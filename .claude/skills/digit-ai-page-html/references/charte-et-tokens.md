# Charte & tokens — socle page HTML Digit-AI

Séparation volontaire entre **principes** (règles stables) et **valeurs paramétrables**
(tokens modifiables sans toucher aux règles). Une évolution de charte ne touche que les tokens.

## Principes (stables)

| # | Règle |
|---|---|
| C1 | Titres & sections en **Montserrat**, font-weight 700/800 ; Roboto en premier repli. |
| C2 | Corps de texte en **Inter** ; DM Sans en premier repli, puis sans-serif standard. |
| C1-C2 · source | Depuis le 23/09/2026, la charte de police des pages EST celle des présentations de l'émetteur (décision humaine D-5 (a) du 22/09, « la charte des présentations fait foi, les pages s'y alignent », exécutée par D-11 (a)). Elle se LIT dans le dossier de marque (`tokens-diapositives`, lu par `digit-ai-pptx/scripts/lire-marque.mjs`) ; la recette de quality-oracles vérifie que ce gabarit la suit. Roboto / DM Sans, la charte d'avant, restent en premier repli : une page livrée avant l'alignement n'est pas fautive. |
| C3 | Police **Syne strictement interdite**, partout. |
| C4 | **Light theme** systématique (jamais de dark par défaut). |
| C5 | Code/mono en **JetBrains Mono** quand un bloc technique est présent. |
| C6 | Année de référence = **année courante** (token `--annee-ref`), à reporter dans dates, footers, mentions générées. |
| C7 | Nommage fichier : `Digit-AI - {TypeDoc} {Client} - {Scope} - {YYYYMMDD}{a,b,c…}.{ext}` — espaces et tirets simples, pas d'underscore ; suffixe alpha incrémenté par itération du même jour. |
| C8 | Une **seule convention de tokens de police** : `--head` / `--sans` / `--mono`. Ne pas réintroduire `--font-head`/`--font-body` (dette de cohérence à éviter). |

## Valeurs paramétrables (tokens `:root`)

> Convention unique imposée par C8. Copier ce bloc tel quel dans `:root`.

```css
:root {
  /* Couleurs — marque & surfaces */
  --blue: #2563EB;        /* primaire / accent de marque */
  --bg: #FAFBFF;          /* fond de page (bleuté quasi-blanc) */
  --surface: #FFFFFF;     /* cartes, surfaces */
  --card: #FFFFFF;

  /* Couleurs — encres */
  --ink: #0F172A;         /* texte principal */
  --muted: #64748B;       /* texte secondaire */
  --faint: #94A3B8;       /* légendes / tertiaire */
  --line: #E6EAF2;        /* filets, bordures */

  /* Accents sémantiques (chacun : base + -fill clair + -line) */
  --amber: #D97706; --amber-fill: #FFFBEB; --amber-line: #FDE9C8;   /* alerte */
  --teal:  #0E9488; --teal-fill:  #EFFDFB; --teal-line:  #C7F0EA;   /* info */
  --green: #15803D; --green-fill: #F2FCF5; --green-line: #CFEEDD;   /* succès */
  --red:   #B91C1C; --red-fill:   #FEF2F2; --red-line:   #F6CFCF;   /* refus / non déclaré */

  /* Fonds PLEINS des badges d'état, à encre BLANCHE (TF-0910). Les `-fill` ci-dessus sont des
     fonds de CARTE : tous entre L* 93 et 97, ils ne se distinguent pas les uns des autres dès
     qu'on les met côte à côte sur des bulles de statut. Ces six-là gardent au moins 23 d'écart
     de couleur deux à deux et 6,4:1 de contraste avec le blanc. */
  --green-solid: #166534; --teal-solid:  #0F5F8F; --amber-solid: #92400E;
  --red-solid:   #B91C1C; --slate-solid: #4B5563; --violet-solid: #7E22CE;

  /* Hauteur de l'en-tête collant — consommée par le thead collant et par le sommaire
     latéral (L29, L25). Un décalage qui vaut 0 par défaut ramène la collision qu'il
     devait éviter : ce token se pose, il ne se devine pas. */
  --hh: 64px;

  /* Rayons */
  --r: 12px; --r-sm: 8px;

  /* Familles (repli système obligatoire) — charte des présentations (D-5 (a), D-11 (a)) */
  --head: "Montserrat", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --sans: "Inter", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "Consolas", monospace;

  /* Année de référence (C6) — seule valeur datée, volontairement isolée ici */
  --annee-ref: "2026";
}
```

## Notes d'usage

- **Contraste.** Vérifier que `--muted` et `--faint` sur `--bg` atteignent les seuils WCAG
  (≥ 4.5:1 texte normal, ≥ 3:1 texte large) avant de les figer sur un livrable critique.
- **Accents sémantiques.** La couleur ne porte jamais seule l'information : un statut
  alerte/info/succès/refus s'accompagne toujours d'un libellé ou d'une icône.
- **Un `-fill` est un fond de CARTE, jamais un badge d'état (TF-0910, 08/09/2026).** Les cinq
  teintes pastel du socle vivent toutes entre **L\* 93 et 97** : le texte encré dessus tient
  4,5:1, donc l'oracle de contraste rendait PASS sur chaque badge pris **un par un**, et le
  lecteur humain a répondu « les bulles des statuts ne sont pas suffisamment différentes pour
  être différenciées ». Le défaut ne vit pas dans un badge, il vit **entre deux badges** : c'est
  une distance, pas un ratio. Un produit a dû refaire la palette **hors socle**. Pour un jeu de
  badges d'état, employer les `*-solid` ci-dessus (encre blanche) **et** un indice non
  colorimétrique — un glyphe par palier, pris dans la liste blanche du socle (`✓ ↔ → ✗ –`), plus
  une légende qui donne **couleur + forme + libellé** (WCAG 1.4.1). Mesuré par
  `render_page.py` **V16** ; fixtures `v16-etats-pastel.html` (5 paires indiscernables, 0
  constat de contraste) et `v16-etats-pleins.html` (0 / 0).
- **Le quatrième registre était employé et non documenté (TF-0755, 02/09/2026).** Un rapport de
  conformité a eu besoin d'un registre « refus / non déclaré » — bas d'échelle d'une carte de
  chaleur — ne l'a pas trouvé dans le socle, et l'a **inventé** comme extension locale. Or le
  livrable conforme de référence de la maison portait **déjà** `--red` / `--red-fill` /
  `--red-line` aux valeurs `#B91C1C` / `#FEF2F2` / `#F6CFCF` : *la palette les portait, la
  documentation non*. Une palette dont un registre entier n'est documenté nulle part se fait
  réinventer, et deux réinventions donnent deux rouges différents dans deux livrables de la même
  maison. Les trois valeurs ci-dessus sont celles du livrable de référence, reprises telles
  quelles — aucune teinte n'a été redécidée.
- **`--hh`, hauteur de l'en-tête collant (TF-0754).** Le socle tranche : l'en-tête de document
  garde le bord haut, le `thead` collant et le sommaire latéral se décalent de `var(--hh)`. Le
  gabarit pose la valeur ; `check_html.py` (L29) refuse un `top: var(--hh)` consommé sans
  déclaration.
- **Année de référence.** Isolée en token `--annee-ref` pour éviter qu'une date en dur ne
  « périme » le gabarit. La mettre à jour en un seul point au changement d'année.
