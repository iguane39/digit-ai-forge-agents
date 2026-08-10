---
name: write-an-oracle
description: Génère (generate/scaffold) en une commande un oracle de qualité conforme au standard §3 de quality-oracles — squelette CLI au contrat JSON commun (verdict PASS/FAIL/SKIP, findings localisants, non_juge obligatoire, exit 0/1/2), paire de fixtures rouge/verte probante d'office, entrée de registre et entrée de manifest — puis guide son durcissement jusqu'au statut « ok ». Rend la règle §4 (« domaine sans oracle → définir + remonter un oracle ») mécanique : couvrir un domaine nouveau prend moins de 15 minutes au lieu d'une réécriture de zéro. Use when l'utilisateur veut créer, scaffolder ou ajouter un oracle de qualité, couvrir un nouveau domaine de défaut au registre de quality-oracles, outiller un contrôle signalé « oracle à outiller / règle §4 » par run-oracles, ou industrialiser un contrôle manuel récurrent. Ne pas déclencher pour exécuter les oracles existants ni auditer un livrable (→ quality-oracles), ni pour créer un skill complet (→ write-a-skill).
metadata:
  version: "1.0.1"
---

# write-an-oracle — générateur d'oracles de qualité

Compagnon de `quality-oracles` (même relation que `write-a-skill` ↔ skills) : il fabrique des
**mesureurs**, pas des livrables. Un oracle produit par ce skill respecte d'office le standard §3
de la loi qualité et la porte P1 (« un oracle qui ne sait pas échouer n'est pas un oracle »).

## Quand l'utiliser
- `run-oracles.mjs` a signalé « extension(s) sans oracle au registre — règle §4 ».
- Un domaine de la grille des classes de défaut est en statut `manuel` ou `todo`.
- Un contrôle manuel revient à chaque livraison → il doit être outillé (§2 : la revue est un repli).

## Commande

```bash
node scripts/scaffold-oracle.mjs --nom mon-domaine --domaine "Libellé du domaine" \
  --ext ".md,.html" --skilldir ~/.claude/skills/quality-oracles
```

Produit, en une commande, dans le skill `quality-oracles` visé :
1. `scripts/oracle-<nom>.mjs` — squelette CLI : contrat JSON commun pré-câblé, exit 0/1/2,
   `non_juge` obligatoire, sortie localisante `fichier:ligne`, et un **contrôle-marqueur**
   (le mot `DEFAUT` = échec) à remplacer par les vrais contrôles du domaine.
2. `fixtures/<nom>-red.*` (contient `DEFAUT` → FAIL d'office) et `fixtures/<nom>-green.*`
   (PASS d'office) — la porte fixtures du self-test reste verte de bout en bout.
3. L'entrée de **registre** (`quality-oracles/references/registre-oracles.json`, statut `partiel`)
   et l'entrée de **manifest** (`quality-oracles/fixtures/manifest.json`) — sauvegardes `.bak`
   des deux fichiers modifiés.

Refus sûrs : oracle déjà existant, domaine déjà au registre, skilldir sans registre → exit 2,
aucune modification partielle.

## Après le scaffold — durcissement (l'essentiel du travail)
1. Remplacer le contrôle-marqueur par les **vrais contrôles** du domaine : déterministes,
   adossés aux outils faisant foi quand ils existent (compilateur, validateur, linter — pas de
   réimplémentation maison, règle R3), findings localisants, tolérances explicites.
2. Remplacer les fixtures placeholder par un **vrai cas rouge** (défaut réaliste du domaine) et
   un **vrai cas vert** — c'est la preuve que l'oracle juge, pas qu'il compile.
3. Déclarer honnêtement `non_juge` : ce que l'oracle ne couvre pas reste dit, jamais tu.
4. Relancer `node quality-oracles/scripts/self-test.mjs` : doit rester **PASS**
   (compilation + fixtures rejouées). Un échec ici est une information, pas un obstacle.
5. Passer le `statut` de l'entrée registre à `ok`, reporter la ligne dans
   `quality-oracles/references/registre-oracles.md`, et si l'oracle est paramétrable, sortir ses
   seuils vers `quality-oracles/profils/*.json` (placeholder `{profil}` dans la commande du registre).

## Règles héritées de la loi (non négociables)
- **Extériorité (R1)** : l'oracle mesure l'artefact réel, jamais l'intention de son auteur.
- **Fixtures probantes (P1)** : rouge → FAIL, verte → PASS ; `FAIL|SKIP` toléré uniquement si
  l'oracle dépend d'un outil externe, avec la raison du SKIP dans la sortie.
- **Honnêteté (§5)** : pas de PASS sans contrat JSON émis ; ce qui n'est pas jugé est déclaré.
- **Un domaine = un oracle** : pas de fourre-tout ; si deux classes de défaut se croisent,
  deux oracles (ou une délégation explicite, comme calculs ↔ claims).
