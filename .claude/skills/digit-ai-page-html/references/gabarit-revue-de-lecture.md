# Gabarit — REVUE.md, la revue de lecture (obligatoire avant livraison)

**TF-0422, lot Client-B 20260820a (21/08).** Une page sortie verte à tous les oracles a été
refusée par le client à l'ouverture : colonne de texte à 40 % d'un écran de 1 800 px, chapeaux
identiques, doublons. Chaque règle mesurait une propriété locale ; aucune étape ne regardait la
page comme un lecteur. La revue de lecture était déclarée « à la charge de l'orchestrateur »
(`lisibilite.md`) — sans être obligatoire ni outillée. Elle l'est désormais : **aucune livraison
sans `REVUE.md`**, et `run-oracles`/l'orchestrateur le vérifient (fichier présent, daté, non vide).

## Ce qu'on lit, et comment

1. `python scripts/render_page.py <page> --sections "<sélecteur de section>"` — une capture
   par largeur (**1920, 1280, 768, 390** par défaut) **et** une capture par section (onglet,
   chapitre, panneau) : une page longue ne se lit pas sur une seule capture pleine page.
2. **Ouvrir chaque capture** et lire comme le destinataire : la question de chaque ligne de la
   table « Ce qui n'est PAS mécanisable » de `lisibilite.md`.
3. Consigner **chaque constat** avec la largeur où il se voit, la suite décidée, et la preuve
   de correction (capture ou oracle rejoué). Une revue sans constat le dit : « aucun constat à
   1920/1280/768/390, captures lues le <date> ».

## Le fichier

`REVUE.md` vit à côté du livrable (ou dans `forge\etapes\…` pour un run) :

```markdown
# Revue de lecture — <livrable> — <AAAA-MM-JJ HH:MM>

Captures lues : 1920 · 1280 · 768 · 390 (+ sections : <sélecteur>, N captures).
Lecteur : <qui>.

| Largeur | Section | Constat (ce que le lecteur voit) | Suite | Preuve |
|---|---|---|---|---|
| 1920 | Synthèse | colonne de texte à 40 % de la fenêtre, marge droite vide | .chap.lire (conteneur 1080 px) au lieu de width:min(75ch,100%) | render_page L2 PASS, capture 1920-b.png |
| 768 | Tableau 3 | panneau de filtre coupé sur la dernière colonne | composant : côté droit (tf-droite) | capture 768-b.png |
| — | — | aucun autre constat | — | — |
```

## Ce que la revue n'est pas

Pas un oracle : elle juge ce que les oracles ne peuvent pas juger (justesse d'un chapeau,
fil narratif, ce qu'un lecteur voit en premier). Pas une relecture du code : on lit des
captures, jamais du HTML. Pas facultative : « lisibilité OK » sans `REVUE.md` n'a pas eu lieu.
