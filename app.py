from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import requests
from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
INGEST_API_KEY = os.environ.get("INGEST_API_KEY", "")


def missing_settings() -> list[str]:
    settings = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_PUBLISHABLE_KEY": SUPABASE_PUBLISHABLE_KEY,
        "SUPABASE_SECRET_KEY": SUPABASE_SECRET_KEY,
        "INGEST_API_KEY": INGEST_API_KEY,
    }
    return [name for name, value in settings.items() if not value]


def parse_decimal(value: object, field: str, minimum: str, maximum: str) -> float:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field} debe ser numérico") from None

    if not number.is_finite():
        raise ValueError(f"{field} debe ser un número finito")
    if not Decimal(minimum) <= number <= Decimal(maximum):
        raise ValueError(f"{field} está fuera del rango permitido")
    return float(number)


def parse_optional_decimal(value: object, field: str, minimum: str, maximum: str) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_decimal(value, field, minimum, maximum)


def parse_metric_values(value: object) -> dict[str, float]:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise ValueError("metrics debe ser un objeto JSON")
    if len(value) > 32:
        raise ValueError("metrics admite como máximo 32 variables")

    metrics: dict[str, float] = {}
    for raw_key, raw_value in value.items():
        key = str(raw_key).strip().lower()
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", key):
            raise ValueError(f"Nombre de métrica no válido: {raw_key}")
        metrics[key] = parse_decimal(raw_value, f"metrics.{key}", "-1000000000", "1000000000")
    return metrics


def parse_telemetry(payload: dict) -> dict:
    device_id = str(payload.get("device_id", "")).strip()
    status = str(payload.get("status", "ONLINE")).strip().upper()

    if not device_id or len(device_id) > 80:
        raise ValueError("device_id es obligatorio y debe tener hasta 80 caracteres")
    if not status or len(status) > 30:
        raise ValueError("status es obligatorio y debe tener hasta 30 caracteres")

    try:
        sequence = int(payload.get("sequence"))
    except (TypeError, ValueError):
        raise ValueError("sequence debe ser un número entero") from None
    if sequence < 0 or sequence > 9_223_372_036_854_775_807:
        raise ValueError("sequence está fuera del rango permitido")

    metric_values = parse_metric_values(payload.get("metrics"))
    record: dict = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "device_id": device_id,
        "sequence": sequence,
        "status": status,
        "source_ip": request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip(),
        "raw_payload": str(payload.get("raw_payload", ""))[:1000] or None,
        "metric_values": metric_values,
    }

    ups_fields = {
        "input_voltage": ("0", "999.99"),
        "output_voltage": ("0", "999.99"),
        "battery_voltage": ("0", "999.99"),
        "load_percent": ("0", "100"),
    }
    # El protocolo UPS existente conserva sus cuatro campos obligatorios. Los
    # proyectos genéricos pueden enviar solamente el objeto "metrics".
    for field, (minimum, maximum) in ups_fields.items():
        if field in payload or not metric_values:
            record[field] = parse_decimal(payload.get(field), field, minimum, maximum)

    # La temperatura es opcional para conservar compatibilidad con los equipos
    # actuales. Solo se envía a Supabase cuando el dispositivo la incluye.
    if "temperature_c" in payload or "temperature" in payload:
        temperature = payload.get("temperature_c", payload.get("temperature"))
        record["temperature_c"] = parse_optional_decimal(
            temperature, "temperature_c", "-50", "150"
        )

    return record


def supabase_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def attach_device_scope(record: dict) -> None:
    """Relaciona la lectura con su proyecto sin confiar en datos del cliente."""
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/devices",
        headers=supabase_headers(),
        params={
            "select": "id,project_id",
            "device_id": f"eq.{record['device_id']}",
            "limit": "1",
        },
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError(f"No fue posible resolver el dispositivo: {response.status_code}")
    devices = response.json()
    if devices:
        record["device_uuid"] = devices[0]["id"]
        record["project_id"] = devices[0]["project_id"]


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
    return jsonify({"ok": not missing, "missing": missing}), 200 if not missing else 503


@app.post("/api/telemetry")
def receive_telemetry():
    if not INGEST_API_KEY or request.headers.get("X-API-Key", "") != INGEST_API_KEY:
        return jsonify({"ok": False, "error": "No autorizado"}), 401
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Servidor sin configurar"}), 503

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"ok": False, "error": "Se esperaba un objeto JSON"}), 400

    try:
        record = parse_telemetry(body)
        attach_device_scope(record)
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400
    except RuntimeError as error:
        app.logger.error("%s", error)
        return jsonify({"ok": False, "error": "No fue posible identificar el proyecto del dispositivo"}), 502

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/telemetry",
        headers=supabase_headers("return=representation"),
        json=record,
        timeout=15,
    )

    if response.status_code == 409:
        return jsonify({"ok": False, "error": "Secuencia duplicada"}), 409
    if not response.ok:
        app.logger.error("Supabase respondió %s: %s", response.status_code, response.text)
        return jsonify({"ok": False, "error": "No fue posible guardar la telemetría"}), 502

    saved = response.json()[0]
    return jsonify({"ok": True, "id": saved["id"], "sequence": saved["sequence"]}), 201


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
