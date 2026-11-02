---
name: make-it-better
description: >
  Fait améliorer un document (Markdown, HTML, Word, PowerPoint, PDF) par Claude Code, tour après tour, chaque tour en
  session neuve dans l'abonnement, sans API. Juge chaque version sans modèle (note, plafond de mots, faits
  absents de l'origine et des sources), les garde dans leur format, les montre sur une page locale avec
  comparaison et revue à l'aveugle, et conclut par un verdict fixé d'avance. Use when / déclencher sur
  « make it better », « itère ce document N fois », ou pour vérifier si l'itération longue rapporte quelque
  chose face à une seule passe. Ne pas déclencher pour une convergence courte vers un arbitre (→ la-boucle),
  une maquette ou une critique graphique (→ ameliore-le-design, critique-le-design), ni pour juger un
  livrable fini (→ quality-oracles).
metadata:
  version: "1.2.0"
---

# make-it-better — le test de l'itération longue

Le modèle ne juge jamais ses versions : la pertinence est un jugement du porteur, rendu à l'aveugle. Opus par défaut ; Sonnet seulement à sa demande, pour comparer sur le même document et le même brief.

## Démarrage rapide

1. Écris le cadre avant le premier tour. Sans lui, le lancement est refusé.

   ```text
   <espace>/document/brief.md      Lecteur, Objectif, Plafond de mots, Référence
   <espace>/document/sources/      les faits que le modèle a le droit d'écrire
   <espace>/document/reference/    1 référence extérieure, rangée en local
   ```

2. Lance, hors de tout dépôt, avec `C:\dev\_essais-make-it-better\<AAAAMMJJ>-<nom court>\` pour espace :

   ```bash
   node scripts/lancer.mjs --document note.docx --espace <espace> --tours 50
   ```

3. Regarde, puis conclus :

   ```bash
   node scripts/serveur-versions.mjs --espace <espace>
   node scripts/bilan.mjs --espace <dossier des espaces>
   ```

## Commandes

Trois commandes suffisent : jouer les tours, regarder les versions, conclure.

| Commande | Options | Rôle |
|---|---|---|
| `lancer.mjs` | `--document`, `--espace`, `--tours 50`, `--modele opus`, `--effort medium`, `--essai <n>`, `--reprendre`, `--simuler <cas>` | Joue les tours et juge chaque version |
| `serveur-versions.mjs` | `--espace`, `--port 4750` | La page, sur 127.0.0.1 seulement |
| `bilan.mjs` | `--espace`, `--restants <n>` | `bilan.md`, ou le besoin de quota du test |

Un espace porte un document ; `serveur-versions.mjs` et `bilan.mjs` acceptent aussi le dossier parent de plusieurs espaces. `--essai` vaut par défaut le numéro suivant pour ce modèle ; `--reprendre` porte sur l'essai nommé, à défaut le dernier. Exit de `lancer.mjs` : 0 arrêt normal, 2 refus, 3 pause de quota, 4 arrêt d'identité ou de modèle.

## Ce que le lanceur garantit

- **Pas d'API.** `apiKeySource` différent de `none`, `isUsingOverage` vrai ou un modèle servi inattendu arrêtent tout, tour non compté.
- **Un tour isolé.** Session neuve, dossier temporaire hors de l'espace et de tout dépôt, sans `CLAUDE.md`, sans `classement.json`.
- **Une version jugée sans modèle.** `note.json` valide, document inchangé si et seulement si le type vaut `rien`, plafond tenu, `scripts/oracle-faits-sources.mjs` vert. Word : `oracle-docx`. PowerPoint : `oracle-pptx`, XML bien formé, formes inchangées, 10 % de caractères au plus par forme. PDF : `modifs.json` applicable.
- **Un arrêt fixé d'avance.** 2 « rien » de suite, la borne, 3 rejets de suite. Pause à `utilization` 0,80, statut non autorisé ou 3 tours sans mesure.
- **Une reprise sans perte.** Un tour coupé se rejoue sans compter de rejet, un tour fini ne se refait pas.

Détail, disposition de l'espace et champs : [references/espace-et-tours.md](references/espace-et-tours.md). Protocole du test et verdict : [references/test-et-bilan.md](references/test-et-bilan.md). Page, aveugle, Word et PowerPoint : [references/page-de-versions.md](references/page-de-versions.md).

## Dépendances

Node seul pour les commandes. Python pour `formats.py` : `pip install pypdfium2 pillow`, et `pymupdf` pour modifier un PDF. `pymupdf`, en AGPL, reste une dépendance du poste, appelée en processus séparé, jamais copiée ici. Word en automation pour l'aperçu d'un `.docx`, PowerPoint et le skill `digit-ai-pptx` pour celui d'un `.pptx` ; sans eux, l'aperçu passe au texte extrait et le dit. Un `.pptx` exige aussi `oracle-pptx.mjs` et `profils/generique.json` de `quality-oracles`.

## Vérifier le skill

```bash
node scripts/self-test.mjs
python scripts/fabriquer-fixtures.py --ecrire
```

Sans modèle : tous les cas de `--simuler`, le bilan, l'oracle, le serveur. Les tours réels, Word, PowerPoint et le navigateur se rejouent à part : `references/recette.md`.

## Limites

- Ce que l'oracle ne voit pas, dont une paraphrase fausse sans chiffre ni nom : `non_juge` de `oracle-faits-sources.mjs`.
- L'aveugle reste partiel : le porteur peut reconnaître l'origine ou une longueur inhabituelle, et le bilan le dit.
- Un PDF n'accepte ni nouveau paragraphe, ni remise en page : seulement des lignes remplacées ou retirées.
- Le seuil de 10 % d'un deck (`GAIN_MAX_FORME_PCT`) ne mesure pas un débordement réel : il ne lit ni la taille de la forme ni la police, ne couvre ni les tableaux ni les images, et refuse un titre court qui gagne un mot. Seul l'aperçu montre qu'un texte tient.
- Le texte d'un graphique, d'un SmartArt ou d'une image de deck n'est pas lu : un fait qui ne vit que là passe pour neuf.
- `oracle-pptx` ne convertit le deck que si LibreOffice est présent. Sinon, `controle.json` et `etat.json` portent ce non-jugé.
- La navigation d'une page HTML dans son propre cadre : la CSP bloque le réseau au chargement, pas un lien suivi par la page elle-même.

## Frontière

Convergence courte → `la-boucle` · maquette et critique graphique → `ameliore-le-design`, `critique-le-design` · juger un livrable fini → `quality-oracles` · remplir un PDF → `digit-ai-pdf` · générer un Word → `digit-ai-docx`.
