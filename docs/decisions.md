# Journal de décisions

Une entrée par sujet. Tant qu'un choix n'est pas fait, le statut reste « en discussion » et aucune option n'est retenue.

## ADR-001 — Stack et point d'intégration : en discussion

- **Statut :** en discussion
- **Date :** 2026-11-06

### Contexte

L'énoncé laisse ouverts le langage, le framework, les modèles et la forme de la solution. Le Product Owner reçoit des feedbacks par plusieurs canaux et repriorise un backlog en permanence. Reste à décider si l'agent vit dans un écran autonome ou dans un outil que ce Product Owner utilise déjà. Tant que ce point est ouvert, aucun framework n'est installé et aucun code d'agent n'est écrit.

### Options ouvertes

L'ordre de la liste ne constitue pas une préférence.

- **UI autonome (type Streamlit)** — écran dédié : import des feedbacks, lecture de l'analyse, de la priorisation et des user stories.
- **Linear** — agent branché sur l'outil où le backlog est déjà tenu.
- **Slack** — agent branché sur les canaux où l'équipe échange déjà.
- **Jira** — agent branché sur les tickets et le backlog.
- **Notion** — agent branché sur les pages où les feedbacks et les specs sont déjà rédigés.

D'autres points d'intégration restent possibles : l'énoncé ne ferme pas la liste.

### Décision

Non prise.

### Conséquences

Le dépôt en reste au squelette : énoncé reformulé, ce journal, format d'exemples de feedbacks. Le choix de stack et le code de l'agent viendront dans une entrée ultérieure, quand une option aura été retenue.
