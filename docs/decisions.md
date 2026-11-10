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

## ADR-014 — Passage réel sur OpenRouter et décisions par Jev

- **Statut :** proposée, à confirmer par le premier passage réel
- **Date :** 2026-11-08

- Un seul fournisseur réel pour la comparaison : OpenRouter, en appels HTTP directs (`/api/v1/chat/completions`), sans SDK. Sortie structurée par `response_format: json_schema` strict ; le schéma envoyé est le schéma Zod sans ses bornes (longueurs, minimums), que certains fournisseurs refusent ; Zod revalide tout à la réception. Une réponse hors schéma est journalisée brute puis relancée une fois avec l'erreur. Aucun outil n'est jamais déclaré.
- Un profil (`config/llm-profiles/<nom>.json`) choisit un modèle par étape de texte (classification, regroupement et rattachement au backlog, évaluation, story, investigation) et un moteur par étape de décision (type, injection, gravité, rattachement au backlog) : `inline` (la décision reste dans la réponse de l'étape de texte, comme en phase 1), `llm` (question fermée posée à part) ou `decisions` (API Decisions d'OpenRouter, repli LLM facultatif). Les étapes servies par le même moteur partagent une requête par feedback ; le rattachement au backlog n'est demandé que pour les thèmes nouveaux.
- Jev : l'identifiant `typesafe/jev-router` désigne le routeur de TypeSafe, qui choisit un modèle génératif et son effort de raisonnement pour une requête de chat ; il ne renvoie pas de décision typée. Le modèle de décision est `typesafe/jev-1.14`, appelé par `POST /api/alpha/decisions` avec `{ model, state, questions }`. Une question `choice` (2 à 255 options, dans `criteria`) renvoie l'option, ses probabilités et une confiance ; une question `noul` renvoie la probabilité du oui. Le profil B utilise donc `typesafe/jev-1.14`. L'API est marquée alpha : chaque réponse est validée (type de chaque réponse, option connue, probabilité dans [0, 1]) ; à défaut, la réponse brute est journalisée et la question repart vers le LLM de repli, compté à part.
- Le oui d'injection est retenu à partir de 0,5, et reste combiné (ou) avec l'heuristique : le modèle peut ajouter une quarantaine, jamais en retirer une.
- Budget : un compteur global vérifie le plafond avant chaque requête, et un compteur par profil mesure appels, coût, latences et erreurs. Le coût vient de `usage.cost`, sinon de `GET /api/v1/generation?id=`. Un dépassement arrête le profil en cours sans repli ; les appels déjà partis (jusqu'à 4 en parallèle) peuvent faire dépasser le plafond de quelques centimes.
- Enregistrement : `--record-fixtures <profil>` écrit lundi et jeudi dans un dossier temporaire, n'installe les fixtures que si le profil va au bout et qu'aucun fichier ne contient la clé ou un en-tête d'autorisation, puis écrit un manifeste. Le mode rejoué lit ce manifeste pour rejouer aussi les décisions enregistrées.
- Tests : tout le câblage est exercé contre un faux serveur HTTP local qui rejoue les fixtures. Aucun appel réel n'a été fait.

### ADR-014, correctif du 2026-11-08 — plafond de jetons de sortie

- Le plafond `request.maxTokens` des profils A, B et C passe de 4 000 à 16 000.
- Cause, constatée au premier passage réel (lancé par Valentin, hors de ce dépôt) : Sonnet 5.5 consacre environ 2 500 jetons à raisonner avant de répondre ; avec 4 000, le JSON du regroupement, la réponse la plus longue, était tronqué et rejeté comme hors schéma.
- Le plafond couvre raisonnement et réponse. 16 000 laisse la marge sans changer le coût d'une réponse courte : seuls les jetons produits sont facturés.
- Les valeurs par défaut du code (`ProfileSchema`, `OpenRouterChatProvider`) restent à 4 000 : un profil écrit à la main doit fixer `request.maxTokens`.

## ADR-015 — Interface du PO et export Linear

- **Statut :** acceptée pour l'interface ; proposée pour Linear, à confirmer par le premier export réel (équipe THI)
- **Date :** 2026-11-08

### Interface

- Next.js (App Router, Cache Components), shadcn/ui sur Base UI, thème sombre. Finitions selon le skill `emil-design-eng` : courbe `ease-out` unique, appui des boutons à 0,97, transitions de 150 à 300 ms limitées à ce qui informe (bascule de lot, dépliage du calcul, valeur recalculée), `prefers-reduced-motion` respecté.
- L'interface consomme `core/` sans le réécrire. Le mode démo rejoue lundi puis jeudi par `core/pipeline/replay-demo.ts`, le même code que `pnpm export:linear` ; le résultat est mis en cache (`'use cache'`) et les pages sont prérendues pour les deux lots.
- Les arbitrages du PO (effort, MoSCoW forcé avec motif obligatoire) passent par `core/scoring/overrides.ts` : RICE recalculé avec la nouvelle taille ; une catégorie forcée réserve ses points avant l'allocation des autres thèmes ; les alertes de capacité portent sur la capacité entière. Ils sont gardés dans le navigateur, par lot, et envoyés avec la demande d'export. Ils ne touchent ni aux preuves ni aux évaluations du LLM.
- Un thème « à revoir » (confirmation donnée sur des preuves modifiées, ADR-013) ne s'exporte pas : bouton verrouillé côté interface, refus côté sink.
- Recontact : brouillons d'investigation et demandes d'identifiant de compte, construits par `core/outbox/recontact.ts`. Une réponse publique (G2, Capterra) ne demande jamais d'identifiant. « Envoyer » écrit dans `out/outbox/` après confirmation ; aucun envoi n'existe dans le code.
- L'export et la boîte de test sont des actions serveur ; le navigateur ne voit jamais la clé Linear. Le mode d'export est lu à la requête : brancher Linear ne demande qu'un redémarrage.

### LinearSink

- Le sink dépend d'un port `LinearApi` ; `core/sink/linear-api.ts` est le seul fichier qui appelle `@linear/sdk`.
- Création : titre, description, estimation (les points de `strategy.sizePoints`), label `MoSCoW : <classe>` créé au besoin, et label de catégorie (`Bug`, `Improvement`, `Feature` : les noms par défaut de Linear, pour réutiliser ceux de l'espace). Sur une issue existante, la catégorie n'est ajoutée que si l'équipe n'en a pas déjà posé une. Si l'équipe refuse l'estimation (échelle différente), l'issue est recréée sans estimation, avec une note.
- Pas de doublon : le thème rattaché à une issue existante (LIN-xx) la met à jour ; sinon l'issue est cherchée par sa clé stable `etai:<thème>`, écrite entre deux marqueurs HTML dans la description. Seule cette section est réécrite ; le texte manuel et l'estimation de l'équipe restent. Contenu et labels identiques : rien n'est envoyé.
- `LINEAR_TEAM_ID` accepte l'UUID ou la clé d'équipe ; une équipe introuvable arrête l'export avec un message explicite.
- Sans `LINEAR_API_KEY` ou `LINEAR_TEAM_ID`, l'interface bascule sur `MarkdownSink` (`out/linear-export/`) et le dit.
- Export à blanc (`--dry-run`) : `DryRunLinearApi` fait les lectures sur Linear et remplace chaque écriture par une ligne décrite. Les tests vérifient qu'aucune écriture n'atteint le faux Linear.

### Customer Requests : ce que permet l'API

Vérifié dans la documentation de l'API GraphQL de Linear avant d'écrire le code :

- une demande client se crée par `customerNeedCreate` : `issueId` (UUID ou identifiant comme `THI-12`), `customerId` ou `customerExternalId`, `body`, `attachmentUrl` facultatif, `priority` ;
- un client se crée par `customerCreate { name, externalIds }`. On lui donne l'identifiant externe `etai:<compte>`, ce qui permet de le retrouver sans doublon ;
- la fonction Customers doit être activée dans l'espace Linear. Si elle ne l'est pas, ou si la clé n'a pas les droits, l'appel échoue : l'issue reste exportée et la raison apparaît dans les notes de l'export.

Une demande par compte qui porte le thème, avec ses citations et un lien vers son premier feedback. Une demande déjà présente pour ce client sur cette issue n'est pas recréée.

### Limites

- Aucun appel réel à Linear n'a été fait : tout est testé contre un faux Linear en mémoire.
- Les LIN-xx du jeu de données sont fictifs et seront introuvables dans l'équipe THI : le premier export créera les issues.
- Les liens vers les feedbacks visent `http://localhost:43217` tant que `ETAI_PUBLIC_URL` n'est pas défini.

## Catégorie de thème : Bug, Amélioration, Nouvelle fonctionnalité

Chaque thème porte une catégorie, affichée dans le brief, la priorisation, la page du thème, les rapports Markdown et l'export.

- Proposée par l'étape d'évaluation (même appel LLM que l'impact et l'effort, pas d'appel en plus), avec une justification courte.
- Règle prioritaire : un thème dont tous les feedbacks sont des bugs est classé Bug par le code (`categorySource: "regle"`).
- Les types par feedback (demande, friction) ne suffisent pas à séparer amélioration et nouveauté : « partage client » et « notifications » ont chacun environ moitié de frictions, alors que l'un est une capacité absente et l'autre un réglage d'une fonction existante. D'où une décision du LLM, qui voit le produit et l'issue liée.
- La catégorie n'entre ni dans le RICE ni dans le MoSCoW.

## ADR-016 — Persistance Supabase, RLS ouverte au rôle anon

- **Statut :** acceptée pour la démo ; insuffisante pour une production multi-PO
- **Date :** 2026-11-09

### Contexte

Les feedbacks viennent des fixtures, les arbitrages du PO vivent dans le navigateur, et `out/` disparaît à chaque déploiement. Un PO qui reprend la main ne retrouve ni ses ajouts ni ses choix. Il n'y a pas de clé `service_role` : le seul secret disponible est la clé publishable du projet, qui authentifie le rôle Postgres `anon` tant qu'aucune session Supabase Auth n'est ouverte.

### Décision

Postgres hébergé par Supabase, lu et écrit uniquement depuis le serveur Next avec `@supabase/supabase-js`. Les variables sont `SUPABASE_URL` et `SUPABASE_KEY`. Elles ne sont pas préfixées `NEXT_PUBLIC_` : le navigateur ne reçoit pas la clé, même si une clé publishable est conçue pour pouvoir l'être.

Trois tables, dans `supabase/migrations/20261109154558_persist_po_cycle.sql` :

- `feedbacks` — texte brut, auteur, source, compte déclaré, lot. L'horodatage d'origine est gardé tel quel (`received_at_raw`) pour rester fidèle au schéma Zod.
- `analysis_runs` — un lot (lundi ou jeudi) : classifications, thèmes, évaluations, scores RICE, allocation MoSCoW, dans le JSON déjà validé par `RunStateSchema`.
- `po_arbitrages` — décisions de contraintes (`PoDecisions`) et surcharges de l'interface (effort, MoSCoW forcé).

RLS activée et forcée sur les trois. `anon` a `select`, `insert`, `update`, `delete`, avec des politiques `using (true)` / `with check (true)`. `authenticated` n'a ni grant ni politique. `service_role` a les grants mais l'application ne l'utilise pas.

Le seed (`pnpm db:seed`) rejoue les fixtures, sans modèle, et remplace le corpus. Un feedback collé dans l'interface repart du lot jeudi déjà analysé : classification et rattachement ne portent que sur ce texte, seuls les thèmes dont les preuves changent sont réévalués, tous les scores sont recalculés. Le compte choisi par le PO compte dans le Reach (`method: saisie_po`) quand l'auteur n'est pas déjà rapproché par e-mail. La fenêtre glisse jusqu'à la date du message pour qu'il y entre.

Sans `SUPABASE_URL`, ou si l'appel échoue, ou si les lots ne sont pas seedés, l'interface rejoue les fixtures et l'affiche (badge et bandeau). Aucun modèle n'est appelé dans ce repli.

Les comptes, le backlog et la stratégie restent des fichiers du dépôt : ce ne sont pas des données saisies par le PO.

### Ce qui manque pour la production

- **Auth.** Un compte par PO (Supabase Auth). Retirer les politiques `anon` et les grants associés. N'autoriser que `authenticated`, avec `auth.uid()` (ou un claim de `app_metadata`, jamais `user_metadata`). La clé publishable peut alors vivre dans le navigateur : elle n'ouvre que les lignes de l'utilisateur connecté.
- **Multi-PO.** Aujourd'hui il n'y a qu'un cycle, partagé par quiconque possède la clé. Il faut un `workspace_id` (ou `owner_id`) sur les trois tables, et des politiques qui le comparent à l'identité. Le seed et l'interface n'ont pas cette dimension.
- **Clé secrète.** Les tâches d'administration (seed, effacement du corpus) devraient passer par `service_role` ou `sb_secret_…`, hors du navigateur, et non par `anon`.
- **Données personnelles.** Les textes bruts contiennent des e-mails. Les exposer au rôle `anon` est acceptable seulement parce que la clé reste sur le serveur de démo et que le jeu est fictif. En production : chiffrement ou masquage avant stockage, durée de rétention, et plus aucun accès anonyme.
- **Comptes clients.** La liste des comptes est encore le fichier du cas. Un vrai PO doit pouvoir en ajouter sans redéployer.

### Conséquences

Le mode démo reste rejouable sans réseau. Le mode direct survit aux redéploiements Render. Tant que les politiques `anon` sont en place, toute personne qui obtient la clé publishable peut lire et modifier les feedbacks : ne pas la publier, et ne pas la considérer comme un contrôle d'accès.

## ADR-017 — Rattachement d'un feedback à un thème déjà ouvert

- **Statut :** acceptée
- **Date :** 2026-11-09

### Contexte

Le premier ajout réel (9 novembre, `fb-direct-20261109174137-tu63k0`) décrivait des notifications de retard en double et redemandait de choisir les alertes selon le rôle. Le regroupement a ouvert un thème neuf, « Notifications de retard reçues en double depuis la dernière mise à jour », à côté de `notifications` (« Régler la fréquence des notifications selon le rôle »). Le prompt ne montrait que le titre et le résumé des thèmes, et rien n'empêchait un thème isolé.

### Décision

Lors d'un ajout en direct, le rattachement compare le feedback à chaque thème ouvert : titre, résumé, deux citations. Le modèle rend une comparaison par thème et une décision (`rattacher` ou `creer`) avec une raison.

Le code tranche ensuite :

- si une comparaison dit que c'est le même problème et que le nouveau thème n'est pas lié à ce thème, le feedback rejoint le thème existant. La raison le dit, et `forced` est vrai ;
- un thème nouveau n'est gardé, dans ce cas, que s'il cite le thème proche dans `relatedThemeIds` (un bug distinct, visible sur la page du thème) ;
- la création sans lien n'est acceptée que si aucune comparaison ne reconnaît le problème. La raison est alors `creationRationale`.

Les lots rejoués (lundi, jeudi) gardent l'ancien regroupement : leurs fixtures ne portent pas ces comparaisons.

Le compte-rendu (durées de classification, rattachement, réévaluation et écriture, jetons, coût, RICE et MoSCoW des thèmes touchés) est un champ facultatif `ingest` du JSON `changes`. Pas de migration SQL : les lignes déjà en base restent lisibles. Une ligne JSON est écrite dans les logs du serveur, sans clé et sans texte brut.

## ADR-018 — Jev décide, Sonnet rédige

- **Statut :** acceptée pour l'ajout direct ; à confirmer par le premier passage en prod
- **Date :** 2026-11-09

### Contexte

Le 8 novembre, Jev (`typesafe/jev-1.14`, `POST /api/alpha/decisions`) a pris 49 décisions sans réponse illisible ni repli, pour 0,002 $. Le profil B coûtait quand même 0,52 $ parce que Sonnet refaisait une classification complète (type, injection, gravité) avant que Jev ne décide la même chose. En prod, avec le profil A, un ajout prend 33,8 s : trois appels Sonnet d'environ 11 s, en série.

### Décision

Le profil par défaut de l'ajout direct est B (`ETAI_LLM_PROFILE` vide). A et C restent sélectionnables.

- Type, injection, gravité et rattachement au backlog : Jev seul. Sonnet n'est plus interrogé là-dessus. La citation affichée est la première phrase du texte, sous-chaîne exacte vérifiée par le code : pas d'appel pour l'extraire.
- Thème, à l'ajout seulement : une question `choice` de plus, dans le même appel Jev. Les options sont les thèmes ouverts (identifiant, titre, résumé dans le `state`) et « aucun ». Si la confiance, ou à défaut la probabilité de l'option, atteint `ETAI_THEME_CONFIDENCE` (défaut 0,8) et que Jev n'est pas tombé en repli, on rattache sans appel `group`. Sinon Sonnet compare les thèmes comme dans l'ADR-017 et nomme un thème nouveau s'il le faut.
- Erreur Jev : repli Sonnet, compté. La confiance du repli n'est pas calibrée, donc on ne rattache pas sur elle seule.
- Évaluation : Sonnet reste le modèle. Il n'est appelé que pour un thème nouveau, ou si le palier de confiance change (2 comptes → 80 %, 3 comptes et 2 canaux → 100 %). Sinon RICE et MoSCoW sont recalculés en code avec l'impact et l'effort déjà connus.

Latence et coût attendus pour un rattachement sûr : un appel Jev, aucun Sonnet, de l'ordre du centime et de quelques secondes au lieu de trois fois 11 s. Un thème nouveau : un Jev, un regroupement Sonnet, une évaluation Sonnet, et un Jev de backlog.

La fenêtre du lot ne glisse pas à l'ajout. Le seed s'arrête au 6 novembre. Un feedback du 9 novembre, s'il décalait la fin de fenêtre, ferait sortir `fb-lundi-07` (Tuile) du thème épingle photo : Reach 2 → 1, confiance 80 % → 50 %, RICE 0,80 → 0,25, sans que ce thème ait reçu le message. Le nouveau feedback est compté dans le Reach du thème qu'il rejoint, même daté après la revue. Les autres thèmes gardent exactement le score du seed. Une confirmation déjà « à revoir » le reste tant que les preuves de ce thème n'ont pas changé.

### Risques

- L'API Decisions est alpha : la forme de la réponse peut changer. Une réponse illisible part en repli, elle n'est pas inventée.
- Les questions sont en français. Jev a tenu ce jour-là, ce n'est pas une garantie.
- La citation automatique est la première phrase, pas le meilleur extrait choisi par un modèle. Elle reste une sous-chaîne exacte.

## ADR-019 — Écoute X par interrogation depuis la page

- **Statut :** acceptée pour la démo
- **Date :** 2026-11-09

### Contexte

Valentin publie un post sur X pendant la restitution. Il faut le voir arriver comme un feedback, traité par le même passage direct que le collage (Jev, rattachement, RICE et MoSCoW), et mesurer le temps entre la publication et l'écran.

Treg ne pousse rien : il faut demander. L'offre gratuite de Render endort le service web après un moment sans visite, donc un cron sur ce service ne tient pas la cadence. L'API X officielle demanderait un compte développeur, et une recherche récente y coûte 0,005 $ par résultat. La recherche routée Treg coûte de 0,00075 $ à 0,015 $ par appel, sans compte développeur.

### Décision

L'écoute n'est pas dans l'écran de Nadia. Elle est product owner : la requête, le coût, la pause et les délais sont de l'outillage d'exploitation. Cette séparation est voulue. Nadia voit le post comme un feedback, avec l'icône X, le compte et le lien. Sa liste se rafraîchit, et un feedback apparu depuis l'ouverture de sa page est signalé une fois.

L'interrogation vit sur `/ops/ecoute`, hors de la navigation, tant que cet onglet est ouvert. Le navigateur y appelle `pollXMentions` toutes les 20 secondes (minimum 10, `ETAI_X_POLL_SECONDS`). Un passage déjà en cours est sauté. L'écoute s'arrête au bout de 30 minutes, ou si le coût cumulé des en-têtes `X-Treg-Cost-Micro` atteint `ETAI_X_MAX_SESSION_USD` (défaut 0,50 $). Chaque recherche est plafonnée à 0,02 $. L'adresse n'est pas un contrôle d'accès : elle est seulement absente du menu.

L'appel part d'abord vers AnyAPI en direct, avec `queryType: Latest`, parce que ce tri n'existe pas sur la recherche routée. La recherche routée n'est appelée que si AnyAPI ne répond pas. La requête affichée sur la page d'exploitation reste réglable (`ETAI_X_QUERY`, défaut `#etai OR @etai`) : ce mot-dièse et ce compte existent déjà hors d'Étaï, et c'est le point de départ à l'ouverture qui les laisse de côté.

Le premier passage ne reprend pas l'historique. Il ne traite que les posts publiés après l'ouverture de `/ops/ecoute`, moins 2 minutes. Un réglage de cette page peut élargir aux dernières heures, pour le cas où le post de démo n'est pas encore indexé. Les posts de plus de 7 jours sont écartés. Un post déjà enregistré (`fb-x-<id>`) ne l'est pas une seconde fois.

Chaque post ingéré garde trois horodatages avec le feedback : publication sur X, détection par le passage Treg, fin de `ingestDirectFeedback`. `/ops/ecoute` relit ce tableau après un rechargement. Le texte du post passe par la détection d'injection de Jev, comme un collage.

Le jeton `TREG_TOKEN` reste sur le serveur. Il n'est ni envoyé au navigateur, ni écrit dans les logs.

### Production

Un worker ou un cron, sur une instance qui ne s'endort pas, interrogerait Treg ou recevrait un flux. Mieux : un webhook, ou le filtered stream de l'API X, pour ne plus dépendre d'une page ouverte. Le plafond de session et la marge de 2 minutes sont des garde-fous de démo, pas le régime cible.

## ADR-020 — La story se rédige à la demande

- **Statut :** acceptée
- **Date :** 2026-11-09

### Contexte

Le pipeline rédigeait automatiquement la story du premier thème retenu de chaque lot. Les autres thèmes affichaient « Pas de story rédigée… l'export reste possible ». La PO veut décider quand une story existe, la relire, la modifier, puis envoyer cette version à Linear.

### Décision

Un lot ne rédige plus de story tout seul. Sur chaque thème, « Générer la user story » appelle le même passage Sonnet que `draftStory` : feedbacks masqués, citations déjà vérifiées, feedbacks en quarantaine exclus. Le modèle rend toujours une story structurée. Le code la sérialise en un seul texte (titre, récit, critères, complexité). La PO édite ce texte. « Valider et exporter vers Linear » envoie ce texte tel quel, et le titre de l'issue est le titre écrit dans le texte. Il n'y a pas de bouton pour régénérer.

En mode direct, la story générée ou éditée est écrite dans l'analyse du lot (Supabase). `pnpm db:seed` recharge le corpus et retire ces éditions. Les stories déjà en base avant ce changement y restent jusqu'au prochain seed. En mode démo, la rédaction rejoue une réponse déjà écrite si elle existe, et reste dans l'écran.

### Conséquences

L'évaluation comparative peut encore demander une story (`draftStory: true`) pour mesurer le modèle. Le chemin produit, le seed et la commande, ne le font plus. Le passage Sonnet (modèle, budget, température) n'a pas changé : seul le texte montré à la PO a changé.

## ADR-021 — Le sentiment se décide avec le type

- **Statut :** acceptée
- **Date :** 2026-11-09

### Contexte

Nadia veut un ton par feedback (positif, neutre, négatif, frustré) dans la liste des sources, sans un appel de modèle de plus.

### Décision

Jev (`typesafe/jev-1.14`) répond à une question `choice` de plus, dans le même appel que le type, l'injection et la gravité. Quatre options : positif, neutre, négatif, frustré. Si la confiance est sous 0,8, si elle est absente, ou si Jev est tombé en repli, la valeur affichée est « indéterminé ». Le profil A, qui ne pose pas de question à Jev, laisse « indéterminé » : on n'ajoute pas d'appel.

Le sentiment est un champ facultatif de la classification, dans le JSON `analysis_runs.state` déjà stocké. Pas de nouvelle colonne, pas de migration SQL. Un état déjà en base reste lisible ; les feedbacks sans sentiment s'affichent « indéterminé ».

Les 52 feedbacks du corpus de démo ont une valeur écrite à la main dans `fixtures/sentiment/demo.json`. Ce ne sont pas des sorties de Jev. `pnpm db:seed` et le mode démo les posent au rejeu. Un ajout direct ou un post X reçu ensuite passe par Jev.

### Conséquences

Relancer le seed recharge ces 52 valeurs et retire les sentiments décidés en direct sur le corpus. Le badge est dans l'en-tête de l'accordéon des sources : entreprise, prénom et nom, sentiment, puis à droite la date et le canal.

## ADR-022 — Un thème exporté sort de l'arbitrage

- **Statut :** acceptée
- **Date :** 2026-11-10

### Contexte

Envoyer un thème vers Linear ne changeait rien dans le lot. L'identifiant de l'issue n'était pas retenu, le thème restait dans le MoSCoW, et un feedback arrivé ensuite ne prévenait pas l'issue.

### Décision

L'issue (`id`, `identifier` du type THI-12, `url`) est un champ facultatif `linearExport` du thème, dans le JSON `analysis_runs.state`. Pas de nouvelle colonne, pas de migration SQL : un état déjà en base reste lisible.

Après un export réussi, le thème est « Engagé (THI-xx) », hors arbitrage, sur le même principe que LIN-12 et LIN-52 : ses points ne comptent plus. Le reste du lot est réalloué. Si un thème monte d'une classe, le brief le dit (`capacityFreed`). Les feedbacks présents à l'export sont « Traité · THI-xx ».

Un feedback saisi ensuite, ou venu de X, et rattaché à ce thème ne le remet pas dans l'arbitrage. Il ajoute un commentaire sur l'issue (citation, entreprise, canal, date, Reach), marqué `<!-- etai-feedback:id -->` pour qu'un second essai ne le poste pas deux fois. Si Linear ne répond pas, le feedback est « En attente » et l'ingestion continue. La description de l'issue liste toujours les feedbacks sources sous la story.

`pnpm db:seed` remplace l'analyse par le corpus rejoué, donc sans ces liens. Les issues déjà dans Linear ne sont pas modifiées.

### Conséquences

Seule l'équipe configurée reçoit les commentaires. Le code ne parle à Linear que pour l'issue enregistrée. La clé reste sur le serveur.

## ADR-023 — Une clé Linear par navigateur

- **Statut :** acceptée
- **Date :** 2026-11-10

### Contexte

Chacun doit pouvoir exporter vers son propre espace Linear, sans qu'on stocke sa clé dans Supabase et sans qu'elle parte vers l'équipe configurée par défaut.

### Décision

Le badge de l'en-tête ouvre une modale. La clé est vérifiée (viewer et organisation), puis l'utilisateur choisit une équipe. Elle est chiffrée en AES-256-GCM dans un cookie httpOnly, SameSite=Lax, Secure dès que la page est en HTTPS, pour 7 jours. Le secret est `LINEAR_KEY_COOKIE_SECRET` : 32 octets en base64. La clé ne revient pas au client, n'est pas journalisée, et n'est pas en base.

S'il y a un cookie, l'export et les commentaires l'utilisent. Sinon, `LINEAR_API_KEY` et `LINEAR_TEAM_ID`. « Déconnecter » efface le cookie. Le garde-fou n'est plus « seulement THI » : c'est l'équipe choisie pour cette connexion. `linearExport` retient l'id de l'espace et de l'équipe. Un feedback sur un thème exporté ailleurs reste en attente, avec un message, plutôt que d'échouer.

### Limites et risque

Une clé personnelle agit comme le compte qui l'a créée, et elle ne expire pas tant qu'on ne la révoque pas dans Linear. Pour un essai : permissions Read, Create issues et Create comments, limitées à une équipe. Write est nécessaire pour mettre à jour une issue, un label ou une demande client. Le cookie peut être volé si le navigateur l'est : le chiffrement protège la base et les logs, pas un poste compromis. Le secret serveur doit rester hors du dépôt.

### Conséquences

Sans `LINEAR_KEY_COOKIE_SECRET`, la modale refuse de garder une clé. Le statut reste en cache 60 secondes, par clé et par équipe.

## ADR-024 — Lien magique pour les actions qui coûtent

- **Statut :** acceptée
- **Date :** 2026-11-10

### Contexte

La lecture du lot peut rester publique. Générer une story, classer un feedback, écouter X et écrire dans Linear avec la clé du serveur dépensent un budget ou touchent un espace partagé.

### Décision

Supabase Auth envoie un lien magique. Le serveur vérifie l'adresse avec `getClaims` (le cookie n'est pas cru tel quel) et la compare à `ALLOWED_EMAILS`, avant l'envoi du lien et dans chaque action protégée. Une adresse refusée reçoit le même texte qu'une adresse acceptée. Les cookies de session passent par `@supabase/ssr`. Le retour se fait vers la page d'origine, jamais vers un autre site.

Une clé Linear personnelle, déjà chiffrée dans le navigateur, autorise l'export vers cet espace sans lien. La génération et l'ajout restent fermés.

### Conséquences

Sans `ALLOWED_EMAILS`, ou sans session, ces actions répondent qu'une connexion est requise. La clé publishable reste côté serveur. Il faut régler Site URL, les Redirect URLs et le modèle d'e-mail sur le projet Auth. Rien de cela n'est écrit dans le dépôt.
