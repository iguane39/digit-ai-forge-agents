---
name: digit-ai-propale-review
description: >
  Audit commercial d'une proposition Digit-AI avant envoi : grille canonique en 7 dimensions
  notées /5 (qualification du deal MEDDIC/BANT-light, orientation client, narratif et
  promesses, ancrage ROI du chiffrage, architecture de l'offre, objections pré-traitées,
  closing et next steps) + checklist de forme hors score, red flags bloquants, verdict en
  trois niveaux (Envoyer / Retravailler / Refondre), top 5 corrections priorisées avec
  réécritures avant/après, et séquence de relance. Accepte PPTX, PDF ou Markdown. Deux modes :
  complet (rapport MD + fiche HTML chartée — défaut) et express (score + corrections en chat).
  Use when / déclencher dès que l'utilisateur demande de relire, auditer, challenger,
  critiquer, scorer, stress-tester ou renforcer une propale ou proposition commerciale
  Digit-AI, ou demande si elle est prête à partir, ce qui cloche, ou comment l'améliorer
  commercialement. Ne pas déclencher pour créer ou chiffrer une propale (digit-ai-propale)
  ni pour le rendu PPTX (digit-ai-pptx).
---

# Digit-AI Propale Review

Miroir critique en bout de pipeline : `digit-ai-prospection` → `digit-ai-propale` →
`digit-ai-pptx` → **`digit-ai-propale-review`**. Ce skill **note, détecte, priorise et
propose des réécritures** ; il ne génère ni ne corrige une propale (fond → `digit-ai-propale`,
forme → `digit-ai-pptx`). Sources : grammaire commerciale, market-proposal, deal-review-framework.

## Workflow

1. **Extraire la propale.**
   - PPTX : `python scripts/extract_propale.py "<fichier>.pptx"` → inventaire Markdown
     slide par slide (titres, corps, notes).
   - PDF : extraction via le skill `pdf-reading`. Markdown/texte : lecture directe.
2. **Ingérer le contexte deal** (tout est optionnel, rien n'est bloquant) : transcript ou
   notes de RDV, diagnostic `digit-ai-prospection`, budget annoncé, concurrents, historique.
   Sans transcript, les contrôles « language mirroring » de D2 sont marqués
   **Non évaluable** — jamais notés à l'aveugle. Aucune question de cadrage : si le mode
   n'est pas précisé, mode **complet** par défaut.
3. **Scorer les 7 dimensions** selon [references/grille-audit.md](references/grille-audit.md).
   Chaque note citée : n° de slide + extrait. D8 (forme) = checklist binaire **hors score**,
   incluant un contrôle de **rendu visuel** (rasteriser + inspecter) : un chevauchement ou
   débordement n'apparaît **pas** dans l'extract texte et **bloque le verdict ✅ Envoyer**.
4. **Passer les red flags** (liste dans la grille). Un seul red flag ⇒ verdict forcé
   **Refondre — ne pas envoyer**, quel que soit le score.
5. **Produire le livrable** :
   - **Mode complet** (défaut) : rapport MD + fiche HTML depuis
     [templates/rapport-review.html](templates/rapport-review.html) (charte Digit-AI,
     vérifications `grep -c "{{"` = 0 et équilibre des `<div>`), puis `present_files` —
     précédé d'une synthèse en chat (score, verdict, red flags).
   - **Mode express** (sur demande : « express », « rapide », « juste le score ») :
     en chat uniquement — score /35, verdict, red flags, top 5 corrections priorisées
     impact×effort avec réécriture avant/après. Aucun fichier généré.

## Verdict

Le verdict se lit dans ce tableau, et nulle part ailleurs : score total d'un côté, red flags de
l'autre. Un red flag l'emporte toujours sur le score.

| Verdict | Condition |
|---|---|
| ✅ **Envoyer** | Score ≥ 28/35 **et** zéro red flag |
| 🟡 **Retravailler** | Score 21–27/35, zéro red flag |
| 🔴 **Refondre — ne pas envoyer** | Score < 21/35 **ou** ≥ 1 red flag |

> ✅ **Envoyer** exige aussi un **rendu visuel vérifié** (D8) : un débordement ou chevauchement
> suspend l'envoi jusqu'à correction de la forme (`digit-ai-pptx`), score commercial ≥ 28 ou non.

## Règles dures

1. **Jamais de note sans preuve.** Chaque point perdu cite le slide et l'extrait concerné ;
   chaque réécriture proposée est directement injectable (avant/après).
2. **Dimension non évaluable ≠ note basse.** Si le contexte manque (pas de transcript, pas
   de budget connu), la dimension est partiellement neutralisée et le score rapporté sur
   le total évaluable — le signaler explicitement.
3. **Confidentialité inter-clients** : les patterns d'audit sont réutilisables, jamais les
   contenus (montants, red flags client, extraits) d'une propale vers une autre.
4. **Prudence sur les gains** : toute réécriture ROI proposée respecte les règles
   digit-ai-propale (« hypothèses médianes, à calibrer », jamais de ROI affirmé sans source).
5. **Top 5 maximum.** Prioriser par impact commercial × effort de correction ; le reste
   en annexe du rapport complet, jamais en chat.

## Convention de nommage (mode complet)

`Digit-AI - Review Propale {Client} - {Scope} - {YYYYMMDD}{a,b,c…}.md` et `.html`
(itération du jour ⇒ suffixe suivant, jamais de régénération de zéro : `cp` + éditions
chirurgicales `str_replace`).

## Références

- [references/grille-audit.md](references/grille-audit.md) — 7 dimensions /5, critères
  détaillés, red flags, checklist forme D8, heuristiques mesurables
- [references/objections.md](references/objections.md) — table d'objections conseil
  IA/data, à croiser avec le deal pour vérifier le pré-traitement dans la propale
- [references/relance.md](references/relance.md) — séquence J0 → J+21 francisée, ton Digit-AI
- [templates/rapport-review.html](templates/rapport-review.html) — fiche HTML chartée

## Exemple d'invocation

```
User : « Propale Client-G v3 + transcript RDV + enveloppe 40 k€ — prête à partir ? »
→ Étape 1-2 : extract_propale.py sur le PPTX ; contexte transcript + budget → D2 mirroring activé.
→ Étape 3-4 : scoring 7 dimensions + red flags, dont rendu visuel D8 (rasterisation).
→ Étape 5 : mode non précisé → complet : synthèse chat (26/35, Retravailler) + rapport MD
  + fiche HTML « Digit-AI - Review Propale Client-G - … » via present_files.
```
