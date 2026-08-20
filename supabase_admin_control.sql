-- Monitor IoT WiMobile: control centralizado por un administrador general.
-- Ejecutar DESPUES de supabase_multitenant.sql en Supabase > SQL Editor.
-- Conserva usuarios, empresas, dispositivos y telemetria existentes.

begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.platform_admins administrator
    where administrator.user_id = auth.uid()
  );
$$;

-- Las empresas solamente consultan. El administrador general puede consultar todo.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_platform_admin());

drop policy if exists organizations_select_member on public.organizations;
drop policy if exists organizations_update_manager on public.organizations;
drop policy if exists organizations_select_scope on public.organizations;
create policy organizations_select_scope on public.organizations
for select to authenticated
using (public.is_platform_admin() or public.is_org_member(id));

drop policy if exists members_select_member on public.organization_members;
drop policy if exists members_manage_manager on public.organization_members;
drop policy if exists members_select_scope on public.organization_members;
create policy members_select_scope on public.organization_members
for select to authenticated
using (public.is_platform_admin() or user_id = auth.uid());

drop policy if exists projects_select_member on public.projects;
drop policy if exists projects_manage_manager on public.projects;
drop policy if exists projects_select_scope on public.projects;
create policy projects_select_scope on public.projects
for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists devices_select_project_member on public.devices;
drop policy if exists devices_manage_project_manager on public.devices;
drop policy if exists devices_select_scope on public.devices;
create policy devices_select_scope on public.devices
for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.projects project
    where project.id = devices.project_id
      and public.is_org_member(project.organization_id)
  )
);

drop policy if exists telemetry_select_project_member on public.telemetry;
drop policy if exists telemetry_select_scope on public.telemetry;
create policy telemetry_select_scope on public.telemetry
for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.projects project
    where project.id = telemetry.project_id
      and public.is_org_member(project.organization_id)
  )
);

-- Ningun usuario del navegador escribe directamente en estas tablas.
revoke all on public.platform_admins from public, anon, authenticated;
revoke all on public.profiles, public.organizations, public.organization_members,
  public.projects, public.devices, public.telemetry from anon;
revoke insert, update, delete on public.profiles, public.organizations,
  public.organization_members, public.projects, public.devices, public.telemetry
  from authenticated;
grant select on public.profiles, public.organizations, public.organization_members,
  public.projects, public.devices, public.telemetry to authenticated;

-- Sustituye el cuestionario: devuelve unicamente los proyectos autorizados.
-- El administrador general recibe todos los proyectos para poder supervisarlos.
create or replace function public.get_my_workspace()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'profile', coalesce(
      (
        select jsonb_build_object(
          'id', profile.id,
          'display_name', profile.display_name,
          'onboarding_completed', profile.onboarding_completed
        )
        from public.profiles profile
        where profile.id = auth.uid()
      ),
      '{}'::jsonb
    ),
    'projects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', project.id,
            'name', project.name,
            'project_type', project.project_type,
            'description', project.description,
            'organization_id', organization.id,
            'organization_name', organization.name,
            'business_description', organization.business_description,
            'role', case
              when public.is_platform_admin() then 'platform_admin'
              else membership.role
            end,
            'devices', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', device.id,
                    'device_id', device.device_id,
                    'display_name', device.display_name,
                    'device_type', device.device_type,
                    'claimed_at', device.claimed_at
                  )
                  order by device.device_id
                )
                from public.devices device
                where device.project_id = project.id
              ),
              '[]'::jsonb
            )
          )
          order by organization.name, project.created_at
        )
        from public.projects project
        join public.organizations organization
          on organization.id = project.organization_id
        left join public.organization_members membership
          on membership.organization_id = organization.id
         and membership.user_id = auth.uid()
        where public.is_platform_admin() or membership.user_id is not null
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.admin_get_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;

  return jsonb_build_object(
    'organizations', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', organization.id,
            'name', organization.name,
            'business_description', organization.business_description,
            'created_at', organization.created_at
          )
          order by organization.name
        )
        from public.organizations organization
      ),
      '[]'::jsonb
    ),
    'projects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', project.id,
            'organization_id', project.organization_id,
            'organization_name', organization.name,
            'name', project.name,
            'project_type', project.project_type,
            'description', project.description,
            'created_at', project.created_at
          )
          order by organization.name, project.name
        )
        from public.projects project
        join public.organizations organization
          on organization.id = project.organization_id
      ),
      '[]'::jsonb
    ),
    'members', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'organization_id', membership.organization_id,
            'user_id', membership.user_id,
            'email', account.email,
            'display_name', profile.display_name
          )
          order by account.email
        )
        from public.organization_members membership
        join auth.users account on account.id = membership.user_id
        left join public.profiles profile on profile.id = membership.user_id
      ),
      '[]'::jsonb
    ),
    'devices', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', device.id,
            'device_id', device.device_id,
            'display_name', device.display_name,
            'device_type', device.device_type,
            'project_id', device.project_id,
            'project_name', project.name,
            'organization_name', organization.name,
            'claimed_at', device.claimed_at
          )
          order by coalesce(organization.name, ''), device.device_id
        )
        from public.devices device
        left join public.projects project on project.id = device.project_id
        left join public.organizations organization on organization.id = project.organization_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- El administrador llena los datos que antes capturaba el cuestionario.
