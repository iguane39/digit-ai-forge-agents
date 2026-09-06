# Contrat de SORTIE du lanceur d'oracles (`run-oracles.mjs`)

> **Version du contrat : 1.2.0** — état du 2026-09-05, documenté le 2026-09-06 (TF-0824).
> **Source de vérité** de ce que `scripts/run-oracles.mjs` **rend** à son appelant. Le contrat
> d'ENTRÉE — ce qu'un oracle CLI doit émettre pour être lu, `{oracle, domaine, artefact, verdict,
> findings[], non_juge[]}`, exit 0/1/2 — vit dans `SKILL.md` (section « Outillage », puce
> « Oracles CLI ») et n'est pas l'objet de ce document.
> Éprouvé par `scripts/self-test.mjs` (cas TF-0824 : forme documentée confrontée à la ligne
> réellement rendue).

## Pourquoi ce document existe

Le champ `detail` de chaque ligne rendue a changé deux fois en dix jours sans qu'aucun document
ne dise ce qu'il contient. Le lanceur est hérité par toutes les forges et par tous les produits,
et le hook d'écriture `qo-gate-write.mjs` identifie un constat **par la ligne ainsi construite** :
un lecteur qui compare deux sorties n'avait rien à lire, et la prochaine forge qui parse la
sortie se serait cassée sans préavis. Ce document est le domicile de cette forme, et la version
en tête est ce qu'un lecteur surveille.

## Vocabulaire employé ici

Trois termes reviennent, et ils ne se recouvrent pas.

- **Ligne de résultat** — une ligne de la sortie texte, produite pour **un couple (oracle,
  fichier)** effectivement joué. Ce n'est pas une ligne par fichier ni une ligne par oracle.
- **`detail`** — le champ porté par une ligne de résultat après le tiret cadratin, et la clé du
  même nom dans le journal JSON. C'est le champ qui a changé deux fois.
- **Marque** — le caractère qui ouvre une ligne de résultat et porte le verdict de cette
  ligne : `✅`, `❌` ou `➖`.

## 1. Sortie texte (mode par défaut)

Le lanceur écrit sur la sortie standard un bloc de sept parties, dans cet ordre fixe. Les parties
3 et 4 peuvent être vides ; les cinq autres sont toujours présentes.

1. **Filet d'ouverture** — une ligne de soixante-dix caractères `─`.
2. **Titre** — `Oracles qualité — <cible>  [profil : <profil> · niveau : <niveau>]`, suivi d'un
   second filet identique.
3. **Lignes de résultat** — une par couple (oracle, fichier) joué, forme détaillée en §2.
4. **Lignes d'exemption** — une par exemption active, forme détaillée en §3.
5. **Bloc de couverture** — présent seulement s'il existe des domaines hors oracle CLI, ouvert par
   `  Couverture — domaines à vérifier hors oracle CLI (action) :` puis une ligne
   `   • [<domaine>] <hint>` par action, suffixée ` (oracle à outiller)` quand son statut est
   `todo`.
6. **Ligne de bilan** — `  Bilan fichiers (<n>) : jugé=<a> · exempté=<b> · délégué=<c> ·
   signalé=<d>`, suffixée `  ⚠ BILAN INCOMPLET — silence détecté` quand la somme ne fait pas `<n>`,
   puis ` · cache=<k>` quand au moins une réponse vient du cache.
7. **Ligne de verdict**, puis **ligne de journal** `Journal : <chemin>`.

## 2. La ligne de résultat, caractère par caractère

C'est la ligne que le hook d'écriture lit et que ce contrat verrouille. Elle se compose de deux
espaces, de la marque, du domaine entre crochets, du chemin relatif du fichier, et — seulement si
`detail` est non vide — d'un tiret cadratin entouré d'espaces suivi de `detail`.

```
  ✅ [<domaine>] <fichier>
  ❌ [<domaine>] <fichier> — <detail>
  ➖ [<domaine>] <fichier>
```

- La **marque** vaut `✅` pour un verdict `PASS`, `❌` pour un `FAIL`, `➖` pour tout autre cas
  (`SKIP`).
- Le **domaine** est le libellé du registre, recopié tel quel entre crochets.
- Le **fichier** est le chemin relatif à la cible, dans la séparation de chemins de l'hôte.
- Le segment ` — <detail>` est **omis en entier** quand `detail` est la chaîne vide.

### 2.1 Le champ `detail` quand l'oracle a rendu des raisons

Dès que l'oracle rend au moins une raison, `detail` prend la forme suivante — et cette forme
vaut **quel que soit le verdict** : un `PASS` qui porte une raison porte le même en-tête.

