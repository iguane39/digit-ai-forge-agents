# La recette

Tout se joue depuis `scripts/`, hors de tout dépôt pour ce qui écrit. `<racine>` vit sous un dossier temporaire.

| Quoi | Commande | Modèle | Word |
|---|---|---|---|
| Cas `--simuler`, bilan, oracle, serveur, structure | `node self-test.mjs` | non | non |
| Au plus 3 tours réels par fixture, capture HTML lue | `node recette-reelle.mjs formats --racine <racine>` | oui | non |
| `CLAUDE.md` piégé, lecture et écriture hors du dossier | `node recette-reelle.mjs isolation --racine <racine>` | oui, 2 tours | non |
| Export réel, processus laissés, Word figé à 120 secondes, Word du porteur | `node recette-word.mjs --racine <racine>` | non | oui |
| Parcours du porteur dans Chromium | `python recette-navigateur.py --racine <racine>` | non | oui |

`recette-navigateur.py` demande Playwright et Chromium, `fabriquer-fixtures.py` demande reportlab ; ni l'un ni l'autre ne sert aux commandes du skill. Avant un tour réel, relis `utilization` : aucun ne se lance à 0,80 ou plus. Un arrêt par 2 « rien » de suite est un résultat admis : il se note, sans relance ni consigne forcée.

`node lancer.mjs --simuler <cas>` joue un cas seul ; `scripts/lib/cas-simules.mjs` les liste, chacun avec son verdict attendu. Le simulateur remplace le modèle et rien d'autre : le lancement du processus, la mise à mort au délai et tout le contrôle sont les vrais. Le délai de 15 minutes y est ramené à 1,5 seconde ; seul ce chiffre diffère.

La page se juge après sa dernière écriture, chaque oracle attendu en exit 0 :

```bash
python ~/.claude/skills/digit-ai-page-html/scripts/check_html.py assets/page-versions.html
python ~/.claude/skills/digit-ai-page-html/scripts/render_page.py http://127.0.0.1:4750/
node $FORGE_ROOT/digit-ai-forge-design/oracles/run-oracles-design.mjs assets/page-versions.html
```