create or replace function public.admin_create_workspace(
  p_user_email text,
  p_display_name text,
  p_company_name text,
  p_business_description text,
  p_project_name text,
  p_project_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_user_id uuid;
  new_organization_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 100 then
    raise exception 'Nombre del responsable no valido';
  end if;
  if char_length(trim(p_company_name)) not between 2 and 120 then
    raise exception 'Nombre de empresa no valido';
  end if;
  if char_length(trim(p_business_description)) not between 10 and 1000 then
    raise exception 'La descripcion debe tener al menos 10 caracteres';
  end if;
  if char_length(trim(p_project_name)) not between 2 and 120 then
    raise exception 'Nombre de proyecto no valido';
  end if;
  if p_project_type not in ('ups', 'agriculture', 'aquarium', 'generic') then
    raise exception 'Tipo de proyecto no valido';
  end if;

  select account.id into target_user_id
  from auth.users account
  where lower(account.email) = lower(trim(p_user_email))
  limit 1;

  if target_user_id is null then
    raise exception 'La cuenta no existe. Creala primero desde el panel del jefe o Supabase Authentication';
  end if;
  if exists (
    select 1 from public.organization_members membership
    where membership.user_id = target_user_id
  ) then
    raise exception 'Este usuario ya pertenece a una empresa';
  end if;

  insert into public.profiles (id, display_name, onboarding_completed)
  values (target_user_id, trim(p_display_name), true)
  on conflict (id) do update
    set display_name = excluded.display_name,
        onboarding_completed = true,
        updated_at = now();

  insert into public.organizations (name, business_description, created_by)
  values (trim(p_company_name), trim(p_business_description), auth.uid())
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, target_user_id, 'member');

  insert into public.projects (organization_id, name, project_type, description)
  values (
    new_organization_id,
    trim(p_project_name),
    p_project_type,
    trim(p_business_description)
  );

  return public.admin_get_catalog();
end;
$$;

create or replace function public.admin_add_company_user(
  p_organization_id uuid,
  p_user_email text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare target_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'La empresa seleccionada no existe';
  end if;

  select account.id into target_user_id
  from auth.users account
  where lower(account.email) = lower(trim(p_user_email))
  limit 1;

  if target_user_id is null then
    raise exception 'La cuenta indicada no existe';
  end if;

  insert into public.profiles (id, display_name, onboarding_completed)
  values (target_user_id, trim(p_display_name), true)
  on conflict (id) do update
    set display_name = excluded.display_name,
        onboarding_completed = true,
        updated_at = now();

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, target_user_id, 'member')
  on conflict (organization_id, user_id) do update set role = 'member';

  return public.admin_get_catalog();
end;
$$;

