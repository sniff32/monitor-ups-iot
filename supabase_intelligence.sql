-- Monitor IoT WiMobile: asistente inteligente, limites y salud del equipo.
-- Ejecutar UNA SOLA VEZ despues de supabase_multitenant.sql y
-- supabase_admin_control.sql.

begin;

create table if not exists public.device_thresholds (
  device_uuid uuid primary key references public.devices(id) on delete cascade,
  offline_seconds integer not null default 30 check (offline_seconds between 10 and 86400),
  urgent_offline_seconds integer not null default 300 check (urgent_offline_seconds between 30 and 604800),
  input_voltage_min numeric not null default 100,
  input_voltage_max numeric not null default 140,
  output_voltage_min numeric not null default 100,
  output_voltage_max numeric not null default 140,
  battery_voltage_min numeric not null default 10.5,
  load_percent_max numeric not null default 90,
  temperature_c_max numeric not null default 50,
  metric_limits jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (input_voltage_min < input_voltage_max),
  check (output_voltage_min < output_voltage_max),
  check (urgent_offline_seconds >= offline_seconds),
  check (jsonb_typeof(metric_limits) = 'object')
);

create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  device_uuid uuid references public.devices(id) on delete set null,
  device_id text not null,
  event_key text not null check (char_length(event_key) between 1 and 120),
  classification text not null check (classification in ('preventive', 'corrective', 'revision')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  urgent boolean not null default false,
  score integer not null check (score between 0 and 100),
  confidence text not null check (confidence in ('Inicial', 'Media', 'Alta')),
  title text not null check (char_length(title) between 1 and 180),
  message text not null default '',
  recommendation text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists intelligence_events_one_active_idx
  on public.intelligence_events (project_id, device_uuid, event_key)
  where status = 'active' and project_id is not null and device_uuid is not null;
create index if not exists intelligence_events_project_time_idx
  on public.intelligence_events (project_id, last_detected_at desc);
create index if not exists intelligence_events_device_time_idx
  on public.intelligence_events (device_uuid, last_detected_at desc);

create table if not exists public.device_health (
  device_uuid uuid primary key references public.devices(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  device_id text not null,
  health_score integer not null default 100 check (health_score between 0 and 100),
  health_label text not null default 'Sin evaluar'
    check (health_label in ('Saludable', 'Observacion', 'Preventivo', 'Correctivo', 'Sin evaluar')),
  summary text not null default '',
  factors jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_health_project_idx
  on public.device_health (project_id, health_score);

drop trigger if exists device_thresholds_touch_updated_at on public.device_thresholds;
create trigger device_thresholds_touch_updated_at before update on public.device_thresholds
for each row execute function public.wimobile_touch_updated_at();

alter table public.device_thresholds enable row level security;
alter table public.intelligence_events enable row level security;
alter table public.device_health enable row level security;

drop policy if exists device_thresholds_select_scope on public.device_thresholds;
create policy device_thresholds_select_scope on public.device_thresholds
for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.devices device
    join public.projects project on project.id = device.project_id
    where device.id = device_thresholds.device_uuid
      and public.is_org_member(project.organization_id)
  )
);

drop policy if exists intelligence_events_select_scope on public.intelligence_events;
create policy intelligence_events_select_scope on public.intelligence_events
for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.projects project
    where project.id = intelligence_events.project_id
      and public.is_org_member(project.organization_id)
  )
);

drop policy if exists device_health_select_scope on public.device_health;
create policy device_health_select_scope on public.device_health
for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.projects project
    where project.id = device_health.project_id
      and public.is_org_member(project.organization_id)
  )
);

revoke all on public.device_thresholds, public.intelligence_events, public.device_health
  from public, anon, authenticated;
grant select on public.device_thresholds, public.intelligence_events, public.device_health
  to authenticated;

