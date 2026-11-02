# La page de versions

`scripts/serveur-versions.mjs` sert `assets/page-versions.html` sur 127.0.0.1. Il refuse un hôte ou une origine étrangers, et seul lui écrit `jugements.json`, `aveugle.json` et `classement.json`.

## Le menu et l'aperçu

Le menu liste toutes les versions, l'origine comprise : numéro, type, commentaire tiré de `note.json`, mots ajoutés et retirés, statut, motif d'un rejet. Le filtre propose Toutes, Pertinentes, Non jugées. Le menu n'est pas un tableau de données : la règle L4 et ses garde-fous G1-G6 ne s'y appliquent pas.

L'aperçu vit dans un `iframe sandbox="allow-scripts"`, sans `allow-same-origin`, servi avec une CSP qui bloque le réseau externe.

| Format | Aperçu |
|---|---|
| Markdown | `scripts/lib/markdown.mjs` : titres, paragraphes, listes, tableaux, gras, italique, liens, code. Tout le reste en texte brut |
| HTML | la version telle quelle ; un lien suivi par la page reste possible, la CSP ne couvre que le chargement |
| PDF | images de pages, par `pypdfium2` |
| Word | export en PDF par Word, puis images de pages. Sinon, le texte extrait, en le disant |
| PowerPoint | export en PDF par PowerPoint, puis images de pages. Sinon, le texte des diapositives, en le disant |

## PowerPoint

Le serveur n'exporte rien lui-même : il appelle `scripts/exporter-pptx.mjs` du skill `digit-ai-pptx`. Cet export pose un verrou entre sessions, travaille sur une copie et ne quitte jamais une instance qu'il n'a pas lancée. PowerPoint n'a qu'une instance par session Windows : si le porteur a le sien ouvert, l'export s'y attache sans fenêtre, ferme sa seule copie et laisse tout le reste. Il attend le verrou 5 minutes au plus et PowerPoint 10 minutes au plus ; le serveur ne le coupe pas plus tôt, car couper l'export ne fermerait pas PowerPoint. Un refus de l'export, dont des polices jugées fausses dans le PDF, fait passer l'aperçu au texte extrait, avec son motif. Une réussite se garde dans `apercus/`, un repli se réessaie au prochain aperçu.

## Word

Le serveur copie la version dans un dossier temporaire et l'ouvre par `scripts/word-vers-pdf.ps1` : lecture seule, fermeture sans enregistrer, `Quit` seulement si cette instance n'a plus de document. L'export est borné à 120 secondes ; au-delà, le serveur arrête son seul processus `WINWORD.EXE /Automation`, dont il a noté le numéro, et l'aperçu affiche le texte extrait. Un arrêt forcé efface l'entrée de reprise que Word aurait laissée pour cette copie : le porteur ne la revoit pas à sa prochaine ouverture de Word. Un Word ouvert par le porteur n'est jamais touché. Un export à la fois ; une réussite se garde dans `apercus/`, un repli se réessaie au prochain aperçu.

Une ligne de PDF remplacée garde sa police si celle-ci est réutilisable et porte tous les caractères ; sinon elle passe à la police standard la plus proche. Cet écart de dessin peut trahir une version modifiée, à l'aveugle comme ailleurs.

## Comparer

L'onglet met 2 versions face à face, choisies par 2 sélecteurs. À droite, la version choisie dans le menu ; à gauche, la précédente gardée tant que le porteur n'en choisit pas une autre. Toute version qui a un fichier se choisit, rejetée comprise, dans les 2 sens. Il n'existe pas en mode aveugle.

| Forme | Word, PowerPoint, PDF | Markdown, HTML |
|---|---|---|
| Dans son format, par défaut | les pages rendues, rang par rang sur une même ligne, comme dans l'aperçu | les 2 aperçus côte à côte, chacun dans son cadre |
| En texte marqué | mots retirés barrés à gauche, ajoutés soulignés à droite | la même chose |

`formats.py pages-ecart` compare les 2 images de chaque rang et rend ce qui diffère : chaque page se dit modifiée ou identique, et chaque bande de lignes voisines qui diffère s'encadre en rouge, des 2 côtés, à la même place. Un écart de gris sous `SEUIL_PIXEL` n'est que du lissage. Au-delà de `ZONES_MAX` bandes, un seul cadre couvre le tout, car le texte a reflué. « Pages modifiées seulement » retire les autres de l'écran, et « Masquer le menu » rend sa largeur aux 2 colonnes, jusqu'au retour à l'aperçu. Une page sans vis-à-vis se dit. Un export qui échoue ramène aux 2 aperçus en texte extrait, avec son motif.

Limites. L'écart compare les pixels à la même place : un Word dont un paragraphe a grandi encadre tout ce qui a glissé dessous, et une page ajoutée décale les suivantes. Markdown et HTML n'ont pas d'encadré, et leurs 2 cadres défilent séparément : ce qui a changé s'y lit par « En texte marqué ».

## La revue à l'aveugle

Elle s'ouvre quand l'essai a atteint son arrêt, et ses versions se figent à l'ouverture : `--reprendre` ne repousse plus la borne ensuite.

- **Les versions.** L'origine et, pour chaque tour cible 1, 5, 10, 20, 35 et 50, la dernière version gardée de numéro inférieur ou égal ; une version retenue pour 2 cibles ne paraît qu'une fois.
- **Les lettres.** Tirées au hasard, la graine dans `aveugle.json`. L'adresse de l'aperçu est neutre : `/aveugle/A`.
- **Ce qui est masqué.** Numéro, commentaire, mots, statut, date, sélecteur, onglet « Comparer ».
- **Word, PowerPoint et PDF.** En images, jamais en fichier. Si l'export d'une seule version échoue, toutes les versions de ce document passent au texte extrait, même celles déjà exportées, pour que le repli ne trahisse aucune version.
- **Le classement.** Toutes les lettres, de la meilleure à la moins bonne, une seule fois : il ne se récrit pas. Les lettres peuvent se marquer pertinentes.
- **La levée.** Après le classement seulement. Chaque lettre dit sa version, et le marquage rejoint `jugements.json` par version.

Cet aveugle reste partiel : le porteur peut reconnaître l'origine ou une longueur inhabituelle, et le bilan le dit.

## Les états vides

Espace sans document, filtre sans version, comparaison sur l'origine, rejet sans fichier : chacun dit quoi faire.
