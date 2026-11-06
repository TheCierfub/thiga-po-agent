# Feedbacks fictifs

Format prévu pour les exemples de feedbacks. Les trois fichiers JSON de ce dossier illustrent ce format. Le jeu complet de démonstration (feedbacks, demandes, éléments de backlog) reste à constituer : l'énoncé n'en fournit pas.

## Objet JSON

Encodage UTF-8. Une fiche = un fichier.

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant stable, unique dans le jeu d'exemples. |
| `source` | Canal d'arrivée : `email`, `ticket` ou `commentaire`. |
| `date` | Date de réception, au format `AAAA-MM-JJ`. |
| `client` | Nom du compte client. Les noms de ces exemples sont fictifs. |
| `segment` | Libellé libre (taille, plan, contexte). L'énoncé ne fixe pas de liste de segments. |
| `texte` | Corps du feedback, tel qu'il est arrivé, sans reformulation. |

## Exemples présents

- [`fb-001.json`](fb-001.json) — email
- [`fb-002.json`](fb-002.json) — ticket
- [`fb-003.json`](fb-003.json) — commentaire

## Ce que la fiche ne contient pas

Motif, tendance, demande extraite, score, classe MoSCoW ou RICE, user story, critères d'acceptation et complexité sont des sorties d'analyse. Ils ne font pas partie du feedback brut.
