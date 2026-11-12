-- Plus de comptes : un seul compteur « global » par action et par jour.
-- L'ancienne fonction exigeait auth.uid(). Celle-ci est appelée par le serveur
-- avec la clé publishable (rôle anon).

alter table public.usage_counters drop constraint if exists usage_counters_user_id_fkey;
alter table public.usage_counters alter column user_id type text using user_id::text;

create or replace function public.consume_global_quota(
  p_action text,
  p_day date,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_action not in ('story', 'feedback', 'export') then
    raise exception 'action inconnue';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'plafond invalide';
  end if;

  perform pg_advisory_xact_lock(hashtext('global:' || p_action || ':' || p_day::text));

  insert into public.usage_counters as counters (user_id, action, day, count)
  values ('global', p_action, p_day, 1)
  on conflict (user_id, action, day)
  do update set count = counters.count + 1
  returning count into next_count;

  if next_count > p_limit then
    update public.usage_counters
      set count = count - 1
      where user_id = 'global' and action = p_action and day = p_day;
    return -1;
  end if;

  return next_count;
end;
$$;

revoke all on function public.consume_global_quota(text, date, integer) from public;
grant execute on function public.consume_global_quota(text, date, integer) to anon, authenticated;
