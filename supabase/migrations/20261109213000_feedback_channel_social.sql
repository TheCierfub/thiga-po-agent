-- Canal « social » pour les posts X remontés par l'écoute Treg.
-- À appliquer sur la base avant la démo : le check actuel refuse toute autre valeur.

alter table public.feedbacks drop constraint feedbacks_channel_check;

alter table public.feedbacks add constraint feedbacks_channel_check check (
  channel in (
    'email',
    'ticket_support',
    'avis_g2',
    'avis_capterra',
    'forum_produit',
    'reddit',
    'x',
    'social'
  )
);
