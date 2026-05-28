-- CNH Marina Manager
-- Schéma Supabase FINAL
-- Corrige aussi le problème : "stack depth limit exceeded"

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'manager', 'viewer');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.app_role not null default 'viewer',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  boat_name text not null,
  licence_number text not null,
  registration_number text,
  boat_type text,
  status text not null default 'actif' check (status in ('actif', 'hivernage', 'maintenance', 'archive')),
  owner_name text not null,
  owner_phone text not null,
  owner_email text,
  emergency_contact text,
  zone_id text not null check (zone_id in ('A', 'B', 'C')),
  slot_number integer not null,
  length_m text,
  width_m text,
  equipment text,
  notes text,
  photo_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, slot_number)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'viewer',
    true
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

-- IMPORTANT
-- Ces fonctions sont en SECURITY DEFINER pour éviter la récursion RLS
-- qui provoquait l'erreur : "stack depth limit exceeded"
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer'::public.app_role);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'::public.app_role;
$$;

create or replace function public.can_manage_boats()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin'::public.app_role, 'manager'::public.app_role);
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_manage_boats() to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_boats_updated_at on public.boats;
create trigger set_boats_updated_at
before update on public.boats
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.boats enable row level security;

-- Nettoyage des anciennes policies si elles existent
drop policy if exists "profiles self read or admin" on public.profiles;
drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles update own safe or admin" on public.profiles;
drop policy if exists "boats authenticated read" on public.boats;
drop policy if exists "boats manager insert" on public.boats;
drop policy if exists "boats manager update" on public.boats;
drop policy if exists "boats manager delete" on public.boats;

-- Profiles
create policy "profiles select own or admin"
on public.profiles
for select
using (auth.uid() = id or public.is_admin());

-- L'utilisateur peut mettre à jour sa propre ligne
-- mais doit conserver son rôle actuel.
-- Cela permet à l'app de mettre must_change_password=false
-- après changement de mot de passe, sans permettre l'auto-escalade admin.
create policy "profiles update own safe or admin"
on public.profiles
for update
using (auth.uid() = id or public.is_admin())
with check (
  public.is_admin()
  or (
    auth.uid() = id
    and role = public.current_user_role()
  )
);

-- Boats
create policy "boats authenticated read"
on public.boats
for select
using (auth.role() = 'authenticated');

create policy "boats manager insert"
on public.boats
for insert
with check (public.can_manage_boats());

create policy "boats manager update"
on public.boats
for update
using (public.can_manage_boats())
with check (public.can_manage_boats());

create policy "boats manager delete"
on public.boats
for delete
using (public.can_manage_boats());

-- Après création du premier compte admin dans Supabase Auth,
-- exécuter cette requête en remplaçant l'email :
-- update public.profiles
-- set role = 'admin', must_change_password = true
-- where email = 'admin@votre-club.fr';