create or replace function public.admin_update_device_thresholds(
  p_device_id text,
  p_offline_seconds integer,
  p_urgent_offline_seconds integer,
  p_input_voltage_min numeric,
  p_input_voltage_max numeric,
  p_output_voltage_min numeric,
  p_output_voltage_max numeric,
  p_battery_voltage_min numeric,
  p_load_percent_max numeric,
  p_temperature_c_max numeric,
  p_metric_limits jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_device public.devices%rowtype;
  saved public.device_thresholds%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;

  select * into selected_device
  from public.devices
  where device_id = trim(p_device_id)
    and project_id is not null;
  if not found then raise exception 'Dispositivo no encontrado o sin proyecto'; end if;

  if p_offline_seconds not between 10 and 86400
     or p_urgent_offline_seconds not between 30 and 604800
     or p_urgent_offline_seconds < p_offline_seconds
     or p_input_voltage_min >= p_input_voltage_max
     or p_output_voltage_min >= p_output_voltage_max
     or p_load_percent_max not between 1 and 200
     or jsonb_typeof(coalesce(p_metric_limits, '{}'::jsonb)) <> 'object' then
    raise exception 'Los limites enviados no son validos';
  end if;

  insert into public.device_thresholds (
    device_uuid, offline_seconds, urgent_offline_seconds,
    input_voltage_min, input_voltage_max, output_voltage_min, output_voltage_max,
    battery_voltage_min, load_percent_max, temperature_c_max,
    metric_limits, updated_by
  ) values (
    selected_device.id, p_offline_seconds, p_urgent_offline_seconds,
    p_input_voltage_min, p_input_voltage_max, p_output_voltage_min, p_output_voltage_max,
    p_battery_voltage_min, p_load_percent_max, p_temperature_c_max,
    coalesce(p_metric_limits, '{}'::jsonb), auth.uid()
  )
  on conflict (device_uuid) do update set
    offline_seconds = excluded.offline_seconds,
    urgent_offline_seconds = excluded.urgent_offline_seconds,
    input_voltage_min = excluded.input_voltage_min,
    input_voltage_max = excluded.input_voltage_max,
    output_voltage_min = excluded.output_voltage_min,
    output_voltage_max = excluded.output_voltage_max,
    battery_voltage_min = excluded.battery_voltage_min,
    load_percent_max = excluded.load_percent_max,
    temperature_c_max = excluded.temperature_c_max,
    metric_limits = excluded.metric_limits,
    updated_by = auth.uid()
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

create or replace function public.sync_device_intelligence(
  p_project_id uuid,
  p_device_id text,
  p_issues jsonb,
  p_health_score integer,
  p_health_label text,
  p_health_summary text,
  p_factors jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_device public.devices%rowtype;
  issue jsonb;
  active_keys text[] := array[]::text[];
  issue_key text;
  issue_classification text;
  issue_severity text;
  issue_confidence text;
  affected integer;
begin
  if auth.uid() is null then raise exception 'Sesion requerida'; end if;
  if jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_issues, '[]'::jsonb)) > 20 then
    raise exception 'Formato de diagnosticos no valido';
  end if;
  if p_health_score not between 0 and 100
     or p_health_label not in ('Saludable', 'Observacion', 'Preventivo', 'Correctivo', 'Sin evaluar')
     or jsonb_typeof(coalesce(p_factors, '[]'::jsonb)) <> 'array' then
    raise exception 'Puntuacion de salud no valida';
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.projects project
    where project.id = p_project_id
      and public.is_org_member(project.organization_id)
  ) then
    raise exception 'No tienes acceso a este proyecto';
  end if;

  select * into selected_device
  from public.devices
  where device_id = trim(p_device_id)
    and project_id = p_project_id;
  if not found then raise exception 'El dispositivo no pertenece al proyecto indicado'; end if;
  -- Evita que dos sesiones creen el mismo diagnostico activo al mismo tiempo.
  perform pg_advisory_xact_lock(hashtextextended(selected_device.id::text, 0));

  for issue in select value from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
  loop
    issue_key := left(regexp_replace(coalesce(issue ->> 'key', ''), '[^a-zA-Z0-9_.:-]', '-', 'g'), 120);
    issue_classification := coalesce(issue ->> 'category', 'revision');
    issue_severity := coalesce(issue ->> 'severity', 'warning');
    issue_confidence := coalesce(issue ->> 'confidence', 'Inicial');
    if issue_key = ''
       or issue_classification not in ('preventive', 'corrective', 'revision')
       or issue_severity not in ('info', 'warning', 'critical')
       or issue_confidence not in ('Inicial', 'Media', 'Alta') then
      raise exception 'Diagnostico no valido';
    end if;
    active_keys := array_append(active_keys, issue_key);

    update public.intelligence_events set
      classification = issue_classification,
      severity = issue_severity,
      urgent = coalesce((issue ->> 'urgent')::boolean, false),
      score = greatest(0, least(100, coalesce((issue ->> 'score')::integer, 50))),
      confidence = issue_confidence,
      title = left(coalesce(nullif(issue ->> 'title', ''), 'Diagnostico del equipo'), 180),
      message = left(coalesce(issue ->> 'message', ''), 2000),
      recommendation = left(coalesce(issue ->> 'recommendation', ''), 2000),
      evidence = coalesce(issue -> 'evidence', '{}'::jsonb),
      last_detected_at = now(),
      resolved_at = null
    where project_id = p_project_id
      and device_uuid = selected_device.id
      and event_key = issue_key
      and status = 'active';
    get diagnostics affected = row_count;

    if affected = 0 then
      insert into public.intelligence_events (
        project_id, device_uuid, device_id, event_key, classification, severity,
        urgent, score, confidence, title, message, recommendation, evidence
      ) values (
        p_project_id, selected_device.id, selected_device.device_id, issue_key,
        issue_classification, issue_severity,
        coalesce((issue ->> 'urgent')::boolean, false),
        greatest(0, least(100, coalesce((issue ->> 'score')::integer, 50))),
        issue_confidence,
        left(coalesce(nullif(issue ->> 'title', ''), 'Diagnostico del equipo'), 180),
        left(coalesce(issue ->> 'message', ''), 2000),
        left(coalesce(issue ->> 'recommendation', ''), 2000),
        coalesce(issue -> 'evidence', '{}'::jsonb)
      );
    end if;
  end loop;

  update public.intelligence_events set
    status = 'resolved', resolved_at = now()
  where project_id = p_project_id
    and device_uuid = selected_device.id
    and status = 'active'
    and (coalesce(array_length(active_keys, 1), 0) = 0 or not (event_key = any(active_keys)));

  insert into public.device_health (
    device_uuid, project_id, device_id, health_score, health_label,
    summary, factors, calculated_at, updated_at
  ) values (
    selected_device.id, p_project_id, selected_device.device_id,
    p_health_score, p_health_label, left(coalesce(p_health_summary, ''), 1000),
    coalesce(p_factors, '[]'::jsonb), now(), now()
  )
  on conflict (device_uuid) do update set
    project_id = excluded.project_id,
    device_id = excluded.device_id,
    health_score = excluded.health_score,
    health_label = excluded.health_label,
    summary = excluded.summary,
    factors = excluded.factors,
    calculated_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'device_id', selected_device.device_id,
    'active_events', coalesce(array_length(active_keys, 1), 0),
    'health_score', p_health_score
  );
end;
$$;

create or replace function public.intelligence_handle_device_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.project_id is distinct from new.project_id then
    update public.intelligence_events set
      status = 'resolved', resolved_at = coalesce(resolved_at, now()),
      last_detected_at = now(), project_id = null
    where device_uuid = new.id and project_id = old.project_id;
    update public.device_health set project_id = new.project_id, updated_at = now()
    where device_uuid = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists intelligence_device_scope_changed on public.devices;
create trigger intelligence_device_scope_changed
after update of project_id on public.devices
for each row execute function public.intelligence_handle_device_scope_change();

revoke all on function public.admin_update_device_thresholds(
  text, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_update_device_thresholds(
  text, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) to authenticated;

revoke all on function public.sync_device_intelligence(
  uuid, text, jsonb, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_device_intelligence(
  uuid, text, jsonb, integer, text, text, jsonb
) to authenticated;

comment on table public.intelligence_events is
  'Historial privado de diagnosticos preventivos, correctivos y de revision.';
comment on table public.device_thresholds is
  'Limites del asistente inteligente configurados exclusivamente por el administrador general.';
comment on table public.device_health is
  'Ultima puntuacion de salud calculada para cada dispositivo.';

commit;
