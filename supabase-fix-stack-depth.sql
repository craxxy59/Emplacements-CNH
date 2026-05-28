-- PATCH RAPIDE SI TU AS DEJA INSTALLE LE SCHEMA
-- A exécuter dans Supabase SQL Editor pour corriger :
-- "stack depth limit exceeded"

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

drop policy if exists "profiles self read or admin" on public.profiles;
drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles update own safe or admin" on public.profiles;

create policy "profiles select own or admin"
on public.profiles
for select
using (auth.uid() = id or public.is_admin());

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
