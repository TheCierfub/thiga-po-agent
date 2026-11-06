# Énoncé — Test technique Product Builder

Reformulation structurée du document PDF « Test technique · Product Builder — Construire un agent IA au service d'un Product Owner » (3 pages). Le texte ci-dessous suit le document. Aucun attendu n'y est ajouté.

## Contexte

Une startup SaaS développe une plateforme de gestion de projet. Son Product Owner est submergé par les feedbacks clients et les demandes de fonctionnalités, qui lui arrivent par plusieurs canaux : emails, tickets, commentaires.

Il doit dans le même temps reprioriser le backlog en permanence. Il a besoin d'un assistant intelligent qui l'aide à prendre ses décisions.

Repères posés par le document : startup SaaS, gestion de projet, feedbacks multicanaux, backlog à prioriser, user stories.

## Mission

Concevoir et construire un agent IA qui assiste ce Product Owner au quotidien, sur trois tâches qui lui prennent du temps :

1. analyser les feedbacks clients ;
2. prioriser les fonctionnalités ;
3. rédiger les user stories.

Aucun jeu de données n'est fourni. Les exemples (feedbacks, demandes, éléments de backlog) servant à la démonstration sont à constituer soi-même.

## Fonctionnalités attendues

Les trois blocs sont attendus. La profondeur de traitement de chacun relève des arbitrages du candidat et est évaluée au titre de la complétude. Le document indique que rien n'empêche d'aller au-delà.

### 1. Analyse des feedbacks — Comprendre

- Traiter les feedbacks clients : emails, tickets, commentaires.
- Identifier les motifs récurrents et les tendances.
- Extraire les demandes de fonctionnalités.

### 2. Aide à la priorisation — Arbitrer

- Proposer un scoring des fonctionnalités selon différents critères.
- Appliquer des frameworks de priorisation (MoSCoW, RICE…).
- Expliquer et justifier les recommandations de priorisation.

### 3. Rédaction assistée — Formaliser

- Générer des user stories structurées selon les standards.
- Proposer des critères d'acceptation pertinents.
- Estimer la complexité relative de développement.

## Livrables attendus

Le document annonce trois livrables, et une restitution de 30 minutes.

### 1. Agent fonctionnel

- Le code source de l'agent, dans le langage et avec le framework de son choix.
- Les fonctionnalités des trois blocs, utilisables sur les exemples constitués pour l'occasion.
- Les tests jugés nécessaires.

### 2. Documentation

Un document qui explique la démarche et les choix techniques. Format libre.

- La démarche : comment on est passé du problème à l'agent (hypothèses, étapes, itérations, impasses), ce qui a été délégué aux assistants IA et ce qui a été vérifié soi-même.
- Les choix techniques et ce qui les motive.

### 3. Présentation et démonstration

30 minutes devant le jury : 20 minutes de présentation, dont la moitié consacrée à montrer l'agent en action, puis 10 minutes de questions.

Découpage indiqué dans le document :

| Durée | Bloc | Contenu |
| --- | --- | --- |
| 10 min | Démonstration | L'agent en action sur des cas concrets |
| 5 min | Architecture | Architecture et choix techniques |
| 5 min | Démarche et difficultés | Le chemin suivi, les obstacles et leurs solutions |
| 10 min | Questions | Échange avec le jury sur les choix |

## Critères d'évaluation

| Critère | Poids | Ce que le document décrit |
| --- | --- | --- |
| Compréhension métier | 20 % | Les enjeux du Product Owner sont compris : des feedbacks qui le submergent et un backlog à reprioriser en permanence. L'agent l'aide concrètement à prendre ses décisions. |
| Démarche | 20 % | Le chemin du problème à l'agent est lisible : les hypothèses posées, ce qui a été essayé puis abandonné, la façon dont l'IA a été mise à contribution et contrôlée. |
| Qualité technique | 15 % | Architecture, code et tests. La solution fonctionne, ses composants s'articulent logiquement et les choix techniques restent proportionnés au besoin. |
| Expérience utilisateur | 15 % | Simplicité et efficacité d'usage : un Product Owner peut se servir de l'agent sans friction. |
| Complétude | 10 % | Jusqu'où la réflexion a été poussée : couverture des fonctionnalités attendues et profondeur de traitement de chacune. |
| Présentation | 20 % | Clarté et pédagogie, pendant la présentation comme dans les réponses aux questions. La démonstration montre l'agent sur des cas concrets et les choix sont expliqués. |

## Format et modalités

| Volet | Modalités indiquées |
| --- | --- |
| Préparation | Libre. Aucune durée imposée. Langage, framework, modèles et outils au choix. |
| Restitution | 30 minutes : 20 minutes de présentation + 10 minutes de questions. |
| Ressources autorisées | Tout, assistants IA compris. L'usage est à décrire dans la documentation. Le jury interrogera dessus. |

## Rappel figurant dans le document

Le sujet est volontairement ouvert. Au-delà des fonctionnalités attendues, le périmètre, la forme et les outils sont à la main du candidat. Le document indique que l'équipe aime être surprise, et qu'elle attend une solution réfléchie, que l'on sait défendre, plutôt qu'une solution parfaite. Les assistants IA sont autorisés parce qu'ils seront utilisés en mission. Pour toute question sur le sujet, le document invite à les contacter.
