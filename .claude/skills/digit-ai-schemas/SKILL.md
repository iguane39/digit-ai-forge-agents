---
name: digit-ai-schemas
description: "Génère des schémas d'architecture, de topologie réseau, de flux temporel ou de tableau de bord aux standards graphiques Digit-AI. À utiliser systématiquement dès que le contexte concerne Digit-AI ou Enseigne-A et qu'un schéma technique est demandé (architecture cloud, topologie Azure, pipeline CI/CD, flux applicatif, comparatif visuel) — même si le mot 'schéma' n'est pas employé explicitement (ex. 'comment s'articulent les composants', 'dessine la chaîne', 'visualise la promotion'). Couvre cinq canevas standardisés — multi-bandes (architecture par couches), topologie (réseau hub-and-spoke), flux temporel (timeline avec swimlanes), tableau de bord (KPI portfolio), modèle de données (ERD avec classification PII). Garantit la charte Roboto / DM Sans / JetBrains Mono, la palette sémantique, le routage des flèches sans superposition et les tooltips structurés. Use when a technical diagram is requested in a Digit-AI or Enseigne-A context."
---

# Skill Digit-AI Schemas · génération de schémas Digit-AI aux standards graphiques

Encode les standards graphiques des livrables Digit-AI (briefs d'architecture, dossiers Design Authority, supports de comité) : un schéma produit doit être reconnaissable comme livrable Digit-AI sans retouche.

## Quand déclencher

Contexte Digit-AI / Enseigne-A **et** schéma technique attendu : demande explicite (« schéma », « diagramme », « visualise », « dessine ») ou implicite (« comment s'articulent », « la chaîne complète », « la topologie », « le flux »), contexte de livrable (brief d'architecture, dossier Conformité Finale / Handoff / MEP, support DA), ou présence des conventions Digit-AI dans les userPreferences.

Ne pas déclencher pour : schémas hors contexte Digit-AI (outils standards type Visualizer), diagrammes interactifs ou animés (le canevas Digit-AI est statique, imprimable PDF), simples listes ou tableaux.

## Choix du canevas

| Canevas | Quand | Signes typiques | Référence |
| --- | --- | --- | --- |
| Multi-bandes | Architecture par couches, pipelines CI/CD détaillés, vue d'ensemble | « architecture cible », « vue d'ensemble », « la chaîne complète » | `references/canevas-multi-bandes.md` + `assets/template-multi-bandes.html` |
| Topologie | Hub-and-spoke, isolation de zones, VNets / RG / subscriptions | « topologie », « peering », « VNet », « segmentation » | `references/canevas-topologie.md` + `assets/template-topologie.html` |
| Flux temporel | Séquences de pipelines, promotions entre environnements, swimlanes | « tag git → PROD », « promotion sans rebuild », « blue-green » | `references/canevas-flux-temporel.md` + `assets/template-flux-temporel.html` |
| Tableau de bord | Synthèse KPI portfolio, vue de pilotage, comparatifs de parc | « dashboard », « vue DSI », « score par POC » | `references/canevas-tableau-de-bord.md` + `assets/template-tableau-de-bord.html` |
| Modèle de données | Schéma relationnel de BDD, tables / colonnes / clés / relations, classification PII, dictionnaire de données | « schéma de base de données », « ERD », « MCD », « les tables et leurs relations » | `references/canevas-modele-donnees.md` + `assets/template-modele-donnees.html` |

Si plusieurs canevas semblent applicables, multi-bandes est le défaut. Si aucun ne colle, le besoin est probablement hors périmètre Digit-AI — utiliser un outil standard.

## Conventions communes obligatoires

Quel que soit le canevas, **toujours lire `references/conventions-communes.md`** avant de produire du SVG. Règles non négociables :

- Palette sémantique (violet pâle, bleu, teal, corail, ambré, gris) avec hex exacts fond / texte / bordure
- Typographies : Roboto 700/800 (titres), DM Sans (corps), JetBrains Mono (code) — **jamais Syne**
- Classes CSS scopées au SVG (`svg-c-purple`, `svg-arr`, `svg-tband`…) réutilisées telles quelles
- Flèches en L pur, jamais en escalier multiple, jamais à travers un nœud ; couloirs verticaux dédiés pour les flux descendants
- Titres de bande dans des pastilles blanches encadrées, hors couloirs de flèches
- Tooltips au format structuré `Titre | Puce 1 | Puce 2 | Puce N` (backticks pour le code inline)
- Footer : `Digit-AI · Conseil et stratégie IA · 2026`

Gabarit minimal d'un nœud et d'une flèche avec tooltips :

```svg
<g class="svg-c-blue">
  <title>Module 1 — Référentiel POCs | Catalogue unifié des POCs et apps | Source de vérité des autres modules</title>
  <rect x="260" y="360" width="240" height="80" rx="8"/>
  <text class="svg-th" x="380" y="395" text-anchor="middle">Référentiel POCs</text>
</g>
<line x1="380" y1="440" x2="380" y2="470" class="svg-arr" marker-end="url(#arrL)">
  <title>Flux d'alimentation | Objets POC et Application | Déclenché à chaque transition de cycle de vie</title>
</line>
```

## Page hôte et nommage

Le SVG est toujours encapsulé dans une page HTML autonome Digit-AI : eyebrow majuscules espacées + H1 Roboto 800 (42px) + sous-titre DM Sans + bloc méta `V{n}{indice} · {date longue}` ; diagram-wrap (fond gris très clair, bordure, radius 12px, padding 28px 20px, overflow-x auto) ; caption `Figure N — Description courte.` en italique gris 13px ; footer flex space-between avec brand à gauche. Détails (variables CSS, responsive, print) dans `references/conventions-communes.md`.

Nommage : `{Marque} - {TypeDoc} {Client} - {Scope} - {YYYYMMDD}{indice}.{ext}` (ex. `Digit-AI - Brief POC-Hub - Architecture detaillee - 20260527d.html`). Indice alphabétique incrémenté à chaque itération du jour, redémarre à `a` chaque jour. Numéro de version (V0, V1…) affiché dans le bloc méta du contenu, **jamais dans le nom de fichier**.

**Aucune police distante (A1/D-10, TF-0308).** Les gabarits ne portent plus de `<link>` vers `fonts.googleapis.com` : un livrable qui téléphone au chargement signale au serveur tiers quand et d'où il est lu, et perd son rendu hors ligne. Les familles Roboto / DM Sans / JetBrains Mono restent déclarées avec leur **pile de repli système** ; le rendu fidèle vient des WOFF2 bundlés de `scripts/fonts/` (installés au cache fontconfig par `render_schema.py`). Ne pas remettre ces `<link>` dans une page produite.

### Ce que check_html juge dans `assets/`, et ce qu'il écarte (TF-0308)

Les six fichiers de `assets/` passent le contrôle de conformité du socle
(`digit-ai-page-html/scripts/check_html.py`, famille charte). Trois sont des **pages** et
sont jugées entièrement : `exemple-reference.html`, `template-modele-donnees.html`,
`template-multi-bandes.html` (ce dernier avec une exemption étroite : l'indice de version
**daté** appartient à l'instance produite, son titre est un `{{PLACEHOLDER}}`).

Trois sont des **fragments par conception** — `template-topologie.html`,
`template-flux-temporel.html`, `template-tableau-de-bord.html` : ils s'insèrent dans le
squelette de `template-multi-bandes.html`, qui porte le `<head>`, le `<title>` et le favicon.
La famille « autoportance » y est écartée par une **exemption déclarée et annoncée** (registre
`EXEMPTIONS_DECLAREES` de `check_html.py`, avec son motif ; le contrôle l'imprime à chaque
exécution). Tout le reste reste jugé : réseau A1, thème G1, police interdite, lisibilité.
Un gabarit ajouté à `assets/` **échoue** tant qu'il n'est pas soit conforme, soit déclaré —
une exemption se décide, elle ne se devine pas (R-30 §3).

## Workflow d'exécution

1. **Identifier le canevas** via la grille ci-dessus ; si ambigu, poser une question fermée (canevas A ou B).
2. **Lire la référence du canevas** (`references/canevas-{nom}.md`) : viewBox, bandes types, gabarits, exemple complet.
3. **Lire `references/conventions-communes.md`** : palette, classes CSS, tooltips, routage.
4. **Instancier le template** (`assets/template-{nom}.html`) en conservant couloirs, pastilles de bande, palette.
5. **Rendre et valider (OBLIGATOIRE)** : exécuter la boucle render-view-fix décrite dans la section « Boucle de validation visuelle » ci-dessous jusqu'à ce que le schéma passe l'audit. Ne jamais livrer un SVG jugé sur le seul code.
6. **Encapsuler, nommer, livrer** : page hôte Digit-AI, nommage conventionnel, `present_files` sans post-amble.

## Boucle de validation visuelle (obligatoire)

On ne juge pas un schéma depuis son SVG. Après génération ou édition, rendre en PNG, lire l'image, corriger ce qu'on voit — en boucle (2 à 4 itérations typiques).

**Rendu** (dépend de `scripts/render_schema.py`, basé sur Playwright + Chromium) :

```bash
cd .claude/skills/digit-ai-schemas/scripts
uv run python render_schema.py <chemin-vers-schema.html>
```

Le script screenshote le conteneur `.diagram-wrap` (cadrage serré sur le schéma + son padding, hors eyebrow / H1 / footer) et écrit un PNG à côté du HTML. Lire ensuite ce PNG avec l'outil Read.

Le script s'adapte seul à deux environnements, sans réglage manuel :
- **Claude Code** (réseau ouvert) : Chromium installé localement. Depuis TF-0308 les gabarits ne chargent plus les polices par le réseau : le rendu utilise les polices installées sur le poste, sinon la pile de repli — vérifier la fidélité typographique sur le PNG, un titre en repli système se voit.
- **Sandbox Claude.ai web** (réseau sur liste blanche) : il auto-détecte le Chromium pré-installé de l'image (`/opt/pw-browsers`) et installe les WOFF2 bundlés dans `scripts/fonts/` au cache fontconfig local — Roboto / DM Sans / JetBrains Mono rendent fidèlement même si `fonts.googleapis.com` est bloqué. Le script attend `document.fonts.ready` avant le screenshot, sinon les débordements de texte sont invisibles au rendu.

**Première installation — Claude Code uniquement** (le sandbox web n'en a pas besoin, le navigateur y est déjà présent) :

```bash
cd .claude/skills/digit-ai-schemas/scripts
uv sync
uv run playwright install chromium
```

**La boucle :**

1. Rendre et lire le PNG.
2. **Audit d'intention** : le canevas choisi est-il bien matérialisé ? Les couloirs de flèches sont-ils respectés ? La hiérarchie visuelle est-elle juste (nœuds maîtres dominants, détails plus petits) ? L'œil suit-il le flux prévu ?
3. **Audit de défauts Digit-AI** (chaque point = une règle dure de `conventions-communes.md` violée) :
   - flèche traversant un nœud au lieu de longer son couloir → reroute en L pur
   - flèche en escalier multiple → couloir vertical dédié
   - titre de bande dans la zone des flèches → pastille blanche encadrée, déplacée hors couloir
   - texte de nœud tronqué ou débordant le rect → élargir le rect
   - tooltip non ancré / label flottant ambigu → repositionner près de sa cible
   - espacement irrégulier entre bandes ou nœuds frères → réaligner les `y`/`x`
   - section trop dense à côté d'une section trop vide → rééquilibrer la composition
   - débordement viewBox ou coordonnée `y` négative → recadrer
4. Corriger le SVG, re-rendre, re-lire.
5. **Arrêt** quand : aucun texte tronqué, flèches en L propres contournant les nœuds, pastilles hors couloirs, espacement régulier, composition équilibrée — et tu montrerais le livrable sans réserve.

Ne pas s'arrêter après une seule passe sous prétexte qu'il n'y a pas de bug critique : si la composition peut être meilleure, l'améliorer.

## Anti-patterns à éviter

- Flèches diagonales longues traversant plusieurs bandes — utiliser les **références numérotées** (`Réf. intégrations 1 · 4 · 6`)
- Titre de bande en texte libre dans la zone des flèches — toujours en pastille blanche encadrée
- Police Syne, même pour les titres
- Tooltips d'une seule ligne non structurés — toujours `Titre | Puce 1 | Puce 2`
- Gradient, ombre, blur, noise — le schéma est flat, lisible imprimé en N&B
- Coordonnées y négatives ou débordement viewBox

## Référence d'exemple

Livrable de référence matérialisant ces standards : `assets/exemple-reference.html` (extrait d'un brief d'architecture détaillée Digit-AI). À consulter en cas de doute sur l'application concrète d'une convention.
