> **Reconstitué le 2026-09-11 depuis la description du SKILL.md v2.5.0 (TF-1022) — valeurs de
> marque à remplacer par la consommation du système de marque Digit-AI (tokens.css + MARQUE.md,
> TF-1023) ; à valider**

# Assets et slides canoniques

## 1 · Avertissement de complétude (2026-09-11)

Le paquet livré **ne contient aucun binaire d'asset**. Les fichiers ci-dessous sont décrits par
le `SKILL.md` v2.5.0 mais **n'ont jamais été livrés** avec lui ; ils ne sont pas reconstituables
(ce sont des images et un fragment XML, pas du texte dérivable d'une description) :

| Asset décrit par la source | État |
|---|---|
| logo officiel Digit-AI (PNG) | **non livré** |
| photos N&B carrées des deux interlocuteurs | **non livré** (et pseudonymisées : cf. §4) |
| fragment XML du slide « Vos interlocuteurs chez Digit-AI » | **non livré** |
| script de fusion XML d'un slide canonique dans un PPTX existant | **non livré** |

Conséquence opérationnelle, à assumer explicitement : **le patch d'un PPTX existant par
réinjection d'un slide canonique n'est pas outillé par ce skill.** Le slide canonique se
**reconstruit** avec le reste du deck (pptxgenjs), il ne se **greffe** pas. Les assets sont à
récupérer par le canal `references/drive-assets.md` (dépôt `profils` pour les photos) ou à
redemander au porteur de la charte.

## 2 · Slide canonique « Vos interlocuteurs chez Digit-AI »

**Position** : dernière slide du deck (attesté par le gabarit B de `digit-ai-propale` :
« Dernière · "Vos interlocuteurs chez Digit-AI" — slide canonique, générée par le skill
`digit-ai-pptx` »).

**Contenu attesté** :

- deux intervenants : **le dirigeant** et **le second intervenant** (identités réelles retirées,
  cf. §4) ;
- leurs **photos de profil**, rondes — préparées avec l'option `--circle` de
  `prepare_images.py` (masque alpha, **aucun cadre**), transcodées webp → PNG ;
- le **logo Digit-AI** : c'est, avec le panneau blanc de la couverture, le **seul** endroit du
  deck où le logo est autorisé.

**Hors rythme d'illustration** : ces photos sont fonctionnelles, pas décoratives — elles ne
comptent pas dans la règle « ≈ 1 slide de contenu sur 2 ».

**Nom, rôle, contact affichés, mise en page, texte d'accompagnement** : `[à valider]` — la
source ne les décrit pas.

## 3 · Slide canonique « Réalisations »

Citée deux fois par le `SKILL.md` (« slides canoniques (interlocuteurs, réalisations) ») et
**jamais décrite**. Contenu, nombre de références montrées, forme : `[à valider]`.

> **Garde-fou de confidentialité.** Une slide « réalisations » nomme par construction des
> clients. Elle ne se construit **que** sur une liste de références validée par le porteur du
> compte, jamais par recopie d'un deck antérieur — la règle de confidentialité inter-clients de
> `digit-ai-propale` (règle dure 2) s'applique ici sans atténuation.

## 4 · Pseudonymisation (2026-09-11, TF-1021)

Les identités des deux interlocuteurs, les noms de clients cités en exemple et les noms de
fichiers de profil ont été remplacés par des **rôles** (« le dirigeant », « le second
intervenant », `intervenant-3`…) et des **pseudonymes** (`Client-A`, `Client-F`…).

Conséquence à connaître : **les noms de fichiers cités ici et dans
`references/drive-assets.md` ne sont plus les noms réels des fichiers du dépôt Drive.** Les
commandes d'exemple (`--name dirigeant.webp --folder profils`) sont des **gabarits** ; passer
d'abord par `--list profils` pour obtenir les noms réels à l'exécution.

## 5 · Règles de rendu applicables à tout asset

Reprises de `references/drive-assets.md`, sans exception ici :

- ratio d'origine **toujours** préservé (`containBox`), jamais `w` **et** `h` figés ;
- **aucun cadre** : arrondi = masque alpha, jamais de `line` ;
- webp / gif → **PNG** avant embarquement ;
- un logo absent du dépôt → repli **texte propre**, jamais un logo étiré ni une case vide.
