---
name: plan-d-amelioration
description: Joint, juge et rend le plan d'amélioration qui suit un audit applicatif. Une amélioration est un écart à une AMBITION du produit, une remédiation un écart à une NORME du référentiel d'audit. Les améliorations vivent dans un fichier de données (fiche à dix champs, treize domaines, chiffres à statut) ; le skill les JOINT aux actions de remédiation de forge-audit (zéro doublon avec un contrôle évalué, renvois résolus, table de jonction), les JUGE par un oracle du contrat de sortie (PA1-PA14) et les REND en page HTML autoportante au socle digit-ai-page-html, huit chapitres, et en Markdown. Use when / déclencher dès qu'il faut produire, vérifier ou remettre un plan d'amélioration, des axes d'amélioration ou une trajectoire d'évolution après un audit. Ne pas déclencher pour mener l'audit (→ forge-audit), corriger des anomalies (→ audite-et-corrige-l-appli), challenger un plan fini (→ contre-expertise) ni rédiger une propale (→ digit-ai-propale).
metadata:
  version: "1.0.0"
---

# plan-d-amelioration — joindre, juger, rendre un plan d'amélioration post-audit

Né le 12/10/2026 (TF-1234, mandat humain du 22/09/2026 sur les huit rangs, rang 1 ; verdict O2 de
l'étude d'opportunité du 19/09/2026). Il outille le bloc « recommander » du run de conseil du pilot
quand le diagnostic est un audit : ce qu'il faut corriger vit dans l'audit, ce qu'il vaut la peine
d'améliorer vit ici, et une seule trajectoire porte les deux.

**Limite déclarée, à lire avant tout usage.** La méthode et le contrat naissent de l'analyse du
19/09 et de cas d'essai fictifs : **aucune mission réelle ne les a encore exercés**, alors que la
règle R-31 du pilot veut qu'un objet durable naisse exercé. La première mission jouée corrigera la
base de domaines et la fiche ; le registre des oracles tient l'oracle en statut `partiel` jusque-là.
Le verbe joindre naît avec un seul adaptateur, forge-audit.

## Quick start

```bash
# 0. Méthode : references/methode.md (frontière, domaines, fiche, questions, statuts, contrat)
# 1. Écrire le fichier de données plan.json (contrat plan-d-amelioration@1.0.0), sur le modèle
#    de fixtures/plan-vert.json ; ses chemins d'audit sont relatifs au plan.
# 2. Joindre aux actions de l'audit (refus si doublon ou renvoi orphelin ; --ecrire consolide)
node .claude/skills/plan-d-amelioration/scripts/joindre.mjs plan.json --actions remediation-actions.yaml --controles rapport.controles-evalues.json
# 3. Juger : contrat de sortie PA1-PA14 — exit 0 PASS, 1 FAIL, 2 non jugeable
node .claude/skills/plan-d-amelioration/scripts/oracle-plan-d-amelioration.mjs plan.json
# 4. Rendre les deux vues (après un PASS seulement)
node .claude/skills/plan-d-amelioration/scripts/rendre.mjs plan.json --html plan.html --md plan.md
# 5. Juger les vues : critère 11 du contrat
python .claude/skills/digit-ai-page-html/scripts/check_html.py plan.html
python .claude/skills/digit-ai-page-html/scripts/render_page.py plan.html --etats-ouverts
python .claude/skills/digit-ai-page-html/scripts/check_markdown.py plan.md
node <forges>/digit-ai-forge-design/oracles/run-oracles-design.mjs plan.html --rendu
```

## Les trois verbes

| Verbe | Script | Ce qu'il garantit |
|---|---|---|
| joindre | `scripts/joindre.mjs` | aucune fiche ne cite un contrôle évalué ni un constat de l'audit ; chaque renvoi `AM` ou `REM` existe ; la table de jonction consolide les liens déclarés et ceux qu'impliquent les dépendances |
| juger | `scripts/oracle-plan-d-amelioration.mjs` | les douze points du contrat du 19/09, joués par PA1-PA14 (table de correspondance : `references/methode.md`, section 7) ; sortie au contrat JSON commun de `quality-oracles` |
| rendre | `scripts/rendre.mjs` | la page dérive du gabarit du socle, ses composants (filtres, recherche, ligne dépliable) sont posés sous sceau par le poseur du socle ; la vue Markdown porte le même contenu |

Les verbes joindre et juger appellent la même bibliothèque (`scripts/lib.mjs`) : ce que l'un
refuse, l'autre le refuse.

## Le fichier de données

Un JSON `plan-d-amelioration@1.0.0`. Champs de tête : `intention` (texte, source, `validee_le` ou
`defaut_motif`), `audit` (`audit_ref`, `actions`, `controles_evalues`), `questions_ouverture`
(Q1-Q5), `ajustements`, `fiches`, `domaines_sans_fiche`, `plans_existants`, `jonction`,
`plan_de_mesure`, `trajectoire.lots`, `decisions`, `methode`, et facultativement
`empreinte_archive` (ouverture, clôture). La fiche porte ses dix champs, plus `horizon`, `rang`,
`chiffres` (valeur, statut, source ou commande et sortie) et `test_retro`. Modèle complet et vert :
`fixtures/plan-vert.json`. Pourquoi JSON et pas YAML : la forge est sans dépendance, et le fichier
d'actions de l'audit n'est lu que par un extracteur borné, déclaré au non-jugé de l'oracle.

## La page rendue

Huit chapitres sous sommaire permanent : (1) les décisions en choix fermés ; (2) la synthèse par
domaine et par horizon ; (3) toutes les fiches, filtrables, chacune dépliable sur ses dix champs ;
(4) la couverture des domaines et la correspondance avec les plans existants ; (5) la jonction avec
les remédiations ; (6) la trajectoire en lots, une colonne par horizon ; (7) le plan de mesure ;
(8) la méthode, les questions d'ouverture et le statut des chiffres. Autoportante, sans requête
réseau, imprimable. Gabarit jugé par forge-design le 12/10/2026 (TF-1236) : critique
d'implémentation et contrôle de généricité, verdict consigné dans
`digit-ai-forge-design/output/01-pages-temoins/`.

## Règles dures

- Une fiche sans constat sourcé ou sans cible se **retire**, elle ne s'adoucit pas.
- Aucun effort en jours ; aucun chiffre sans statut ; aucune performance « mesurée » sans commande
  et sortie.
- Le plan n'est remis que sur un PASS de l'oracle **et** des oracles des vues.
- La donnée fait foi : on ne corrige jamais la page à la main, on corrige le fichier et on rend.

## Recette

`node .claude/skills/plan-d-amelioration/scripts/self-test.mjs` : le plan vert passe ; un rouge
par règle, dérivé du vert en ne changeant qu'un élément, échoue sur SA règle ; le verbe joindre
refuse un doublon et accepte le vert ; la page rendue passe `check_html.py` et
`oracle-filtres-tableau`.
