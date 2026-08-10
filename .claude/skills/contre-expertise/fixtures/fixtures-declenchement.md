# Fixtures de déclenchement — 5 cas (2 négatifs)

Rejouables à la main ou par un juge : pour chaque entrée utilisateur, le
comportement attendu est binaire (déclenche / ne déclenche pas + routage).

| # | Entrée utilisateur | Attendu | Raison |
|---|---|---|---|
| D1 | « Contre-expertise de cette architecture de synchro Outlook↔Dropbox » | **Déclenche** (type c) | Invocation explicite, objet = solution proposée |
| D2 | « Fais l'avocat du diable sur ce plan de migration » | **Déclenche** (type b/c, confirmer) | Déclencheur explicite du vocabulaire du skill |
| D3 | « Challenge ce chiffrage de gains : 34 % de productivité » | **Déclenche** (type a) | Invocation explicite sur résultat chiffré ; A3 exige re-dérivation ou source |
| D4 | « Vérifie ce livrable avant envoi » / « c'est diffusable ? » | **Ne déclenche pas** → renvoi `quality-oracles` | Vocabulaire de conformité, réservé à la loi transversale |
| D5 | « Audite cette propale, elle part demain » | **Ne déclenche pas** → renvoi `digit-ai-propale-review` | Audit spécialisé existant : il prime |

## Règles complémentaires

- Une réponse en cours de production (pas de livrable fini) matchant des
  déclencheurs de fiches expert → `experts-forge`, jamais contre-expertise.
- Aucune invocation explicite → le skill ne se propose pas de lui-même
  (jamais proactif) ; au plus une mention en une ligne si l'utilisateur
  hésite explicitement sur la solidité d'une solution finie.
- D4/D5 : le renvoi est nommé dans la réponse (« ça relève de X ») — jamais
  de contre-expertise silencieusement substituée à l'audit attendu.
