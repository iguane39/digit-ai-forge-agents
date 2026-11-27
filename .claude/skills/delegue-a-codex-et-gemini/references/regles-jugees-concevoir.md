## Règles que la Factory juge sur une page HTML (ajoutées par le lanceur au geste concevoir)

Si ton livrable est une page HTML, deux contrôles la jugeront après toi. Respecte ces règles en l'écrivant : la comparaison de 18 maquettes du 27/11/2026 (lot Produit-82 20261127e, RT-69) mesurait en partie la connaissance de ces règles. `render_page.py` comptait de 11 à 911 constats bloquants par page chez Codex et Gemini, presque tous des chevauchements de zones de survol, contre 0 à 3 chez Claude.

1. **Jetons.** Toute couleur et toute famille de police vient d'un jeton déclaré en `:root` (`--nom: valeur`). Aucune couleur ni famille littérale (`#fff`, `rgb()`, `font-family: Inter`) hors des blocs de jetons (règles T1 et T2).
2. **Thème sombre complet.** Si tu déclares un thème sombre, il tient dans un bloc `[data-theme="dark"]` qui redéclare chaque jeton de couleur du thème clair : un jeton absent du sombre est bloquant (T4). Un bloc `@media (prefers-color-scheme: dark)` n'est pas le thème sombre : le clair est le défaut, et ce bloc est refusé.
3. **Échelle de 4 px.** Tout espacement en px est un multiple de 4 : 4, 8, 12, 16, 24, 32… (T3).
4. **Contraste AA, dans chaque thème.** Texte courant au moins 4,5:1 ; texte large (24 px, ou 18,66 px gras) et éléments d'interface (bordures de contrôle, anneau de focus) au moins 3:1 (V2, T5, T7, T8).
5. **Chevauchements (V4).** Deux éléments frères dont les boîtes se recouvrent sont un constat bloquant, y compris une zone de survol transparente posée sur des marques SVG. Une superposition voulue (calque de survol, badge, ruban) se déclare : `data-overlap-ok="<id de l'élément recouvert>"` sur le calque, plusieurs identifiants séparés par des espaces. Des éléments qui se recouvrent tous entre eux (traits de branche) déclarent le même jeton : `data-overlap-ok="calque-traits"` sur chacun. Pour un nœud de schéma, préfère un groupe `<g>` qui porte un `<title>` : il évite la déclaration. N'écris pas `data-overlap-ok=""` : la forme nue exempte encore, mais elle est recensée en avertissement.

Commandes à rejouer sur ton fichier, une fois qu'il est écrit, si tes outils le permettent (la racine du parc est `{FORGE_ROOT}`) :

```
python {FORGE_ROOT}/digit-ai-forge-agents/.claude/skills/digit-ai-page-html/scripts/render_page.py <page.html>
node {FORGE_ROOT}/digit-ai-forge-design/oracles/run-oracles-design.mjs <page.html> --rendu
```

Ces commandes sont soumises à ta borne de vérification : une seule passe, jamais plus longue que ce que la borne autorise. Si elles ne tournent pas dans ton bac à sable, applique les cinq règles sans elles et dis-le en une ligne dans ta direction.
