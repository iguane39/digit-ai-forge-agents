---
name: contre-expertise
description: Fournit une contre-expertise de fond d'un livrable fini — résultat, document, solution ou architecture proposée — pour challenger la pertinence, la robustesse et les alternatives (« est-ce la bonne solution ? ») via 3 angles fixes (conformité déléguée à quality-oracles, expertise routée via experts-forge, contradiction et alternatives sourcées), avec verdict Valider/Renforcer/Reprendre, constats à preuve typée, contradictions arbitrées et top 5 corrections impact×effort. Use when / déclencher sur invocation explicite uniquement : « contre-expertise de… », « challenge ce résultat / cette solution / cette proposition », « fais l'avocat du diable sur… », « seconde opinion sur… ». Jamais systématique ni proactif. Ne pas déclencher pour vérifier la conformité d'un livrable (→ quality-oracles), auditer une propale (→ digit-ai-propale-review), auditer un skill (→ ameliore-un-skill), analyser un prompt (→ prompt-analyzer-l99), ni annoter une réponse en cours de production (→ experts-forge).
# TF-0475 : une contre-expertise argumente, elle ne reecrit pas ce qu'elle challenge. Les
# outils d'ecriture sortent du pool pendant qu'elle est active (la restriction se leve au
# message suivant). Plus fort qu'un rappel en prose, et sans effet sur son analyse.
disallowed-tools: Write Edit NotebookEdit
metadata:
  version: 1.2.0
---

# contre-expertise — validation de fond d'un livrable fini

Dernière case du dispositif qualité de la forge : `quality-oracles` **vérifie**
(conformité exécutée), `experts-forge` **contribue** (pendant la production),
contre-expertise **valide** (le livrable fini est-il la bonne réponse au besoin ?).

## Loi fondatrice

> « Une contre-expertise qui ne changerait matériellement aucune décision n'est
> pas une contre-expertise — elle conclut alors *Valider en l'état*. »

Jamais de critique de remplissage : chaque constat doit pouvoir changer une
décision, sinon il est supprimé avant restitution.

## Entrées (avant toute analyse)

1. **L'objet** : fichier, texte ou description de la solution.
2. **Son type**, détecté puis confirmé : (a) résultat factuel/chiffré,
   (b) document/livrable, (c) solution ou architecture proposée.
3. **Le contexte d'enjeu** : destinataire, décision que le livrable doit servir.
   Absent → le demander en **une** question avant d'analyser, jamais supposer.

## Méthode — 3 angles fixes, en séquence, même contexte

- **A1 · Conformité (délégué)** : type couvert par le registre de
  `quality-oracles` → exécuter `run-oracles` et intégrer le verdict tel quel —
  jamais de re-jugement manuel d'un domaine outillé. Sinon : « angle conformité
  non outillé » en une ligne **et écrire l'entrée candidat dans la file**
  (`file-candidats.md` du repo forge ; côté claude.ai `/areas/forge-file-candidats.md`)
  — M2, D1, 23/07/2026 : un angle vide sur livrable client = scaffold obligatoire (N1).
- **A2 · Expertise de domaine (routé)** : router l'objet via
  `experts-forge/scripts/route-experts.mjs` (fiches en statut **ok** uniquement)
  et intégrer les annotations en sections identifiées. Aucune fiche applicable :
  le dire en une ligne **et écrire l'entrée candidat dans la file** (même règle
  M2/D1 — l'angle vide s'écrit, il ne s'évapore plus).
- **A3 · Contradiction et alternatives (cœur du skill)** : jouer le
  contradicteur — hypothèses fragiles, scénarios d'échec, **au moins 1
  alternative crédible comparée** (avantages / inconvénients / conditions de
  bascule), confrontation à l'état de l'art **sourcé**. Détail :
  [references/angle-contradiction.md](references/angle-contradiction.md).

`forge-agents` n'est **pas** invoqué par défaut : réservé au cas où l'utilisateur
demande une contre-expertise multi-agents d'un objet lourd — le skill le propose
alors comme option, sans l'imposer. Dans claude.ai : mode séquentiel dégradé
assumé, consigné dans la restitution.

## Régime de preuve (règle dure)

Chaque constat porte **exactement un** type de preuve : `[exécuté]` ·
`[source]` · `[standard]` · `[raisonnement]`. Interdits : « état de l'art »
sans source, chiffre de marché non cité, montant ou TJM inventé. Ce qui ne peut
être prouvé est marqué **« à vérifier »**. Définitions et critères
d'admissibilité : [references/regime-de-preuve.md](references/regime-de-preuve.md).

## Restitution (format fixe)

Dans la conversation ; fichier chartré Digit-AI seulement sur demande.

1. **Verdict** : Valider en l'état / Renforcer / Reprendre.
2. **Constats** tagués bloquant / majeur / mineur, chacun avec sa preuve typée.
3. **Contradictions arbitrées** : deux angles divergent → trancher avec le
   critère utilisé, jamais un « d'un côté / de l'autre » sans position.
4. **Top 5 corrections** priorisées impact × effort.
5. **Compléments** « pour aller plus loin » (hors corrections), 3 maximum.

Gabarit et règles d'arbitrage : [references/restitution.md](references/restitution.md).

**Bornes** : 1 passe, pas de boucle ; **≤ 7 constats majeurs+bloquants par
angle** — au-delà, agréger par classe de défaut (grille §1 de quality-oracles).

## Exemple d'invocation

```
User : « Contre-expertise de cette architecture : synchro Outlook↔Dropbox
        via export CSV quotidien déposé en SFTP. »
→ Type (c) confirmé, enjeu demandé → A1 : non outillé (1 ligne) →
  A2 : fiche interop-archi matchée, annotations intégrées →
  A3 : batch quotidien = perte des évènements intrajournaliers [raisonnement],
  alternative Graph API webhooks comparée [source], verdict : Reprendre.
```

## Frontières

- `quality-oracles` : consommé en A1 — jamais concurrencé sur la conformité.
- `experts-forge` : consommé en A2 — fiches ok uniquement, jamais réécrites.
- `digit-ai-propale-review`, `ameliore-un-skill`, `prompt-analyzer-l99` : un
  objet de leur type leur est **renvoyé** (audits spécialisés priment).
- `la-boucle` : la contre-expertise est 1 passe ; itérer sur les corrections
  relève de la-boucle, hors de ce skill.

Fixtures de déclenchement (2 négatives) et fixture de valeur A/B :
[fixtures/fixtures-declenchement.md](fixtures/fixtures-declenchement.md) ·
[fixtures/fixture-ab-materialite.md](fixtures/fixture-ab-materialite.md).
