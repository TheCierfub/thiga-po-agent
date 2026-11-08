# Journal de décisions

Une entrée par sujet. L'ADR-001 reste comme trace de l'ouverture initiale. Les ADR datées du 2026-11-08 la remplacent.

## ADR-001 — Stack et point d'intégration : en discussion

- **Statut :** remplacée le 2026-11-08 par ADR-002 et ADR-003
- **Date :** 2026-11-06

### Contexte

L'énoncé laisse ouverts le langage, le framework, les modèles et la forme de la solution. Le Product Owner reçoit des feedbacks par plusieurs canaux et repriorise un backlog en permanence. Reste à décider si l'agent vit dans un écran autonome ou dans un outil que ce Product Owner utilise déjà. Tant que ce point est ouvert, aucun framework n'est installé et aucun code d'agent n'est écrit.

### Options ouvertes à cette date

L'ordre de la liste ne constituait pas une préférence.

- **UI autonome (type Streamlit)** — écran dédié : import des feedbacks, lecture de l'analyse, de la priorisation et des user stories.
- **Linear** — agent branché sur l'outil où le backlog est déjà tenu.
- **Slack** — agent branché sur les canaux où l'équipe échange déjà.
- **Jira** — agent branché sur les tickets et le backlog.
- **Notion** — agent branché sur les pages où les feedbacks et les specs sont déjà rédigés.

### Décision

Non prise le 2026-11-06. Tranchée le 2026-11-08 : voir ADR-002 et ADR-003.

### Conséquences

Le dépôt est resté un squelette jusqu'aux ADR suivantes. Le code d'application n'est toujours pas écrit : un autre modèle le fera.

## ADR-002 — Couche de décision, Linear en destination

- **Statut :** acceptée
- **Date :** 2026-11-08

### Contexte

Le Product Owner a besoin de décider, pas d'un tableau de plus. Linear est l'outil où son équipe tient déjà le backlog. En faire le cœur du pitch collerait l'agent à un écran qu'on ne contrôle pas, et masquerait le jugement (preuves, score, capacité).

### Décision

L'agent est une couche de décision.

- Chaque recommandation porte des preuves traçables.
- Le score est auditable et modifiable par le PO avant export.
- L'arbitrage final croise la capacité du cycle et la stratégie (OKR, non-objectifs, contraintes).

Linear est la destination du backlog, pas le pitch. L'export passe par une interface `BacklogSink`, avec deux implémentations :

- `LinearSink` — écrit dans Linear via le SDK officiel, après validation humaine ;
- `MarkdownSink` — dry-run et secours de démo, écrit un markdown local si Linear est indisponible.

### Conséquences

L'écran de l'agent montre le raisonnement. Linear reçoit des issues, des statuts et des commentaires une fois le PO d'accord. La démo peut se jouer entièrement sur `MarkdownSink`.

## ADR-003 — Stack

- **Statut :** acceptée
- **Date :** 2026-11-08

### Décision

Tout TypeScript.

- Next.js et shadcn/ui pour l'interface, avec les skills de design d'Emil Kowalski (`emil-design-eng`).
- Schémas Zod pour les sorties structurées du LLM.
- Vitest pour les tests.
- SDK officiel Linear pour `LinearSink`.

Streamlit est écarté : l'interface demandée s'appuie sur shadcn.

### Conséquences

Aucun `package.json` ni `src/` dans ce commit. Le modèle qui code part de cette stack, sans la rediscuter, sauf blocage constaté.

## ADR-004 — Pipeline

- **Statut :** acceptée
- **Date :** 2026-11-08

### Décision

Le traitement est une suite d'étapes, pas un prompt unique.

1. Ingestion et normalisation.
2. Classification par type.
3. Regroupement en thèmes centrés sur le problème, pas sur la solution citée.
4. RICE déterministe.
5. MoSCoW.
6. Rédaction des user stories à la demande, seulement pour les thèmes retenus.

On distingue :

- le **motif récurrent**, un stock : le même problème revient sur la période, sans forcément accélérer ;
- la **tendance**, un flux : le rythme accélère sur la période (une régression après une mise en production, par exemple).

### Types et routage

