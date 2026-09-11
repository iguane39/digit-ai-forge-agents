# Grammaire commerciale Digit-AI

Ce qui fait vendre ces propales n'est pas la structure des slides : c'est le ton.
Patterns extraits du corpus canonique v2 (Client-F 04/2026, Client-G 06/2026,
Client-H Lot 2 06/2026, Client-I 06/2026, Client-J 06/2026 — forme validée marché). **Réutiliser les structures, jamais
les contenus clients.**

## 1 · Sous-titres narratifs orientés bénéfice

Chaque slide porte un sous-titre = phrase complète, du point de vue du client,
décrivant un résultat — jamais un libellé technique.

| Structure | Exemple de structure (à adapter) |
|---|---|
| Résultat + « automatiquement / sans X » | « Chaque {objet} rangé au bon endroit, automatiquement » |
| Action + double réassurance | « Traiter les {X} plus vite, sans changer d'outil ni perdre le contrôle » |
| Constat qui crée l'urgence | « La {qualité X} n'est plus un confort : c'est une obligation réglementaire » |
| Continuité rassurante | « Votre trame actuelle, conservée à l'identique — l'agent remplit {x} colonnes sur {y} » |
| Concession maîtrisée | « "À l'identique de {X}"… à {n} différences près, toutes maîtrisées » |
| Autonomie du système | « À chaque {cycle}, vos {objets} partent seuls — et tout est tracé » |

## 2 · Promesse utilisateur testable (gabarit A, une par lot)

Format fixe : guillemets français, futur accompli, persona nommé, parcours complet,
critère vérifiable :

> « À la fin de L{x}, {persona} {réalise une action métier de bout en bout}
> {sans l'outil legacy / avec le résultat mesurable}. »

Une promesse non testable (« l'application sera plus performante ») est à réécrire.
Le {persona} est celui du **bloc personas niveau B** du lot
(`personas-ligne-editoriale.md` §1) — un rôle métier réel des entrants, jamais un
générique.

## 3 · Exclusions explicites et destinations

Tout ce qui n'est pas dans un lot est nommé avec sa destination : « (reporté L2) »,
« (→ L3) », « (chiffrage séparé) », « (hors périmètre CDC) », « (Lot 3, comme
convenu) ». Jamais de zone grise : c'est ce qui protège le forfait.

## 4 · Vigilance assumée = preuve de sérieux

Les risques sont exposés AVANT signature : « Notre analyse de {entrants} a fait
émerger {n} red flags et {m} questions bloquantes. » Les questions sont fermées,
actionnables, calables « en 15 minutes ». Ne jamais lisser un risque réel identifié
dans les entrants.

## 5 · Le système ne devine jamais

Réassurance systématique sur les automatismes :
- « En cas de doute, l'agent ne devine jamais : {cas} = {libellé erreur}, {trace},
  alerte. Vous corrigez, l'agent repêche au cycle suivant. »
- « Principe non négociable · aucun envoi automatique — l'humain valide et envoie. »
- « Jamais d'écrasement — tout est journalisé, les cas incertains passent en
  validation. »
- Montée en criticité = mise en service progressive supervisée, bascule « décidée
  ensemble ».

## 6 · Prudence sur les gains

- Chapeau : « Hypothèses médianes, à calibrer — {variable} est la variable décisive. »
- Tags honnêtes : **QUANTIFIÉ** réservé aux données réelles des entrants ;
  sinon **À CALIBRER** ou **INDICATEUR CIBLE**.
- Pied : « Estimations indicatives, sans engagement de résultat. »
- Contrepoint : l'engagement de **résultat** porte sur les livrables et conditions de
  prod (« Obligation de résultats avec critères de succès mesurables par lot »),
  jamais sur les gains.

## 7 · Discipline de slide — densité, exhibit, auto-suffisance

Une propale circule **sans son auteur** : transférée au décideur qui n'était pas dans la
pièce, lue en diagonale, exportée en PDF. Chaque slide doit donc tenir seule.

**Test du deck fantôme (plan de slides).** Avant soumission du plan : lire à la suite
uniquement les titres + sous-titres. Seuls, ils doivent dérouler toute la trajectoire —
du problème client au closing. Si la lecture décroche, ou si une slide pourrait être
placée n'importe où sans perte, le plan n'est pas prêt : retravailler titres et ordre.

**Test de lisibilité des lots.** Un lecteur non technique qui ne lit QUE titre +
sous-titre de chaque slide de lot doit comprendre ce que le lot **lui apporte**
(`personas-ligne-editoriale.md` §4). Échec = retravailler le message-clé, pas ajouter
du texte.

**Test d'auto-suffisance.** Couvrir mentalement le présentateur : la slide délivre-t-elle
son message sans un mot d'oral ? Sinon, c'est le sous-titre ou l'annotation qui manque.
C'est le test le plus rentable de toute la propale — une part des deals perdus le sont
chez un décideur absent du RDV, devant une slide muette.

**Un seul visuel porteur par slide.** Un schéma, une courbe de gains, un planning — pas
deux. Si deux semblent nécessaires : soit c'est une seule comparaison (à fusionner), soit
deux messages (deux slides). Test de couverture : cacher le visuel et lire le titre — il
tient encore ? cacher le titre et lire le visuel — le message saute aux yeux ? Si l'un
échoue, l'un des deux est faible.

**Annoter le chiffre décisif.** Sur la slide Gains, l'architecture, le planning :
surligner / flécher / encadrer le point qui compte (« −40 % de ressaisie », « MEP L1 à
S6 »). Ne pas faire chercher le décideur. La couleur dirige l'attention, elle ne décore
pas — la charte (couleurs, filets, typo) reste celle de `digit-ai-pptx`.

**Plafond de densité : ~40 mots de corps par slide.** Au-delà, soit la slide fait deux
choses (la scinder), soit le détail part en annexe. Puces : une idée chacune, 3 à 5 par
slide ; au-delà de 5, signal d'alerte. Style télégraphique admis quand le sens tient
(« Ressaisie supprimée sur 8 colonnes / 10 » plutôt qu'une phrase pleine). **Exception
assumée** : la slide Investissement / Conditions tarifaires peut être dense — c'est un
tableau de référence, pas une slide de narration.

## 8 · Lexique récurrent (à doser, pas à saturer)

« livré ET utilisable en production de façon autonome » · « chaque lot justifie le
suivant par les résultats mesurés » · « parcours métier complet » · « shadow mode » ·
« human-in-the-loop » · « logique de bundle » · « effet socle » · « la valeur se
mesure » · « L'IA à taille humaine » (cover et engagement souveraineté).

## 9 · Interdits

- Superlatifs creux (« révolutionnaire », « unique sur le marché »)
- ROI affirmé sans source dans les entrants
- Jargon IA non traduit en bénéfice métier (« RAG », « embeddings » seuls)
- Contenu d'un client dans la propale d'un autre (chiffres, red flags, trames,
  volumétries, noms d'outils internes)
- Promesse de délai sans mécanisme (chaque planning montre COMMENT on tient)
