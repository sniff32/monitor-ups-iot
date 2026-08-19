-- Monitor IoT WiMobile: migracion multiusuario y multiproyecto.
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor con una cuenta administradora.
-- La migracion conserva public.telemetry y sus lecturas existentes.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  business_description text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  project_type text not null default 'generic'
    check (project_type in ('ups', 'agriculture', 'aquarium', 'generic')),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique check (char_length(device_id) between 1 and 80),
  display_name text not null default '',
  device_type text not null default 'generic',
  claim_code_hash text not null,
  project_id uuid references public.projects(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columnas que relacionan cada lectura con un dispositivo y proyecto privados.
alter table public.telemetry
  add column if not exists device_uuid uuid references public.devices(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists metric_values jsonb not null default '{}'::jsonb;

-- Los sensores que no son UPS pueden enviar metric_values sin voltajes de UPS.
alter table public.telemetry alter column input_voltage drop not null;
alter table public.telemetry alter column output_voltage drop not null;
alter table public.telemetry alter column battery_voltage drop not null;
alter table public.telemetry alter column load_percent drop not null;

create index if not exists telemetry_project_received_idx
  on public.telemetry (project_id, received_at desc);
create index if not exists telemetry_device_id_idx
  on public.telemetry (device_id);
create index if not exists devices_project_idx
  on public.devices (project_id);
create index if not exists projects_organization_idx
  on public.projects (organization_id);
create index if not exists members_user_idx
  on public.organization_members (user_id);

comment on column public.telemetry.metric_values is
  'Metricas variables, por ejemplo {"humidity_percent": 70.2, "ph": 7.1}';

create or replace function public.wimobile_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.wimobile_touch_updated_at();
drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at before update on public.organizations
for each row execute function public.wimobile_touch_updated_at();
drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.wimobile_touch_updated_at();
drop trigger if exists devices_touch_updated_at on public.devices;
create trigger devices_touch_updated_at before update on public.devices
for each row execute function public.wimobile_touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists wimobile_on_auth_user_created on auth.users;
create trigger wimobile_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Crea perfiles para cuentas que ya existian antes de esta migracion.
insert into public.profiles (id, display_name)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1), '')
from auth.users
on conflict (id) do nothing;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.devices enable row level security;
alter table public.telemetry enable row level security;

-- Elimina politicas anteriores que pudieran permitir ver toda la telemetria.
do $$
declare policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'telemetry'
  loop
    execute format('drop policy %I on public.telemetry', policy_record.policyname);
  end loop;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
for select to authenticated using (public.is_org_member(id));
drop policy if exists organizations_update_manager on public.organizations;
create policy organizations_update_manager on public.organizations
for update to authenticated using (public.can_manage_org(id)) with check (public.can_manage_org(id));

drop policy if exists members_select_member on public.organization_members;
create policy members_select_member on public.organization_members
for select to authenticated using (user_id = auth.uid() or public.is_org_member(organization_id));
drop policy if exists members_manage_manager on public.organization_members;
create policy members_manage_manager on public.organization_members
for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists projects_manage_manager on public.projects;
create policy projects_manage_manager on public.projects
for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists devices_select_project_member on public.devices;
create policy devices_select_project_member on public.devices
for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = devices.project_id and public.is_org_member(p.organization_id)
  )
);
drop policy if exists devices_manage_project_manager on public.devices;
create policy devices_manage_project_manager on public.devices
for update to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = devices.project_id and public.can_manage_org(p.organization_id)
  )
) with check (
  exists (
    select 1 from public.projects p
    where p.id = devices.project_id and public.can_manage_org(p.organization_id)
  )
);

create policy telemetry_select_project_member on public.telemetry
for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = telemetry.project_id and public.is_org_member(p.organization_id)
  )
);

revoke all on public.profiles, public.organizations, public.organization_members,
  public.projects, public.devices, public.telemetry from public, anon;
revoke all on public.telemetry from authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, update on public.devices to authenticated;
grant select on public.telemetry to authenticated;

create or replace function public.get_my_workspace()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'profile', coalesce(
      (select jsonb_build_object(
        'id', pr.id,
        'display_name', pr.display_name,
        'onboarding_completed', pr.onboarding_completed
      ) from public.profiles pr where pr.id = auth.uid()),
      '{}'::jsonb
    ),
    'projects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'project_type', p.project_type,
          'description', p.description,
          'organization_id', o.id,
          'organization_name', o.name,
          'business_description', o.business_description,
          'role', m.role,
          'devices', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', d.id,
              'device_id', d.device_id,
              'display_name', d.display_name,
              'device_type', d.device_type,
              'claimed_at', d.claimed_at
            ) order by d.device_id)
            from public.devices d
            where d.project_id = p.id
          ), '[]'::jsonb)
        ) order by p.created_at
      )
      from public.projects p
      join public.organizations o on o.id = p.organization_id
      join public.organization_members m
        on m.organization_id = o.id and m.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

