# Personas & ligne éditoriale

Mécanisme issu du retour marché sur le corpus canonique v2 (Client-J Produit-J MVP,
06/2026 — forme validée par le client) : le point à renforcer est la **clarté du
contenu et de l'apport de chaque lot** pour son lecteur. Tout ce fichier sert cet
objectif, mesuré par le test de lisibilité (§4).

## 1 · Bloc personas — deux niveaux, jamais confondus

Le bloc personas est un **artefact nommé** du plan de slides (avant le plan lui-même),
réutilisable en aval : `digit-ai-propale-review`, préparation de soutenance, Q&R,
emails de relance.

**Niveau A — le lecteur-décideur de la propale** (1 persona global) :

| Champ | Contenu |
|---|---|
| Rôle | Fonction réelle du signataire / du comité (issue des entrants) |
| Enjeu | Ce qu'il doit obtenir ou éviter en signant |
| Objection principale | La question qui peut tuer le deal — pré-traitée en annexe objections |
| Vocabulaire | 3-5 termes de SON métier, à réutiliser tels quels dans les sous-titres |

Le niveau A calibre le **ton de toute la propale** et alimente la passe
`digit-ai-communication` (§3).

**Niveau B — l'utilisateur cible de chaque lot** (1 persona par lot) :

| Champ | Contenu |
|---|---|
| Rôle métier | Fonction réelle nommée (« chef de projet Agence/Annonceur », « planneur ») |
| Tâche douloureuse actuelle | Ce qu'il fait aujourd'hui, avec quel coût (temps, erreurs, friction) |
| Apport du lot | « À la fin de Lx, {persona} peut {action} qu'il ne pouvait pas faire avant » |

Le niveau B calibre la **promesse utilisateur testable** du lot (règle dure 3) et le
**ROI en une ligne** de la slide de lot.

**Règles de dérivation.**
- Source **exclusive** : les entrants du deal (CDC, transcript, diagnostic prospection,
  emails). **Jamais de bibliothèque figée, jamais de persona générique** (« l'utilisateur »,
  « le décideur » sont interdits comme personas).
- Persona introuvable dans les entrants → la question rejoint les 4 questions groupées
  de l'étape 1 du workflow. On demande, on n'invente pas.
- Un même rôle peut couvrir plusieurs lots ; un lot ne porte qu'un persona principal
  (les rôles secondaires apparaissent dans la slide parcours, §4).

## 2 · Ligne éditoriale transversale

Une **phrase-mère de positionnement** (3-6 mots) qui nomme la tension résolue par la
mission — pas le projet, pas la techno. Structure éprouvée : verbe d'action +
objet-marché + qualificatif de tension (corpus : « Faire dialoguer un marché atomisé »).
Elle vit sur la **cover** (titre principal), irrigue les sous-titres, et la *ligne
courte* du mode live en dérive (§5). Une seule ligne éditoriale par propale — si deux
candidates coexistent, arbitrer avant le plan de slides.

## 3 · Passe digit-ai-communication — unique, en phase contenu

**Quand** : étape 3 du workflow, après le bloc personas, avant tout plan de slides et
tout PPTX. **Une seule passe** — pas de re-invocation slide par slide (budget contexte).

**Entrants à lui transmettre** : livrable = propale (preset) · canal = écrit, document
qui circule sans son auteur · audience = persona niveau A complet · objectif = décision
attendue (signature, go lot) · enjeu · objection principale (niveau A) · actifs de
crédibilité issus des entrants.

**Sorties attendues (contrat d'échange)** :
1. La **ligne éditoriale transversale** (§2), avec le réglage ethos/logos/pathos justifié.
2. Un **message-clé par slide** du squelette : UNE phrase simple dans le vocabulaire du
   lecteur-décideur (registre sous-titre narratif, grammaire §1). Pour les **slides de
   lot**, le message-clé répond à « qu'est-ce que ce lot M'apporte ? » du point de vue
   du persona niveau B — ce que le client gagne, jamais ce que Digit-AI fait.

Ces messages-clés sont transmis à `digit-ai-pptx` comme sous-titres (étape 5).
**Frontière stricte** : `digit-ai-communication` travaille le message uniquement — le
chiffrage reste ici, le rendu reste à `digit-ai-pptx`.

## 4 · Slide parcours par lot (pattern validé marché)

Pour les propales **≥ 3 lots** ou à lots denses, chaque lot se présente en **deux
slides** :

1. **Slide parcours** (la clarté de l'apport) — titre = le message-clé du lot (phrase
   bénéfice) ; flux en 3 blocs `{source} ▶ {moteur} ▶ {destination}` ; actions
   numérotées **groupées par persona** en sections « POUR {PERSONA} — {VERBE D'ENJEU} »
   (2 groupes max), chaque action = verbe + complément + précision en 1 ligne ;
   pied = l'invariant transversal du lot (traçabilité, cloisonnement…).
2. **Slide contrat** (l'engagement) — structure fixe du gabarit A : PROMESSE UTILISATEUR /
   INCLUS / EXPLICITEMENT EXCLU / CONDITIONS DE PROD / ROI. Le **ROI est formulé comme
   apport** du persona niveau B (« Fin du multi-canal manuel — un brief, plusieurs
   régies, en une action tracée »), pas comme prouesse technique.

**Test de lisibilité des lots** (complète le deck fantôme, grammaire §7) : un lecteur
non technique qui ne lit QUE titre + sous-titre de chaque slide de lot doit comprendre
ce que le lot lui apporte. Échec = retravailler le message-clé, pas ajouter du texte.

## 5 · Ligne courte (mode présentation live)

La *ligne courte* du mode live **dérive de la ligne éditoriale** : cover (ligne
éditoriale) → contexte → réponse → gains → investissement → next steps. Budget ~1 idée
structurante par minute de créneau ; slides sécables marquées d'avance ; ne jamais
couper : problème client, promesse, investissement, prochaines étapes. Ce mode ne
change pas le contenu, il sélectionne un chemin de lecture.

## 6 · Interdits propres à ce mécanisme

- Persona générique ou importé d'un autre client (confidentialité inter-clients).
- Deux mécanismes de fil rouge concurrents : la ligne courte dérive TOUJOURS de la
  ligne éditoriale, jamais l'inverse.
- Message-clé de lot décrivant l'action de Digit-AI (« nous développons… ») au lieu
  de l'apport du persona (« vous émettez… »).
- Ré-invoquer digit-ai-communication après validation du plan (une passe, en amont).
