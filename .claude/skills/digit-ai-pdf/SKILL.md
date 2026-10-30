---
name: digit-ai-pdf
description: >
  Remplit un formulaire PDF, à champs ou plat, et le contrôle par un oracle exécuté sur le fichier
  rendu avant toute remise ; trie un PDF page par page (natif, scan, hybride, formulaire sans champ,
  signé, chiffré, XFA) et dit quelle voie suivre ; convertit un PDF en texte, couche de texte ou OCR
  selon la page, et déclare les pages illisibles. Use when / déclencher dès qu'il faut compléter,
  remplir ou vérifier un formulaire PDF, un contrat ou un mandat à signer, un CERFA, identifier ce
  qu'est un PDF, lire un scan, faire l'OCR d'un document français, ou convertir un PDF entrant en
  texte pour une conception. Priorité sur le skill générique `pdf` pour ces trois gestes. Ne pas
  déclencher pour fusionner, découper ou tourner un PDF (→ `pdf`), produire un PDF depuis une page
  HTML (→ `fiche-en-pdf.mjs` de forge-audit), juger ses polices (→ oracle-polices-embarquees), ni
  rendre un Word (→ digit-ai-docx).
metadata:
  version: "1.0.0"
---

# PDF de la Factory — formulaires, tri, lecture

Né de l'étude du 30/10/2026 (`output/03-etudes/` du pilot, TF-2031, décision humaine D-112 (a)). Le
risque mesuré : un contrat et un mandat de prélèvement sont sortis remplis sans contrôle sur le
fichier, et aucun oracle du parc ne jugeait un champ rempli. Le skill reste mince : il ne remplace ni
les chaînes des produits ni le skill `pdf`, qu'il appelle tel quel pour le reste.

Dépendances, toutes permissives : `pip install pypdf pypdfium2 pdfplumber reportlab pillow`. `pymupdf`,
en AGPL, n'entre jamais dans ce skill. Une dépendance absente rend un SKIP motivé, jamais un PASS.

## Par où commencer

```bash
python scripts/trier-pdf.py <fichier.pdf>
```

Le JSON rendu donne la nature de chaque page et la liste `voies`. Le tri est **technique** : facture,
bail ou CV ne sont pas reconnus, ce lot n'ouvrira que sur 3 demandes relevées à la revue du 15/12/2026.

| Voie rendue | Sens | Geste |
|---|---|---|
| `remplir_champs` | de vrais champs de saisie | formulaire, ci-dessous |
| `remplir_plat` | aucun champ, mais des libellés et des lignes vides ou des cases | formulaire, ci-dessous ; c'est une probabilité, l'œil confirme |
| `ocr` | scan, page de dessin ou couche de texte fausse | lecture, ci-dessous |
| `lire_texte` | une couche de texte saine | lecture, ci-dessous |
| `signe` | une signature est posée | lire seulement : toute écriture la casse |
| `xfa` | formulaire XML | refusé ici : Acrobat, ou le demander en AcroForm |
| `deverrouiller` | mot de passe | le demander à son détenteur, jamais le contourner |

## Remplir un formulaire

1. **Relever avant d'écrire.** Les noms de champs, leurs états et leurs boîtes se lisent, ils ne se devinent pas.

   ```bash
   python scripts/formulaire.py relever vierge.pdf --modele valeurs.json --png <dossier>
   ```

   L'image est quadrillée tous les 50 points : sur un formulaire plat, c'est elle qui donne les boîtes.

2. **Écrire `valeurs.json`.** Les boîtes s'écrivent `[x0, haut, x1, bas]`, en points, origine en haut à gauche.

   ```json
   { "champs": { "nom": "Hélène Dupré", "accepte": true, "formule": "/B" },
     "plat":   [ { "page": 1, "boite": [110, 88, 400, 106], "texte": "Hélène Dupré" },
                 { "page": 1, "boite": [50, 150, 62, 162], "coche": true } ] }
   ```

   Les valeurs viennent de l'humain ou d'un document qu'il a fourni. Une valeur manquante se demande,
   elle ne s'invente pas. La signature reste au signataire : `remplir` refuse d'écrire un champ de signature.

3. **Remplir : l'oracle s'enchaîne, et son verdict est le code de sortie.**

   ```bash
   python scripts/formulaire.py remplir vierge.pdf --valeurs valeurs.json --out rempli.pdf
   ```

