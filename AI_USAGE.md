# Usage des IA

Journal tenu au fil de l'eau. Il sert la partie « démarche » de l'énoncé : ce qui a été délégué à un modèle, et ce qui reste à vérifier par Valentin.

## 2026-11-08 — Architecture

Brainstorm d'architecture confronté à plusieurs modèles frontier via OpenRouter : Gemini, Claude Opus et GPT.

Retenu :

- une couche de décision, avec des preuves traçables, un score auditable et modifiable, et un arbitrage capacité / stratégie ;
- le contexte stratégique en entrée de la priorisation ;
- le MoSCoW façon DSDM ;
- le Reach compté en comptes distincts ;
- les citations vérifiées par le code ;
- le backlog existant en entrée ;
- un mode jeudi, où un second lot fait bouger les priorités.

Rejeté :

- un récit d'erreur d'IA inventé ;
- un volume d'environ 60 feedbacks ;
- l'estimation en Fibonacci ;
- des faits de marché non vérifiés.

## 2026-11-08 — Jeu de données

Le jeu synthétique (contexte Étai, comptes, backlog, lots lundi, jeudi et holdout, clé de réponses) a été rédigé par Grok 4.7. Le modèle est volontairement différent de celui qui codera l'agent, pour limiter la circularité.

Valentin relit et valide avant de figer les seuils comme oracle de test, en particulier la capacité arbitrable, la table de tailles, et les classes MoSCoW du scénario d'intention.

Aucun incident à signaler.

## 2026-11-08 — Phase 1 : cœur de l'agent

Modèle : Claude Opus 5.5, en agent dans Cursor.

Généré par le modèle :

- tout le code de `core/` (schémas, étapes, règles de scoring, pipeline, CLI, évaluation) et ses tests ;
- l'initialisation Next.js et la configuration (TypeScript strict, Vitest, ESLint) ;
- `data/context/strategy.json`, copie structurée de `strategy.md` ;
- `data/po-decisions.json` ;
- les réponses LLM de `fixtures/llm/`, rédigées à la main par le même modèle, après lecture de la clé de réponses. Aucune clé d'API n'était disponible : aucune réponse n'a été produite par un modèle appelé en direct ;
- les ADR 008 à 013 et ce README.

À relire par Valentin :

- les seuils de l'ADR-009 (fenêtre, Confidence, tendance) et la règle d'allocation de l'ADR-010, calibrée pour reproduire le scénario de la clé ;
- l'écart sur fb-lundi-26 (quarantaine plutôt que thème Won't, ADR-011) ;
- les prompts de `core/steps/`, jamais confrontés à un vrai modèle ;
- la concordance entre `strategy.json` et `strategy.md` ;
- un premier passage `pnpm eval --provider real`, seul résultat qui mesurera un modèle.

Aucun incident à signaler.

## 2026-11-08 — Phase 1bis : préparation du passage réel

Modèle : Claude Opus 5.5, en agent dans Cursor.

Généré par le modèle :

- le client OpenRouter (`core/llm/openrouter/`), les profils A, B et C, les moteurs de décision (`core/llm/decisions.ts`, `core/steps/decide.ts`), `pnpm eval:compare` et ses tests contre un faux serveur ;
- l'ADR-014 et la section du README sur le passage réel.

Recherche : le format de l'API Decisions et la nature de `typesafe/jev-router` viennent de la documentation publique d'OpenRouter (guides Jev et Jev Router, référence de l'API Decisions). Aucune clé n'était disponible : aucun appel réel n'a été fait, aucun chiffre de coût ou de qualité de modèle n'est encore connu.

À relire par Valentin :

- le remplacement de `typesafe/jev-router` par `typesafe/jev-1.14` dans le profil B (ADR-014) ;
- les questions fermées posées à Jev, en français, dans `core/steps/decide.ts` ;
- le premier `summary.md` réel, seul résultat qui comparera des modèles.

Aucun incident à signaler.
