# Images du deck — sourcing, placement, QA (charte Digit-AI)

Comment le skill choisit, prépare, pose et contrôle les images d'un PPTX. Trois classes
d'assets, une règle de rendu unique (**ratio d'origine préservé, jamais d'étirement, aucun
cadre**), un rythme d'illustration, une passe QA finale anti-débordement. Fonctionnalité
robuste mais **non bloquante** : si un dépôt est inaccessible, continuer sans l'image
concernée — ne jamais échouer pour cette raison.

## 1. Modèle d'assets (dépôts Drive publics « tout le monde avec le lien »)

Trois classes d'assets vivent dans trois dépôts distincts ; ce chapitre dit lequel contient
quoi et par quel critère on y sélectionne un fichier.

| Classe | Dépôt / ID | Contenu | Sélection |
|---|---|---|---|
| **Illustrations** | bibliothèque `images` · `1CszZdULRFiGe6x0TLZyTZS2nH_XCj9_A` | ~1000 `.jpg` tagués en kebab-case (`equipe-reunion-presentation.jpg`, `datacenter-salle-serveurs.jpg`, `arbre-champ-majestueux.jpg`…) | par **tags** = tokens du nom (`--search`) |
| **Logos** | sous-dossier `logos` · `1DQfv1_Zr6xSVGNrXEXv59NviNIdCvQ_4` | `.png` transparents, logos clients/partenaires (`Client-O.png`, `Client-P.png`, `Client-B.png`) | par **nom du client** |
| **Profils** | sous-dossier `profils` · `180h2DHTjZUDQp2I9GJvIpmvuG3w-uWGN` | `.webp` carrés, photos de personnes (`dirigeant`, `second-intervenant`, `intervenant-3`, `intervenant-4`, `intervenant-5`) | par **rôle** |

`logos` et `profils` sont imbriqués dans `images` (listables comme sous-dossiers). Raccourcis
du script : `images`, `logos`, `profils`.

> **Noms de fichiers pseudonymisés (2026-09-11, TF-1021).** Les noms de logos clients et de
> photos de profil cités dans ce fichier sont des **pseudonymes** (`Client-O.png`,
> `dirigeant.webp`…), pas les noms réels des fichiers du dépôt. Toute commande `--name` de ce
> fichier est un **gabarit** : passer d'abord par `--list <dossier>` pour obtenir les noms réels
> à l'exécution.

> **Dépendance : Pillow.** Les deux scripts de cette chaîne importent `PIL` — `fetch_drive_assets.py`
> pour la validation d'image (`PIL.Image.verify()`, dimensions réelles, §3) et `prepare_images.py`
> pour le transcodage et le masque alpha (§4). Prérequis : `pip install Pillow`. Pillow n'est pas
> dans la bibliothèque standard ; son absence fait échouer toute l'étape images, pas le reste du deck.

**À ne jamais proposer comme illustration** (fichiers de service présents dans la biblio) :
`CREDITS.txt`, `credits.json`, `RENOMMER-*.cmd`, `*-tags.ps1`, `Recap_*.html`. Le script les
exclut déjà (filtre extensions image).

**`credits.json`** (biblio) : pour ~24 fichiers, une **description** (anglais) + `width`/`height`.
Utile pour affiner la sélection sémantique et pré-calculer un ratio **sans télécharger** ;
partiel, donc la sélection reste basée sur les tokens du nom (couvre les 1000).
Attribution Unsplash disponible si une slice crédits est demandée (licence commerciale OK,
attribution non requise mais élégante).

## 2. Sélection — piloter par le message de la slide

L'image sert le **message-clé de la slide** (fourni par `digit-ai-propale`), jamais l'inverse.
Traduire ce message en 2-3 mots-clés métier, puis :

```bash
python scripts/fetch_drive_assets.py --search equipe reunion --folder images
```

