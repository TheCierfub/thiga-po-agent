# Feedbacks fictifs — Étai

Jeu synthétique pour la démo et l'évaluation. Aucune personne réelle, aucun e-mail hors domaine `.example`.

Les trois fiches d'illustration (`fb-001` à `fb-003`) sont remplacées par trois lots.

| Fichier | Rôle | Volume |
| --- | --- | --- |
| [`batch-lundi.json`](batch-lundi.json) | Pile lue le lundi 2 novembre 2026, quatre semaines de messages | 40 |
| [`batch-jeudi.json`](batch-jeudi.json) | Delta du jeudi 5 et du vendredi 6 novembre | 12 |
| [`holdout.json`](holdout.json) | Évaluation seulement. Hors démo, hors réglage de seuils | 10 |

Le holdout reprend les mêmes pièges sous d'autres formulations. Le mélanger au lot de démo fausse la relecture.

Comptes, stratégie et backlog ouvert : [`../context/`](../context/). Intention de conception : [`../answer-key.md`](../answer-key.md).

## Fichier

```json
{
  "lot": "lundi",
  "usage": "demonstration",
  "fenetre": { "debut": "2026-10-06", "fin": "2026-11-02" },
  "feedbacks": []
}
```

## Feedback

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant stable (`fb-lundi-01`, `fb-jeudi-01`, `fb-hold-01`). |
| `canal` | `email`, `ticket_support`, `avis_g2`, `avis_capterra`, `forum_produit`, `reddit`, `x`. |
| `date` | Horodatage ISO 8601, offset `+01:00`. |
| `auteur` | `nom`, `email`, `pseudo`, `anonyme`. L'un de ces signes peut manquer. |
| `account_id` | Compte déjà connu, ou `null`. |
| `langue` | `fr` ou `en`. Quelques messages sont en anglais, d'autres glissent une phrase anglaise dans un texte français. |
| `texte` | Brut : fautes, signatures, fils cités, longueurs variables. |

`account_id` n'est rempli que lorsqu'un e-mail ou un pseudo du texte figure déjà sur le compte. Un expéditeur inconnu reste `null` : on ne crée pas de fiche client pour l'exercice.

## Ce que le feedback ne contient pas

Type, thème, score, classe MoSCoW, user story, sévérité et rattachement Linear sont des sorties. Ils sont décrits, comme intention et non comme résultat d'exécution, dans la clé de réponses.