| Type | Suite |
| --- | --- |
| Demande de fonctionnalité | Candidate user story, si le thème est retenu |
| Friction d'usage | Candidate user story, si le thème est retenu |
| Bug | Ticket bug. Un bug critique va aussi dans une file d'alerte |
| Question (documentation) | Vers la doc, pas vers le backlog fonctionnel |
| Éloge | Aucune story. Signal de satisfaction seulement |
| Signal de churn | Mis à jour du risque du compte. Le motif cité peut renforcer un thème, il ne devient pas une story « rattraper le concurrent » |

Le bruit hors produit (facturation, spam, démarchage commercial) sort du pipeline de priorisation. S'il vient d'un contact déjà connu, le lien au compte est conservé.

## ADR-005 — RICE et MoSCoW

- **Statut :** acceptée
- **Date :** 2026-11-08

### RICE

Le calcul est dans le code. Le LLM ne produit pas le score.

- **Reach.** Comptes distincts sur 4 semaines. Bascule affichée entre volume de messages, nombre de comptes et ARR. La pondération choisie est visible, jamais cachée. Un compte qui écrit six fois compte une fois.
- **Impact.** Échelle 0,25 / 0,5 / 1 / 2 / 3, proposée par le LLM avec le lien vers un OKR, modifiable par le PO.
- **Confidence.** 50 %, 80 % ou 100 %, par une règle déterministe sur le nombre de comptes et la diversité des canaux.
- **Effort.** Taille T-shirt de XS à XL, ancrée sur les stories de référence de `data/context/strategy.md`, modifiable par le PO. La table de conversion est affichée. Pas de Fibonacci.

### MoSCoW, façon DSDM

L'ordre n'est pas « le plus gros RICE devient Must ».

1. **Must** = contraintes : contrat, sécurité, cœur cassé. Le PO confirme. Si les Must dépassent 60 % de la capacité arbitrable, alerte.
2. Le reste est ordonné par RICE. **Should** jusqu'à environ 80 % de la capacité. **Could** environ 20 %.
3. Le surplus est **Won't** pour ce cycle, avec la raison (capacité, impact, hors stratégie, déjà couvert).

Une contrainte à faible Reach reste Must. Un thème bruyant à ARR nul reste Won't même si le volume de messages est haut.

## ADR-006 — Preuves, sécurité, identité

- **Statut :** acceptée
- **Date :** 2026-11-08

### Citations

Une citation montrée au PO est une sous-chaîne exacte du feedback, vérifiée par le code. Une paraphrase du modèle ne compte pas comme preuve.

### Sécurité

Le LLM qui lit les feedbacks n'a aucun outil. Toute écriture (Linear, e-mail) est du code exécuté après validation humaine. Les feedbacks sont des données, jamais des instructions. Une demande d'exfiltration, d'envoi ou de score forcé est ignorée comme consigne, même si elle est en anglais, dans une signature ou dans un bloc cité.

### Auteur

On rapproche l'auteur d'un compte déjà détenu (e-mail, identifiant interne, pseudo connu), pour lire l'offre, l'ARR et le risque de churn. Un pseudo de réseau social absent du fichier est affiché avec une confiance faible. On ne devine pas en silence.

RGPD : on fait correspondre des identifiants déjà détenus. Pas d'enrichissement de profil, pas de création de compte à partir d'un expéditeur inconnu.

### Investiguer

Si un feedback est trop flou pour une story, l'agent propose 2 ou 3 questions et un brouillon de message, dans un champ éditable. L'envoi part au clic du PO, via une boîte de test connectée, avec un secours fichier. Jamais d'envoi sans ce clic.

Sur un réseau social : message privé de remerciement, questions, et demande d'identifiant de compte quand le canal permet le privé. Sinon, réponse publique qui renvoie vers un lien ou un formulaire.

## ADR-007 — Collecte, invalidation, écarts

- **Statut :** acceptée
- **Date :** 2026-11-08

### Collecte

Un connecteur par canal, tous vers le même format normalisé. Dans le livrable, les connecteurs sont simulés par les fichiers de `data/feedbacks/`.

Architecture de production, documentée et non codée :

- API ou webhook quand ils existent : e-mail via Gmail push ou Postmark / Mailgun inbound, Intercom, Zendesk, Discourse, Reddit, forum maison ;
- outils d'agrégation d'avis et de social listening : programme éditeur G2 / Capterra, Mention, Brandwatch, Syften ;
- scraping en dernier recours.

