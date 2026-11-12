# Étai · Agent IA pour Product Owner

Cas pratique Thiga, poste Product Builder : un agent qui aide Nadia, PO d'un SaaS de pilotage de chantier, à analyser les feedbacks clients, prioriser le backlog et rédiger les user stories, jusqu'à l'issue Linear.

- **Présentation (Google Slides)** : [Thiga · Restitution case study Product Builder](https://docs.google.com/presentation/d/16djw2qlmxY8vSz63ubYyRwfii0mS9yKJVNRM27mkwrM/edit) <!-- TODO Valentin : partager le deck en lecture avant de publier ce README -->
- **Application en ligne** : [thiga-po-agent.onrender.com](https://thiga-po-agent.onrender.com) (offre gratuite Render : le premier affichage après une pause peut prendre quelques dizaines de secondes)
- **Carte interactive du code (Floorplan)** : [thiga-po-agent.onrender.com/floorplan.html](https://thiga-po-agent.onrender.com/floorplan.html)

## Le problème

Nadia Ferri est Product Owner d'**Étai**, un SaaS de pilotage de chantier pour les PME du bâtiment. Les feedbacks arrivent par plusieurs canaux — e-mail, tickets support, avis G2 / Capterra, X / Reddit. Dans la démo, seul X est écouté en direct (via Treg, depuis `/ops/ecoute`) ; les autres canaux sont la cible, représentés aujourd'hui par le jeu de données et par les feedbacks collés dans l'interface. Elle repriorise le backlog chaque semaine, dans Linear. Le concurrent cité par les clients qui menacent de partir est Vertuoza.

Le jeu de démo compte 52 feedbacks fictifs (lot du lundi : 40, lot du jeudi : 12), plus 10 feedbacks de holdout réservés à l'évaluation. Contexte, OKR et capacité du cycle : [`data/context/strategy.md`](data/context/strategy.md).

## Ce que fait l'agent

| Bloc | Ce qui se passe | Qui décide |
| --- | --- | --- |
| **1. Analyser les feedbacks** | Masquage des données personnelles, rapprochement auteur → compte client, classification (type, gravité, sentiment, injection de prompt), regroupement en thèmes avec citations exactes. Un feedback collé dans l'interface ou capté sur X est rattaché à un thème ouvert ou en ouvre un nouveau. | **Jev** (`typesafe/jev-1.14`) rattache les cas clairs (confiance ≥ 0,8). **Sonnet** tranche les cas ambigus : il compare le feedback aux thèmes ouverts, le rattache ou crée et nomme un thème, puis rédige les user stories. Le code a le dernier mot : citations vérifiées (sous-chaîne exacte du texte), RICE et MoSCoW DSDM déterministes. |
| **2. Prioriser** | **RICE** calculé en code (Reach en comptes distincts sur une fenêtre de 28 jours, Confidence selon l'étendue des preuves), puis **MoSCoW façon DSDM** : remplissage de la capacité du cycle, Must ≤ ~60 %, alerte au-delà de ~80 % pour Must + Should, le reste en Could puis Won't. La PO peut forcer une classe ou changer l'effort, avec un motif. | Code déterministe et testé, jamais le modèle |
| **3. Rédiger et exporter** | User story générée **à la demande** sur un thème (récit, critères d'acceptation, complexité), éditable en un seul texte, puis « Valider et exporter vers Linear ». | Sonnet rédige ; la PO valide |

Le jeudi, un second lot fait bouger les priorités : l'écran « Ce qui a changé » montre le thème touché, le RICE, la Confidence et le MoSCoW avant et après.

## Fonctionnalités ajoutées pendant la phase de production (PR #1 à #14)

- **Persistance Supabase** et ajout de feedback en direct (PR #1), rattachement au thème existant (PR #2, #3).
- **Écoute X via Treg** depuis la page d'exploitation `/ops/ecoute`, hors de la navigation de Nadia (PR #4).
- **Stories à la demande**, sentiment par feedback, badges Négatif / Frustré (PR #5 à #7).
- **Badge Linear** dans l'en-tête, affiché seulement si Linear répond (PR #8).
- **Cycle de vie après export** (PR #9) : le thème exporté passe « Engagé (THI-xx) » et sort de l'arbitrage, sa capacité est réallouée aux autres thèmes ; les feedbacks présents deviennent « Traité · THI-xx » ; un feedback arrivé ensuite sur ce thème est posté en **commentaire sur l'issue**, sans doublon.
- **Clé Linear personnelle** (PR #10) : vérifiée auprès de l'API, choix de l'équipe, chiffrée en AES-256-GCM dans un cookie httpOnly de 7 jours, jamais en base ni renvoyée au navigateur.
- **Code d'accès** : la démo est fermée par un code partagé (`DEMO_ACCESS_CODE`), vérifié côté serveur. Un cookie signé ouvre l'application pendant 7 jours. Sans cette variable, l'accès est refusé.
- **Quotas globaux** : 30 stories et 200 classifications par jour pour toute la démo, 20 exports avec la clé Linear du serveur. Le badge n'est vert qu'avec une clé personnelle.
- **Carte Floorplan** de l'architecture servie par l'app (PR #14).

## Architecture

```
Navigateur ─▶ Next.js 16 (Render) ─┬─▶ OpenRouter ─┬─ Jev (typesafe/jev-1.14) : rattache les cas clairs (confiance ≥ 0,8)
                                   │               └─ Claude Sonnet : tranche les cas ambigus (compare, rattache ou crée le thème) et rédige les US
                                   ├─▶ Code déterministe : RICE, MoSCoW DSDM, citations, invalidation
                                   ├─▶ Supabase : Postgres (feedbacks, analyses, arbitrages) + usage_counters (plafond global)
                                   ├─▶ Linear SDK : issues, labels, demandes clients, commentaires
                                   └─▶ Treg : écoute X en direct (les autres canaux — e-mail, tickets, G2/Capterra, Reddit — sont la cible)
```

- **Interface** : Next.js 16, React 19, TypeScript strict, composants shadcn/ui, thème sombre.
- **Contrats** : chaque réponse de modèle est un objet validé par **Zod**. Le modèle n'a aucun outil : il ne peut que renvoyer ce schéma.
- **Modèles via OpenRouter** : une seule API pour plusieurs fournisseurs, ce qui simplifie les appels et permet un repli. Profil par défaut B : Jev décide (type, injection, gravité, sentiment, backlog, thème d'un ajout). Si sa confiance sur le thème atteint 0,8 (`ETAI_THEME_CONFIDENCE`), le feedback est rattaché sans autre appel ; sinon Sonnet compare le feedback aux thèmes ouverts et, si besoin, nomme un thème nouveau, puis le code tranche (un « créer » qui contredit sa propre comparaison est forcé en « rattacher »). En cas d'échec de Jev, repli Sonnet. Budget plafonné à 1 $ par ajout. Mesures en production : Jev ≈ 0,9 s et ~0,0001 $ par décision ; une story Sonnet ≈ 50,6 s et ~0,07 $.
- **Tests** : Vitest, **199 tests sur 37 fichiers, tous verts** : règles RICE et MoSCoW, rattachement, export Linear, code d'accès, quotas, sécurité, avec un faux OpenRouter et un faux Linear.
- **Persistance** : Supabase, appelé uniquement depuis le serveur Next ; la clé n'est jamais préfixée `NEXT_PUBLIC_`.
- **Déploiement** : Render (`render.yaml`), redéploiement à chaque commit sur `main`, contrôle de santé sur `/lundi`.
- **Carte Floorplan** : 217 fichiers, servie à [`/floorplan.html`](https://thiga-po-agent.onrender.com/floorplan.html).

Le détail des choix est dans [`docs/decisions.md`](docs/decisions.md) (ADR-001 à ADR-025).

## Lancer en local

Node 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # http://localhost:43217, mode démo sans aucune clé
pnpm test         # Vitest (199 tests)
pnpm typecheck && pnpm lint
```

Sans variable d'environnement, l'interface rejoue des réponses déjà écrites (`fixtures/llm/`, rédigées à la main) : aucun appel de modèle, aucun réseau. Un bandeau l'indique.

**Mode direct** (base + modèles) : copier `.env.example` vers `.env` (jamais commité), renseigner `DEMO_ACCESS_CODE`, `ACCESS_COOKIE_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`, et pour l'export `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `LINEAR_KEY_COOKIE_SECRET`. Sans `DEMO_ACCESS_CODE` ou `ACCESS_COOKIE_SECRET`, l'application refuse l'accès. Appliquer les migrations de `supabase/migrations/`, puis :

```bash
pnpm db:seed      # recharge les 52 feedbacks et les analyses lundi/jeudi, retire les ajouts faits dans l'interface
```

Pour la démo en ligne, l'accès se fait avec le **code partagé** (`DEMO_ACCESS_CODE`), puis on peut coller une clé Linear personnelle pour exporter vers sa propre équipe. Le code n'est pas écrit dans ce dépôt.

Autres commandes : `pnpm agent run --batch lundi|jeudi` (pipeline en ligne de commande, sorties dans `out/`), `pnpm export:linear --batch lundi --dry-run`, `pnpm eval` (comparaison à la clé de réponses), `pnpm eval:compare` (profils A, B, C sur de vrais modèles, plafond 5 $).

## Démarche et usage de l'IA

Le journal complet est [`AI_USAGE.md`](AI_USAGE.md). Règle tenue tout du long : **j'initie, l'IA exécute, je vérifie puis décide**.

1. **Tableau blanc** : cadrage du problème de Nadia et des rituels de la semaine (canaux, sentiment, reformulation, intégration Linear, hiérarchisation, catégorisation).
2. **Board de modèles frontier** : utilisation croisée d'Opus, Gemini Pro et GPT via OpenRouter pour confronter les premières idées, puis itération avec Grok Bot, qui a l'intégralité du contexte. Retenu : une couche de décision avec preuves traçables, un score auditable, le MoSCoW façon DSDM, le Reach en comptes distincts.
3. **Première piste abandonnée** : une extension Chrome greffée sur Linear, jugée difficile à maintenir et trop bruyante pour la PO (injection dans le DOM, puis appel à l'API Linear).
4. **Application dédiée, Linear en destination** : Linear est l'outil le plus répandu chez les équipes produit de startup (Jira conviendrait mieux à une PME plus traditionnelle). Treize itérations produit (PR #1 à #13), chacune testée en ligne, plus la carte Floorplan (PR #14).
5. **Jeu de données** rédigé par Grok 4.7, un modèle volontairement différent de celui qui code, pour limiter la circularité.
6. **Code et tests** dans Cursor (cloud agent) : Claude Opus 5.5 pour l'architecture, Grok 4.7 pour les modifications. Dans l'outil, Jev classifie les feedbacks, Sonnet rédige les user stories.

**Ce que j'ai vérifié moi-même** : le jeu de données et les seuils (RICE, allocation MoSCoW), relus et validés ; les sorties réelles (un JSON tronqué constaté et corrigé à la main, voir `AI_USAGE.md`) ; les mesures en production (parcours, UX/UI, temps et coût de Jev et des stories) ; l'accès par code et les quotas ; l'export réel vers Linear et les commentaires sur une issue exportée.

**Difficultés**

- **Brainstorm trop conceptuel** : le board de modèles frontier a sur-intellectualisé la solution. Il a fallu revenir au quotidien du PO, en repartant du tableau de départ.
- **Assistant IA instable (Grok Bot et Cursor)** : le contexte n'a pas toujours été mémorisé (OpenRouter et Jev oubliés, confusion entre Étai et Vertuoza). Parade : décisions écrites dans les ADR et le journal, relus à chaque reprise.
- **Sonnet lent et imprécis** : le modèle créait des thèmes trop granulaires et mettait trop de temps à répondre. Parade : Jev rattache les cas clairs (confiance ≥ 0,8), Sonnet tranche les cas ambigus et rédige les US ; le code a le dernier mot (RICE et MoSCoW DSDM déterministes, citations vérifiées).

## Sécurité et limites connues

- **Base de données** : les trois tables de l'application sont lues et écrites avec le rôle `anon` (clé publishable gardée côté serveur, jamais envoyée au navigateur), avec des politiques RLS ouvertes. Compromis de démo documenté dans l'ADR-016 : quiconque obtiendrait cette clé pourrait modifier les données. Correctif prévu : passer le serveur sur la clé secrète et supprimer les politiques `anon`.
- **Données** : un seul cycle partagé, sans séparation par compte. Le jeu est fictif.
- **Écoute sociale** : Treg interroge X toutes les 20 s tant que `/ops/ecoute` est ouverte (arrêt après 30 min ou 0,50 $), pas de worker : l'offre gratuite de Render endort le service. Reddit et les autres canaux ne sont pas branchés en direct.
- **Fixtures** : rédigées à la main, elles démontrent le pipeline, pas la qualité d'un modèle.

## Prochaines étapes

- **OAuth Linear** : remplacer la clé API collée par une connexion en un clic.
- **Comptes séparés**, si la démo doit dépasser un code partagé.
- **Refonte UX** : mieux afficher « Ce qui a changé » depuis la dernière connexion.
- **Données par compte** : un `workspace_id` sur les tables, des politiques RLS fondées sur `auth.uid()`, plus aucun accès anonyme.
- Un worker pour l'écoute X, ou un webhook, au lieu d'une page ouverte.
