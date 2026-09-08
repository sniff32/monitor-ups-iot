from __future__ import annotations

import hmac
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import requests
from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


def environment_value(name: str) -> str:
    """Lee una variable sin conservar espacios o saltos de linea accidentales."""
    return os.environ.get(name, "").strip()


SUPABASE_URL = environment_value("SUPABASE_URL").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = environment_value("SUPABASE_PUBLISHABLE_KEY")
SUPABASE_SECRET_KEY = environment_value("SUPABASE_SECRET_KEY")
INGEST_API_KEY = environment_value("INGEST_API_KEY")


def missing_settings() -> list[str]:
    settings = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_PUBLISHABLE_KEY": SUPABASE_PUBLISHABLE_KEY,
        "SUPABASE_SECRET_KEY": SUPABASE_SECRET_KEY,
        "INGEST_API_KEY": INGEST_API_KEY,
    }
    return [name for name, value in settings.items() if not value]


def supabase_headers(prefer: str | None = None) -> dict[str, str]:
    """Admite tanto la nueva secret key como la service_role JWT heredada."""
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
    }
    if SUPABASE_SECRET_KEY.count(".") == 2:
        headers["Authorization"] = f"Bearer {SUPABASE_SECRET_KEY}"
    if prefer:
        headers["Prefer"] = prefer
    return headers


def parse_decimal(value: object, field: str, minimum: str, maximum: str) -> float:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field} debe ser numerico") from None

    if not number.is_finite():
        raise ValueError(f"{field} debe ser un numero finito")
    if not Decimal(minimum) <= number <= Decimal(maximum):
        raise ValueError(f"{field} esta fuera del rango permitido")
    return float(number)


def parse_optional_decimal(
    value: object, field: str, minimum: str, maximum: str
) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_decimal(value, field, minimum, maximum)


def parse_metric_values(value: object) -> dict[str, float]:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise ValueError("metrics debe ser un objeto JSON")
    if len(value) > 128:
        raise ValueError("metrics admite como maximo 128 variables")

    metrics: dict[str, float] = {}
    for raw_key, raw_value in value.items():
        key = str(raw_key).strip().lower()
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", key):
            raise ValueError(f"Nombre de metrica no valido: {raw_key}")
        metrics[key] = parse_decimal(
            raw_value, f"metrics.{key}", "-1000000000", "1000000000"
        )
    return metrics


RESERVED_PAYLOAD_FIELDS = {
    "device_id",
    "sequence",
    "status",
    "raw_payload",
    "metrics",
    "input_voltage",
    "output_voltage",
    "battery_voltage",
    "load_percent",
    "temperature",
    "temperature_c",
    "ups_interface",
    "interface_type",
    "data_interface",
    "source_interface",
}


def collect_dynamic_metrics(
    payload: dict, metrics: dict[str, float]
) -> dict[str, float]:
    """Conserva mediciones numericas adicionales sin cambiar la tabla."""
    collected = dict(metrics)
    for raw_key, raw_value in payload.items():
        key = str(raw_key).strip().lower()
        if key in RESERVED_PAYLOAD_FIELDS or key in collected:
            continue
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", key):
            continue
        if isinstance(raw_value, (dict, list, tuple, bool)) or raw_value in (None, ""):
            continue
        try:
            collected[key] = parse_decimal(
                raw_value, key, "-1000000000", "1000000000"
            )
        except ValueError:
            continue
        if len(collected) > 128:
            raise ValueError("La telemetria admite como maximo 128 variables numericas")
    return collected


def first_text(payload: dict, names: tuple[str, ...], maximum: int) -> str | None:
    for name in names:
        value = str(payload.get(name, "")).strip()
        if value:
            if len(value) > maximum:
                raise ValueError(f"{name} supera {maximum} caracteres")
            return value
    return None


