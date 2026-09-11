# Presets de réglage par livrable — Communication à impact (Digit-AI)

Chaque ligne donne un **point de départ** : le curseur ethos/logos/pathos (E / L / P, en points, total 100), la structure par défaut, les patterns à mobiliser en priorité et le piège dominant. Toujours **ajuster au cas réel** (audience, enjeu, canal) et n'en garder que **3 patterns**.

| Livrable | Objectif | Curseur E / L / P | Structure | Patterns prioritaires | Piège à éviter |
|---|---|---|---|---|---|
| **Proposition commerciale** | Faire signer | 35 / 45 / 20 | Pyramide **droite** — recommandation d'abord, prix protégé en BLUF | SCQA · Before-After-Bridge · So What ? · Cialdini (preuve sociale, autorité, rareté) | Logos hypertrophié, pathos zéro — ou l'inverse |
| **Conférence / keynote** | Marquer les esprits | 30 / 25 / 45 | Tension narrative (pyramide **inversée**) — découverte progressive, chute mémorable | Sparkline · Trois actes · Message unique · Règle de trois · Pattern interrupt · Silence | Spoiler la conclusion (la pyramide de décision tue la tension) |
| **Formation / atelier** | Faire monter en compétence | 20 / 45 / 35 | Du simple au complexe, exemples **avant** la théorie, checkpoints | STAR · Langage clair · Make it safe · Règle de trois · So What ? | Transmission descendante, théorique, sans mise en pratique |
| **COPIL / restitution** | Faire décider ou valider | 30 / 60 / 10 | Pyramide **droite** stricte — décision en tête (BLUF), options chiffrées MECE | SCQA · BLUF · So What ? · Signposting · recadrage factuel | Raconter le chemin parcouru au lieu de demander la décision |
| **Pitch court / accroche** | Obtenir le prochain RDV | 25 / 35 / 40 | Une phrase-hameçon, une preuve, un appel à l'action | AIDA · Before-After-Bridge · Message unique · Règle de trois | Tout dire (diluer) au lieu d'accrocher |
| **Note / email / écrit** | Faire agir sans être présent | 30 / 55 / 15 | Pyramide **inversée** / BLUF — objet explicite, demande claire, un seul appel à l'action | BLUF · Langage clair · So What ? · Signposting (titres, puces) | Enterrer la demande en fin de message ; jargon *(le 7-38-55 ne s'applique pas)* |
| **Négociation / face-à-face** | Aligner, débloquer, faire accepter | 35 / 25 / 40 | Centrer sur l'autre, sécuriser, puis recadrer | Make it safe · Centrer sur l'autre · Pattern interrupt · Silence · Cialdini (réciprocité, cohérence) | Dérouler son argumentaire logos sans sécuriser l'autre d'abord |

## Lire le curseur
- **Ethos** = crédibilité (références, cas, autorité, posture). Monte-le face à une audience qui ne te connaît pas ou qui doute.
- **Logos** = raisonnement (faits, chiffres, ROI, options). Domine dès qu'il faut **décider** ou **acheter**.
- **Pathos** = engagement (douleur, désir, récit, sécurité). Domine dès qu'il faut **adhérer**, **mémoriser** ou **débloquer** une relation.

## Combiner avec l'écosystème Digit-AI
- **Propale** — coupler avec `digit-ai-propale` (narratif, objections pré-traitées, chiffrage) et `digit-ai-pptx` (rendu du deck). Ce skill règle le message ; il ne produit ni le fichier ni le prix.
- **COPIL / restitution** — le rendu visuel reste `digit-ai-pptx` ; les schémas éventuels passent par `digit-ai-schemas`.
- **Note / email** — la mise en forme du message écrit peut s'appuyer sur le compositeur de messages.
