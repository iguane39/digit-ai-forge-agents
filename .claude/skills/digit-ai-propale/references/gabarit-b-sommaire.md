# Gabarit B — « Sommaire numéroté » (+ variante lot suivant)

**Quand l'utiliser** : missions agents IA / automatisation pour PME et ETI, 1-3 lots
courts (2 semaines à quelques jours), interlocuteur dirigeant ou métier, vente par
bénéfices et confiance plus que par périmètre exhaustif. Références corpus :
Client-I (15 slides), Client-H Lot 2 (12 slides).

**Volume cible : 11-15 slides.** Sections numérotées 01-0N, chacune = 1-3 slides.

## Squelette slide par slide

### 1 · Cover
- Baseline « L'IA à taille humaine » + « PROPOSITION COMMERCIALE · {année} »
  (+ « LOT {n} » si lot suivant)
- **Titre = bénéfice à l'impératif ou résultat** (« Reprenez le contrôle de vos emails
  et de vos documents », « Du Bon de Livraison à la Facture ») — jamais un titre
  technique
- Sous-titre descriptif 1 ligne
- 3 bullets de réassurance (synergie des lots, « sans changer d'outil », outil maître
  préservé, données UE)
- « Document préparé pour {Prénom / contact} — {Société, ville} » · date · Confidentiel

### 2 · SOMMAIRE — sous-titre narratif (« De votre contexte à notre plan d'action »)
Grille 01-0N, chaque entrée : numéro + titre + sous-ligne de 3-6 mots.
Sections types : Contexte & enjeux · Notre réponse · Approche & méthodologie ·
Architecture & souveraineté · Planning & phasage · Estimation des gains ·
Conditions tarifaires / Investissement · Nos engagements · Prochaines étapes.

### 01 · Contexte & enjeux
- Sous-titre = diagnostic en une phrase (« Une gestion quasi bancaire freinée par le
  volume et la dispersion documentaire »)
- 1 ligne de présentation du client (montre qu'on l'a compris)
- 4 cartes de douleur : titre court + 1 phrase chiffrée avec les données des entrants.
  Nommer la « douleur n°1 » quand elle existe.

### (Optionnel) PERSPECTIVE · HORS PÉRIMÈTRE
Trajectoire IA future (3-4 chantiers en 1 ligne chacun) pour installer la relation
long terme. Clore par : « ces chantiers ne sont pas inclus dans la présente
proposition — ils dessinent la suite possible. »

### 02 · Notre réponse — 1 slide par lot (+ 1 slide synergie si ≥ 2 lots)
Par lot :
- Sous-titre = bénéfice narratif (« Traiter les emails plus vite, sans changer d'outil
  ni perdre le contrôle »)
- Deux colonnes : **« Ce que fait l'agent/le pipeline »** (4-5 capacités) /
  **« Ce que vous recevez »** (4-5 livrables tangibles)
- Bandeau de réassurance : « Principe non négociable · aucun envoi automatique —
  l'humain valide et envoie (human-in-the-loop) » ou « jamais d'écrasement — tout
  est journalisé »

Slide synergie (si ≥ 2 lots) : « Un seul socle technique pour les deux lots : le second
coûte moins cher » — schéma socle commun → lots, logique de bundle.

### 03 · Approche & méthodologie
4 étapes fléchées : Cadrage (demi-journée sur site) → Développement (avec Claude Code)
→ Test en prod (shadow mode, mesure de précision) → Ajustements & livraison.
Pied : principe POC-first.

### 04 · Architecture & souveraineté
3 colonnes : **Captation & intégration** (APIs) / **Traitement — sur mesure** (stack,
hébergement région UE, code versionné) / **Intelligence — LLM** (modèle léger pour la
classification, Sonnet pour la rédaction, Bedrock UE ou option 100 % souveraine Mistral).
Bandeau : l'outil maître du client « n'est jamais modifié ».

### 05 · Planning & phasage
Étapes numérotées avec durées réelles (J0 cadrage → Lot 1 ~2 sem. → Lot 2 ~2 sem. →
Production en continu). Si créneau concret disponible : le proposer
(« Créneau J0 proposé · mardi {date} ou jeudi {date} au matin »).

### 06 · Estimation des gains
- Chapeau OBLIGATOIRE : « Hypothèses médianes, à calibrer {au démarrage / lors du
  cadrage} — {la variable décisive} est la variable décisive. »
- 3 gros chiffres (≈ h/mois rendues · volume couvert · « 100 % des envois validés par
  un humain »)
- 4-6 cartes taguées **À CALIBRER** / **QUANTIFIÉ** (seulement si donnée réelle dans
  les entrants) / **INDICATEUR CIBLE**