create or replace function public.complete_onboarding(
  p_display_name text,
  p_company_name text,
  p_business_description text,
  p_project_name text,
  p_project_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if current_user_id is null then raise exception 'Debes iniciar sesion'; end if;
  perform 1 from public.profiles where id = current_user_id for update;
  if char_length(trim(p_display_name)) not between 2 and 100 then raise exception 'Nombre no valido'; end if;
  if char_length(trim(p_company_name)) not between 2 and 120 then raise exception 'Empresa no valida'; end if;
  if char_length(trim(p_business_description)) not between 10 and 1000 then raise exception 'Describe la actividad con al menos 10 caracteres'; end if;
  if char_length(trim(p_project_name)) not between 2 and 120 then raise exception 'Proyecto no valido'; end if;
  if p_project_type not in ('ups', 'agriculture', 'aquarium', 'generic') then raise exception 'Tipo de proyecto no valido'; end if;

  if exists (select 1 from public.profiles where id = current_user_id and onboarding_completed) then
    return public.get_my_workspace();
  end if;

  insert into public.organizations (name, business_description, created_by)
  values (trim(p_company_name), trim(p_business_description), current_user_id)
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'owner');

  insert into public.projects (organization_id, name, project_type, description)
  values (new_organization_id, trim(p_project_name), p_project_type, trim(p_business_description));

  update public.profiles
  set display_name = trim(p_display_name), onboarding_completed = true
  where id = current_user_id;

  return public.get_my_workspace();
end;
$$;

-- Vincula un equipo previamente aprovisionado con el proyecto del usuario.
create or replace function public.claim_device(
  p_project_id uuid,
  p_device_id text,
  p_claim_code text,
  p_display_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_device public.devices%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion'; end if;
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and public.can_manage_org(p.organization_id)
  ) then raise exception 'No tienes permiso para administrar este proyecto'; end if;

  select * into selected_device
  from public.devices
  where device_id = trim(p_device_id)
  for update;

  if not found then raise exception 'El dispositivo aun no fue aprovisionado'; end if;
  if selected_device.project_id is not null then raise exception 'El dispositivo ya pertenece a un proyecto'; end if;
  if selected_device.claim_code_hash <> crypt(trim(p_claim_code), selected_device.claim_code_hash) then
    raise exception 'Codigo de vinculacion incorrecto';
  end if;

  update public.devices
  set project_id = p_project_id,
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name, trim(p_device_id)),
      claimed_at = now()
  where id = selected_device.id;

  update public.telemetry
  set device_uuid = selected_device.id, project_id = p_project_id
  where device_id = selected_device.device_id and project_id is null;

  return public.get_my_workspace();
end;
$$;

-- SOLO PARA EL ADMINISTRADOR: crea o renueva el codigo que se entrega con el equipo.
create or replace function public.admin_provision_device(
  p_device_id text,
  p_claim_code text,
  p_device_type text default 'generic',
  p_display_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare provisioned_id uuid;
begin
  if char_length(trim(p_device_id)) not between 1 and 80 then raise exception 'ID de dispositivo no valido'; end if;
  if char_length(trim(p_claim_code)) < 8 then raise exception 'El codigo debe tener al menos 8 caracteres'; end if;

  insert into public.devices (device_id, display_name, device_type, claim_code_hash)
  values (trim(p_device_id), trim(p_display_name), trim(p_device_type), crypt(trim(p_claim_code), gen_salt('bf')))
  on conflict (device_id) do update
    set display_name = excluded.display_name,
        device_type = excluded.device_type,
        claim_code_hash = excluded.claim_code_hash,
        updated_at = now()
  returning id into provisioned_id;
  return provisioned_id;
end;
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.can_manage_org(uuid) from public, anon;
revoke all on function public.get_my_workspace() from public, anon;
revoke all on function public.complete_onboarding(text, text, text, text, text) from public, anon;
revoke all on function public.claim_device(uuid, text, text, text) from public, anon;
revoke all on function public.admin_provision_device(text, text, text, text) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;
grant execute on function public.get_my_workspace() to authenticated;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;
grant execute on function public.claim_device(uuid, text, text, text) to authenticated;

-- EJEMPLO para preparar un equipo antes de entregarlo al usuario:
-- select public.admin_provision_device('MUPS-01436666', 'WM-8F7K-42Q9', 'ups', 'UPS oficina');
