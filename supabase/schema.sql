create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source_row integer unique,
  name text not null,
  sku text not null default '',
  price_cents integer not null check (price_cents >= 0),
  image text not null default './product-placeholder.svg',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.products from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select (id, email, display_name, role, status, created_at) on public.profiles to authenticated;
grant update (status) on public.profiles to authenticated;
grant select (id, name, sku, image, description, active) on public.products to anon, authenticated;
grant insert (name, sku, price_cents, image, description, active) on public.products to authenticated;
grant update (name, sku, price_cents, image, description, active) on public.products to authenticated;

create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'approved'
  );
$$;

revoke all on function public.is_catalog_admin() from public, anon;
grant execute on function public.is_catalog_admin() to authenticated;

drop policy if exists "Users can read their own profile and admins can read all profiles" on public.profiles;
create policy "Users can read their own profile and admins can read all profiles"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_catalog_admin()));

drop policy if exists "Admins can update customer approval status" on public.profiles;
create policy "Admins can update customer approval status"
on public.profiles for update to authenticated
using (role = 'customer' and (select public.is_catalog_admin()))
with check (role = 'customer' and (select public.is_catalog_admin()));

drop policy if exists "Anyone can read active product details" on public.products;
create policy "Anyone can read active product details"
on public.products for select to anon, authenticated
using (active);

drop policy if exists "Admins can read all product records" on public.products;
create policy "Admins can read all product records"
on public.products for select to authenticated
using ((select public.is_catalog_admin()));

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
on public.products for insert to authenticated
with check ((select public.is_catalog_admin()));

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
on public.products for update to authenticated
using ((select public.is_catalog_admin()))
with check ((select public.is_catalog_admin()));

create or replace function public.products_with_prices()
returns table (
  id uuid,
  name text,
  sku text,
  price_cents integer,
  image text,
  description text,
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'approved'
      and profiles.role in ('customer', 'admin')
  ) then
    raise exception 'Aprovacao necessaria para consultar precos.'
      using errcode = '42501';
  end if;

  return query
    select p.id, p.name, p.sku, p.price_cents, p.image, p.description, p.active
    from public.products as p
    where p.active
    order by p.name;
end;
$$;

create or replace function public.admin_list_products()
returns table (
  id uuid,
  source_row integer,
  name text,
  sku text,
  price_cents integer,
  image text,
  description text,
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_catalog_admin()) then
    raise exception 'Acesso administrativo necessario.'
      using errcode = '42501';
  end if;

  return query
    select p.id, p.source_row, p.name, p.sku, p.price_cents, p.image, p.description, p.active
    from public.products as p
    order by p.name;
end;
$$;

revoke all on function public.products_with_prices() from public, anon;
revoke all on function public.admin_list_products() from public, anon;
grant execute on function public.products_with_prices() to authenticated;
grant execute on function public.admin_list_products() to authenticated;

create or replace function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    'customer',
    'pending'
  );
  return new;
end;
$$;

revoke all on function public.create_customer_profile() from public, anon, authenticated;

drop trigger if exists create_customer_profile_after_signup on auth.users;
create trigger create_customer_profile_after_signup
after insert on auth.users
for each row execute function public.create_customer_profile();
