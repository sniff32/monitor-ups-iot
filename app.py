from __future__ import annotations

import os
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

    if not Decimal(minimum) <= number <= Decimal(maximum):
        raise ValueError(f"{field} está fuera del rango permitido")
    return float(number)


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
    if sequence < 0:
        raise ValueError("sequence no puede ser negativo")

    return {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "device_id": device_id,
        "sequence": sequence,
        "status": status,
        "input_voltage": parse_decimal(payload.get("input_voltage"), "input_voltage", "0", "999.99"),
        "output_voltage": parse_decimal(payload.get("output_voltage"), "output_voltage", "0", "999.99"),
        "battery_voltage": parse_decimal(payload.get("battery_voltage"), "battery_voltage", "0", "999.99"),
        "load_percent": parse_decimal(payload.get("load_percent"), "load_percent", "0", "100"),
        "source_ip": request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip(),
        "raw_payload": str(payload.get("raw_payload", ""))[:1000] or None,
    }


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
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/telemetry",
        headers={
            "apikey": SUPABASE_SECRET_KEY,
            "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
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
