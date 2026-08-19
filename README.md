# Plataforma IoT WiMobile

Plataforma web multiusuario para recibir telemetría en Render, almacenarla en
Supabase y mostrar una interfaz privada por empresa, proyecto y dispositivo.

## Qué cambió

- Cada cuenta completa un cuestionario en su primer inicio de sesión.
- El cuestionario crea una empresa y su primer proyecto privado.
- Hay interfaces preconfiguradas para UPS, cosechas, acuarios y telemetría genérica.
- Cada lectura queda asociada en el servidor a un `project_id`.
- Las políticas RLS de Supabase impiden que un usuario consulte datos de otra empresa.
- Un dispositivo sólo se vincula con su ID y un código privado de vinculación.
- Una cuenta puede pertenecer a varios proyectos y seleccionarlos desde el encabezado.

## Archivos principales

- `app.py`: receptor HTTPS, validación y asignación segura del dispositivo.
- `templates/index.html`: acceso, cuestionario e interfaz visual.
- `static/dashboard.js`: sesión, proyectos, dispositivos, gráficas y tiempo real.
- `supabase_multitenant.sql`: tablas, funciones, índices y seguridad RLS.
- `render.yaml`: servicio web de Render.
- `requirements.txt`: dependencias de Python.

## Orden correcto para instalar la actualización

1. En Supabase abre **SQL Editor**, crea una consulta nueva, pega todo el contenido
   de `supabase_multitenant.sql` y pulsa **Run** una sola vez.
2. Aprovisiona cada dispositivo desde otra consulta del SQL Editor. Usa un código
   distinto, aleatorio y de al menos ocho caracteres:

   ```sql
   select public.admin_provision_device(
     'MUPS-01436666',
     'WM-8F7K-42Q9',
     'ups',
     'UPS oficina principal'
   );
   ```

3. Sube a GitHub `app.py`, `templates/index.html`, `static/dashboard.js`, este
   README y `supabase_multitenant.sql`.
4. Espera a que Render termine el despliegue y muestre **Deploy live**.
5. Inicia sesión. Las cuentas existentes verán el cuestionario una sola vez.
6. En el cuestionario o en **Mis dispositivos**, escribe el ID y código de
   vinculación preparados en el paso 2.

El ID debe coincidir exactamente con el texto que el dispositivo envía como
`device_id`. El código no viaja en cada lectura: sólo se usa una vez para demostrar
que el usuario tiene autorización para reclamar ese equipo.

## Cómo queda aislada la información

La página nunca decide por sí sola qué filas pertenecen a un usuario. Supabase lo
comprueba con RLS:

`usuario -> membresía -> empresa -> proyecto -> dispositivo -> telemetría`

El navegador usa la llave pública y sólo puede leer proyectos de su membresía. El
receptor de Render usa la llave secreta, busca el `device_id` en `devices` y agrega
el `project_id` correspondiente antes de insertar la lectura. Un dispositivo aún
no vinculado se guarda con `project_id = null`; ningún usuario puede verlo y sus
lecturas se asignan automáticamente cuando se vincula.

## Formato UPS existente

El receptor TCP puede seguir enviando a `POST /api/telemetry` el mismo JSON:

```json
{
  "device_id": "MUPS-01436666",
  "sequence": 10001,
  "status": "ONLINE",
  "input_voltage": 127.5,
  "output_voltage": 120.3,
  "battery_voltage": 13.2,
  "load_percent": 40,
  "temperature_c": 31.8
}
```

`temperature_c` continúa siendo opcional. El encabezado `X-API-Key` sigue siendo
obligatorio y debe contener `INGEST_API_KEY`.

## Formato de sensores variables

Los proyectos de cosechas, acuarios u otros sensores pueden enviar un objeto
`metrics`. En ese caso los cuatro campos eléctricos de UPS dejan de ser
obligatorios:

```json
{
  "device_id": "ACUARIO-01",
  "sequence": 501,
  "status": "ONLINE",
  "metrics": {
    "water_temperature_c": 25.6,
    "ph": 7.15,
    "dissolved_oxygen_mg_l": 8.1,
    "water_level_percent": 91
  }
}
```

Variables reconocidas por las interfaces incluidas:

| Proyecto | Variables |
|---|---|
| UPS | `temperature_c`, `input_voltage`, `output_voltage`, `battery_voltage`, `load_percent` |
| Cosechas | `temperature_c`, `humidity_percent`, `soil_moisture_percent`, `light_lux` |
| Acuarios | `water_temperature_c`, `ph`, `dissolved_oxygen_mg_l`, `water_level_percent` |
| Genérico | cualquier nombre en minúsculas con números y guion bajo |

El receptor TCP actual interpreta la trama UPS `V1|...`. Para sensores de cosechas
o acuarios habrá que adaptar ese receptor para formar el JSON `metrics`, sin
cambiar la seguridad ni la página.

## Variables privadas de Render

Mantén estas variables solamente en Render:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `INGEST_API_KEY`

No publiques `SUPABASE_SECRET_KEY`, `INGEST_API_KEY` ni códigos de vinculación en
GitHub. El archivo `.env` local también debe permanecer ignorado.

## Alta de usuarios

Las cuentas se siguen creando o invitando desde **Supabase > Authentication >
Users**. En su primer inicio de sesión el usuario verá el cuestionario. Después,
la función `complete_onboarding` crea su empresa, membresía y proyecto en una sola
transacción.

Para agregar a otra persona a una empresa existente no se debe completar otro
cuestionario: un administrador debe crear su fila en `organization_members`. Esa
pantalla de invitaciones puede incorporarse como siguiente módulo.
