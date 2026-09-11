# Gabarit A — « Trajectoire produit »

**Quand l'utiliser** : projet applicatif structuré (souvent un CDC), ≥ 3 lots de
~5 semaines, client avec DSI ou direction métier, besoin de prouver la maîtrise du
périmètre. Références corpus : Client-F (13 slides), Client-G (14 slides), Client-J
(42 slides, forme validée marché — version longue avec slides parcours).

**Volume cible : 12-14 slides** (jusqu'à ~40 en version longue avec slides parcours,
cf. `personas-ligne-editoriale.md` §4 — réservée aux RFP denses ≥ 4 lots).

## Squelette slide par slide

### 1 · Cover
- **Titre = ligne éditoriale transversale** (cf. `personas-ligne-editoriale.md` §2,
  ex. structure « Faire {verbe} un {marché} {tension} ») ; à défaut, titre projet
- Sous-titre « Lotissement L0 → L{n} »
- Accroche démarche : « Proposition commerciale — démarche incrémentale par releases
  utilisables » ou équivalent
- 1 ligne « De {situation actuelle} à {cible}, en {n} lots »
- Client, site/contexte, mois année, Confidentiel, digit-ai.fr, réf. CDC si applicable

### 2 · Contexte — « Votre enjeu : {reformulation orientée action} »
Deux colonnes :
- **SITUATION ACTUELLE** : 4-6 douleurs factuelles, chiffrées avec les données des
  entrants (volumétries, temps perdus, risques réglementaires)
- **NOTRE APPROCHE** : « Lotissement incrémental : chaque lot est livré ET utilisable
  en production de façon autonome » + liste des lots en 1 ligne chacun (nom, durée,
  bénéfice)
- Phrase de clôture : « Livrer vite, livrer utile — chaque lot justifie le suivant
  par les résultats mesurés »

### 3 · Trajectoire produit — « {n} lots, {n} promesses utilisateur testables »
- Bandeau : « SCÉNARIO RECOMMANDÉ · {x} semaines · {n} lots en chaîne continue ·
  MEP toutes les 2 semaines dès S{y} »
- Pour chaque lot : code (L0…), nom, durée, **POUR** (personas), **PÉRIMÈTRE** (1-2 lignes)
- Pied : « Principe : chaque lot livré permet à un utilisateur d'accomplir un parcours
  métier complet en production » + liste des livrables systématiques (appli en prod,
  sources, specs, doc utilisateur, doc technique, résultats de tests)

### 4 à 4+n · Une à deux slides par lot — « L{x} — {Nom} »

**Version longue (RFP denses)** : chaque lot s'ouvre sur un **intercalaire** (« Lot L{x} ·
{Nom} », sous-titre = message-clé du lot — rendu par `digit-ai-pptx`, layout 1b), suivi de
la **slide parcours** — titre = message-clé bénéfice, flux `{source} ▶ {moteur} ▶
{destination}`, actions numérotées groupées « POUR {PERSONA} — {VERBE} » (cf.
`personas-ligne-editoriale.md` §4) — puis de la slide contrat.

**Slide contrat**, structure fixe :
- Bandeau : « {durée} · {PROMESSE EN MAJUSCULES, FORMULÉE COMME UN OBJECTIF} »
- **PROMESSE UTILISATEUR** : citation testable — « À la fin de L{x}, {persona}
  {accomplit un parcours métier complet, mesurable} »
- **INCLUS DANS LE LOT** : 5-8 items concrets
- **EXPLICITEMENT EXCLU** : 4-7 items, chacun avec sa destination — « (reporté L2) »,
  « (→ L3) », « (chiffrage séparé) ». L'exclusion explicite est une signature Digit-AI :
  elle protège le forfait et rassure le client.
- **CONDITIONS DE PROD** : 4-6 critères de recette mesurables (chronométrés, signés,
  vérifiables)
- **ROI** : 1 ligne, formulée comme **apport du persona du lot** (« Fin de {douleur} —
  {résultat} en {modalité} »), liée aux douleurs de la slide 2 — jamais une prouesse
  technique Digit-AI

