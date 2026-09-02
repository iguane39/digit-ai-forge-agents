# Corpus propre — migration de plateforme brownfield (checklist)

Constitué le 02/09/2026 pour la fiche `expert-migration-plateforme-brownfield` (TF-0717).

**Pourquoi ce corpus existe.** L'écart E5 d'une revue du 20/08/2026 déclarait, mot pour mot,
que l'entrée candidate « fiche expert MIGRATION DE PLATEFORME BROWNFIELD » n'avait pas été
écrite dans la file des candidats de la forge. **Onze jours plus tard**, le client d'un
programme de migration constatait que le programme **ne prévoyait nulle part de prévenir les
utilisateurs**. Mesure exécutée sur le corpus de ce programme (douze livrables Markdown) :
les mots « prévenir », « préavis », « notifier », « informer » y avaient **zéro occurrence** ;
la machine d'états de la bascule comptait **huit états** (planned, rehearsed, frozen, migrated,
verified, switched, observed, closed / rolled_back) dont **aucun d'annonce** ; les **quarante
travaux du lot 2** (16 capacités, 6 portes, 12 travaux de bascule, 6 critères de sortie,
4 questions) n'en portaient **aucun** ; et une contre-expertise complète du lotissement,
jouée le 22/08/2026, avait produit **sept constats**, aucun sur ce point.

Le trou n'était donc pas une inattention de rédaction : c'était **un angle qu'aucun juge du
dispositif ne regardait**, et il était nommé d'avance. Les points 3 et 4 ci-dessous étaient
déjà couverts par les corpus voisins (`interop-archi`, `data-platform-cloud`) ; les points 1
et 2 ne l'étaient par aucun. **La checklist se calibre exactement sur cet écart.**

## 1. Ce que la bascule impose à l'utilisateur final — et le préavis correspondant

Toute bascule d'un système en service impose au moins un des quatre changements suivants à
quelqu'un qui n'a rien demandé. Chacun se **date** et se **préavise**, sans quoi le programme
transfère silencieusement son coût au support :

| Ce que la bascule impose | Ce qui doit exister en face | Preuve attendue |
|---|---|---|
| Fenêtre d'indisponibilité | date, heure, durée annoncées avant | message daté + canal |
| Changement de mode de connexion (SSO, MFA, nouveau portail) | consigne de reconnexion, page d'aide | procédure écrite atteignable sans se connecter |
| Identifiants ou habilitations à recréer | qui recrée, dans quel délai, avec quel repli | liste nominative ou règle de dérivation |
| Changement d'URL, de raccourcis, de favoris | redirection ou consigne | redirection testée, ou consigne diffusée |

**Test opposable** : une machine d'états de bascule sans état d'**annonce** avant l'état de
bascule est incomplète ; un lot de travaux de bascule sans **travail de préavis** est
incomplet. Un état `switched` qui suit directement `frozen` sans `announced` décrit une
bascule que personne n'a annoncée.

**Ordre de grandeur usuel du préavis** (à confirmer avec le métier, jamais à supposer) :
annonce initiale à J-15 minimum, rappel à J-2, message le jour J, et une adresse de retour
qui répond. Ce délai n'est pas une règle du prestataire : il se **fait valider**.

## 2. Qui prévenir — la connaissance des populations concernées

On ne peut pas prévenir une population qu'on n'a pas dénombrée. Le programme doit porter :

1. **Le dénombrement des populations** par système d'origine, et non seulement le nombre de
   comptes techniques : utilisateurs internes, utilisateurs finaux, tiers (partenaires,
   prestataires), comptes de service.
2. **Les populations à cheval** sur deux systèmes pendant la cohabitation — c'est la
   population la plus coûteuse : elle subit deux modes de connexion, deux jeux de données et
   deux supports. Elle doit être **nommée**, dénombrée, et son sort décidé.
3. **Le canal par population** : un canal qui suppose que l'utilisateur est déjà connecté au
   NOUVEAU système ne prévient personne.
4. **Le propriétaire de l'annonce** : qui signe le message, qui répond aux retours. Sans nom,
   l'annonce n'existe pas.

## 3. Le coût de fonctionnement en double (cohabitation)

Pendant la cohabitation, deux plateformes vivent : deux hébergements, deux jeux de sauvegardes,
deux chaînes de supervision, deux files de support, et la **synchronisation** entre les deux.
Points de contrôle : durée bornée et **datée** de la cohabitation ; sens de la synchronisation
(uni ou bidirectionnelle) et arbitrage des conflits ; qui paie les deux plateformes ; à quelle
date le double run s'arrête, et qui prononce cet arrêt.

## 4. Réversibilité et point de non-retour

Un plan de bascule sans retour arrière testé est un pari. Points de contrôle : le retour
arrière est-il **rejoué** en répétition (`rehearsed`), pas seulement écrit ? À partir de quel
événement devient-il impossible — première écriture métier dans la cible, purge de la source,
coupure d'un flux amont ? Ce **point de non-retour se nomme et se date** ; qui prononce le
retour arrière, sur quel critère observable, et dans quel délai ; que devient ce qui a été
produit dans la cible entre la bascule et le retour arrière.

## 5. Le sort de l'historique

L'historique est le sujet le plus souvent renvoyé « au lot suivant », et celui qui revient le
plus vite : quelle profondeur d'historique est reprise, laquelle reste consultable dans le
système source, et jusqu'à quand ; les obligations de conservation applicables (durées légales
ou contractuelles) sont-elles **citées**, pas supposées ; l'accès à l'historique non repris
est-il documenté pour l'utilisateur, ou disparaît-il sans que personne ne le dise ; les
identifiants, numéros et références restent-ils stables entre source et cible, ou les
documents déjà émis deviennent-ils introuvables.

## Frontières du corpus

Ce corpus ne traite pas la **qualité des données migrées** (→ `data`), le **canal technique**
d'échange entre systèmes (→ `interop-archi`), ni l'**exploitation** de la plateforme cible
(→ `ops-*`). Il traite ce que la bascule **impose à des gens** et ce que le programme doit
porter en face.
