# Le test et son bilan

## Le déroulé

Le porteur donne 5 ou 6 documents, chacun avec son brief et ses sources. Le premier document tourne seul, et `--tours` reste le même pour tout le test.

```bash
node scripts/bilan.mjs --espace <dossier des espaces> --restants <documents restants>
```

Cette commande relit la durée et le quota par tour du premier document, soit l'écart de `utilization` divisé par le nombre de tours joués. Besoin prévu : quota par tour × `--tours` × documents restants. S'il dépasse 0,80 moins `utilization`, les documents suivants attendent `resetsAt` entre eux, et le porteur reçoit l'annonce ; rien d'autre ne change. Les documents passent l'un après l'autre. Le premier document reçoit un 2e essai après les autres, seulement si `utilization` reste sous 0,80 moins le besoin d'un document, pour mesurer l'écart entre 2 essais.

Le rang d'un document suit la date de lancement de son essai `opus-1`.

## Une comparaison par document

Le verdict lit le seul essai `opus-1` de chaque document ; un essai Sonnet ou un 2e essai restent descriptifs.

- La version cible est celle du tour cible 20, de numéro 10 ou plus, donc toujours distincte de celle du tour cible 1. Une réponse « rien » n'est pas une version.
- Sans version gardée de numéro 10 ou plus, le document est défavorable, avec le motif qui s'applique : « 2 rien de suite » ou « 3 rejets de suite ».
- Favorable : la version cible est classée devant la version du tour cible 1 et devant l'origine. Si la version du tour cible 1 est l'origine, « devant l'origine » suffit.
- `oracle-faits-sources.mjs` se rejoue sur la version cible : en échec, le document est défavorable.

Si aucune version gardée ne tombe entre les tours 10 et 20, mais qu'une version retenue pour les tours cibles 35 ou 50 atteint 10, c'est elle qui sert de cible : elle seule a été classée. Le prompt ne tranche pas ce cas, très rare.

## Un document terminé

Son essai `opus-1` s'est arrêté par 2 « rien » de suite, par la borne ou par 3 rejets de suite, et son classement est enregistré. Un document en pause ou arrêté par un contrôle d'identité ou de modèle n'est pas compté tant que `--reprendre` ne l'a pas mené à l'un de ces arrêts ; s'il reste bloqué, le porteur reçoit l'annonce et le bilan le désigne par son rang.

## Le verdict

Il a 3 issues, fixées avant le premier tour.

| Issue | Condition, sur 5 ou 6 documents terminés |
|---|---|
| Intérêt | au moins 5 favorables sur 6, ou 5 sur 5 |
| Pas d'intérêt démontré | au plus 1 favorable |
| Non concluant | les autres cas, et tout test à moins de 5 documents terminés |

Si les essais `opus-1` et `opus-2` du premier document n'ont pas le même statut, un verdict « intérêt » devient « non concluant », et le bilan le signale. Sans 2e essai, le verdict reste tel quel et le bilan dit que l'écart n'est pas mesuré.

## Ce que le bilan écrit

`bilan.md`, dans l'espace, sans contenu ni nom de document : le verdict ; par document le statut et son motif, le tour de la version classée première, à titre descriptif, les mots de l'origine, de la version du tour cible 1 et de la version cible, la durée et le quota consommé ; le risque d'un faux « intérêt », sous l'hypothèse d'une chance sur 2 par document ; les limites.

C'est le run du test, au pilot, qui le relit puis le publie sous `output/03-etudes/`, nommé selon R-4 et R-25, indice par `scripts/allouer-indice.mjs` du pilot.