create or replace function public.admin_create_project(
  p_organization_id uuid,
  p_project_name text,
  p_project_type text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'La empresa seleccionada no existe';
  end if;
  if char_length(trim(p_project_name)) not between 2 and 120 then
    raise exception 'Nombre de proyecto no valido';
  end if;
  if p_project_type not in ('ups', 'agriculture', 'aquarium', 'generic') then
    raise exception 'Tipo de proyecto no valido';
  end if;

  insert into public.projects (organization_id, name, project_type, description)
  values (p_organization_id, trim(p_project_name), p_project_type, trim(p_description));

  return public.admin_get_catalog();
end;
$$;

create or replace function public.admin_assign_device(
  p_project_id uuid,
  p_device_id text,
  p_display_name text,
  p_device_type text default 'generic'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_device public.devices%rowtype;
  selected_device_id uuid;
  is_first_assignment boolean := false;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'El proyecto seleccionado no existe';
  end if;
  if char_length(trim(p_device_id)) not between 1 and 80 then
    raise exception 'ID de dispositivo no valido';
  end if;

  select * into selected_device
  from public.devices
  where device_id = trim(p_device_id)
  for update;

  if found then
    if selected_device.project_id is not null
       and selected_device.project_id <> p_project_id then
      raise exception 'El dispositivo pertenece a otro proyecto. Retiralo primero';
    end if;
    is_first_assignment := selected_device.claimed_at is null;
    selected_device_id := selected_device.id;

    update public.devices
    set project_id = p_project_id,
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name, trim(p_device_id)),
        device_type = coalesce(nullif(trim(p_device_type), ''), device_type, 'generic'),
        claimed_at = now(),
        updated_at = now()
    where id = selected_device_id;
  else
    is_first_assignment := true;
    insert into public.devices (
      device_id, display_name, device_type, claim_code_hash, project_id, claimed_at
    )
    values (
      trim(p_device_id),
      coalesce(nullif(trim(p_display_name), ''), trim(p_device_id)),
      coalesce(nullif(trim(p_device_type), ''), 'generic'),
      crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')),
      p_project_id,
      now()
    )
    returning id into selected_device_id;
  end if;

  -- Solo la primera asignacion recupera lecturas que llegaron antes del alta.
  -- Las lecturas de una empresa anterior nunca se entregan a una empresa nueva.
  if is_first_assignment then
    update public.telemetry
    set device_uuid = selected_device_id,
        project_id = p_project_id
    where device_id = trim(p_device_id)
      and project_id is null;
  end if;

  return public.admin_get_catalog();
end;
$$;

create or replace function public.admin_unassign_device(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_device_id uuid;
  previous_project_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso exclusivo del administrador general';
  end if;

  select id, project_id into selected_device_id, previous_project_id
  from public.devices
  where device_id = trim(p_device_id)
  for update;

  if selected_device_id is null then
    raise exception 'El dispositivo no existe';
  end if;

  if previous_project_id is not null then
    update public.telemetry
    set project_id = null
    where device_uuid = selected_device_id
      and project_id = previous_project_id;
  end if;

  update public.devices
  set project_id = null,
      updated_at = now()
  where id = selected_device_id;

  return public.admin_get_catalog();
end;
$$;

-- Deshabilita definitivamente el cuestionario y la vinculacion por clientes.
revoke all on function public.complete_onboarding(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_device(uuid, text, text, text)
  from public, anon, authenticated;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.get_my_workspace() from public, anon;
revoke all on function public.admin_get_catalog() from public, anon;
revoke all on function public.admin_create_workspace(text, text, text, text, text, text)
  from public, anon;
revoke all on function public.admin_add_company_user(uuid, text, text)
  from public, anon;
revoke all on function public.admin_create_project(uuid, text, text, text)
  from public, anon;
revoke all on function public.admin_assign_device(uuid, text, text, text)
  from public, anon;
revoke all on function public.admin_unassign_device(text)
  from public, anon;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.get_my_workspace() to authenticated;
grant execute on function public.admin_get_catalog() to authenticated;
grant execute on function public.admin_create_workspace(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.admin_add_company_user(uuid, text, text)
  to authenticated;
grant execute on function public.admin_create_project(uuid, text, text, text)
  to authenticated;
grant execute on function public.admin_assign_device(uuid, text, text, text)
  to authenticated;
grant execute on function public.admin_unassign_device(text)
  to authenticated;

commit;

-- PASO MANUAL OBLIGATORIO, EJECUTAR UNA VEZ DESPUES DE CAMBIAR EL CORREO:
-- insert into public.platform_admins (user_id)
-- select id from auth.users where lower(email) = lower('correo-del-jefe@empresa.com')
-- on conflict (user_id) do nothing;