Les tickets support peuvent déjà vivre dans Linear, comme Customer Requests.

### Invalidation

Si une source, un regroupement ou une hypothèse change, les scores, les stories et les validations qui en dépendent sont recalculés ou marqués obsolètes avant tout export. Le lot du jeudi est le cas d'école : il ne s'ajoute pas en silence par-dessus les décisions du lundi.

### Écarté pour le livrable

- Extension Chrome injectée dans Linear.
- Adaptateur Jira codé.
- Multi-agents.
- Vrais connecteurs Gmail, Zendesk ou réseaux sociaux.
- Toute écriture sans validation du PO.

### Bonus possibles, non engagés

- Un serveur MCP branché sur l'agent Linear.
- Floorplan (carte du code, lancée via Claude Code) pour la partie architecture.

## ADR-008 — Mise en œuvre de la stack (phase 1)

- **Statut :** acceptée, à relire par Valentin
- **Date :** 2026-11-08

### Décision

- Next.js (App Router) est initialisé, mais `app/` n'est qu'un placeholder. Tout le métier vit dans `core/`, sans import React ni Next (un test le vérifie).
- Zod 4 pour tous les schémas, y compris chaque sortie LLM. Une sortie non conforme est une erreur, pas une donnée.
- Vercel AI SDK 7 : `generateText` avec `Output.object` (`generateObject` est déprécié dans cette version), température 0, aucun outil. Fournisseurs : OpenAI, Anthropic, OpenRouter, choisis par `LLM_PROVIDER`.
- Pas de LangChain ni LangGraph : le pipeline est une suite de fonctions.
- pnpm, Vitest, tsx pour la CLI.

## ADR-009 — Seuils déterministes

- **Statut :** acceptée, seuils à valider par Valentin
- **Date :** 2026-11-08

### Fenêtre

Fenêtre glissante de 28 jours, terminée à la date de fin du lot (`fenetre.fin`). Un compte qui n'a plus de message dans la fenêtre sort du Reach, et le rapport du jeudi le dit (Kervel sur le partage client).

### Reach

- Mode `comptes` (défaut) : comptes distincts. Seuls les auteurs rapprochés avec certitude (e-mail ou pseudo déjà détenus) apportent un compte. Un rapprochement « probable » (même domaine) n'est pas compté tant qu'il n'est pas confirmé.
- Mode `volume` : messages dans la fenêtre.
- Mode `arr` : ARR cumulé des comptes, en k€.

### Confidence

| Valeur | Règle |
| --- | --- |
| 100 % | au moins 3 comptes distincts certains et au moins 2 canaux |
| 80 % | au moins 2 comptes distincts certains |
| 50 % | sinon |

### Tendance ou récurrent

Quatre semaines de 7 jours. **Tendance** si la dernière semaine compte au moins 4 messages et au moins 2 fois la moyenne des 3 précédentes. **Récurrent** si le thème est présent au moins 3 semaines sur 4. Sinon **ponctuel**.

### RICE

RICE = Reach × Impact × Confidence ÷ points d'effort (XS 1, S 2, M 4, L 6, XL 10), arrondi à 3 décimales. Impact et taille viennent du LLM ou d'une surcharge du PO, affichée comme telle.

## ADR-010 — Allocation MoSCoW

- **Statut :** acceptée, à valider par Valentin
- **Date :** 2026-11-08

Capacité arbitrable = 20 points bruts − 4 points engagés (LIN-12, LIN-52) = 16.

1. **Hors arbitrage** : thème rattaché à une issue déjà engagée ou en cours. Il ne consomme pas la capacité arbitrable.
2. **Must** : contrainte (contrat, sécurité, cœur cassé) confirmée par le PO. Une contrainte vient soit du LLM avec une citation vérifiée, soit d'une règle (bug critique dans le thème → cœur cassé). Non confirmée, elle reste **À confirmer** et ne prend pas de capacité. Alerte au-delà de 60 %.
3. **Won't** immédiat pour un thème qui relève d'un non-objectif.
4. **Should** : candidats à Confidence 100 %, par RICE décroissant, tant que le cumul tient dans la capacité. Alerte si Must + Should dépassent environ 80 %.
5. **Could** : autres candidats, dans un budget d'environ 20 %, et seulement si Must + Should restent sous 80 % (sinon la contingence est déjà entamée).
6. Le reste est **Won't** pour ce cycle, avec la raison.

