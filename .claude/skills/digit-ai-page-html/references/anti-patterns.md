# Contournements à ne pas généraliser

Patterns relevés dans des livrables réels, **légitimes dans leur contexte d'origine** mais
à ne **pas** ériger en règle. Les reconnaître évite de canoniser une rustine.

## `xmlns:mso` / `xmlns:msdt` sur `<html>`

Namespaces Microsoft Office, artefact de compatibilité **copier-coller vers Word**.
À conserver **uniquement** si le collage Word est un objectif explicite du livrable.
Sinon, bruit à retirer.

## Placeholders `{{PROJET}}`, `{{VERSION_INDICE}}`, etc.

Mécanique de **templating** (gabarit à remplir), pas une caractéristique de page finale.
Acceptable dans un *modèle* ; jamais dans un *livrable rendu* remis au client.

## Google Fonts CDN comme seule source de police

Pratique **viewer**, mais fragile pour la cible **PDF** (les fonts CDN ne s'embarquent pas)
et pour l'usage offline. Toujours doubler d'un **repli système** (cf. bonnes-pratiques §3, §6).

## Tooltips JS porteurs d'information non redondante

OK en viewer, **trou en PDF** (`:hover` et JS inactifs). Si la page vise aussi le PDF,
prévoir un **équivalent statique** de l'information (cf. bonnes-pratiques §6).

## Texte stylé en gras simulant un titre

Casse la navigation par titres des lecteurs d'écran et le plan du document.
Utiliser un vrai `<hN>` (cf. bonnes-pratiques §2).

## Couleurs hex en dur hors `:root`

Couleurs écrites en dur dans les règles (`color: #404040`, `background: #0F766E`) au lieu des
tokens. Relevé dans des rapports réels. Casse la charte (une évolution de palette n'est plus
pilotable en un point) et empêche tout audit de cohérence. **Tout** en `:root` (cf.
`charte-et-tokens.md`, bonnes-pratiques §3).

## Pile de police sans DM Sans / Roboto

`font-family: "Segoe UI", Roboto, system-ui, …` sur le corps de texte : le corps doit être en
**DM Sans** et les titres en **Roboto** (C1/C2). Une pile qui saute DM Sans sort de la charte
même si le rendu « ressemble ». Corriger via les tokens `--head`/`--sans`.

## Composant interactif sans accessibilité

Catalogue filtrable, drawer, onglets ou dropdown livrés **sans `role`/`aria`, sans contrat
clavier, sans piège de focus**. Relevé sur un catalogue entièrement rendu en JS (0 attribut
a11y). L'interactivité riche impose l'a11y (bonnes-pratiques §4) : `aria-expanded`/`-controls`
sur les dropdowns, `role="dialog"` + `aria-modal` + fermeture clavier sur les drawers,
`role="tab"`/`tablist`/`tabpanel` sur les onglets.

## Barre de progression sur `<span>` inline

`.bar { height: 8px }` posé sur un `<span>` laissé `display: inline` : un inline ignore
`height`/`width` et la barre devient **invisible** (défaut de rendu que les mesures de code ne
voient pas, seul l'œil sur le PNG le voit). Toujours `display: inline-block` ou `block`
(cf. composants.md §3).

## Sous-titre explicatif redondant sous un titre

Un `<h_>` suivi d'une phrase qui **paraphrase le titre** (« Mon activité » puis « Cette page
présente votre activité »). Les agents (Claude Code, Codex) en ajoutent par réflexe sous chaque
titre. C'est du bruit : le titre porte déjà l'information. **Règle : si ce n'est pas tangiblement
utile, on le supprime.** Un sous-titre n'est légitime que s'il ajoute une information que le titre
ne donne pas (chiffre, période, précision d'audience).
