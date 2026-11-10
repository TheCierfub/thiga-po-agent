-- Plafonds du jour pour les actions qui coûtent.
--
-- La table n'est pas lisible par anon ni authenticated : aucune politique.
-- Seule consume_quota, exécutée avec les droits du propriétaire, incrémente
-- le compteur du auth.uid() courant. Elle refuse si le compte ou le total
-- du jour dépasse le plafond, et annule alors son +1.
-- La clé secrète n'est pas utilisée. Le navigateur n'a pas la clé publishable.

create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  day date not null,
  count integer not null default 0,
  primary key (user_id, action, day),
  constraint usage_counters_action_check check (action in ('story', 'feedback', 'export')),
  constraint usage_counters_count_check check (count >= 0)
);

comment on table public.usage_counters is
  'Nombre d''actions coûteuses par compte et par jour (fuseau Europe/Paris, calculé par l''application).';

create index usage_counters_action_day_idx on public.usage_counters (action, day);

alter table public.usage_counters enable row level security;

revoke all on table public.usage_counters from public, anon, authenticated;

create or replace function public.consume_quota(
  p_action text,
  p_day date,
  p_user_limit integer,
  p_global_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_count integer;
  global_count integer;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_action not in ('story', 'feedback', 'export') then
    raise exception 'action inconnue';
  end if;
  if p_user_limit is null or p_user_limit < 0 then
    raise exception 'plafond invalide';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_action || ':' || p_day::text));

  insert into public.usage_counters as counters (user_id, action, day, count)
  values (uid, p_action, p_day, 1)
  on conflict (user_id, action, day)
  do update set count = counters.count + 1
  returning count into user_count;

  if user_count > p_user_limit then
    update public.usage_counters
      set count = count - 1
      where user_id = uid and action = p_action and day = p_day;
    return -1;
  end if;

  if p_global_limit is not null then
    select coalesce(sum(count), 0) into global_count
      from public.usage_counters
      where action = p_action and day = p_day;
    if global_count > p_global_limit then
      update public.usage_counters
        set count = count - 1
        where user_id = uid and action = p_action and day = p_day;
      return -1;
    end if;
  end if;

  return user_count;
end;
$$;

revoke all on function public.consume_quota(text, date, integer, integer) from public, anon;
grant execute on function public.consume_quota(text, date, integer, integer) to authenticated;
