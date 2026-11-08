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
