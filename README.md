# Monitor UPS IoT

Demostración pública del sistema de telemetría: inicio de sesión con Supabase, recepción HTTPS en Render y actualización del tablero en tiempo real.

## Archivos

- `app.py`: receptor HTTPS y conexión privada con Supabase.
- `templates/index.html`: inicio de sesión y tablero responsivo.
- `render.yaml`: configuración del servicio gratuito.
- `requirements.txt`: dependencias de Python.

## Variables privadas en Render

Configura estas variables solamente en Render; nunca las escribas en el repositorio:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `INGEST_API_KEY` (Render puede generarla automáticamente)

## Formato de envío

`POST /api/telemetry`, encabezado `X-API-Key` y cuerpo JSON:

```json
{
  "device_id": "LAPTOP-PRUEBA",
  "sequence": 10001,
  "status": "ONLINE",
  "input_voltage": 127.5,
  "output_voltage": 120.3,
  "battery_voltage": 13.2,
  "load_percent": 40
}
```

El script de PowerShell para la prueba se proporcionará después de publicar el servicio, pues necesita la URL de Render y la llave de ingestión.
