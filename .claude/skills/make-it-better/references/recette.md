# La recette

Tout se joue depuis `scripts/`, hors de tout dépôt pour ce qui écrit. `<racine>` vit sous un dossier temporaire.

| Quoi | Commande | Modèle | Office |
|---|---|---|---|
| Cas `--simuler`, bilan, oracle, serveur, structure | `node self-test.mjs` | non | non |
| Au plus 3 tours réels par fixture, capture HTML lue | `node recette-reelle.mjs formats --racine <racine>`, `--format pptx` pour un seul | oui | non |
| `CLAUDE.md` piégé, lecture et écriture hors du dossier | `node recette-reelle.mjs isolation --racine <racine>` | oui, 2 tours | non |
| Export réel, processus laissés, Word figé à 120 secondes, Word du porteur | `node recette-word.mjs --racine <racine>` | non | Word |
| Export réel, repli, PowerPoint du porteur intact | `node recette-powerpoint.mjs --racine <racine>` | non | PowerPoint |
| Parcours du porteur dans Chromium, comparaison d'un deck si la racine porte un espace `note-pptx` | `python recette-navigateur.py --racine <racine>` | non | Word, PowerPoint |

`recette-powerpoint.mjs` ne ferme jamais un PowerPoint qu'elle n'a pas ouvert. Si un PowerPoint tourne déjà, elle n'y ouvre rien, relit son numéro, sa date et son titre après chaque export, et ne joue pas le cas de l'instance lancée puis quittée, qu'elle annonce alors. Un deck réel s'éprouve sans modèle sur une copie hors de tout dépôt : `node lancer.mjs --document <copie> --espace <espace> --simuler normal`.

`recette-navigateur.py` demande Playwright et Chromium, `fabriquer-fixtures.py` demande reportlab pour le seul PDF ; ni l'un ni l'autre ne sert aux commandes du skill. La fixture `.pptx` s'écrit à la bibliothèque standard, car `python-pptx` n'est pas requis. Avant un tour réel, relis `utilization` : aucun ne se lance à 0,80 ou plus. Un arrêt par 2 « rien » de suite est un résultat admis : il se note, sans relance ni consigne forcée.

`node lancer.mjs --simuler <cas>` joue un cas seul ; `scripts/lib/cas-simules.mjs` les liste, chacun avec son verdict attendu. Le simulateur remplace le modèle et rien d'autre : le lancement du processus, la mise à mort au délai et tout le contrôle sont les vrais. Le délai de 15 minutes y est ramené à 1,5 seconde ; seul ce chiffre diffère.

La page se juge après sa dernière écriture, chaque oracle attendu en exit 0 :

```bash
python ~/.claude/skills/digit-ai-page-html/scripts/check_html.py assets/page-versions.html
python ~/.claude/skills/digit-ai-page-html/scripts/render_page.py http://127.0.0.1:4750/
node $FORGE_ROOT/digit-ai-forge-design/oracles/run-oracles-design.mjs assets/page-versions.html
```