```
<n> constat(s) · <raison 1> ; <raison 2>
```

- `<n>` est le nombre **total** de raisons rendues par l'oracle, pas le nombre de raisons
  affichées. C'est l'objet du changement du 2026-09-05 : la ligne annonce ce qu'elle tronque.
- Les raisons sont lues dans `findings[]` en priorité, sinon dans `fails[]` ; une raison est soit
  une chaîne, soit un objet dont on prend `msg`, sinon `message`. C'est l'objet du changement du
  2026-08-26.
- **Deux raisons au plus** sont écrites, dans l'ordre rendu par l'oracle, séparées par ` ; `. La
  troncature est délibérée : une ligne de verdict n'est pas un rapport, et le rapport complet
  vit dans le journal JSON (§5).
- Le séparateur entre l'en-tête et la première raison est ` · ` (espace, point médian, espace).

### 2.2 Le champ `detail` quand l'oracle n'a rendu aucune raison

Quatre replis existent, et un seul s'applique à la fois. Ils s'écrivent tels quels, **sans**
en-tête de compte, puisqu'il n'y a rien à compter.

| Situation | `detail` rendu |
|---|---|
| Sortie non parsable en JSON, code de retour 0 | `contrat JSON non émis — verdict non retenu (P5/R1)` |
| Oracle tué par son `timeout_ms` | `timeout oracle (<ms> ms)` |
| Oracle non lançable (pas de code de retour) | `oracle non exécutable` |
| Aucun des trois, et verdict `PASS` ou `SKIP` | chaîne vide — le segment ` — <detail>` disparaît |

Un cinquième cas est un **garde-fou**, et il ne se tait jamais : un verdict `FAIL` qui arriverait
ici avec un `detail` vide se voit substituer un message qui dit l'absence de raison et donne la
commande à rejouer, sous la forme `l'oracle a ECHOUE et n'a pas su expliquer pourquoi — aucun
`findings[]` ni `fails[]` dans sa sortie JSON. Rejouer a la main pour voir ses constats :
<commande>`. Un échec muet a l'air d'un verdict alors qu'il est une panne de transmission.

### 2.3 Les trois enrichissements de `detail`

Trois mécanismes du lanceur écrivent par-dessus la forme de §2.1, et ils sont cumulables avec
elle. Ils se reconnaissent à leur position.

1. **Réponse servie par le cache** — `(cache)` est ajouté **en fin** de `detail`, précédé d'une
   espace lorsque `detail` n'était pas vide, et seul lorsqu'il l'était. Ne concerne que les
   verdicts `PASS` : un `FAIL` n'est jamais mis en cache.
2. **Avertissements promus en échec** (niveau `production`) — `detail` est **préfixé** de
   `<n> avertissement(s) promu(s) en échec (niveau <niveau>) — `, et le verdict passe à `FAIL`.
3. **Lignes fabriquées par le lanceur lui-même**, sans appel d'oracle : le type réel démenti par
   l'extension rend `type réel <type> ≠ extension déclarée <ext> (magic bytes)` ; une exemption
   périmée rend `exemption EXPIRÉE le <date> (<justification>) — re-vérifier ou renouveler`. Les
   deux portent le verdict `FAIL` et aucun en-tête de compte.

### 2.4 Forme opposable, lue par la recette

La recette `scripts/self-test.mjs` lit **ce bloc-ci** — pas une copie — et confronte l'expression
qu'il porte à la ligne réellement rendue par le lanceur sur une fixture. Modifier la forme sans
modifier ce bloc fait rougir la recette ; modifier ce bloc sans modifier la forme aussi.

```
ligne-fail = ^ {2}❌ \[[^\]]+\] .+ — \d+ constat\(s\) · .+$
```

## 3. Les lignes d'exemption

Une exemption active ne produit pas une ligne de résultat mais une ligne à elle, ouverte par une
marque distincte pour qu'aucun lecteur ne la compte comme un verdict.

```
  🔶 [<domaine>] <fichier> — EXEMPTÉ : <justification> (échéance <expire>)
```

Une exemption **dont l'échéance est passée** ne s'écrit pas ici : elle devient une ligne de
résultat `FAIL` (§2.3, cas 3).

## 4. La ligne de verdict et le code de sortie

La dernière ligne avant celle du journal porte le verdict global, et le code de sortie en est la
traduction machine. Les quatre verdicts et leurs codes se lisent ensemble.

