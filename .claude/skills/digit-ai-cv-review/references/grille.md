# Grille de revue d'un CV — 1.0.0

Un CV reçu est jugé pour une seule question : **Digit-AI peut-il proposer cette personne à un client sans lui reposer de
questions, et le client verra-t-il son apport ?** Les critères reprennent les bonnes pratiques que Digit-AI impose à ses
propres dossiers d'intervenant : chronologie datée, faits d'action, ligne « Environnement » par mission, chiffre sourcé,
données personnelles retirées. Elles sont retournées en conseils pour la personne qui a écrit le CV.

## Priorités et verdict

| Priorité | Sens | Exemple |
|---|---|---|
| 1 | empêche de proposer la personne sans lui reposer de question | expériences sans période, statut inconnu |
| 2 | affaiblit le profil : le client peut juger, mais la personne se distingue mal | aucun résultat, outils sans mission |
| 3 | finition | coquilles, données personnelles superflues |

Le verdict se lit dans ce tableau, jamais au jugé ; il ne porte aucune note. `oracle_revue.py` (R6) le recompte.

| Verdict | Condition, comptée sur les lignes de la revue |
|---|---|
| Prêt à proposer | aucune ligne de priorité 1 et 2 lignes de priorité 2 au plus |
| À refondre | 3 lignes de priorité 1 ou plus, ou un PDF sans texte exploitable |
| À retravailler | tous les autres cas |

## Critères

| Code | Critère | Mesure de `analyser_cv.py` | Priorité | Action | Pourquoi (effet sur le client) | Forme de correction |
|---|---|---|---|---|---|---|
| C1 | chronologie datée | `experiences.datees` sur `experiences.nombre` | 1 si une expérience n'a pas de période | Ajouter | le client lit d'abord la chronologie ; une durée seule ne dit ni la récence ni un trou ; Digit-AI calcule ses durées depuis les périodes | « mm/aaaa – mm/aaaa » par poste, « depuis mm/aaaa » pour le poste en cours |
| C2 | statut et cadre des missions | `statut.dit`, `experiences.postes_conseil` | 1 si le statut n'est pas dit | Ajouter | Digit-AI doit savoir comment proposer la personne, et quel client a porté la mission | « consultante indépendante » ou le cabinet, sous le titre |
| C3 | résultats mesurables | `faits.avec_chiffre`, `faits.repetes` | 2 | Modifier | le client retient un résultat, pas une activité ; une tâche répétée d'un poste à l'autre ne distingue personne | action, périmètre, résultat, avec des trous à remplir « [N] », « [X] % » : jamais un chiffre inventé |
| C4 | outils rattachés aux missions | `outils.non_cites` sur `outils.nombre` | 2 | Ajouter | un outil sans mission se lit comme une notion | une ligne « Environnement : [outils de la mission] » par poste ; noms écrits en entier |
| C5 | positionnement prouvé | `ia.revendiquee_au_titre`, `ia.faits_citant_ia` | 2 | Ajouter, ou Supprimer la revendication | un client qui retient la personne pour cet argument la questionnera dessus | un cas par mission : « [outil] pour [tâche] sur [périmètre] : [effet mesuré] » |
| C6 | résumé utile | `resume.redites`, `resume.atouts`, `resume.mots` | 2 | Supprimer | la zone lue en premier ; une redite ou des qualités sans fait y prennent la place de l'expertise | 3 lignes : métier, secteurs, singularité |
| C7 | données personnelles superflues | `donnees_personnelles` | 3 | Supprimer | critères sans rapport avec la mission, sources de discrimination | les retirer ; garder la zone de mobilité |
| C8 | relecture et rubriques | lecture experte, `rubriques.doublons_bilingues`, `contacts.courriel_lettres_doublees` | 3 | Modifier | une coquille se remarque, surtout dans un métier de la qualité | la forme juste de chaque coquille citée |
| C9 | lisibilité machine | `lisibilite_machine` | informative | — | dépend du logiciel lecteur | n'entre dans une revue que si TOUS les lecteurs échouent |

## Règles de rédaction d'une revue

1. **7 lignes au plus**, classées par priorité puis par effet ; une ligne peut couvrir 2 critères de même action.
2. **Chaque ligne dit quoi, pourquoi, l'action et comment.** « Quoi » cite le CV entre guillemets français ou donne une
   mesure ; « Pourquoi » dit l'effet sur le client ; « Comment » donne une forme directement recopiable.
3. **Jamais une affirmation sans preuve** : un extrait entre guillemets dans « Quoi » ou « Pourquoi » existe dans le CV ;
   un nombre y vient d'une mesure citée en preuve (`preuves: [{"mesure": "faits.nombre"}]`).
4. **Jamais de chiffre inventé** : dans « Comment », un pourcentage ou un montant reste un trou entre crochets.
5. **Aucune donnée personnelle** dans la revue : ni nom, ni coordonnée, ni âge, ni employeur, ni ville d'expérience. Le
   prénom va dans le message d'envoi, pas dans le fichier.
6. **Un registre déclaré et tenu** (« tu » ou « vous »), et le lexique de l'émetteur quand il en a un (`--lexique`).
7. **Commencer par ce qui tient** : une phrase de points solides avant les corrections.

## Forme d'une revue (`revue.json`)

Champs obligatoires : `registre`, `titre` (75 caractères au plus), `verdict`, `points_solides` (230), `lignes`, `appel` (100),
`pied`. Une ligne : `rang`, `priorite` (1 à 3, non décroissante), `criteres`, `action` (Ajouter, Modifier ou Supprimer), `quoi`
(120), `pourquoi` (105), `comment` (130), `preuves`. Modèle : `fixtures/revue_synthetique.json`. Les plafonds sont ceux d'une
revue qui tient sur une diapositive.

## Hors du champ de la grille

L'orthographe hors lecture experte (aucun dictionnaire), la véracité du parcours, l'adéquation à une mission précise, le goût
graphique.
