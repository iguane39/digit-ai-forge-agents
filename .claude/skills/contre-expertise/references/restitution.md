# Restitution — gabarit fixe et arbitrage

## Gabarit

```
## Contre-expertise — <objet> (<type a/b/c>, enjeu : <décision servie>)

Verdict : Valider en l'état | Renforcer | Reprendre
<1-2 phrases : la raison dominante du verdict>

### Constats
| # | Angle | Constat | Sévérité | Preuve |
|---|---|---|---|---|
| C1 | A3 | … | bloquant | [source] <référence> |

### Contradictions arbitrées
<pour chaque divergence inter-angles : position tranchée + critère utilisé>
<aucune divergence : « aucune contradiction entre angles » en une ligne>

### Top 5 corrections (impact × effort)
1. <correction> — corrige C<n> — impact <fort/moyen> / effort <faible/moyen/fort>

### Pour aller plus loin (≤ 3)
- <complément hors corrections>

### À vérifier
- <affirmation> — qui tranche : <acteur> — comment : <question/document/test>
```

## Règles de verdict

- **Valider en l'état** : aucun constat bloquant ni majeur qui changerait la
  décision servie. C'est un verdict **légitime et attendu** quand le livrable
  tient — la loi fondatrice l'exige (pas de critique de remplissage).
- **Renforcer** : des majeurs corrigeables sans remettre en cause l'approche.
- **Reprendre** : au moins un bloquant sur l'approche elle-même (mauvaise
  solution, hypothèse centrale fausse, alternative clairement supérieure).
- Un constat `[raisonnement]` seul ne suffit **jamais** à un verdict Reprendre :
  il faut au moins une preuve `[exécuté]`, `[source]` ou `[standard]` sur le
  point bloquant, sinon le verdict plafonne à Renforcer avec « à vérifier ».

## Arbitrage des contradictions

Deux angles divergent (ex. A1 conforme mais A3 démontre l'inadéquation au
besoin ; A2 recommande X, A3 démontre la fragilité de X) :

1. Nommer la divergence en une phrase.
2. Trancher selon, dans l'ordre : hiérarchie des preuves
   (regime-de-preuve.md) → proximité avec la **décision servie** (l'enjeu
   confirmé en entrée prime sur la conformité générique) → réversibilité
   (à preuves égales, privilégier l'option la plus réversible).
3. Écrire le critère retenu à côté de la position — jamais de position sans
   critère, jamais de critère inventé après coup.

## Interdits de restitution

- Restituer les 3 angles comme 3 rapports juxtaposés sans synthèse.
- Dépasser 7 constats majeurs+bloquants par angle sans agréger par classe.
- Émettre le verdict avant le tableau de constats (le verdict se lit en tête
  mais se **déduit** des constats — le rédiger en dernier).
- Produire un fichier sans demande explicite ; le format conversationnel est
  le défaut.
