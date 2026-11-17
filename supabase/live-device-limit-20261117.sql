-- Limite transacional de cinco aparelhos por sessão ao vivo.
-- Não altera nem consulta a biblioteca shared_songs.
create or replace function public.enforce_live_device_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_status text;
  v_leader_device text;
  v_active_count integer;
begin
  select owner_id, status, leader_device_id
    into v_owner, v_status, v_leader_device
    from public.live_sessions
   where id = new.session_id
   for update;

  if not found then
    raise exception 'Sessão de compartilhamento não encontrada.';
  end if;

  if v_owner is distinct from auth.uid() then
    raise exception 'Somente o proprietário pode autorizar aparelhos.';
  end if;

  if v_status <> 'active' then
    raise exception 'A sessão de compartilhamento está encerrada.';
  end if;

  if new.role = 'leader' and new.device_id <> v_leader_device then
    raise exception 'Somente o aparelho principal registrado pode ser líder.';
  end if;

  if new.role = 'participant' and new.device_id = v_leader_device then
    raise exception 'O aparelho principal não pode entrar como participante.';
  end if;

  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id
       or new.device_id <> old.device_id
       or new.role <> old.role then
      raise exception 'A identidade e a função do aparelho não podem ser alteradas.';
    end if;
    if old.role = 'leader' and old.authorized and not new.authorized then
      raise exception 'O aparelho principal não pode revogar a si próprio.';
    end if;
  end if;

  if new.authorized then
    if tg_op = 'UPDATE' then
      select count(*) into v_active_count
        from public.live_devices
       where session_id = new.session_id
         and authorized = true
         and id <> old.id;
    else
      select count(*) into v_active_count
        from public.live_devices
       where session_id = new.session_id
         and authorized = true;
    end if;

    if v_active_count >= 5 then
      raise exception 'Limite de cinco aparelhos autorizados atingido.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists live_devices_enforce_limit on public.live_devices;
create trigger live_devices_enforce_limit
before insert or update on public.live_devices
for each row execute function public.enforce_live_device_limit();

revoke all on function public.enforce_live_device_limit() from public, anon, authenticated;
