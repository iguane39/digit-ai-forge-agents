# Journal de mesure du lot 12

Le lot 12 est entre en recette le 2 septembre. Trois environnements ont ete mesures : poste local,
integration, preproduction. Les relevés viennent du journal d'execution, archive au meme dossier.

| environnement | duree du build | tests joues | tests en echec |
|---|---|---|---|
| poste local | 4 min 10 s | 312 | 0 |
| integration | 6 min 02 s | 312 | 2 |
| preproduction | 6 min 55 s | 312 | 0 |

Les deux echecs d'integration portent sur le meme composant. Le premier vient d'un fuseau horaire
code en dur — le poste local est en UTC. Le second vient d'un fichier de donnees absent du depot.
Les deux ont ete corriges le 3 septembre. La recette a ete rejouee le meme jour. Elle rend zero
echec sur les trois environnements.

La duree du build a augmente de 40 secondes entre le lot 11 et le lot 12. La cause est identifiee :
le lot 12 ajoute 40 tests. Le cout par test reste stable, a 1,2 seconde. Aucune action n'est
demandee sur ce point.

Un contre-exemple utile, tire d'un ancien rapport, montre ce que la doctrine ecarte :

```markdown
En conclusion, il est important de noter que les experts s'accordent a dire que cette solution
revolutionnaire est absolument cruciale. De plus, elle est non seulement performante mais aussi
incontournable. N'hesitez pas a nous solliciter — j'espere que cela vous aidera.
```

Ce bloc est cite, pas ecrit. L'oracle ne le compte pas, et c'est le point : un texte qui montre une
tournure fautive ne la commet pas.

Trois suites sont prevues. La migration de la base est planifiee le 20 septembre. Le decommissionnement
de l'ancien service suit le 27 — la bascule est reversible pendant 8 jours. Le bilan de recette
sera depose le 30, avec les relevés bruts.

Les chiffres ci-dessus viennent du journal d'execution. Ils ont ete releves 2 fois, a 2 jours
d'intervalle. L'ecart entre les deux relevés est inferieur a 5 secondes sur chaque environnement.
La mesure est donc tenue pour stable. Le detail des commandes jouees vit dans le meme dossier que
ce journal, sous le nom des trois environnements.
