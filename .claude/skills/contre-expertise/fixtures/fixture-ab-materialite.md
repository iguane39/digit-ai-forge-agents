# Fixture A/B — matérialité de la contre-expertise

Fixture **synthétique illustrative** (même statut que la fixture rouge
d'experts-forge) : un même objet évalué sans / avec le skill. Critère de
succès : la version B change matériellement la décision par rapport à A.
Juge : Sébastien ou `oracle-judge` (rubrique matérialité).

## Objet (commun A/B)

Solution proposée : « Synchronisation Outlook↔Dropbox par export CSV quotidien
des métadonnées d'emails, déposé sur un SFTP, importé chaque nuit. »
Type (c). Enjeu : décider si cette architecture part en implémentation chez un
client de gestion locative.

## A — Baseline (sans le skill)

> La solution est simple, robuste et peu coûteuse à opérer : le CSV est un
> format universel, le SFTP est maîtrisé par le client, le batch nocturne évite
> les problèmes de charge. Points d'attention : encodage UTF-8 et supervision
> du dépôt. **Avis : faisable, on peut lancer.**

Décision induite : implémentation lancée sur cette architecture.

## B — Contre-expertise (avec le skill)

Verdict : **Reprendre**.

| # | Angle | Constat | Sévérité | Preuve |
|---|---|---|---|---|
| C1 | A3 | Le batch quotidien perd toute réactivité intrajournalière : un classement de PJ attendu « dans la foulée » arrive à J+1 — inadéquat si la décision servie est un usage au fil de l'eau | bloquant | [raisonnement] enjeu confirmé en entrée → latence max tolérable < 1 jour |
| C2 | A3 | Alternative crédible non considérée : abonnements aux notifications de changement de l'API Microsoft Graph (webhooks), qui poussent l'évènement au lieu d'exporter en masse | majeur | [source] documentation Microsoft Graph — change notifications (à re-vérifier en session réelle) |
| C3 | A3 | Le CSV de métadonnées d'emails transporte des données personnelles hors du périmètre M365 vers un SFTP : le transfert doit être inscrit au registre de traitement et minimisé | majeur | [standard] RGPD — minimisation (art. 5) et registre (art. 30) |
| C4 | A1 | Angle conformité non outillé (pas de livrable fichier à ce stade) | — | — |

Contradiction arbitrée : la simplicité opérée (baseline) contre l'adéquation à
l'enjeu (C1) — tranché par proximité avec la décision servie : l'enjeu « fil de
l'eau » prime, critère 2 de restitution.md.

Décision induite : implémentation **suspendue**, étude comparée batch vs
webhooks demandée, question de latence tolérable posée au client.

## Verdict de matérialité attendu

A concluait « on peut lancer » ; B suspend et réoriente l'étude. La décision
change de nature → **MATÉRIEL**. Si un juge conclut NON-MATÉRIEL sur cette
paire, le skill échoue sa loi fondatrice et repart en correction.