### Suivante · Stack technique — « notre recommandation »
- Si stack libre : 3 blocs FRONT / BACK / BDD avec justification 1 ligne chacun
- Si stack imposée par le client : assumer le désaccord — colonne « NOTRE
  RECOMMANDATION » vs « STACK IMPOSÉE PAR LE CDC » avec limites factuelles
- Le cas échéant, bloc « reprise du code » : recommander la montée en compétence
  Développeur Augmenté (formation Digit-AI) plutôt qu'une reprise manuelle

### Suivante · Planning — « {x} semaines, {n} lots en chaîne continue »
- Frise S1 → S{x} avec barres par lot et jalons « ▸ MEP L{x} »
- **CLÉS DE LECTURE** : « Chaque lot = 5 semaines : 1 sem. validation specs +
  2 sem. dév + 1 sem. tests & validation + 1 sem. correction + MEP » ·
  « Facturation au forfait par lot après chaque MEP » · « Toute modification après
  validation des spécifications fera l'objet d'un avenant »

### Suivante · Investissement
Structure canonique → voir `entrants-chiffrage.md`.

### Suivante · Points de vigilance — « à trancher avant démarrage »
Signature Digit-AI : exposer les risques AVANT signature, comme preuve d'analyse.
- Intro : « Notre analyse de {entrants} a fait émerger {n} red flags et {m} questions
  bloquantes »
- Red flags numérotés : titre + mécanisme en 2-3 lignes (impact chiffré si possible)
- **QUESTIONS BLOQUANTES** : liste fermée, chacune actionnable en cadrage
- Clôture : « Chaque lot fera l'objet d'une spécification détaillée avec des maquettes
  des écrans finaux »

### (Optionnel) Suivante · Au-delà de la mission — « la trajectoire »
Pattern validé marché : 2-4 orientations post-mission (1 titre + 2-3 lignes chacune),
chapeau obligatoire « Mentionné pour anticiper les orientations — sans engagement
contractuel au présent {appel d'offres / périmètre} ». Montre la vision sans diluer le
périmètre chiffré.

### Suivante · Prochaine étape — « Démarrage du L0 »
2-3 blocs numérotés : Décision (go/no-go + bon de commande) → Démarrage (sprint 0,
première livraison à 2 semaines). Contact : contact@digit-ai.fr · digit-ai.fr

### (Optionnel) Annexe · Objections anticipées — « ce qu'un décideur va se demander »

À placer en annexe (après la slide interlocuteurs). **Distincte des Points de vigilance**
(slide précédente, qui expose les red flags issus du CDC/des entrants AVANT signature) :
ici on pré-répond aux objections prévisibles du décideur qui n'était pas au RDV. 3 à 5
paires question → réponse courte :
- « Pourquoi vous plutôt qu'une grosse ESN / un intégrateur ? » → différenciateur réel
  (démarche incrémentale, lots utilisables en prod, Développeur Augmenté), pas un slogan.
- « Pourquoi ce montant ? » → ancrage sur la valeur de chaque lot livré et utilisable en
  prod, pas sur un volume de jours.
- « Et si ça dérape ? » → forfait par lot après MEP, avenant sur specs validées, recette
  mesurable par lot.
- « Qu'est-ce qui n'est pas inclus ? » → renvoi aux EXPLICITEMENT EXCLU de chaque lot,
  destinations nommées (« reporté L2 », « → L3 », « chiffrage séparé »).

Ne pas maquiller une objection sans réponse solide : si elle n'en a pas, c'est un signal à
traiter en amont, pas une slide à habiller.

### Dernière · « Vos interlocuteurs chez Digit-AI »
Slide canonique — générée par le skill `digit-ai-pptx`, ne pas la recomposer.

## Footer (toutes slides sauf cover)
« Digit-AI · Proposition commerciale · {CLIENT} · {Mois Année} · Confidentiel » + pagination n / N.