def parse_telemetry(payload: dict) -> dict:
    device_id = str(payload.get("device_id", "")).strip()
    status = str(payload.get("status", "ONLINE")).strip().upper()

    if not device_id or len(device_id) > 80:
        raise ValueError("device_id es obligatorio y debe tener hasta 80 caracteres")
    if not status or len(status) > 30:
        raise ValueError("status es obligatorio y debe tener hasta 30 caracteres")

    try:
        if isinstance(payload.get("sequence"), bool):
            raise ValueError
        sequence = int(payload.get("sequence"))
    except (TypeError, ValueError):
        raise ValueError("sequence debe ser un numero entero") from None
    if sequence < 0 or sequence > 9_223_372_036_854_775_807:
        raise ValueError("sequence esta fuera del rango permitido")

    metric_values = collect_dynamic_metrics(
        payload, parse_metric_values(payload.get("metrics"))
    )
    record: dict = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "device_id": device_id,
        "sequence": sequence,
        "status": status,
        "source_ip": request.headers.get(
            "X-Forwarded-For", request.remote_addr or ""
        ).split(",")[0].strip()[:100],
        "raw_payload": str(payload.get("raw_payload", ""))[:1000] or None,
        "metric_values": metric_values,
    }

    ups_fields = {
        "input_voltage": ("0", "999.99"),
        "output_voltage": ("0", "999.99"),
        "battery_voltage": ("0", "999.99"),
        "load_percent": ("0", "100"),
    }
    for field, (minimum, maximum) in ups_fields.items():
        value = payload.get(field, metric_values.get(field))
        if value is None or str(value).strip() == "":
            raise ValueError(f"{field} es obligatorio")
        record[field] = parse_decimal(value, field, minimum, maximum)

    temperature = payload.get(
        "temperature_c",
        payload.get("temperature", metric_values.get("temperature_c")),
    )
    if temperature is not None and str(temperature).strip() != "":
        record["temperature_c"] = parse_optional_decimal(
            temperature, "temperature_c", "-50", "150"
        )

    ups_interface = first_text(
        payload,
        ("ups_interface", "interface_type", "data_interface", "source_interface"),
        40,
    )
    if ups_interface:
        record["ups_interface"] = ups_interface

    return record


@app.get("/")
def dashboard():
    return render_template(
        "index.html",
        supabase_url=SUPABASE_URL,
        supabase_publishable_key=SUPABASE_PUBLISHABLE_KEY,
        configuration_error=", ".join(missing_settings()),
    )


@app.get("/health")
def health():
    missing = missing_settings()
    if missing:
        return jsonify(
            {
                "ok": False,
                "supabase_connected": False,
                "missing": missing,
            }
        ), 503

    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/telemetry",
            headers=supabase_headers(),
            params={"select": "id", "limit": "1"},
            timeout=12,
        )
    except requests.RequestException as error:
        app.logger.error("Fallo de red comprobando Supabase: %s", error)
        return jsonify(
            {
                "ok": False,
                "supabase_connected": False,
                "error": "No fue posible contactar Supabase",
            }
        ), 503

    if not response.ok:
        app.logger.error(
            "Comprobacion Supabase respondio %s: %s",
            response.status_code,
            response.text[:500],
        )
        return jsonify(
            {
                "ok": False,
                "supabase_connected": False,
                "upstream_status": response.status_code,
                "error": "Supabase no acepto la consulta de telemetry",
            }
        ), 503

    return jsonify(
        {
            "ok": True,
            "supabase_connected": True,
            "table": "public.telemetry",
            "missing": [],
        }
    ), 200


@app.post("/api/telemetry")
def receive_telemetry():
    provided_key = request.headers.get("X-API-Key", "").strip()
    if not INGEST_API_KEY or not hmac.compare_digest(provided_key, INGEST_API_KEY):
        return jsonify({"ok": False, "error": "No autorizado"}), 401
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Servidor sin configurar"}), 503

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"ok": False, "error": "Se esperaba un objeto JSON"}), 400

    try:
        record = parse_telemetry(body)
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400

    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/telemetry",
            headers=supabase_headers("return=representation"),
            json=record,
            timeout=15,
        )
    except requests.RequestException as error:
        app.logger.error("Fallo de red guardando telemetria: %s", error)
        return jsonify(
            {"ok": False, "error": "No fue posible contactar Supabase"}
        ), 502

    if response.status_code == 409:
        return jsonify({"ok": False, "error": "Secuencia duplicada"}), 409
    if not response.ok:
        app.logger.error(
            "Supabase respondio %s: %s",
            response.status_code,
            response.text[:500],
        )
        return jsonify(
            {"ok": False, "error": "No fue posible guardar la telemetria"}
        ), 502

    saved_rows = response.json()
    saved = saved_rows[0] if isinstance(saved_rows, list) and saved_rows else {}
    return jsonify(
        {
            "ok": True,
            "id": saved.get("id"),
            "sequence": saved.get("sequence", record["sequence"]),
        }
    ), 201


@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({"ok": False, "error": "La solicitud supera 16 KB"}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
