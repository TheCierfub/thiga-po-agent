# Étai — contexte stratégique

Document fictif. Il sert d'entrée à l'agent : la priorisation se juge contre cette stratégie, pas dans le vide.

## La startup

Étai est un SaaS de pilotage de chantier pour les PME du bâtiment : gros œuvre, second œuvre, petits promoteurs, bureaux de contrôle, de 5 à 80 personnes. Le chef d'équipe ouvre l'outil sur le téléphone, souvent avec un réseau faible, pour poser des réserves, des photos et un avancement que le client comprend.

Ce n'est pas un outil de gestion de projet logiciel. L'équipe produit d'Étai, elle, tient son backlog dans Linear. Nadia Ferri en est la Product Owner.

Version en production au moment des lots : **2.4.0, mise en ligne le 27 octobre 2026**, qui refond la synchronisation des réserves. Les signalements de perte ou de blocage de saisie commencent le lendemain.

## Vision

Devenir le système que le chef de chantier garde ouvert jusqu'à la réception, là où le groupe WhatsApp et le tableur Excel servent encore de compte-rendu client.

## OKR du trimestre (octobre — décembre 2026)

1. **Montrer l'avancement au client sans le recopier.** 40 % des chantiers Pro et Enterprise ont un partage client ouvert au moins une fois dans la semaine, d'ici le 31 décembre 2026.
2. **Fiabiliser la saisie en conditions de chantier.** Plus aucune perte de saisie signalée sur la version courante, et une réserve ouverte en moins de 20 secondes quand le réseau tient.

## Non-objectifs du trimestre

- Facturation, situations de travaux, comptabilité.
- BIM, maquette IFC, plans techniques avancés.
- Majors du BTP et leurs directions méthodes.
- Thème sombre et autre personnalisation d'écran.
- Annuaire ou marketplace de sous-traitants.

## Capacité du prochain cycle

Cycle du **9 au 20 novembre 2026**.

| | Points |
| --- | ---: |
| Capacité brute | 20 |
| Déjà engagé, hors arbitrage : LIN-12 et LIN-52 (S + S) | 4 |
| Capacité arbitrable | 16 |

Repères, appliqués à la capacité arbitrable :

- Alerte si les Must confirmés dépassent **60 %** (plus de 9,6 points, donc à partir de 10).
- Should jusqu'à environ **80 %** (environ 13 points, Must compris).
- Could sur environ **20 %** (environ 3 points).
- Au-delà : Won't pour ce cycle, avec la raison. Un thème Won't pour capacité reste visible. Un thème Won't pour impact ou hors stratégie peut rester parqué.

### Tailles

La conversion est affichée. Elle n'est pas une suite de Fibonacci. Le PO peut modifier une taille avant le calcul.

| Taille | Points |
| --- | ---: |
| XS | 1 |
| S | 2 |
| M | 4 |
| L | 6 |
| XL | 10 |

### Stories de référence (déjà livrées)

Ces cinq stories ancrent l'effort. Elles ne sont pas dans le backlog ouvert.

| Id | Story | Taille | Points |
| --- | --- | --- | --- |
| LIN-091 | Filtrer la liste des réserves par lot | XS | 1 |
| LIN-104 | Ajouter une photo à une réserve depuis le téléphone | S | 2 |
| LIN-088 | Exporter le registre des réserves en CSV | M | 4 |
| LIN-076 | Prévenir le conducteur par e-mail quand une réserve est bloquante | M | 4 |
| LIN-063 | Inviter un sous-traitant avec un accès limité à un seul chantier | L | 6 |

Un SSO d'entreprise se compare à LIN-063, pas à un filtre. Un correctif ciblé de synchronisation se compare à LIN-076 ou LIN-088. Un lien de partage simple se compare à LIN-104.
