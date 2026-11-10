-- Louvores: estrutura de sincronização na nuvem
-- Execute no Supabase SQL Editor do projeto cwnybkcrlljebabxscvc.
-- Não apaga músicas nem dados existentes.

create table if not exists public.user_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.shared_songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text,
  category text,
  musical_key text,
  capo text,
  chords text,
  chord_color text,
  lyric_color text,
  font_family text,
  bold boolean,
  source_local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.register_pending_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_approvals (user_id, email, approved)
  values (new.id, new.email, false)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_pending on auth.users;
create trigger on_auth_user_created_pending
after insert on auth.users
for each row execute procedure public.register_pending_user();


-- Permite atualizar a cópia compartilhada da mesma música pelo mesmo usuário.
create unique index if not exists shared_songs_owner_source_unique
on public.shared_songs (owner_id, source_local_id);

alter table public.user_approvals enable row level security;
alter table public.shared_songs enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Ver própria aprovação" on public.user_approvals;
create policy "Ver própria aprovação"
on public.user_approvals for select to authenticated
using (auth.uid() = user_id or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com');

drop policy if exists "Administrador aprova usuários" on public.user_approvals;
create policy "Administrador aprova usuários"
on public.user_approvals for update to authenticated
using (lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com');

drop policy if exists "Aprovados leem músicas compartilhadas" on public.shared_songs;
create policy "Aprovados leem músicas compartilhadas"
on public.shared_songs for select to authenticated
using (
  exists (select 1 from public.user_approvals a
          where a.user_id = auth.uid() and a.approved = true)
  or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com'
);

drop policy if exists "Aprovados publicam músicas" on public.shared_songs;
create policy "Aprovados publicam músicas"
on public.shared_songs for insert to authenticated
with check (
  owner_id = auth.uid()
  and (exists (select 1 from public.user_approvals a
               where a.user_id = auth.uid() and a.approved = true)
       or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com')
);

drop policy if exists "Dono ou administrador atualiza músicas" on public.shared_songs;
create policy "Dono ou administrador atualiza músicas"
on public.shared_songs for update to authenticated
using (owner_id = auth.uid() or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com')
with check (owner_id = auth.uid() or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com');

drop policy if exists "Dono ou administrador remove músicas" on public.shared_songs;
create policy "Dono ou administrador remove músicas"
on public.shared_songs for delete to authenticated
using (owner_id = auth.uid() or lower(coalesce(auth.jwt()->>'email','')) = 'binhabh10@gmail.com');

drop policy if exists "Usuário gerencia próprias configurações" on public.user_settings;
create policy "Usuário gerencia próprias configurações"
on public.user_settings for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
