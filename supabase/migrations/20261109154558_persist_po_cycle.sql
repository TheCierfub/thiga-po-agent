-- Cycle PO : feedbacks bruts, analyse (thèmes, classifications, scores) et arbitrages.
--
-- Compromis de démo, documenté dans docs/decisions.md (ADR-016).
-- La clé publishable (SUPABASE_KEY) agit avec le rôle anon, sans session.
-- anon peut lire et écrire uniquement ces trois tables. authenticated n'a aucun
-- droit : un utilisateur connecté ne voit rien tant qu'une politique auth.uid()
-- n'existe pas. Le rôle service_role (clé secrète, absente de ce dépôt) contourne
-- la RLS ; il n'est pas utilisé par l'application.
--
-- En production : révoquer anon, activer l'auth, et remplacer ces politiques
-- par des règles limitées au PO authentifié. Les textes bruts contiennent des
-- e-mails : ne pas les exposer avec une clé publique.

create table public.feedbacks (
  id text primary key,
  batch text not null,
  channel text not null,
  received_at timestamptz not null,
  received_at_raw text not null,
  author jsonb not null,
  source_account_id text,
  language text not null,
  body text not null,
  origin text not null,
  created_at timestamptz not null default now(),
  constraint feedbacks_batch_check check (batch in ('lundi', 'jeudi')),
  constraint feedbacks_channel_check check (
    channel in (
      'email',
      'ticket_support',
      'avis_g2',
      'avis_capterra',
      'forum_produit',
      'reddit',
      'x'
    )
  ),
  constraint feedbacks_language_check check (language in ('fr', 'en')),
  constraint feedbacks_origin_check check (origin in ('seed', 'direct')),
  constraint feedbacks_author_object_check check (jsonb_typeof(author) = 'object'),
  constraint feedbacks_body_not_blank_check check (char_length(btrim(body)) > 0)
);

comment on table public.feedbacks is
  'Feedbacks bruts, e-mail d''auteur inclus. Le texte masqué est dans analysis_runs.state.';

comment on column public.feedbacks.received_at_raw is
  'Horodatage d''origine, tel que validé par Zod, sans réécriture de fuseau.';

comment on column public.feedbacks.body is
  'Texte brut collé par la source ou par le PO.';

create index feedbacks_batch_received_at_idx
  on public.feedbacks (batch, received_at desc);

create table public.analysis_runs (
  batch text primary key,
  state jsonb not null,
  new_feedback_ids jsonb not null,
  changes jsonb,
  updated_at timestamptz not null default now(),
  constraint analysis_runs_batch_check check (batch in ('lundi', 'jeudi')),
  constraint analysis_runs_state_object_check check (jsonb_typeof(state) = 'object'),
  constraint analysis_runs_new_ids_array_check check (jsonb_typeof(new_feedback_ids) = 'array'),
  constraint analysis_runs_changes_check check (changes is null or jsonb_typeof(changes) = 'object')
);

comment on table public.analysis_runs is
  'Résultat d''analyse d''un lot : classifications, thèmes, RICE, allocation MoSCoW.';

create table public.po_arbitrages (
  batch text primary key,
  decisions jsonb not null,
  overrides jsonb not null,
  updated_at timestamptz not null default now(),
  constraint po_arbitrages_batch_check check (batch in ('lundi', 'jeudi')),
  constraint po_arbitrages_decisions_object_check check (jsonb_typeof(decisions) = 'object'),
  constraint po_arbitrages_overrides_object_check check (jsonb_typeof(overrides) = 'object')
);

comment on table public.po_arbitrages is
  'Arbitrages du PO : confirmations de contraintes, surcharges d''effort et MoSCoW forcé.';

alter table public.feedbacks enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.po_arbitrages enable row level security;

alter table public.feedbacks force row level security;
alter table public.analysis_runs force row level security;
alter table public.po_arbitrages force row level security;

revoke all on table public.feedbacks from public, anon, authenticated;
revoke all on table public.analysis_runs from public, anon, authenticated;
revoke all on table public.po_arbitrages from public, anon, authenticated;

grant select, insert, update, delete on table public.feedbacks to anon;
grant select, insert, update, delete on table public.analysis_runs to anon;
grant select, insert, update, delete on table public.po_arbitrages to anon;

grant select, insert, update, delete on table public.feedbacks to service_role;
grant select, insert, update, delete on table public.analysis_runs to service_role;
grant select, insert, update, delete on table public.po_arbitrages to service_role;

create policy feedbacks_anon_select
  on public.feedbacks
  for select
  to anon
  using (true);

create policy feedbacks_anon_insert
  on public.feedbacks
  for insert
  to anon
  with check (true);

create policy feedbacks_anon_update
  on public.feedbacks
  for update
  to anon
  using (true)
  with check (true);

create policy feedbacks_anon_delete
  on public.feedbacks
  for delete
  to anon
  using (true);

create policy analysis_runs_anon_select
  on public.analysis_runs
  for select
  to anon
  using (true);

create policy analysis_runs_anon_insert
  on public.analysis_runs
  for insert
  to anon
  with check (true);

create policy analysis_runs_anon_update
  on public.analysis_runs
  for update
  to anon
  using (true)
  with check (true);

create policy analysis_runs_anon_delete
  on public.analysis_runs
  for delete
  to anon
  using (true);

create policy po_arbitrages_anon_select
  on public.po_arbitrages
  for select
  to anon
  using (true);

create policy po_arbitrages_anon_insert
  on public.po_arbitrages
  for insert
  to anon
  with check (true);

create policy po_arbitrages_anon_update
  on public.po_arbitrages
  for update
  to anon
  using (true)
  with check (true);

create policy po_arbitrages_anon_delete
  on public.po_arbitrages
  for delete
  to anon
  using (true);
