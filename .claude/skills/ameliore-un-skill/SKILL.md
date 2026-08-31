---
name: ameliore-un-skill
description: >
  Analyse, note et corrige un skill existant : prend un skill en entrée, produit un
  diagnostic noté et des corrections priorisées injectables, sans régression de déclenchement.
  Grille canonique en 7 dimensions /5 pondérée par type de skill (métier / comportemental /
  technique), red flags bloquants, verdict en trois niveaux (Ajuster / Renforcer / Refondre),
  top 5 corrections avant/après impact×effort, baseline de non-régression et re-test via le
  runner 6/6 de write-a-skill. Use when / déclencher dès que l'utilisateur demande d'améliorer,
  auditer, durcir, fiabiliser, scorer, réviser, optimiser ou stress-tester un skill existant,
  ou demande pourquoi un skill déclenche mal. Ne pas déclencher pour créer un skill de zéro
  (→ write-a-skill), auditer une propale (→ digit-ai-propale-review) ni analyser un prompt
  (→ prompt-analyzer-l99).
# TF-0475 : le noyau declare ce skill APPELE PAR MOT-CLE (lexique d'invocation RV-6).
# Le modele ne le charge donc pas de lui-meme ; l'appel direct reste entier.
---

# Améliore un skill

Miroir critique côté **maintenance** de l'écosystème : `write-a-skill` **crée**, ce skill
**audite, note, priorise et corrige** un skill déjà en place. Frontière nette — il ne part
jamais d'une page blanche (→ `write-a-skill`) et n'évalue que des skills, pas des livrables
métier (→ `digit-ai-propale-review`) ni des prompts (→ `prompt-analyzer-l99`).

## Workflow

1. **Cartographier la cible.** Lire le `SKILL.md`, l'arborescence et les ressources.
   Classer le skill par **type** — métier, comportemental ou technique — car le type
   oriente la pondération et la priorisation (cf. grille).
2. **Capturer la baseline de non-régression + déléguer la conformité.** Snapshot
   déterministe (déclencheurs, exclusions, sections, ressources) **et** délégation de
   toute la conformité mécanique aux validators de `write-a-skill` :

   ```bash
   python scripts/skill_audit_baseline.py <dossier-skill>
   ```

   Le script appelle les trois validators de `write-a-skill` (description ≤ 1024 +
   triggers, structure, checklist 6/6). **Aucun de ces contrôles n'est recodé** ici —
   `write-a-skill` reste la source unique de vérité (anti-drift). La baseline, elle,
   liste ce qui **doit survivre à la passe** : c'est le filet anti-régression.
3. **Scorer les 7 dimensions /5** — D1 Déclenchement, D2 Frontière, D3 Exécutabilité,
   D4 Disclosure, D5 Déterminisme, D6 Cohérence, D7 Robustesse — selon
   [references/grille-audit.md](references/grille-audit.md). **Jamais de note sans
   preuve** : chaque point perdu cite la ligne ou la section fautive et une raison
   réexploitable (de quoi corriger à la passe suivante).
4. **Passer les red flags** (liste dans la grille). Un seul ⇒ verdict forcé **Refondre**,
   quel que soit le score.
5. **Verdict + top 5 corrections.** Prioriser impact×effort ; chaque correction est rendue
   en **avant/après** directement injectable.
6. **Appliquer puis re-tester.** Éditions chirurgicales (`cp` + `str_replace`), jamais de
   régénération de zéro. Relancer le script : runner 6/6 = PASS **et** baseline intacte.
   Boucler jusqu'à convergence.
7. **Packager puis livrer.** Le skill corrigé part **installable d'un coup**, pas en fichiers
   nus (sinon il manque toujours un bout). Déléguer le packaging au script propriétaire de
   `write-a-skill` — **jamais le recoder** (même anti-drift que la conformité) :

   ```bash
   python ../../write-a-skill/scripts/package_skill.py <dossier-skill> --out "<nom>.zip"
   ```

   Il walke l'arborescence (rien d'oublié), regate sur validators + limites d'upload, refuse
   un skill non conforme. Puis `present_files` : rapport Markdown **+ le `.zip`** (jamais un
   `.skill` — Claude.ai/API n'installent qu'un `.zip`).

## Verdict

| Verdict | Condition |
|---|---|
| ✅ **Ajuster** | Score ≥ 28/35 **et** zéro red flag — retouches chirurgicales |
| 🟡 **Renforcer** | Score 21–27/35, zéro red flag — refonte ciblée |
| 🔴 **Refondre** | Score < 21/35 **ou** ≥ 1 red flag **de conception** — repartir de `write-a-skill` |

> **Proportionnalité.** Tous les red flags ne se valent pas (cf. grille). Un red flag
> **réparable en additif** — ressource citée manquante, nit de conformité — sur un SKILL.md
> par ailleurs sain (score ≥ 21/35) route vers 🟡 **Renforcer** : on crée le fichier ou on
> corrige le nit, on ne scrappe pas. **Refondre** est réservé aux red flags de **conception**
> (workflow non exécutable, frontière inexistante, incohérence interne, régression introduite).

## Règles dures

1. **Jamais de note sans preuve.** Chaque point perdu cite la ligne/section ; chaque
   réécriture est directement injectable (avant/après).
2. **Non-régression sacrée.** Un déclencheur ou comportement présent dans la baseline qui
   disparaît est un **échec de la passe**, jamais une amélioration.
3. **Modifications chirurgicales.** `cp` puis `str_replace` ciblés ; aucune réécriture
   complète, aucun refactoring opportuniste.
4. **Frontière respectée.** Ce skill améliore des skills. Création de zéro →
   `write-a-skill`. Audit de propale → `digit-ai-propale-review`. Audit de prompt →
   `prompt-analyzer-l99`.
5. **Dimension non évaluable ≠ note basse.** Si le contexte manque, la dimension est
   neutralisée et le score rapporté sur le total évaluable — le signaler.

## Convention de nommage (rapport)

`Digit-AI - Audit Skill {nom-skill} - {Scope} - {YYYYMMDD}{a,b,c…}.md`
(itération du jour ⇒ suffixe alphabétique suivant ; `cp` + éditions chirurgicales).

## Références

- [references/grille-audit.md](references/grille-audit.md) — barème détaillé des
  7 dimensions, red flags, pondération par type, exemple d'audit travaillé.
