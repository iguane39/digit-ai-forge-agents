# Tests d'interactions — ce que les oracles statiques ne voient pas (RA-7, 14/08)

`check_html.py` juge la structure, `render_page.py` juge le rendu (y compris états ouverts,
`--etats-ouverts`). **Aucun des deux ne voit une affordance câblée mais FAUSSE** — trois
défauts de cette classe en une seule journée de run réel, tous invisibles aux oracles :

1. un indicateur annonçant « 35 éléments » qui n'en filtrait que 34 (verdict « sous
   réserve » exclu de l'appariement) ;
2. un tri armé en réécrivant `th.textContent`, détruisant silencieusement la facette
   injectée par le composant (voir le piège RA-6, `composant-filtres-tableau.md`) ;
3. une valeur non mesurable remontée en tête d'un tri décroissant, là où le lecteur attend
   le maximum.

## La méthode

Un test d'interactions est un script Playwright qui **exerce chaque affordance par un vrai
geste** et affirme l'effet observable — jamais la présence :

- chaque compteur affiché est **recompté** depuis le DOM après l'action qu'il annonce
  (cliquer le filtre, puis compter les lignes visibles : les deux nombres sont égaux) ;
- chaque tri est vérifié sur l'**ordre réel** des premières lignes (et le sort des valeurs
  non mesurables est affirmé explicitement : en queue, jamais en tête) ;
- chaque extension d'un composant vérifie que **ce que le composant avait injecté existe
  encore** après l'extension (le défaut n°2 est indétectable autrement) ;
- la réinitialisation ramène TOUT (recherche + facettes + tris + états dépliés).

**Double sens obligatoire** : comme tout oracle du socle, un test d'interactions se prouve
sur une fixture verte (câblage vrai → PASS) et une rouge (câblage FAUX — un compteur qui
ment d'une unité suffit → FAIL). Un test qui n'a jamais échoué ne prouve rien.

## Points de départ éprouvés

[`assets/exemples-interactions/`](../assets/exemples-interactions/) porte les deux scripts
du run SCC_ALX (13/08) — 34 contrôles au total, qui ont trouvé les trois défauts ci-dessus
sur un livrable que les deux oracles validaient :

- `test_interactions_html.py` — page de restitution : compteurs de filtres, recherche,
  tri, réinitialisation ;
- `test_interactions_gabarit.py` — module `GabaritTableau` composé avec le composant
  D-12 : survie des facettes aux extensions, tri des non-mesurables, état dans l'URL.

Autres modèles dans l'écosystème : l'oracle de câblage de `todo/TODO.html` (pilot, 13/13)
et l'oracle d'acceptation du dashboard forge-tests (10/10 sur captures d'états ouverts).

## Frontière

Le test d'interactions appartient au LIVRABLE (il connaît ses affordances) — le socle
fournit la méthode et les exemples, pas un oracle générique : une affordance fausse ne se
détecte qu'en connaissant l'intention de la page. La revue d'acceptation joint les
captures d'états ouverts (TF-0176) ; le test d'interactions est son bras exécutable.