| Verdict | Ligne rendue (début) | Code de sortie |
|---|---|---|
| `PASS` | `✅ CONFORME` — suffixé ` (couverture partielle)` s'il reste des actions | 0 |
| `FAIL` | `❌ NON CONFORME — <n> oracle(s) en échec` | 1 |
| `PERIME` | `❌ PERIME — <n> fichier(s) modifie(s) PENDANT le run` | 1 |
| `INCONCLUSIF` | `⚠️ INCONCLUSIF — aucun oracle n'a réellement jugé` | 2 |

Quatre refus d'usage sortent **avant** tout jugement, écrivent leur motif sur la sortie d'erreur
et rendent également le code 2 : cible absente du tout ou introuvable sur le disque, profil
introuvable, niveau d'exigence inconnu, et profil excluant un domaine du plancher non
désactivable. Un code 2 se lit donc « personne n'a jugé », jamais « rien à signaler ».

## 5. Mode `--json`

Avec `--json`, rien de ce qui précède n'est écrit : la sortie standard porte le **journal**
complet, en un seul objet JSON, et le code de sortie est celui de §4. Le journal est le même
objet que celui écrit dans `<cible>.oracles.json`. Ses clés de premier rang sont `cible`,
`date_iso`, `registre_version`, `profil`, `niveau`, `verdict`, `resume`, `bilan_fichiers`,
`bilan_complet`, `exemptions_actives`, `resultats`, `actions_couverture`, `empreinte`,
`empreinte_motif` et `verdict_oracles`.

Chaque entrée de `resultats[]` porte `{domaine, file, verdict, detail}` : c'est la **source** de
la ligne de §2, et `detail` y est **identique au caractère près** à ce qui est rendu après le
tiret cadratin. Un lecteur machine lit `resultats[].detail` ; il n'a jamais à parser la ligne
texte.

## 6. Mode `--verifier-empreinte`

Ce mode ne rejoue aucun oracle : il confronte l'empreinte scellée au journal au contenu présent,
et rend **une seule ligne**.

```
<marque> <ETAT> — <message>
```

`ETAT` vaut `FRAIS` (marque `✅`, code 0), `PERIME` (marque `❌`, code 1) ou `NON JUGEABLE`
(marque `➖`, code 2). Avec `--json`, la ligne est remplacée par un objet
`{oracle, cible, etat, verdict, message, fichiers_modifies}`, où `verdict` traduit `etat` en
`PASS` / `FAIL` / `SKIP`.

## 7. Version du contrat et historique

La version en tête de ce document est celle du **contrat**, pas du document. Elle s'incrémente à
chaque changement de ce que le lanceur rend, et la règle est fixe : **tout changement de forme
incrémente la version, met à jour la ligne du tableau ci-dessous et se déclare au registre du
pilot par un lot de retours.** Un changement livré sans version est le défaut que ce document
existe pour empêcher.

Les deux versions antérieures sont datées de leur changement réel ; elles n'ont jamais été
écrites à l'époque et portent ici la version qu'elles **auraient** portée.

| Version | Date | Item | Ce qui a changé dans la sortie |
|---|---|---|---|
| 1.0.0 | avant le 2026-08-26 | — | `detail` = les deux premiers `findings[].msg`, joints par ` ; `, sans en-tête. Un oracle émettant `fails[]` rendait un `detail` vide, et un `FAIL` pouvait donc être muet. |
| 1.1.0 | 2026-08-26 | TF-0659 | Les raisons se lisent aussi dans `fails[]`, et une raison peut être une chaîne, un `msg` ou un `message`. Le garde-fou de §2.2 apparaît : un `FAIL` sans raison le dit et donne la commande à rejouer. Aucune ligne existante ne change de forme — ajout de sources et d'un repli. |
| 1.2.0 | 2026-09-05 | TF-0815 | `detail` est préfixé de `<n> constat(s) · ` dès qu'une raison existe. **Rupture assumée** pour tout lecteur qui comparait `detail` mot pour mot : deux versions d'un même fichier portant deux puis trois constats du même oracle rendaient jusque-là une ligne identique, et le hook d'écriture concluait « 0 neuf » sur du travail neuf. |

## 8. Ce que ce contrat ne couvre pas

Trois surfaces voisines existent et se lisent ailleurs, pour qu'aucun lecteur ne les cherche ici.

- Le **contrat d'entrée** des oracles CLI — ce que l'oracle appelé doit émettre — vit dans
  `SKILL.md`, section « Outillage ».
- Le **fichier d'historique** `<cible>.oracles-historique.jsonl`, une ligne JSON par run, dont les
  clés diffèrent de celles du journal : il porte `fails[]` sous la forme `<domaine>:<fichier>` et
  ne porte aucun `detail`.
- Le **format d'empreinte** `forge-ops/empreinte@1`, décrit dans `SKILL.md`, qui a sa propre
  version et son propre propriétaire.
