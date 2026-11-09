---
name: tri-de-sujets
description: >
  Trie une liste de sujets (page enregistrée, liste de liens, fichier texte, JSONL) pour dire lesquels
  méritent une étude d'opportunité : normalise la liste, retire le déjà analysé, calcule score et
  verdict à partir des notes du modèle, rend un tableau et le fait juger par un oracle. Use when /
  déclencher dès que l'utilisateur veut savoir si des sujets, des vidéos, des favoris ou une veille
  justifient une étude d'opportunité, ou demande un tableau de pertinence sur une liste. Ne pas
  déclencher pour analyser une seule proposition (→ `veille/MODE-VEILLE.md` du pilot), écrire l'étude
  elle-même (→ `gabarits/ETUDE-OPPORTUNITE.md`), qualifier un entrant de produit (→ qualifie-l-entrant)
  ni analyser un prompt (→ prompt-analyzer-l99).
metadata:
  version: "1.1.1"
---

# Tri de sujets — décider où une étude changera une décision

Né de l'étude du 02/11/2026 (pilot, `output/03-etudes/Digit-AI - Étude - Skill de tri de sujets - 20261102c.md`). Les scripts ne notent jamais : le modèle note, le script somme et applique la règle, l'oracle recalcule.

## Démarrage rapide

```bash
node scripts/tri.mjs normaliser liste.html > entrees.json
node scripts/tri.mjs soustraire entrees.json --deja ancien-tri.md --reprendre "légende trop vague" > reste.json
node scripts/tri.mjs verdict lignes.json > lignes-jugees.json
node scripts/tri.mjs tableau rangement.json --motif entier
node ../quality-oracles/scripts/oracle-tri-de-sujets.mjs livrable.md --rangement rangement.json
```

## Déroulé

1. **Normaliser.** Le script dédoublonne et retire toute requête d'adresse, donc les signatures de session. Une page de favoris compte à part ses liens hors liste : ce sont d'autres panneaux, jamais des sujets.
2. **Soustraire.** `--deja` lit un rangement JSON ou un tri Markdown. Un contenu rangé sans être qualifié revient.
3. **Lire chaque sujet**, dans cet ordre : texte de la liste, image jointe, source primaire nommée, fichier fourni par le demandeur. Tout téléchargement depuis une plateforme dépend de ses conditions et d'une réponse humaine écrite. La voie se note à l'entrée.
4. **Ranger.** Chaque entrée reçoit un seul état : `retenu`, `hors filtre` ou `non qualifié`. Le filtre vient de la demande.
5. **Chercher l'existant** avant de noter : études, registre, veille, skills installés. Un sujet couvert, sans fait neuf, porte `deja_couvert: true` et cite l'existant.
6. **Noter et décider.** Le modèle donne `notes_chiffres` et, s'il y a lieu, `seuil`, `question`, `mesure`, `ecarte`. `verdict` rend la somme et le verdict.
7. **Rendre et juger.** `tableau`, puis l'oracle. Tout chiffre repris d'une vidéo ou d'une source non primaire s'écrit « selon l'auteur ».

## La règle de verdict

La première condition vraie l'emporte.

| Verdict | Condition |
|---|---|
| À écarter | `ecarte` : viole les conditions d'un tiers ou une règle |
| Sans suite | `deja_couvert`, ou score sous 14 |
| Étude poussée | Seuil tenu et `question` nommée |
| Essai court | Coût inverse de 4 ou 5 et `mesure` nommée |
| Décision directe | Tous les autres cas |

Score : `2G + N + P + C`, chaque note de 1 à 5 (gain, nouveauté, preuve, coût inverse). Le minimum de 14 vient d'un back-test sur 14 études, 7 accords sur 14 : c'est un réglage provisoire, à remesurer. Un « Sans suite » veut dire « rien ne presse ». Le seuil est celui de `gabarits/ETUDE-OPPORTUNITE.md` : `objet-durable`, `forges=a,b,c` (au moins 3, ou `noyau`), `gain-preuve` (gain d'au moins 3, preuve d'au plus 2), ou `non`.

## Le fichier de rangement

Il reste hors de tout dépôt public quand la liste dit quelque chose du demandeur. Forme et exemple : [references/rangement.md](references/rangement.md).

## Vérifier le skill

```bash
node scripts/self-test.mjs
```
