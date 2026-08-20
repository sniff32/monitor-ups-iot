# Plataforma IoT WiMobile

Plataforma privada de monitoreo con administración centralizada. Un solo usuario,
el **administrador general o jefe**, controla las empresas, usuarios, proyectos y
dispositivos. Las cuentas de las empresas únicamente consultan sus equipos,
telemetría, gráficas, historial y alertas.

## Modelo de acceso definitivo

- **Jefe:** crea cuentas, registra empresas, crea proyectos, asigna y retira
  dispositivos y puede consultar todos los entornos.
- **Empresa:** inicia sesión y solo visualiza los proyectos y equipos que el jefe
  le asignó.
- **Cuenta pendiente:** si el jefe todavía no preparó su entorno, verá un aviso de
  acceso en preparación. Ya no existe el cuestionario de primera entrada.
- **Dispositivos:** las empresas no pueden vincular, retirar ni modificar equipos.

Supabase aplica esta separación con RLS; no depende de que el navegador oculte
botones.

## Archivos principales

- `app.py`: página web, recepción HTTPS de telemetría y creación segura de cuentas
  por el jefe.
- `templates/index.html`: acceso, panel empresarial y panel de administración.
- `static/dashboard.js`: sesiones, gráficas, telemetría y operaciones del jefe.
- `supabase_multitenant.sql`: estructura multiempresa base.
- `supabase_admin_control.sql`: migración al modelo de jefe y empresas de solo
  lectura.
- `render.yaml`: configuración de despliegue en Render.

## Actualización de una instalación existente

1. Verifica que la cuenta que será el jefe ya exista en **Supabase >
   Authentication > Users**.
2. Abre **Supabase > SQL Editor**, crea una consulta nueva, pega completo
   `supabase_admin_control.sql` y pulsa **Run**.
3. En otra consulta ejecuta lo siguiente, reemplazando el correo por el correo real
   del jefe:

   ```sql
   insert into public.platform_admins (user_id)
   select id
   from auth.users
   where lower(email) = lower('correo-del-jefe@empresa.com')
   on conflict (user_id) do nothing;
   ```

4. Sube a GitHub estos archivos conservando sus carpetas:

   - `app.py`
   - `templates/index.html`
   - `static/dashboard.js`
   - `supabase_admin_control.sql`
   - `README.md`

5. Espera a que Render muestre **Deploy live**.
6. Inicia sesión con la cuenta del jefe. Aparecerá el menú
   **Administración**.

La migración conserva la telemetría, empresas, usuarios, proyectos y dispositivos
existentes. Los usuarios que anteriormente eran `owner` o `admin` dejan de tener
permisos de modificación desde el navegador; solamente el jefe puede escribir por
medio de las funciones administrativas protegidas.

## Registrar una empresa desde el panel del jefe

En **Administración > Nueva empresa y cuenta**, el jefe escribe:

- Nombre del responsable.
- Correo de inicio de sesión.
- Contraseña temporal, únicamente si desea crear la cuenta desde la plataforma.
- Nombre de la empresa.
- Actividad y objetivo del monitoreo.
- Nombre del proyecto.
- Tipo de monitoreo: UPS, agricultura, acuarios o genérico.

Si la cuenta ya fue creada en Supabase Authentication, se deja vacía la contraseña
temporal. El formulario registra el entorno y asocia esa cuenta con la empresa.

## Asignar un dispositivo

En **Administración > Asignar dispositivo**:

1. Selecciona la empresa y proyecto.
2. Escribe exactamente el `device_id` transmitido por el equipo.
3. Define el nombre visible y el tipo de dispositivo.
4. Pulsa **Guardar y asignar dispositivo**.

Las lecturas nuevas quedan asociadas automáticamente al proyecto. En la primera
asignación también se recuperan las lecturas que el equipo hubiera enviado antes
de ser registrado.

Al retirar un equipo, deja de aparecer para la empresa y sus lecturas anteriores
quedan fuera del acceso del cliente. El registro del dispositivo no se elimina y
el jefe puede asignarlo después a otro proyecto sin entregar a la nueva empresa la
telemetría perteneciente a la empresa anterior.

## Flujo de telemetría que se conserva

```text
STM32/SIM900 -> TCP/ngrok -> receptor Python -> HTTPS Render -> Supabase
```

La actualización administrativa no cambia el firmware, la trama TCP, Ngrok, el
receptor local ni `POST /api/telemetry`.

El receptor de Render busca el `device_id` en `public.devices` y agrega el
`project_id` correcto antes de guardar la lectura. El navegador usa la llave
pública; RLS solamente entrega las filas autorizadas para la sesión.

## Formato UPS existente

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

## Formato de sensores variables

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

## Variables privadas de Render

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `INGEST_API_KEY`

No publiques `SUPABASE_SECRET_KEY` ni `INGEST_API_KEY` en GitHub. La creación de
cuentas desde el panel administrativo pasa por Render y verifica que la sesión
pertenezca a `public.platform_admins`; la llave secreta nunca se entrega al
navegador.
