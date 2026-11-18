-- Compartilhamento ao Vivo do Louvores
-- Executado no projeto cwnybkcrlljbebaxscvc em 17/11/2026.
-- As tabelas ficam protegidas por RLS e disponíveis somente a authenticated.

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  leader_device_id text not null,
  invite_code_hash text not null,
  status text not null default 'active' check (status in ('active','ended')),
  song_key text,
  song_title text,
  scroll_top double precision not null default 0,
  scroll_speed double precision not null default 1,
  is_scrolling boolean not null default false,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.live_devices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  role text not null default 'participant' check (role in ('leader','participant')),
  authorized boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(session_id, device_id)
);
create index if not exists live_sessions_owner_status_idx on public.live_sessions(owner_id,status);
create index if not exists live_devices_session_authorized_idx on public.live_devices(session_id,authorized,role);

alter table public.live_sessions enable row level security;
alter table public.live_devices enable row level security;

drop policy if exists "Louvores: ver próprias sessões ao vivo" on public.live_sessions;
create policy "Louvores: ver próprias sessões ao vivo" on public.live_sessions
for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "Louvores: criar própria sessão ao vivo" on public.live_sessions;
create policy "Louvores: criar própria sessão ao vivo" on public.live_sessions
for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Louvores: atualizar própria sessão ao vivo" on public.live_sessions;
create policy "Louvores: atualizar própria sessão ao vivo" on public.live_sessions
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Louvores: encerrar própria sessão ao vivo" on public.live_sessions;
create policy "Louvores: encerrar própria sessão ao vivo" on public.live_sessions
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Louvores: ver aparelhos da própria sessão" on public.live_devices;
create policy "Louvores: ver aparelhos da própria sessão" on public.live_devices
for select to authenticated using (
 exists (select 1 from public.live_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
);
drop policy if exists "Louvores: registrar aparelho autorizado" on public.live_devices;
create policy "Louvores: registrar aparelho autorizado" on public.live_devices
for insert to authenticated with check (
 exists (
   select 1 from public.live_sessions s
   where s.id = session_id and s.owner_id = (select auth.uid())
   and ((role = 'leader' and device_id = s.leader_device_id) or role = 'participant')
 )
);
drop policy if exists "Louvores: atualizar aparelho da própria sessão" on public.live_devices;
create policy "Louvores: atualizar aparelho da própria sessão" on public.live_devices
for update to authenticated using (
 exists (select 1 from public.live_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
) with check (
 exists (select 1 from public.live_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
);
drop policy if exists "Louvores: remover aparelho da própria sessão" on public.live_devices;
create policy "Louvores: remover aparelho da própria sessão" on public.live_devices
for delete to authenticated using (
 exists (select 1 from public.live_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
);

drop policy if exists "Louvores: ouvir transmissão privada" on realtime.messages;
create policy "Louvores: ouvir transmissão privada" on realtime.messages
for select to authenticated using (
 extension in ('broadcast','presence')
 and exists (
   select 1 from public.live_sessions s
   where s.id::text = split_part(realtime.topic(), ':', 2)
     and s.owner_id = (select auth.uid()) and s.status = 'active'
     and exists (select 1 from public.live_devices d where d.session_id=s.id and d.authorized=true)
 )
);
drop policy if exists "Louvores: somente líder transmite comandos" on realtime.messages;
create policy "Louvores: somente líder transmite comandos" on realtime.messages
for insert to authenticated with check (
 extension = 'broadcast'
 and exists (
   select 1 from public.live_sessions s
   join public.live_devices d on d.session_id=s.id
   where s.id::text = split_part(realtime.topic(), ':', 2)
     and s.owner_id = (select auth.uid()) and s.status = 'active'
     and d.role = 'leader' and d.authorized = true and d.device_id = s.leader_device_id
 )
);

revoke all on table public.live_sessions, public.live_devices from anon;
grant select, insert, update, delete on table public.live_sessions, public.live_devices to authenticated;
