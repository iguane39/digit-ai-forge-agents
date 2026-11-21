---
name: ou-en-suis-je
description: >
  Montre à l'utilisateur de la Factory Digit-AI où il en est : son niveau (5 niveaux), sa note sur 100, ses jalons
  prouvés sur tous ses projets du poste, l'état du projet ouvert et le prochain jalon, en lisant la boussole du pilot
  (`scripts/boussole.mjs`) ; reprend aussi sa progression d'un autre poste par son dossier synchronisé (Drive,
  OneDrive, Dropbox). Ne porte aucune doctrine : il lit celle du pilot. Use when / déclencher dès que l'utilisateur
  dit « où en suis-je ? », « où j'en suis », « récupère ma progression », demande son niveau, sa note, sa
  progression ou ses prochains jalons dans la Factory, ou annonce son niveau (« j'ai déjà mené trois runs »). Ne pas
  déclencher pour l'avancement d'un run ou d'une campagne d'agents (→ le suivi des agents et le ledger du run), ni
  pour l'état des dépôts du poste (→ `node <pilot>/bootstrap.mjs`).
metadata:
  version: "1.0.0"
---

# Où en suis-je ? — la boussole de l'utilisateur

Né des lots L-01 à L-06 du pilot (GO du porteur du 21/11/2026, étude `output/03-etudes/Digit-AI - Étude - Parcours d accueil des nouveaux utilisateurs - 20261121h.md`, référence `references/BOUSSOLE.md`). Le calcul vit au pilot, dans `scripts/boussole.mjs` : ce skill le joue et rend sa sortie, il ne recalcule rien.

## 1. Résoudre le pilot

Dans cet ordre : `$FORGE_ROOT\digit-ai-factory`, le dossier parent du projet courant, `c:\dev\digit-ai-factory`, `~/.digit-ai-forge/digit-ai-factory`. Le pilot est le premier qui porte `scripts/boussole.mjs`. Introuvable : le dire, avec les chemins essayés, et s'arrêter.

## 2. Jouer la commande qui correspond à la demande

Chaque demande de l'utilisateur appelle une seule commande de la boussole. Le tableau se lit par la colonne de gauche : on y cherche la phrase qui ressemble à la demande, et la ligne donne la commande à jouer.

| L'utilisateur dit | Commande (depuis la racine du projet ouvert) |
|---|---|
| « où en suis-je ? », « quel est mon niveau ? » | `node "<pilot>/scripts/boussole.mjs" --detail` |
| « j'ai déjà mené trois runs », « je suis au niveau 4 » | `node "<pilot>/scripts/boussole.mjs" --annoncer <1-5>`, puis `--detail` |
| « non, je n'ai jamais utilisé la Factory » (réponse à la question du poste vierge) | `node "<pilot>/scripts/boussole.mjs" --debutant` |
| « récupère ma progression depuis <dossier> » | `node "<pilot>/scripts/boussole.mjs" --declarer-canal "<dossier>"`, puis `--recuperer` |
| « récupère ma progression » (dossier déjà déclaré) | `node "<pilot>/scripts/boussole.mjs" --recuperer` |

Le niveau annoncé se traduit en chiffre de 1 à 5 d'après les niveaux de `references/BOUSSOLE.md` ; au doute entre deux niveaux, prendre le plus bas.

## 3. Rendre la sortie

Recopier la sortie de la commande telle quelle, dans un bloc de texte, puis une phrase au plus : le prochain jalon et ce qu'il faut dire pour l'atteindre. Ne rien ajouter que la sortie ne dise pas : un jalon non prouvé ne se présente jamais comme acquis, et un niveau annoncé reste « annoncé ».

## Garde-fous

- Lecture seule sur les projets : la commande n'écrit que dans `~/.digit-ai` et, s'il est déclaré, dans le dossier synchronisé de l'utilisateur.
- Le dossier synchronisé se déclare seulement quand l'utilisateur le nomme ; ne jamais en deviner un.
- Le fichier de progression ne porte aucun nom de projet ni chemin : ne pas en ajouter dans la réponse.