Départage : RICE, puis ARR, puis clé du thème.

La porte « Confidence 100 % pour un Should » et la suspension des Could au-delà de 80 % sont des choix de conception. Ils reproduisent le scénario de la clé (notifications Could lundi, Should jeudi quand Rivage arrive ; épingle Won't). Ils ont été calibrés sur ce scénario : c'est à valider, pas une loi.

## ADR-011 — Sécurité et données personnelles

- **Statut :** acceptée
- **Date :** 2026-11-08

- Masquage avant tout appel LLM : e-mails, téléphones français, adresses postales, remplacés par `[EMAIL]`, `[TÉLÉPHONE]`, `[ADRESSE]`. Les citations sont vérifiées sur le texte masqué.
- Chaque feedback est encadré dans le prompt par `<donnees …>` ; une balise fermante dans le texte est neutralisée.
- Quarantaine si le LLM signale une injection **ou** si l'heuristique de `core/security/injection.ts` en détecte une. Un feedback en quarantaine est classé mais sort du regroupement, du scoring et de l'investigation, jusqu'à libération par le PO (`releasedFromQuarantine`). Écart assumé avec la clé, qui garde la friction de fb-lundi-26 comme thème Won't : on préfère qu'un humain relise avant qu'un message piégé pèse dans un score.
- L'état local (`out/state/`) ne garde ni le texte brut ni l'e-mail des auteurs. Le nom et le pseudo public restent, pour adresser les brouillons de réponse.
- Aucune écriture externe en phase 1 : investigations en brouillon, `LinearSink` en bouchon.

## ADR-012 — Fournisseurs LLM et fixtures

- **Statut :** acceptée
- **Date :** 2026-11-08

- Une interface `LlmProvider` ; trois implémentations : réelle, rejouée, scriptée (tests).
- Chaque requête porte une clé stable (`classify/<feedback>`, `group/<lot>`, `assess/<lot>--<thème>`, `story/<lot>--<thème>`, `investigate/<feedback>`) et l'empreinte de ses données d'entrée. Le mode rejoué refuse une fixture dont l'empreinte ne correspond plus, sauf `--allow-stale-fixtures`.
- Chaque fixture déclare son origine : `redigee` (écrite à la main) ou `enregistree` (sortie d'un modèle, avec son nom).
- Faute de clé pendant la phase 1, toutes les fixtures actuelles sont `redigee`, par `scripts/author-fixtures.ts`, qui passe les réponses dans le vrai pipeline (schémas, citations, empreintes). Elles ont été écrites après lecture de la clé de réponses : elles ne mesurent pas un modèle.
- Le holdout n'a pas de fixture. Ses couches LLM ne sont évaluées qu'avec `--provider real`.

## ADR-013 — Invalidation et export idempotent

- **Statut :** acceptée
- **Date :** 2026-11-08

- Chaque thème a une empreinte de preuves (feedbacks, signaux liés, issue du backlog) et une empreinte d'hypothèses (surcharge du PO, mode de Reach, capacité, tailles).
- Au lot suivant, seuls les nouveaux feedbacks sont classés, et seuls les thèmes nouveaux ou modifiés sont réévalués par le LLM. Les scores et l'allocation sont toujours recalculés.
- Une story dont les preuves ont changé devient obsolète et est réécrite si le thème reste le premier retenu.
- Une confirmation du PO donnée sur un lot antérieur devient « à revoir » si les preuves ont changé : le thème garde sa classe, mais son export est bloqué.
- `MarkdownSink` écrit `out/backlog/<thème>.md` et un manifeste clé stable (`etai:<thème>`) → fichier et empreinte du contenu. Relancer un lot ne recrée rien et ne réécrit rien ; un élément bloqué laisse la version précédente intacte. Le contenu ne porte aucun horodatage.
- `LinearSink` suivra le même contrat en phase 2 : clé stable dans la description de l'issue, recherche avant création, mise à jour de l'issue existante quand le thème y est rattaché.