- Pied OBLIGATOIRE : « Estimations indicatives, sans engagement de résultat ·
  hypothèses détaillées et simulateur paramétrable dans la fiche jointe en annexe »
  (fiche = skill `digit-ai-fiches-html` si demandée)

### 07 · Investissement / Conditions tarifaires
Structure canonique → voir `entrants-chiffrage.md`.

### (Optionnel) 08 · Nos engagements
4 cartes : Human-in-the-loop · Données en région UE (aucun entraînement sur vos
données, DPA fournisseurs) · Option 100 % souveraine (Mistral, « cohérent avec
"L'IA à taille humaine" ») · Périmètre minimal & outil maître préservé.

### 0N · Prochaines étapes
3 étapes fléchées : Validation → Cadrage J0 (créneau) → Démarrage.
Geste commercial éventuel en bandeau (validé par l'utilisateur).

### (Optionnel) Annexe · Objections anticipées — « ce qu'un décideur va se demander »

À placer en annexe (après la slide interlocuteurs dans le PPTX). **Distincte des points
de vigilance** (§4 grammaire, qui exposent les red flags issus des entrants) : ici on
pré-répond aux objections prévisibles du décideur qui n'était pas au RDV. 3 à 5 paires
question → réponse courte :
- « Pourquoi vous plutôt qu'une grosse ESN / un intégrateur ? » → différenciateur réel
  (à taille humaine, Claude Code, mise en prod réelle), pas un slogan.
- « Pourquoi ce montant ? » → ancrage sur la valeur du parcours livré et utilisable en
  prod, pas sur un volume de jours.
- « Et si ça dérape en cours de route ? » → forfait par lot, avenant sur specs validées,
  mise en service progressive supervisée, human-in-the-loop.
- « Qu'est-ce qui n'est pas inclus ? » → renvoi aux exclusions (§3), destinations nommées.

Ne pas maquiller une objection sans réponse solide : si elle n'en a pas, c'est un signal
à traiter en amont, pas une slide à habiller.

### Dernière · « Vos interlocuteurs chez Digit-AI »
Slide canonique — générée par le skill `digit-ai-pptx`.

---

# Variante « lot suivant » (modèle Client-H Lot 2)

Quand la propale prolonge une mission **déjà en production**, le gabarit B s'adapte :

1. **Section 01 = « Les acquis du Lot {n-1} »** — sous-titre du type « L'Agent {X}
   tourne en production : la base technique est posée ». 3 gros chiffres de prod
   réels + bloc « DÉJÀ EN PRODUCTION » listant le pipeline existant. On vend sur
   la preuve, pas sur la promesse.
2. **Section « Ce qui change vs {lot précédent} »** — sous-titre :
   « "À l'identique de {X}"… à {n} différences près, toutes maîtrisées ».
   4 cartes : DOMAINE / titre du changement / mécanisme en 2 lignes. La carte
   CRITICITÉ assume la montée de risque (« Une facture n'est pas un BL »).
3. **Section « Sécurisation & points à trancher »** — mise en service progressive
   supervisée (« {n} cycles supervisés avant tout envoi automatique ») +
   « {n} questions pour démarrer · À caler en 15 minutes » (liste fermée,
   réponses binaires ou courtes).
4. **Gains : réutiliser les données réelles du lot précédent** (volumes constatés
   → tag QUANTIFIÉ) et ajouter une carte « Effet socle » : « Le {lot n+1} deviendra
   un paramétrage du même moteur. »
5. **Investissement : TJM du lot précédent affiché comme référence**
   (« {x} j × {TJM} € HT — TJM Lot {n-1} ») et lot suivant « chiffré ultérieurement,
   sur le même moteur ».

---

# Variante « Answer-First » (décideur pressé / comité court)

Quand le destinataire est un dirigeant pressé ou un comité qui ne restera pas pour tout le
funnel, inverser l'ordre d'ouverture : **commencer par la recommandation et la valeur**,
puis dérouler le contexte en justification.

1. **Slide 1 (après cover) = « Notre recommandation en une page »** — la réponse + la
   promesse + l'ordre de grandeur d'investissement, d'emblée. Le décideur a l'essentiel
   même s'il décroche ensuite.
2. **01 · Contexte & enjeux** devient la *justification* de la reco (pourquoi c'est le bon
   plan), plus son préalable.
3. La suite est inchangée : Notre réponse · Approche · Gains · Planning · Investissement
   détaillé · Prochaines étapes.

Le reste de la grammaire ne bouge pas. À réserver aux cas où l'attention du décideur est
rare : sinon, le funnel Contexte → Réponse reste plus engageant.
