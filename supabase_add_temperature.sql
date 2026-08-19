-- Ejecutar una sola vez en Supabase > SQL Editor antes de enviar temperatura.
alter table public.telemetry
  add column if not exists temperature_c numeric;

comment on column public.telemetry.temperature_c is
  'Temperatura reportada por el Monitor UPS IoT en grados Celsius';