- **Panneaux latéraux** (texte+visuel, visuel+étapes) → préférer une image **paysage** (la
  biblio l'est majoritairement) : elle remplit mieux un panneau haut sans micro-format.
- Éviter de télécharger 10 candidates : lister, choisir 1 nom sur le libellé, télécharger
  **ce** fichier. Sélectivité stricte.

## 3. Récupération + validation (canal curl, sans MCP ni base64)

Turnkey via `scripts/fetch_drive_assets.py`, ou à la main :

1. **Lister / chercher** → mapping nom → ID (`--list` / `--search`).
2. **Télécharger** (`-L` pour suivre les redirections) :
   `curl -sL "https://drive.google.com/uc?export=download&id=<ID>" -o <nom>`
3. **Valider** : magic bytes (`89504e47` PNG · `ffd8ff` JPEG · `RIFF…WEBP` · `GIF8`),
   `PIL.Image.verify()`, dimensions réelles. **Jamais de retranscription base64.**

> **Gros fichiers** : `uc?export=download` peut renvoyer une page d'avertissement antivirus
> (paramètre `confirm`). Les logos/photos usuels (< ~25 Mo) passent ; si le fichier n'est pas
> une image (magic KO), récupérer le token `confirm` dans le HTML et relancer.

**Alt. Drive privé (MCP)** : `Google Drive:search_files` avec `parentId='<ID>'` (pas la
recherche sémantique, qui ignore les binaires) → `download_file_content` (base64) → décoder,
valider. Budget : base64 transite par le contexte → ≤ ~10 images / ~1,5 Mo par deck.

## 4. Préparation — `prepare_images.py` (ratio préservé, aucun cadre)

Avant embarquement, **toujours** passer par `scripts/prepare_images.py` :

- **Transcodage** `.webp`/`.gif` → **PNG** : PowerPoint n'embarque pas le webp de façon
  fiable ; les profils sont en webp → transcodage obligatoire. (Le rendu peut sinon afficher
  une case vide.)
- **Coins arrondis** (look des exemples) : masque **alpha** arrondi, **aucune bordure
  dessinée** (`--round 0.055` pour les illustrations, `--circle` pour un avatar). Le fond hors
  masque est transparent → l'image se pose sur le fond de slide, sans cadre.
- **Manifest** : `--manifest out/ -o out/manifest.json` → `{clé: {path, w, h, ratio}}`, lu par
  le build pour poser chaque image au **contain-fit exact**.

```bash
python scripts/fetch_drive_assets.py --name equipe-reunion-presentation.jpg --folder images --out img/
python scripts/prepare_images.py --round 0.055 img/equipe-reunion-presentation.jpg -o assets/
python scripts/fetch_drive_assets.py --name dirigeant.webp --folder profils --out img/
python scripts/prepare_images.py --circle img/dirigeant.webp -o assets/     # webp→png + cercle
python scripts/prepare_images.py --manifest assets/ -o assets/manifest.json
```

## 5. Placement — la règle de rendu (à recopier dans le build pptxgenjs)

**Jamais** fixer `w` ET `h` depuis une boîte à ratio figé : c'est le bug d'étirement. On
calcule `(w,h)` à partir des **dimensions réelles** de l'image (manifest) pour tenir dans un
**panneau** en respectant le ratio, puis on aligne dans le panneau (l'espace résiduel reste
le fond de slide → aucun cadre). Aucun `line` sur une image.

```js
// (w,h) contain-fit dans un panneau — ratio d'origine préservé, jamais d'étirement
function containBox(iw, ih, boxW, boxH) {
  const r = iw / ih;
  return (boxW / boxH >= r) ? [boxH * r, boxH] : [boxW, boxW / r];
}
// pose une photo (déjà arrondie par prepare_images) dans un panneau, sans cadre
function addPhoto(slide, m /* {path,w,h} */, panel /* {x,y,w,h} */, align = "center") {
  const [w, h] = containBox(m.w, m.h, panel.w, panel.h);
  let x = panel.x, y = panel.y + (panel.h - h) / 2;          // centrage vertical
  if (align === "right")  x = panel.x + (panel.w - w);
  else if (align === "center") x = panel.x + (panel.w - w) / 2;
  slide.addImage({ path: m.path, x, y, w, h });               // pas de `line` → pas de cadre
}
```

Un **logo** suit exactement la même règle (`containBox` dans sa boîte) : un logo n'est
**jamais** étiré pour remplir un bandeau. Un placeholder texte ne remplace un logo que si le
logo est absent du Drive.

## 6. Couverture — logos + photo d'habillage

La couverture porte **trois** assets :

1. **Logo Digit-AI** dans le panneau blanc (asset `assets/logo-digit-ai.png`, seul endroit
   autorisé avec la slide interlocuteurs).
2. **Logo client** depuis `logos` (`--name <client>.png --folder logos`), posé en `containBox`
   dans une boîte dédiée du panneau. Client absent du dépôt → le signaler et proposer de
   l'ajouter au dossier `logos`, sinon repli texte propre.
3. **Une photo d'habillage** (illustration paysage cohérente avec le secteur/le message),
   arrondie, sans cadre, en `addPhoto` sur le panneau visuel.

## 7. Rythme d'illustration (slides de contenu)

- **≈ 1 slide de contenu sur 2** porte une illustration. Objectif : rythmer sans saturer.
- **Jamais** d'illustration sur : **intercalaire**, **sommaire**, **investissement/prix**.
- La slide **« Vos interlocuteurs »** porte ses **photos de profil** (dépôt `profils`,
  `--circle`) — elle est hors de ce rythme (photos fonctionnelles, pas décoratives).
- Règle déterministe : parmi les slides de contenu **éligibles** (hors exclusions ci-dessus),
  alterner « avec / sans » ; sauter une slide déjà dense en données (tableau, grille 6 cartes)
  où une photo tasserait le contenu — reporter l'image sur la suivante éligible.
- Le **type de chaque slide** est fourni par `digit-ai-propale` (cover / sommaire /
  intercalaire / contenu / investissement / interlocuteurs / annexe) : c'est lui qui rend le
  rythme et les exclusions déterministes.

## 8. Passe QA finale — débordements & déformations (obligatoire)

Après la génération complète, **rasteriser tout le deck et inspecter chaque slide** :

```bash
soffice --headless --convert-to pdf --outdir . deck.pptx
pdftoppm -png -r 110 deck.pdf slide           # slide-1.png, slide-2.png, …
```

Checklist par slide (corriger puis **re-générer** — ne jamais livrer avec un défaut) :

- [ ] **Image non déformée** : ratio d'origine visible (via `containBox`), aucune image écrasée/allongée.
- [ ] **Image dans sa zone** : aucune photo qui déborde de son panneau ni ne sort de la slide.
- [ ] **Aucun cadre / case noire** : coins arrondis en transparence, pas de bordure parasite.
- [ ] **Logo net** : logo client/Digit-AI non étiré, non pixelisé, non tronqué.
- [ ] **Texte dans son encart** : aucun libellé/paragraphe qui déborde d'une carte, d'une
      colonne ou de la slide. Ajuster le texte ou la boîte à la source (budget de caractères).
- [ ] **Zones qui se chevauchent** : photo ↔ texte ↔ cartes ne se recouvrent pas.

> **Note rendu** : `fit: "shrink"` (pptxgenjs) émet `normAutofit` → **PowerPoint** réduit le
> corps s'il dépasse (filet de sécurité), mais **LibreOffice ne calcule pas toujours** cette
> réduction au rendu PDF. Donc : garde-fou **primaire = budget de contenu + QA visuelle** ;
> `fit:"shrink"` en secours. Un texte qui déborde à la rasterisation se corrige à la source,
> il ne se « compte » pas sur l'autofit.

## Garde-fous

- **Ratio d'origine préservé partout, jamais d'étirement** — `containBox`, pas de `w`+`h` figés.
- **Aucun cadre** sur les images — pas de `line` ; arrondi = masque alpha (`prepare_images`).
- **webp/gif → PNG** avant embarquement (sinon case vide dans PowerPoint).
- **Sélectivité** : une image entre si elle sert le message ; ne télécharger que l'utile.
- **Rythme** : ~1 contenu/2 ; jamais sur intercalaire, sommaire, prix.
- **Droits** : dépôts réputés libres d'usage (Unsplash pour la biblio) ; en cas de doute
  (personne identifiable hors profils maison, marque tierce), signaler.
- **QA finale non négociable** : rasteriser + checklist ; re-générer si défaut.