4. **Regarder le rendu** : `python scripts/oracle-formulaire-pdf.py rempli.pdf --attendu valeurs.json --source vierge.pdf --rendu <dossier>` dépose l'image de chaque page telle qu'elle s'imprime. Le dessin réel des caractères n'est jugé par aucun contrôle : **un document à signer ne part pas sans cette lecture**, faite par la session.

### Règles de l'oracle

`oracle-formulaire-pdf.py`, inscrit au registre de `quality-oracles`, exit 0/1/2. Il relit le fichier par
d'autres bibliothèques que celles qui l'ont écrit : PDFium aplatit les apparences comme à l'impression.

- **F1** fichier lisible, même nombre de pages que la source, pas de XFA.
- **F2** chaque champ demandé existe. **F3** la valeur relue est la valeur voulue ; `/V` et `/AS` d'une case concordent.
- **F4** ce qui s'imprime : une valeur sans apparence, invisible hors d'Acrobat, une apparence périmée, un champ non imprimable.
- **F5** le texte tient : largeur, hauteur en multiligne, `MaxLen`. **F6** aucun champ requis ne reste vide.
- **F7** aucun champ non déclaré n'a changé. **F8** le contenu de la page n'a changé qu'aux zones déclarées.
- **P1** plat : le texte est dans sa boîte et se voit. **P2** rien ne sort de sa boîte. **P3** rien n'écrit sur le texte du formulaire ; sur un scan sans couche de texte, de l'encre sous le texte ajouté avertit. **P4** les cases sont comme demandé. **P5** corps sous 6 points, avertissement.

`--source` est exigée pour un formulaire plat, sinon SKIP : sans le vierge, ni collision ni écriture hors zone ne se jugent.

## Lire un PDF

```bash
python scripts/lire-pdf.py entrant.pdf --out entrant.md --images <dossier>
```

- Chaque page prend sa voie : couche de texte, OCR, vide ou illisible. Le bilan rend `outil`, `date`,
  `moteur` et `pages_illisibles`, ce que `qualifie-l-entrant` déclare en section 2 d'`ENTRANT.md`.
- Une page illisible se déclare, exit 1, et son image va dans `--images` : la session la lit alors comme image.
- `--images-ocr` dépose aussi l'image de chaque page passée par l'OCR, pour la relecture ci-dessous.
- `--tableaux` ajoute les tableaux d'une page native en Markdown ; `--moteur tesseract` force ce moteur s'il est installé.

**Un chiffre lu par OCR ne part jamais sans relecture de l'image.** Sur le banc, le moteur de Windows
retrouve 81 % des nombres d'un scan propre et 45 % d'un scan dégradé ; Tesseract 90 % et 56 % ; la lecture
d'image par Claude 93 % et 95 %. Pour un montant, un IBAN ou une date qui engage : `--images-ocr`, puis
lecture de l'image par la session. Détail et limites : `references/banc-ocr-20261030.md`.

## Preuve

`python scripts/self-test.py` : le vert passe, et chaque règle tombe sur un défaut fabriqué pour elle ;
tri, lecture et OCR sont joués sur des PDF synthétiques à nature connue. Sur un poste sans moteur d'OCR,
le contrôle dit que la page reste illisible, il ne la compte pas comme lue.
`python scripts/fixtures_pdf.py --ecrire` régénère les fixtures du manifest, toutes fictives.
`python scripts/banc-ocr.py` rejoue le banc ; ses pages, de vrais documents, ne sortent jamais du poste.

## Limites

- L'exactitude métier des valeurs : l'oracle compare à `valeurs.json`, il ne dit pas si `valeurs.json` est juste.
- La validité d'une signature, ni le droit de remplir un document déjà signé.
- Le bon placement d'une boîte d'un formulaire plat : l'oracle borne le texte à la boîte déclarée, l'œil juge la boîte.
- Le dessin réel des caractères : `--rendu` et l'œil, ou `oracle-polices-embarquees` pour une police embarquée.
- Les pages tournées d'un formulaire : remplissage plat refusé, F4 et F5 déclarées non jouées.
- Le type métier d'un document, et la modification d'un texte existant : `pypdf` ne le supprime pas proprement en place, cela reste une affaire de session.

## Frontière

Fusion, découpe, rotation, filigrane → `pdf`, appelé tel quel, sa licence interdit toute copie ·
PDF produit depuis une page → `fiche-en-pdf.mjs` et `verifier-pdf.mjs` (forge-audit) · polices →
`oracle-polices-embarquees` · format imprimé → `check_format_a4.py` · conversion d'un dossier entrant
→ appelée par `qualifie-l-entrant` · chaînes de lecture d'un produit → elles restent chez le produit.
