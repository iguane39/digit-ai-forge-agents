---
name: digit-ai-docx
description: >
  Rend un document Word (.docx) — mémoire technique de réponse à un appel d'offres, courrier,
  kit partenaire, note — sur la MARQUE de l'émetteur (tokens.css de systeme-de-marque) ou sur la
  TRAME imposée par un destinataire (styles, en-têtes, pieds, format de page repris), puis le
  soumet à un oracle de validité du paquet bloquant avant remise. Frère de digit-ai-pptx, sans
  aucune valeur de marque en dur : sans dossier de marque ni trame, il rend la main. Use when /
  déclencher dès qu'il faut produire, rendre ou vérifier un DOCX, un mémoire technique sur trame
  fournie, un document Word à la charte d'un émetteur, ou relever la charte d'un modèle Word avant
  d'écrire. Ne pas déclencher pour un deck (→ digit-ai-pptx), rédiger ou chiffrer une propale
  (→ digit-ai-propale), ni une page HTML (→ digit-ai-page-html).
metadata:
  version: "1.0.0"
---

# Rendu DOCX — marque de l'émetteur ou trame imposée

Une réponse à un appel d'offres public impose souvent son mémoire technique en DOCX, sur une trame
fournie ; un kit partenaire ou un courrier fournisseur n'est pas un deck. Ce skill rend le
**document** ; le **contenu** (plan, rubriques, texte) vient de `digit-ai-propale` ou de
l'utilisateur, jamais de lui (TF-1027, décision humaine du 11/09/2026).

## Trois gestes, dans l'ordre de PRODUCTION-OOXML.md (références du pilot)

1. **Relever avant d'écrire** — une charte se relève, elle ne se déduit jamais (TF-0687) :

   ```bash
   node scripts/rendre-docx.mjs --relever <trame.docx>
   ```

   Styles (identifiant, nom, type), polices, couleurs, médias, format de page, en-têtes et pieds,
   et la correspondance retrouvée pour le titre, les titres 1-2, la puce et le tableau. Une trame
   sans style de titre le montre ici ; le rendu ne l'inventera pas.

2. **Rendre**, sur l'une des deux sources, jamais sur une valeur en dur :

   ```bash
   node scripts/rendre-docx.mjs --plan plan.json --marque <dossier de marque> --out doc.docx
   node scripts/rendre-docx.mjs --plan plan.json --trame  <trame.docx>       --out doc.docx
   ```

   - **Marque** : lit `tokens.css` de l'émetteur (`--head`, `--sans`, `--ink`, et `--accent`,
     `--blue` ou `--primary`, en hexadécimal). Un jeton requis absent → refus, exit 2.
   - **Trame** : garde **toutes** les parties de la trame (styles, thème, en-têtes, pieds, médias,
     format de page) et ne remplace que le **corps** ; les styles se retrouvent par leur nom
     (« Heading 1 » ou « Titre 1 »…). Des puces sans style de liste dans la trame sont rendues par
     un tiret, et c'est dit dans la sortie (`ecarts`).

   Les titres du plan passent **mot pour mot** : une rubrique imposée se reprend à l'identique
   (`oracle-exigences-ao`, X2) — le rendu ne renumérote rien.

3. **Contrôler avant remise** — gate bloquante, exit 0/1/2 :

   ```bash
   node scripts/oracle-docx.mjs doc.docx
   ```

   D1 archive lisible · D2 types de contenu · D3 relations vers des parties présentes · D4 parties
   XML bien formées · D5 ordre des enfants WordprocessingML (`w:sectPr` en dernier, `w:pPr`,
   `w:rPr`, `w:tcPr` en premier, `w:tblPr` → `w:tblGrid` → `w:tr`) · D6 ordre DrawingML
   **délégué** au contrôle verifier-ooxml.py des scripts du pilot (introuvable → D6 déclarée non jugée, jamais
   un PASS). Un paquet mal ordonné s'ouvre avec une « réparation » qui perd du formatage en
   silence (TF-0686) : rien ne part sans ce verdict.

## Plan (JSON)

```json
{ "titre": "…", "emetteur": "…",
  "sections": [ { "titre": "1. Présentation du candidat", "niveau": 1,
                  "blocs": [ { "type": "paragraphe", "texte": "…" },
                             { "type": "puces", "items": ["…"] },
                             { "type": "tableau", "entetes": ["…"], "lignes": [["…"]] } ] } ] }
```

## Preuve

`node scripts/self-test.mjs` — double sens : un mémoire rendu sur une marque de fixture passe
D1-D6 et se relit par une bibliothèque tierce (python-docx, quand elle est installée) ; quatre
paquets abîmés tombent chacun sur SA règle ; une marque incomplète est refusée ; un rendu sur trame
reprend la partie styles.xml octet pour octet. Fixtures : `fixtures/plan-memoire.json`,
`fixtures/plan-sur-trame.json`, `fixtures/marque/`, `fixtures/marque-incomplete/`.

## Ce que ce skill ne juge pas

- L'ouverture réelle dans Word : aucun Word sur le poste de recette ; D1-D6 contrôlent les causes
  connues de réparation, pas le schéma complet.
- La fidélité visuelle à la trame (espacements fins, images de couverture) : le relevé la montre,
  un rendu ou un œil la juge.
- Le PDF : exporter depuis Word ou un convertisseur, puis juger le PDF avec son propre contrôle.

## Frontière

Contenu et chiffrage → `digit-ai-propale` (qui choisit ce rendu **par paramètre**, jamais par
défaut) · deck → `digit-ai-pptx` · page HTML → `digit-ai-page-html` · marque de l'émetteur →
`systeme-de-marque` (forge-design).
