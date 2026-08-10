---
name: prompt-analyzer-l99
description: >
  Analyse approfondie de prompts en 8 couches stratégiques (OODA, Chainlogic, Blindspots, Factcheck, Premortem, Wargame, Deepthink, Synthèse). Utiliser ce skill dès que l'utilisateur demande d'analyser, auditer, améliorer, optimiser, décortiquer ou stress-tester un prompt, que ce soit un prompt personnel ou un prompt client. Aussi déclencher quand l'utilisateur mentionne L99, analyse de prompt, prompt review, audit de prompt, améliore ce prompt, optimise ce prompt, ou colle un prompt en demandant de le passer au crible. Fonctionne sur tout type de prompt, y compris system prompts, user prompts, chaînes de prompts, templates, instructions agent.
metadata:
  version: "2.1.0"
  updated: "2026-06-22"
---

# Prompt Analyzer L99

Analyse de prompt en mode expertise maximale, zéro simplification. 8 couches d'analyse
séquentielles, chacune dans son propre chapitre.

## Langue

Toujours répondre en **français**, quelle que soit la langue du prompt analysé.

## Niveaux

- **L99** (défaut) : analyse complète, 8 couches.
- **L50** (si « analyse rapide » ou « L50 ») : uniquement couches 1 (OODA, étalon noté), 3 (Blindspots) et 8 (Synthèse). Le score et le contrat de sortie restent produits (portés par Ch1 et Ch8).

## Workflow

1. Charger `references/couches.md` — spécification détaillée des 8 chapitres. **Toujours.**
2. Produire les chapitres numérotés, chacun avec titre clair et séparateur visuel.
3. Les couches **conditionnelles** (2 Chainlogic, 4 Factcheck, 7 Deepthink, lentille robustesse du 6) ne s'ouvrent que si leur condition est remplie ; sinon, une seule ligne le signale.
4. Chaque chapitre doit être substantiel — pas de réponse creuse ou générique.
5. Ancrer chaque analyse dans le contenu concret du prompt (citations à l'appui).

## Les 8 couches (vue d'ensemble)

| # | Couche | Objet |
|---|---|---|
| 1 | OODA | Cadrage stratégique : Observe / Orient / Decide / Act + **étalon noté** (rubrique /100) |
| 2 | Chainlogic | Décomposition logique Si A → alors B ; ruptures et sauts non justifiés |
| 3 | Blindspots | Hypothèses implicites, ambiguïtés, edge cases, contraintes oubliées, biais |
| 4 | Factcheck | *(conditionnel)* Prémisses fausses, périmées ou invérifiables que le LLM amplifierait |
| 5 | Premortem | 5 causes d'échec les plus probables + mécanisme + mitigation |
| 6 | Wargame | 3 attaques : utilisateur exigeant, expert du domaine, contradicteur (+ lentille robustesse) |
| 7 | Deepthink | Implications de 2e/3e ordre, effets d'échelle, dépendances systémiques |
| 8 | Synthèse | **Score /100** + diagnostic 3 lignes + **prompt réécrit** + **contrat de sortie** + changelog tracé |

Le chapitre 8 est le livrable principal : le prompt réécrit conserve l'intention originale,
comble les angles morts, intègre les garde-fous, **embarque ses propres critères de réussite
(contrat de sortie)**, et reste directement utilisable.

## Exemple d'invocation et de sortie attendue

```
User : "Passe ce prompt au crible L99 : 'Tu es un expert marketing.
Rédige-moi un post LinkedIn percutant sur l'IA.'"

→ Charger references/couches.md
→ Chapitre 1 (OODA) : Observe = 2 instructions seulement (rôle + tâche),
  aucune contrainte de format, audience ou ton. Étalon noté : 31/100
  (intention claire mais spécification quasi nulle).
→ ... chapitres 2, 3 ...
→ Chapitre 4 (Factcheck) : aucune prémisse factuelle vérifiable
  → couche non déclenchée (une ligne).
→ ... chapitres 5 à 7 ...
→ Chapitre 8 : Score 31 → 84 (projeté). Diagnostic = intention claire
  mais sous-spécifié (pas d'audience, pas de longueur, pas d'angle).
  Prompt réécrit = "Tu es consultant IA B2B. Rédige un post LinkedIn de
  150-200 mots pour des dirigeants de PME, angle : [sujet], hook en
  1re ligne, 3 paragraphes courts, CTA conversationnel, ≤5 hashtags."
  Contrat de sortie = 150-200 mots · 1 hook en L1 · 3 paragraphes ·
  1 CTA · ≤5 hashtags · pas de jargon non défini.
  Changelog = +audience (bloquant Ch3), +format (majeur Ch3), +contrat.
```

## Cas d'usage

- Prompts personnels avant utilisation (auto-amélioration)
- Audit de prompts clients (conseil, formation, optimisation)
- System prompts d'agents IA, templates réutilisables, chaînes de prompts (chaque maillon)

## Consignes de ton

- Expert mais accessible. Pas de jargon inutile, mais aucune simplification.
- Direct et tranchant dans les diagnostics. Ne pas enrober.
- Illustrer avec des exemples concrets tirés du prompt analysé.
