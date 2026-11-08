# Agent IA pour Product Owner

Assistant d'un Product Owner de startup SaaS de gestion de projet : analyser les feedbacks clients, éclairer la priorisation du backlog et rédiger les user stories.

Présentation : [lien Google Slides à venir]

## Problème et persona

Nadia Ferri est Product Owner d'**Étai**, un SaaS de pilotage de chantier pour les PME du bâtiment. Les feedbacks arrivent par e-mail, ticket, avis G2 et Capterra, forum, Reddit et X. Elle repriorise le backlog chaque semaine. Son équipe produit tient déjà ce backlog dans Linear.

Le cas fictif, les OKR et la capacité du cycle sont dans [`data/context/strategy.md`](data/context/strategy.md).

## Démo

_À compléter quand l'agent tourne._

Deux temps de données sont prêts : la pile du lundi 2 novembre 2026 ([`data/feedbacks/batch-lundi.json`](data/feedbacks/batch-lundi.json)) et le delta du jeudi 5 novembre ([`data/feedbacks/batch-jeudi.json`](data/feedbacks/batch-jeudi.json)). Le fichier [`data/feedbacks/holdout.json`](data/feedbacks/holdout.json) reste hors démo.

## Architecture (à venir)

Décidée, pas encore codée. L'agent est une couche de décision : preuves traçables, score modifiable, arbitrage capacité / stratégie. Linear est la destination, via `LinearSink`. `MarkdownSink` couvre le dry-run et le secours de démo.

Stack retenue : TypeScript, Next.js, shadcn/ui, Zod, Vitest, SDK Linear. Détail et écarts : [`docs/decisions.md`](docs/decisions.md).

## Démarche et choix techniques

L'énoncé reformulé est dans [`docs/brief.md`](docs/brief.md). Le journal de décisions est dans [`docs/decisions.md`](docs/decisions.md).

## Ce qui a été délégué à l'IA vs vérifié manuellement

Le journal est [`AI_USAGE.md`](AI_USAGE.md). Le jeu de données a été rédigé par un modèle différent de celui qui codera l'agent. La relecture des seuils (capacité, tailles, classes) reste à Valentin. Le code, lui, n'est pas encore écrit.

## Limites et prochaines étapes

- Pas d'application dans ce dépôt : ni `src/`, ni `package.json`.
- Les connecteurs de canaux sont des fichiers. L'architecture de production est décrite, pas branchée.
- `data/feedbacks/holdout.json` ne sert pas à régler les seuils.
- Le scénario de points dans la clé de réponses est une intention, pas un oracle figé.

## Lancer le projet

_À compléter quand l'application Next.js sera ajoutée._

Rien ne s'exécute encore. Les données se lisent sans installation.

## Arborescence

```
AI_USAGE.md                 journal d'usage des IA
docs/brief.md               énoncé reformulé
docs/decisions.md           ADR
data/context/strategy.md    vision, OKR, capacité, stories de référence
data/context/accounts.json  15 comptes fictifs
data/context/backlog.json   10 issues Linear ouvertes
data/feedbacks/             lots lundi, jeudi, holdout
data/answer-key.md          intention de conception
data/answer-key.json        même clé, pour la machine
```
