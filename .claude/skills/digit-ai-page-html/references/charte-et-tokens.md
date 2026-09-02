# Charte & tokens — socle page HTML Digit-AI

Séparation volontaire entre **principes** (règles stables) et **valeurs paramétrables**
(tokens modifiables sans toucher aux règles). Une évolution de charte ne touche que les tokens.

## Principes (stables)

| # | Règle |
|---|---|
| C1 | Titres & sections en **Roboto**, font-weight 700/800. |
| C2 | Corps de texte en **DM Sans** (sans-serif standard en repli). |
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

  /* Hauteur de l'en-tête collant — consommée par le thead collant et par le sommaire
     latéral (L29, L25). Un décalage qui vaut 0 par défaut ramène la collision qu'il
     devait éviter : ce token se pose, il ne se devine pas. */
  --hh: 64px;

  /* Rayons */
  --r: 12px; --r-sm: 8px;

  /* Familles (repli système obligatoire) */
  --head: "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
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
