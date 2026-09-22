# Registre des barres

Source unique des barres pérennisées. Symétrique au registre des oracles de
`quality-oracles` et au registre des fiches de `experts-forge`.

**Règle d'entrée** — une barre n'est inscrite en `ok` qu'après :
1. `test_existence` **exécuté** avec verdict PASS (pas 3 du protocole) ;
2. filtre de légitimité passé (pas 4) ;
3. justification **validée en un tour** par l'humain (pas 5) ;
4. `niveaux` décomposés (pas 6).

Tant qu'un de ces quatre points manque : `statut: todo`. Une barre en `todo`
n'est jamais servie au pas 1 — elle est reprise depuis le pas 2.

**Péremption** — une référence peut mourir (404, refonte du site, fichier
déplacé). Rejouer `test_existence` avant toute réutilisation d'une barre `ok` ;
un FAIL la repasse en `todo`, il ne la supprime pas.

---

## Format d'une entrée

```yaml
- cible: <type de livrable — champ de matching>
  reference: <artefact nommé> — <URL | chemin | capture>
  test_existence: python scripts/test_existence.py <localisateur>
  dernier_test: <AAAA-MM-JJ> — <PASS | FAIL>
  niveaux:
    structure: <ce qui est vérifiable sur la géométrie / l'ossature>
    tokens: <fontes, couleurs, espacements>
    composants: <composants, effets, états>
    comportement: <interactions, responsive, performance>
  frontiere: <le niveau autorisé | ce que la barre n'autorise pas à reproduire>
  justification: <une phrase — pourquoi cette référence est valide pour cette cible>
  statut: todo | ok
```

---

## Entrées

```yaml
- cible: maquette de refonte (site ou application web existante)
  reference: à renseigner — pas 2 du protocole non exécuté
  test_existence: à renseigner
  dernier_test: —
  niveaux: à décomposer (pas 6)
  frontiere: >
    Fixe le niveau de finition attendu d'une maquette de refonte.
    N'autorise pas la reproduction de l'identité visuelle, du contenu
    ou de la charte d'un tiers — a fortiori d'un concurrent du client.
  justification: à renseigner et faire valider (pas 5)
  statut: todo

- cible: page HTML chartée Digit-AI (fiche, schéma, restitution)
  reference: à renseigner — pas 2 du protocole non exécuté
  test_existence: à renseigner
  dernier_test: —
  niveaux: à décomposer (pas 6)
  frontiere: >
    Fixe le niveau de finition attendu. La charte Digit-AI (typographies,
    palette, tokens) reste la contrainte de forme et prime sur la référence :
    la barre porte sur le niveau, jamais sur l'apparence.
  justification: à renseigner et faire valider (pas 5)
  statut: todo

- cible: interface d'application web métier / SaaS d'entreprise (workflow d'approbation)
  reference: >
    Paire — Atlassian Design System (https://atlassian.design/) pour la désirabilité
    et les patterns métier ; GOV.UK Design System
    (https://design-system.service.gov.uk/) pour l'apprenabilité et l'accessibilité.
  test_existence: python scripts/test_existence.py https://atlassian.design/ https://design-system.service.gov.uk/
  dernier_test: 2026-08-11 — PASS (3/3 candidats testés, HTTP 200)
  niveaux:
    structure: >
      S1 en-tête explicite + UNE action principale visible sans défilement.
      S2 récapitulatif avant toute action irréversible (envoi, refus).
    tokens: >
      T1 jeu d'états complet par contrôle (repos/survol/actif/focus/désactivé/erreur),
      échelle d'espacement sans valeur arbitraire, échelle typographique ≥ 4 niveaux.
      T2 contraste AA partout, focus clavier visible, cibles tactiles ≥ 44 px sur mobile.
    composants: >
      C1 statuts = jeu sémantique fermé (une couleur = un sens).
      C2 état vide = titre + explication + action de sortie.
      C3 résumé d'erreurs en haut de page, entrées cliquables vers le champ.
      C4 aide sous le libellé avant le champ ; hiérarchie de boutons explicite.
    comportement: >
      B1 trois états par vue de données (chargement / vide / erreur).
      B2 après chaque action : ce qui s'est passé ET ce qui suit.
      B3 parcours au clavier seul ; écran de revue utilisable à une main.
  frontiere: >
    Fixe un niveau de complétude et de guidage. N'autorise PAS la reproduction
    de l'identité visuelle, des illustrations, de la voix rédactionnelle ni des
    gabarits d'Atlassian ou de GOV.UK. La charte du client (ici Client-A, vert
    #1E7A46) prime et reste la contrainte de forme.
  justification: >
    Atlassian matche exactement la cible (application métier à workflows, tableaux
    denses, statuts — Jira gère des approbations) ; GOV.UK est la référence de la
    réussite de tâche sans formation, ce qui adresse le déficit d'apprenabilité.
  statut: ok
```

> Les deux **premières** entrées ci-dessus sont des **amorces de cible**, pas des barres :
> aucune référence n'a été choisie ni testée. Les champs vides sont vides
> volontairement — aucune valeur n'est inventée pour faire nombre.

- cible: forge/discipline data — verbe tracer (data lineage exigible)
  reference: OpenLineage — object model (spec ouverte)
  localisateur: https://openlineage.io/docs/spec/object-model
  test_existence: PASS — HTTP 200, 30 794+ octets (exécuté le 11/08/2026)
  niveaux:
    structure: un lineage complet déclare run · job · datasets d'entrée · datasets de sortie
    vocabulaire: facets nommées (schéma, horodatage, source) — champs obligatoires, pas de prose
    artefacts: événements/déclarations machine-lisibles, pas de documentation rédigée à part
    comportement: toute donnée servie sans cette déclaration = défaut détectable (verdict binaire)
  frontiere: fixe le NIVEAU de complétude du lineage ; interdit de réimplémenter ou copier la spec — on mesure notre exigence à son modèle
  justification: standard ouvert de référence du lineage — définit « complet » mieux que toute intuition maison
  statut: ok (validée humain, 11/08/2026 — pré-vol TF-0083)

- cible: forge/discipline data — verbe profiler (qualité de données exécutable)
  reference: Great Expectations (great_expectations)
  localisateur: https://github.com/great-expectations/great_expectations
  test_existence: PASS — HTTP 200 (exécuté le 11/08/2026)
  niveaux:
    structure: la qualité s'exprime en assertions déclaratives unitaires (une attente = un contrôle)
    vocabulaire: chaque assertion nomme colonne/objet, condition, seuil — jamais « données propres »
    artefacts: suites d'assertions versionnées + documentation générée depuis les assertions
    comportement: verdict machine par assertion (PASS/FAIL), exécutable sur fixture
  frontiere: fixe le NIVEAU « qualité = assertions exécutées » ; on compose data-quality-auditor, on ne réécrit pas GE
  justification: référence du domaine pour la qualité testable — le contraire exact des bonnes intentions en prose
  statut: ok (validée humain, 11/08/2026 — pré-vol TF-0083)

- cible: forge/discipline data — verbe restituer (reporting sourcé, doc générée)
  reference: dbt-core (dbt-labs)
  localisateur: https://github.com/dbt-labs/dbt-core
  test_existence: PASS — HTTP 200 (exécuté le 11/08/2026)
  niveaux:
    structure: tout artefact servi déclare ses dépendances (ref/source) — le DAG se déduit des déclarations
    vocabulaire: sources nommées et datées ; un chiffre sans source déclarée n'existe pas
    artefacts: documentation et graphe générés DEPUIS les déclarations, jamais rédigés à part
    comportement: tests as code attachés aux modèles, rejoués à chaque changement
  frontiere: fixe le NIVEAU « déclaré → généré » ; on n'importe pas dbt dans la forge, on exige sa discipline
  justification: la discipline sources-déclarées/doc-générée est l'état de l'art du reporting traçable
  statut: ok (validée humain, 11/08/2026 — pré-vol TF-0083)

- cible: surface d'entrée agent d'un dépôt (AGENTS.md, en-tête README pour agents IA)
  reference: Standard AGENTS.md
  localisateur: https://agents.md/
  test_existence: PASS — HTTP 200, 65 536+ octets (exécuté le 12/08/2026)
  niveaux:
    structure: un AGENTS.md unique à la racine, Markdown pur, sections courtes orientées action (setup, commandes, conventions) ; le README humain reste distinct
    vocabulaire: instructions impératives et exécutables (commandes réelles à coller), chemins réels — pas de prose descriptive
    artefacts: chaque commande ou fichier cité existe dans le dépôt et se vérifie (pas de promesse sans fichier)
    comportement: une session agent froide n'ayant que l'URL du dépôt atteint l'état opérationnel sans autre information
  frontiere: fixe le NIVEAU d'exécutabilité à froid ; n'impose ni ne copie le contenu d'un AGENTS.md tiers
  justification: standard multi-éditeurs (OpenAI, Google, Sourcegraph, Cursor…) — définit « lisible par un agent » mieux que toute convention maison
  statut: ok (validée humain, 12/08/2026 — pré-vol campagne catalogues & prompts pilot)

- cible: prompt d'usage une-deux lignes (collage à froid, outil auto-installant)
  reference: rustup.rs (installeur Rust)
  localisateur: https://rustup.rs/
  test_existence: PASS — HTTP 200, 12 962+ octets (exécuté le 12/08/2026)
  niveaux:
    structure: le prompt tient en 2 lignes ; détection, installation, mise à jour et suite vivent côté outil/dépôt, jamais dans le prompt
    vocabulaire: zéro placeholder technique — l'unique variable est l'intention de l'utilisateur
    artefacts: la même commande sert l'installation ET la mise à jour (idempotence) — coller sur un poste déjà équipé ne casse rien
    comportement: auto-détection de l'état du poste, fin observable (« Poste prêt »), aucune édition humaine avant collage
  frontiere: fixe le NIVEAU d'autonomie à froid et d'idempotence ; ne reproduit ni le site ni la mécanique shell de rustup
  justification: la référence du « une ligne collée, l'outil s'auto-installe et se configure » — exactement le niveau visé par « Utilise <URL> pour… »
  statut: ok (validée humain, 12/08/2026 — pré-vol campagne catalogues & prompts pilot)

- cible: dashboard HTML de résultats de tests (autonome, dérivé d'un rapport JSON)
  reference: Allure Report — démo publique
  localisateur: https://demo.allurereport.org/ (doc : https://allurereport.org/docs/)
  test_existence: PASS — HTTP 200 sur démo et doc (exécuté le 13/08/2026, 4/4 candidats testés)
  niveaux:
    structure: une vue d'ensemble unique (statuts agrégés en x/y + %), navigation par regroupements métier (comportements/features ≈ pans), détail par test atteignable en ≤ 2 clics depuis n'importe quel agrégat
    vocabulaire: statuts = jeu sémantique FERMÉ (passed/failed/broken/skipped ≈ OK/KO/cassé/non joué), chacun pictogramme + libellé + couleur — jamais la couleur seule ; tout agrégat = nombre + total + %
    artefacts: catégories de défauts (classes d'échec) avec comptes et liens vers les tests concernés ; tendance multi-runs quand l'historique existe ; détail de test avec étapes, durée, données et pièces jointes
    comportement: TOUT agrégat (KPI, part de donut, catégorie, ligne de tendance) est cliquable et mène à la liste filtrée correspondante ; listes filtrables et cherchables ; l'historique explique la progression, pas seulement l'instantané
  frontiere: fixe le NIVEAU d'explorabilité (agrégat → liste filtrée → détail) et de complétude ; n'autorise pas la copie de l'UI ou de l'identité d'Allure — la charte Digit-AI et les standards R-30/E4/H priment ; toute donnée affichée trace au rapport JSON (G-6), donnée manquante = générateur à étendre, jamais une invention du gabarit
  justification: la référence du genre pour les rapports de tests explorables — même contrainte que la nôtre (rapport statique généré depuis les résultats), démo publique inspectable
  statut: ok (validée humain, 13/08/2026 — pré-vol campagne TF-0153 étendue)

- cible: catalogue de services machine-lisible (source unique + vues générées)
  reference: Backstage Software Catalog — descriptor format (Spotify/CNCF)
  localisateur: https://backstage.io/docs/features/software-catalog/descriptor-format/
  test_existence: PASS — HTTP 200, 65 536+ octets (exécuté le 12/08/2026)
  niveaux:
    structure: une entité = un enregistrement déclaratif dans une source structurée unique et versionnée ; les vues sont générées, jamais éditées
    vocabulaire: champs obligatoires nommés — id stable, type, cycle de vie (experimental|production|deprecated), relations déclarées ; « owner » écarté ici (écosystème mono-mainteneur : la forge est le propriétaire)
    artefacts: catalogue machine-lisible validable par schéma (équivalent maison : oracle-catalogues.mjs)
    comportement: entité orpheline ou sans preuve détectable mécaniquement ; les relations (service → point d'entrée) sont déclarées, pas déduites
  frontiere: fixe le NIVEAU de structuration et de validabilité ; on n'importe pas Backstage, on mesure notre format à son modèle
  justification: l'état de l'art du catalogue de services déclaratif à vues générées — même discipline source/vue que TODO-FORGE
  statut: ok (validée humain, 12/08/2026 — pré-vol campagne catalogues & prompts pilot)

- cible: page / interface web générée par un agent (landing, portfolio, refonte)
  dimension: absence de généricité (« anti-slop ») — le niveau de finition qui distingue une page conçue d'une page recrachée
  reference: taste-skill (Leonxlnx) — variante skills/taste-skill, frontmatter name design-taste-frontend
  localisateur: https://github.com/Leonxlnx/taste-skill
    (texte lu : https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/skills/taste-skill/SKILL.md)
  test_existence: PASS — HTTP 200, text/html, 65 536+ octets (exécuté le 14/08/2026, 1/1 référence atteignable)
  niveaux:
    structure: >
      Le hero tient dans la fenêtre initiale — titre ≤ 2 lignes au bureau, sous-texte
      ≤ 20 mots ET ≤ 4 lignes, action principale visible sans défilement ; padding haut
      du hero plafonné. La navigation tient sur UNE ligne au bureau, hauteur ≤ 80 px.
      Mise en page par grille déclarée, jamais par arithmétique de pourcentages.
      Une famille de gabarit de section ne se répète pas : le zigzag image/texte est
      plafonné à 2 sections consécutives, une grille a exactement autant de cellules
      que d'items (aucune cellule vide de remplissage).
    tokens: >
      UNE couleur d'accent, verrouillée sur toute la page (pas d'accent qui change en
      section 7), saturation bornée sous 80 % ; bases neutres plutôt que le violet-bleu
      réflexe. Ni noir pur ni blanc pur. UNE seule échelle de rayon par page. Échelle
      typographique déclarée : titres resserrés, corps borné en longueur de ligne
      (≈ 65 caractères) ; les familles de polices réflexes sont écartées par défaut et
      un serif ne s'emploie que sur justification explicite.
    composants: >
      La carte n'est employée que quand l'élévation porte une hiérarchie réelle, sinon
      regroupement par filets sobres ou par l'espace. JAMAIS bordure haute ET basse sur
      chaque ligne d'une liste ou d'un tableau : un seul filet, employé avec parcimonie ;
      au-delà de ~5 items, une liste brute n'est pas la bonne forme. Ombres teintées à
      la teinte du fond, jamais du noir pur. Libellé de bouton tenant sur une ligne,
      contraste AA vérifié sur chaque bouton et chaque champ ; libellé au-dessus du
      champ, jamais le placeholder en guise de libellé. États vide, chargement et
      erreur fournis, pas sous-entendus.
    comportement: >
      Toute animation porte une intention nommée (hiérarchie, narration, retour d'action,
      changement d'état) — « ça faisait joli » n'en est pas une ; du mouvement annoncé est
      du mouvement réellement rendu. `prefers-reduced-motion` respecté dès qu'il y a du
      mouvement. Animation limitée à transform et opacity. Pas d'écouteur de défilement
      appelé à chaque image. Cibles de performance déclarées : LCP < 2,5 s, INP < 200 ms,
      CLS < 0,1.
  frontiere: >
    Importe un NIVEAU d'exigence sur la finition d'une page générée. N'autorise NI la
    copie du gabarit, NI la reprise de l'identité visuelle, NI l'emprunt de la voix
    d'auteur de la référence — on mesure notre exigence à la sienne, on ne la reproduit
    pas. Deux réserves portées au clair : la référence prescrit des ressources chargées
    par le réseau (picsum.photos, cdn.simpleicons.org) que la règle A1 du socle interdit
    et que check_html.py refuse en FAIL bloquant, et une pile applicative imposée
    (Next.js, Tailwind v4, Motion, GSAP) qui heurte la neutralité du socle. Ces deux
    familles de prescriptions sont HORS de la barre : elles ne font pas partie du niveau
    importé. La charte Digit-AI et l'autonomie réseau priment et restent la contrainte
    de forme.
  justification: >
    La référence traite exactement la cible — le rendu générique d'une page produite par
    un agent — et la traite en règles binaires localisables plutôt qu'en intentions, ce
    qui la rend décomposable en critères vérifiables ; le dépôt est public, inspectable
    et lu (consultation du 14/08/2026), et son verdict d'admission est déjà tranché :
    référence de niveau, jamais outil installé (étude d'opportunité du 14/08/2026, O3).
  statut: ok (validée humain, 14/08/2026 — mandat « point 5 : a traiter ». ÉCART DÉCLARÉ :
    la validation est venue d'un mandat de liste, pas du tour dédié que prévoit le pas 5 du
    protocole. L'humain a vu la référence, sa dimension et sa frontière avant de trancher ;
    la barre n'est PAS auto-validée, mais elle n'a pas eu son tour propre — dit, pas tu.)
    barre rédigée sous mandat TF-0198, elle ne s'auto-valide pas)

# ---- Lot L2 de l'étude d'opportunité du 07/09/2026 (TF-0859, mandat D-5 a) : quatre barres
# ---- pour une mission data Silver/Gold sur Databricks puis rapports Power BI. Pas 1 à 4 et 6
# ---- joués le 07/09/2026 (test d'existence : 12/12 candidats atteignables, HTTP 200, exécuté
# ---- par scripts/test_existence.py --liste) ; le pas 5 — validation humaine en un tour, non
# ---- sautable — a eu lieu le 07/09/2026 (décision D-6 option (a) du pilot, tour dédié).
# ---- La référence RECOMMANDÉE est celle de l'entrée ; les candidats survivants sont nommés.

- cible: forge/discipline data — verbe modéliser (modèle dimensionnel de la couche Gold)
  reference: Kimball Group — Dimensional Modeling Techniques (les 34 techniques, dont bus matrix, grain, dimensions conformes, clés de substitution, dimension date, changements lents)
  localisateur: https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/
  candidats_survivants: >
    (1) la page ci-dessus (recommandée : c'est la source primaire, structurée technique par
    technique) ; (2) https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/
    (page mère, plus large) ; (3) https://learn.microsoft.com/en-us/power-bi/guidance/star-schema
    (transposition au modèle sémantique Power BI — utile en complément, pas en barre : elle
    dérive de Kimball et ne le remplace pas)
  test_existence: PASS — HTTP 200, text/html, 65 536+ octets sur les trois candidats (exécuté le 07/09/2026)
  niveaux:
    structure: chaque table de faits déclare son GRAIN en une phrase avant toute mesure ; les dimensions sont CONFORMES (une dimension partagée = une seule définition) ; une matrice en bus (processus métier × dimensions) précède le modèle
    vocabulaire: clé de substitution par dimension, distincte de la clé naturelle ; type de changement lent (1, 2, 3…) déclaré par dimension ; dimension date contiguë au grain jour, jamais dérivée à la volée
    artefacts: le modèle est un artefact déclaratif inspectable (faits, dimensions, grains, relations) dont le dessin se génère — jamais un dessin seul
    comportement: un fait sans grain, une dimension partagée définie deux fois, une dimension date trouée = défaut détectable à verdict binaire
  frontiere: fixe le NIVEAU de rigueur dimensionnelle de la couche Gold ; n'impose ni n'importe l'outillage Kimball, ne copie aucun texte — on mesure le format `forge-data/modele-dimensionnel@1` à ses techniques
  justification: STANDARDS-DATA.md de forge-data retient Kimball comme référence de modélisation depuis le 11/08/2026 « sans oracle » ; ADR0801 de forge-audit (invariante) exige un modèle sémantique gouverné en étoile — la barre nomme la source que les deux citent
  statut: ok (validée humain, 07/09/2026 — décision D-6 option (a) « 6a », tour dédié au pas 5 : les quatre références recommandées retenues telles quelles, candidats survivants conservés en mémoire de choix)

- cible: forge/discipline data — verbe transformer (projet de transformation Silver/Gold sous tests)
  reference: dbt-core (dbt-labs) — discipline ref/source, tests attachés aux modèles, documentation générée
  localisateur: https://github.com/dbt-labs/dbt-core
  candidats_survivants: >
    (1) dbt-core (recommandée : déjà barre du verbe restituer au registre, même référence pour
    une autre cible et d'autres niveaux — la forme d'un projet de transformation est stable de
    dbt Core 1.10 à dbt Fusion, cf. feuille de route 2025-05) ;
    (2) https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview (structure
    staging → intermediate → marts, complément de niveau, pas une barre à part) ;
    (3) https://github.com/TobikoData/sqlmesh (alternative crédible ; écartée comme barre
    parce que moins répandue et que sa discipline recoupe celle de dbt)
  test_existence: PASS — HTTP 200 sur les trois candidats (exécuté le 07/09/2026)
  niveaux:
    structure: un projet = des modèles SQL/déclaratifs organisés par couche (source brute → conformée → métier), chaque modèle déclarant ses dépendances par `ref`/`source` — le DAG se déduit, il ne se dessine pas
    vocabulaire: chaque modèle porte une description et au moins un test (unicité, non-nullité, valeurs acceptées, relation) ; les sources sont nommées et datées
    artefacts: documentation et graphe GÉNÉRÉS depuis les déclarations ; sortie de tests archivée machine-lisible
    comportement: un modèle sans test, une dépendance non déclarée, une documentation écrite à la main = défaut détectable
  frontiere: fixe le NIVEAU de discipline d'un projet de transformation ; n'importe pas dbt dans la forge, n'impose pas son moteur — la forme est exigée, l'outil est celui du projet (dbt, SQL Delta, notebooks)
  justification: seule discipline de transformation à la fois ouverte, inspectable et devenue lingua franca (dbt Core 1.10 du 2025-06-16, Fusion en préversion depuis 2025-08-20) ; ADR0803 de forge-audit exige la logique « testée et versionnée au plus près de la source »
  statut: ok (validée humain, 07/09/2026 — décision D-6 option (a) « 6a », tour dédié au pas 5 : les quatre références recommandées retenues telles quelles, candidats survivants conservés en mémoire de choix)

- cible: modèle sémantique Power BI — règles de bonnes pratiques (jugement sur fichiers)
  reference: TabularEditor/BestPracticeRules — collection officielle de règles du Best Practice Analyzer (JSON)
  localisateur: https://github.com/TabularEditor/BestPracticeRules
  candidats_survivants: >
    (1) TabularEditor/BestPracticeRules (recommandée : règles en JSON, inspectables une à une,
    exécutables en ligne de commande — `TabularEditor.exe -A` ou `te bpa run`) ;
    (2) https://github.com/microsoft/Analysis-Services/tree/master/BestPracticeRules (collection
    Microsoft, même format, complément) ;
    (3) https://docs.tabulareditor.com/te2/Best-Practice-Analyzer.html (documentation du
    mécanisme, pas une collection de règles — écartée comme barre)
  test_existence: PASS — HTTP 200 sur les trois candidats (exécuté le 07/09/2026)
  niveaux:
    structure: relations actives et non ambiguës, une seule table de dates marquée, pas de colonne de clé visible, pas de table isolée
    vocabulaire: chaque mesure a un format et une description ; aucune mesure dupliquée ; noms sans préfixe technique ; une mesure n'est jamais une colonne calculée quand une mesure suffit
    artefacts: le modèle est lu depuis ses fichiers (TMDL) ; chaque règle a un identifiant, une sévérité, une expression vérifiable
    comportement: une violation de sévérité erreur bloque la publication ; le verdict est rendu à chaque commit, pas à la revue
  frontiere: fixe le NIVEAU de qualité d'un modèle sémantique ; n'importe pas Tabular Editor dans la forge (le point de terminaison XMLA et la version payante restent au projet) — l'oracle de forge-audit lit les fichiers et rejoue les règles qu'il peut, en déclarant celles qu'il ne rejoue pas
  justification: le profil `powerbi` de forge-audit cite déjà « les règles Best Practice Analyzer (Tabular Editor) » comme moyen de vérification (CTL-D16-02) ; la collection est la seule liste de règles ouverte et maintenue du domaine
  statut: ok (validée humain, 07/09/2026 — décision D-6 option (a) « 6a », tour dédié au pas 5 : les quatre références recommandées retenues telles quelles, candidats survivants conservés en mémoire de choix)

- cible: projet Power BI en formats texte versionnables (PBIP / TMDL) — format de dépôt du modèle sémantique et des rapports
  reference: Microsoft Learn — Power BI Desktop projects (PBIP), vue d'ensemble et dossier du modèle sémantique
  localisateur: https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview
  candidats_survivants: >
    (1) projects-overview (recommandée : définit le format de projet, ses dossiers et ce qui est
    versionnable) ; (2) https://learn.microsoft.com/en-us/analysis-services/tmdl/tmdl-overview
    (spécification du langage TMDL, complément indispensable — retenue comme second
    localisateur de la même barre, pas comme barre séparée) ;
    (3) https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset (dossier
    du modèle sémantique dans un projet, détail)
  test_existence: PASS — HTTP 200 sur les trois candidats (exécuté le 07/09/2026)
  niveaux:
    structure: un projet = un dossier `.SemanticModel` (définition TMDL : tables, relations, mesures, rôles, un fichier par table) et un dossier `.Report` (définition PBIR), sans binaire ; chaque objet est un fichier texte diffable
    vocabulaire: TMDL est le format par défaut du modèle depuis sa disponibilité générale (2025-09) ; les propriétés d'un objet sont déclaratives et nommées
    artefacts: le dépôt git porte le projet entier ; aucune définition ne vit seulement dans l'application
    comportement: un modèle qui n'existe qu'en PBIX (binaire) n'est pas versionnable ni jugeable par un agent — défaut détectable
  frontiere: fixe le NIVEAU « le modèle sémantique est du texte versionné » ; n'impose aucune version de Power BI Desktop, ne copie aucun contenu de la documentation
  justification: condition posée par l'analyse L99 du 07/09/2026 pour qu'un verbe soit exerçable par un agent (formats texte, lignes de commande, API) ; sans ce format, les oracles M4 et M6 de l'étude n'ont rien à lire
  statut: ok (validée humain, 07/09/2026 — décision D-6 option (a) « 6a », tour dédié au pas 5 : les quatre références recommandées retenues telles quelles, candidats survivants conservés en mémoire de choix)

# ---- TF-1028 (17/09/2026) : barre externe « publication réseau ». Pas 1 à 4 joués le
# ---- 17/09/2026 (test d'existence : 4/4 candidats atteignables, HTTP 200, exécuté par
# ---- scripts/test_existence.py --liste) ; niveaux décomposés (pas 6) en anticipation. Le
# ---- pas 5 — validation humaine en un tour, non sautable — a eu lieu le 17/09/2026
# ---- (décision D-4 option (a)) : statut ok.

- cible: >
    publication réseau professionnelle (LinkedIn), 150 à 300 mots — deux écritures : profil
    d'une personne (première voix) et page d'une organisation (voix de marque)
  reference: >
    Paire — LinkedIn Top Voices (programme éditorial officiel de LinkedIn, corpus nommé et
    daté d'exemples reconnus) pour l'écriture profil ; LinkedIn Pages Best Practices
    (recommandations officielles de LinkedIn pour les organisations) pour l'écriture page.
    Complément transversal de structure : LinkedIn Help — « Tips for writing articles on
    LinkedIn » (bornée : porte sur les articles longs, pas les posts courts — seule sa
    discipline de structure et de voix est importée, jamais sa longueur).
  candidats_survivants: >
    (1) https://www.linkedin.com/help/linkedin/answer/a776208 — « LinkedIn Top Voices »,
    critères de sélection (recommandée, écriture profil) ; test le 17/09/2026, HTTP 200,
    41 343+ octets, page datée « Last updated: 8 months ago » (relatif — texte exact relevé
    dans le HTML). (2) https://www.linkedin.com/news/story/meet-the-linkedin-top-voices-class-of-january-2026-6924764/
    — classe nommée « Top Voices » du 27/01/2026 (métadonnée `datePublished:
    2026-01-27T20:13:10.955Z`), auteure Devin Banerjee sous LinkedIn News (rédacteur en chef
    Daniel Roth) — exemple concret cité, post de Kim Scott, corpus illustratif de la même
    référence (1), pas une barre à part ; test le 17/09/2026, HTTP 200, 65 536+ octets.
    (3) https://business.linkedin.com/marketing-solutions/linkedin-pages/best-practices
    (recommandée, écriture page) — datée « © LinkedIn Corporation 2026 » (texte exact relevé,
    aucune date de mise à jour plus précise trouvée) ; test le 17/09/2026, HTTP 200,
    65 536+ octets. Retenue UNIQUEMENT pour ses éléments d'identité et de format (image de
    couverture, mise en avant des salariés) — ses statistiques d'engagement non sourcées
    (« 2x », « 5x », « 24x ») sont explicitement HORS barre, voir frontière. (4)
    https://www.linkedin.com/help/linkedin/answer/a516913 — « Tips for writing articles on
    LinkedIn » — datée « Last updated: 3 years ago » (texte exact relevé) ; test le
    17/09/2026, HTTP 200, 45 569+ octets. Retenue en complément transversal pour sa
    discipline de structure (un seul sujet, opinion assumée, en-tête écrit en dernier) ;
    écartée comme barre autonome car elle vise les articles longs (600-1 200 mots selon la
    page), hors du format court demandé (150-300 mots).
  test_existence: python scripts/test_existence.py --liste candidats.txt (4 candidats)
  dernier_test: 2026-09-17 — PASS (4/4 références atteignables, HTTP 200, exécuté par
    scripts/test_existence.py --liste, exit 0)
  niveaux:
    structure: >
      S1 la première phrase porte, à elle seule, le sujet ET l'intérêt du post — fondé sur
      (4) : « Write the headline last… find the sharpest sentence in the whole thing, then
      ask whether it belongs at the top ». S2 un seul sujet par post, aucune juxtaposition de
      sujets — fondé sur (4) : « Keep your writing focused. Avoid covering too many topics in
      the same article ». S3 longueur 150 à 300 mots — DONNÉE PAR LE MANDAT de cette entrée
      (cible demandée), non issue d'une référence testée ; à dire tel quel, jamais fondue dans
      la barre comme si elle était sourcée. S4 clôture qui appelle une réponse (question ou
      invitation explicite) — fondé sur (4), structure attendue « introduction → implications
      → solutions et un appel à l'action ».
    vocabulaire: >
      V1 un fait concret nommé (chiffre, exemple vécu, référence datée) plutôt qu'une
      généralité — fondé sur (1) : « professional topics, including specific industry
      insights, news analysis and knowledge that can inform others ». V2 aucun remplissage :
      chaque phrase apporte une information neuve, pas un lieu commun — fondé sur (2), post
      cité de la classe de janvier 2026 : « Share what they're still figuring out, not just
      what worked once ». V3 mention de transparence si le texte est généré ou assisté par
      IA, conforme à la règle de marque de l'émetteur — fondé sur `references\PLATEFORME-LINKEDIN.md`
      §3 du pilot (obligation datée du 2026-08-02, article 50 du règlement européen sur l'IA ;
      lignes directrices de la Commission mises à jour le 2026-08-06) — référence interne au
      pilot, distincte des quatre candidats web, citée telle quelle.
    artefacts: >
      A1 écriture profil = première personne assumée, une opinion exprimée depuis une
      expérience nommée — fondé sur (4) : « Don't shy away from expressing your opinion » et
      sur (2), post Kim Scott : « Say the hard thing with care ». A2 écriture page = voix de
      marque cohérente, l'organisation nommée comme sujet, jamais un porte-parole anonyme, un
      élément d'identité visible (logo ou image de couverture) quand le format le permet —
      fondé sur (3) : « cover image to bring your Page to life ». A3 la page nomme des
      personnes réelles de l'organisation plutôt qu'un « nous » désincarné, quand le sujet s'y
      prête — fondé sur (3) : « employees to humanize your brand », « personalized
      shout-outs from your Page ».
    comportement: >
      B1 le post reste lisible et complet indépendamment de tout lien externe : le lien n'est
      jamais la seule source du fait annoncé (déduit de S1/V1, pas d'une référence à part). B2
      le choix profil vs page est déclaré avant rédaction et gouverne A1/A2 — pas de mélange
      des deux voix dans un même post.
  frontiere: >
    Fixe le NIVEAU d'un post court professionnel (accroche, un fait, une voix, une clôture) —
    n'autorise NI la copie du contenu, NI la reproduction de l'identité de marque LinkedIn, NI
    l'emprunt de la voix d'un Top Voice nommé : on mesure l'exigence à son corpus, on ne le
    recopie pas. EXPLICITEMENT HORS barre (exclusion tenue de `references\PLATEFORME-LINKEDIN.md`
    §4 du pilot, dernière partie, qui refuse tout recueil de « règles d'algorithme » sans
    source primaire datée) : heure de publication idéale, fréquence hebdomadaire optimale,
    nombre de hashtags, emplacement des liens, et les multiplicateurs d'engagement non
    sourcés de (3) (« 2x », « 5x », « 24x » — LinkedIn ne publie pas la méthodologie derrière
    ces chiffres). La fourchette de longueur en articles de (4) (600-1 200 mots) n'est pas
    transposée au post court : seule sa discipline de structure l'est. La charte de voix déjà
    définie par l'émetteur, le cas échéant, prime et reste la contrainte de forme.
  justification: >
    Les deux références recommandées adressent chacune une des deux écritures demandées.
    LinkedIn Top Voices est le programme par lequel LinkedIn — l'opérateur de la plateforme,
    organisation publique citée comme source — désigne publiquement, par nom et par date, les
    publications qu'il reconnaît comme incarnant la voix personnelle professionnelle
    (sélection par son équipe éditoriale, direction Daniel Roth) : un corpus cité en exemple
    par une source nommée, au sens exact du protocole. LinkedIn Pages Best Practices est la
    recommandation officielle de LinkedIn pour l'écriture d'une organisation. Aucune des deux
    n'est un recueil de règles d'algorithme sans méthode : (1)+(2) documentent des critères de
    sélection éditoriaux (qualité, originalité, expertise) et un exemple nommé et daté ; (3)
    documente des éléments d'identité et de format, sa partie « performance » étant
    explicitement écartée de la barre (voir frontière). Aucun nom de personne privée n'entre
    au registre : LinkedIn (organisation) porte la référence ; l'exemple nommé (Kim Scott) est
    une autrice publique déjà mise en avant, par son nom, dans le corpus officiel et daté cité.
  statut: ok (validée humain, 17/09/2026 — décision D-4 option (a) « 4a », tour dédié au pas 5 : les quatre références retenues telles quelles, frontière conservée. Réserve dite par l'humain dans le même message : la barre ne couvre que LinkedIn ; d'autres réseaux demanderont leur propre entrée, jamais une extension par analogie)

# ---- Fusion du 20/09/2026 (décision humaine D-1 (b)) : le lot local du 14/09 ci-dessous portait
# ---- une troisième entrée « publication réseau B2B » en `todo` ; elle est retirée au profit de la
# ---- barre « publication réseau » ci-dessus, publiée et validée par l'humain le 17/09/2026.
# ---- Les deux entrées qui suivent n'ont pas d'équivalent publié et restent en `todo`.

# ---- Lot M8 de l'étude d'opportunité du 11/09/2026 (TF-1028, décision D-3 (a)) : trois barres
# ---- pour les livrables de COMMUNICATION, qui n'en avaient aucune (grep propale, communication,
# ---- marketing, pitch, LinkedIn : 0 au 11/09). Les oracles de propale jugent la forme et la
# ---- traçabilité, jamais le NIVEAU — précédent B1-B4 de forge-design (TF-0483). Pas 1 à 4 et 6
# ---- joués le 14/09/2026 ; test d'existence exécuté par scripts/test_existence.py le 14/09/2026.
# ---- LE PAS 5 N'A PAS EU LIEU : les trois entrées restent en `todo` et ne sont servies à aucun
# ---- consommateur (digit-ai-propale et digit-ai-communication en pré-vol, l'arbitre de
# ---- digit-ai-propale-review en ligne) tant que l'humain n'a pas retenu une référence par cible,
# ---- en un tour dédié. Candidats ÉLIMINÉS au pas 3, dits et non tus : NIAID Sample Applications
# ---- (HTTP 405 au script), apmp.org/page/BOK (404), open-grants sur GitHub (404),
# ---- applytosupply.digitalmarketplace (404).

- cible: propale privée (proposition commerciale de conseil, envoyée à un prospect)
  reference: Slideworks — « 14 Real Consulting Proposals », collection de propositions RÉELLES de cabinets de conseil — https://slideworks.io/resources/10-real-consulting-proposals-free-to-download
  candidats_survivants: >
    (1) Slideworks — « 14 Real Consulting Proposals » (https://slideworks.io/resources/10-real-consulting-proposals-free-to-download) :
    collection de propositions RÉELLES de cabinets de conseil, dont des propositions devenues
    documents publics après une consultation d'un organisme public (recommandé : ce sont des
    artefacts, pas des conseils) ; (2) Administrative Conference of the United States —
    « Consulting RFPs » (https://www.acus.gov/page/consulting-rfps) : consultations de conseil
    publiées avec leurs pièces, utile pour lire ce que l'acheteur demande en regard —
    ÉLIMINÉ le 21/09/2026 au pas 3 (HTTP 503 au script, 403 à curl avec un agent de navigateur :
    un FAIL élimine, il ne produit pas un « à vérifier ») ;
    (3) https://www.shipleywins.com/ et https://www.apmp.org/ (méthode de référence du métier de
    la proposition) — atteignables, mais ce sont des ORGANISATIONS, pas des artefacts : écartés
    comme barre, gardés comme source de méthode.
  test_existence: python scripts/test_existence.py https://slideworks.io/resources/10-real-consulting-proposals-free-to-download
  dernier_test: 2026-09-22 — PASS (1/1), rejoué au tour du pas 5 ; le 21/09/2026 : PASS (1/1, HTTP 200) ; le 14/09/2026 : PASS (2/2), le second candidat étant tombé depuis
  niveaux:
    structure: le problème du client ouvre le document, dans ses mots, avant toute présentation du cabinet ; le plan de travail est détaillé par phase (durée, livrables, jalons) ; le prix se lit en décomposition par phase ou par lot, jamais en un montant unique
    vocabulaire: chaque promesse est testable (un résultat, un délai, un indicateur) ; l'expérience citée est RATTACHÉE au projet visé, jamais un catalogue de références
    composants: une synthèse d'une page lisible seule ; des hypothèses et exclusions écrites ; l'équipe nommée avec son rôle sur la mission
    comportement: un lecteur décideur qui ne lit que la synthèse et la page de prix sait quoi signer, pour combien et pour quand
  frontiere: fixe le NIVEAU de rigueur et de complétude d'une propale ; n'autorise ni la reprise d'un gabarit, ni celle d'un texte, ni celle d'une identité de cabinet ; la charte (tokens-diapositives.css) et la grammaire commerciale de digit-ai-propale restent la contrainte de forme
  justification: validée au pas 5 — ce sont des propositions réelles de cabinets, inspectables, et non des guides d'écriture ; le niveau d'un livrable se mesure à un livrable
  statut: ok (validée humain, 22/09/2026 — décision D-8 option (a) « 8a », tour dédié au pas 5 : le seul survivant retenu tel quel ; le candidat éliminé au pas 3 reste nommé ci-dessus, en mémoire de choix)

- cible: mémoire technique de réponse à un appel d'offres public (trame imposée)
  dimension: réponse complète à une trame imposée, avec son issue
  reference: Open Grants — collection publique de propositions de financement réellement soumises, lauréates et non lauréates, publiées par leurs auteurs — https://www.ogrants.org/
  candidats_survivants: >
    (1) Open Grants (https://www.ogrants.org/) : collection publique de propositions de
    financement réellement soumises, lauréates et non lauréates, publiées par leurs auteurs
    (recommandé : ce sont des réponses complètes à des trames imposées, avec leur issue) ;
    (2) UK Digital Marketplace — G-Cloud (https://www.digitalmarketplace.service.gov.uk/g-cloud/search) :
    offres de services ADMISES au cadre d'achat public britannique, publiées avec leur document
    de définition de service ;
    (3) Observatoire économique de l'achat public, guide de décembre 2012, « Annexe 1 — Aide à
    la rédaction d'un mémoire technique » (pages 47 et suivantes), trouvé le 21/09/2026 sous deux
    miroirs : https://www.marche-public.info/wp-content/uploads/2020/05/exemple-memoire-technique-oeap.pdf
    (5 pages, l'annexe) et https://www.cclpa.fr/sites/cclpa.fr/files/inline-files/Exemple%20de%20trame%20de%20m%C3%A9moire%20technique.pdf
    (9 pages, l'objectif de la trame puis l'annexe). Source FRANÇAISE et OFFICIELLE de ce qu'un
    acheteur public attend, rubrique par rubrique. Réserves dites : c'est une TRAME commentée,
    pas une réponse rédigée ; elle vise un marché de TRAVAUX, pas une prestation intellectuelle ;
    elle date de 2012. Texte extrait et lu le 21/09/2026 (pypdf, 10 149 et 13 670 caractères).
    Réserve générale : (1) et (2) ne sont pas des mémoires de marché public français ; les
    mémoires lauréats français ne sont communicables qu'au cas par cas (confidentialité des
    offres), et aucune réponse RÉDIGÉE française ouverte n'a été trouvée, ni le 14/09 ni le 21/09.
    Proposition pour le pas 5 : DEUX entrées de même cible, une par dimension (RB-1) —
    dimension « réponse complète à une trame imposée, avec son issue » portée par (1), dimension
    « attente d'un acheteur public français, rubrique par rubrique » portée par (3).
  test_existence: python scripts/test_existence.py https://www.ogrants.org/ https://www.digitalmarketplace.service.gov.uk/g-cloud/search https://www.marche-public.info/wp-content/uploads/2020/05/exemple-memoire-technique-oeap.pdf https://www.cclpa.fr/sites/cclpa.fr/files/inline-files/Exemple%20de%20trame%20de%20m%C3%A9moire%20technique.pdf
  dernier_test: 2026-09-22 — PASS pour la référence de cette dimension (ogrants.org) et pour les deux miroirs de l'annexe de l'Observatoire, rejoués au tour du pas 5 ; le catalogue G-Cloud, candidat non retenu, n'a pas été rejoué ce jour ; le 21/09/2026 — PASS (4/4, HTTP 200) au second passage ; au premier passage du même jour, ogrants.org a rendu « injoignable : URLError » puis HTTP 200 quelques minutes après (script et curl) : panne passagère, dite et non tue. Le 14/09/2026 : PASS (2/2)
  niveaux:
    structure: chaque rubrique imposée par le règlement de consultation est reprise À L'IDENTIQUE et dans l'ordre ; chaque exigence du CCTP reçoit une réponse localisable (oracle-exigences-ao X1-X3)
    vocabulaire: la réponse reprend les termes de l'acheteur ; chaque engagement est chiffré ou daté ; aucune affirmation sans preuve jointe (référence, certificat, CV)
    composants: un tableau de conformité exigence → réponse → page ; des moyens humains nommés ; un planning et une méthode de pilotage
    comportement: un évaluateur retrouve la réponse à un critère de notation en moins d'une minute, sans lire le mémoire en entier
  frontiere: fixe le NIVEAU de conformité et de preuve ; n'autorise aucune reprise de texte d'une réponse tierce ; la trame imposée par l'acheteur prime sur la barre
  justification: validée au pas 5 — ce sont des réponses complètes à des trames imposées, publiées avec leur issue ; l'écart de juridiction est déclaré ci-dessus, et c'est pourquoi la seconde dimension, française, a sa propre entrée juste en dessous
  statut: ok (validée humain, 22/09/2026 — décision D-8 option (a) « 8a », tour dédié au pas 5 : la proposition retenue telle quelle, deux entrées de même cible, une par dimension (RB-1) ; celle-ci porte la réponse complète à une trame imposée)

- cible: mémoire technique de réponse à un appel d'offres public (trame imposée)
  dimension: attente d'un acheteur public français, rubrique par rubrique
  reference: Observatoire économique de l'achat public, guide de décembre 2012, « Annexe 1 — Aide à la rédaction d'un mémoire technique » (pages 47 et suivantes) — https://www.marche-public.info/wp-content/uploads/2020/05/exemple-memoire-technique-oeap.pdf (l'annexe, 5 pages) ; miroir : https://www.cclpa.fr/sites/cclpa.fr/files/inline-files/Exemple%20de%20trame%20de%20m%C3%A9moire%20technique.pdf (9 pages)
  test_existence: python scripts/test_existence.py https://www.marche-public.info/wp-content/uploads/2020/05/exemple-memoire-technique-oeap.pdf https://www.cclpa.fr/sites/cclpa.fr/files/inline-files/Exemple%20de%20trame%20de%20m%C3%A9moire%20technique.pdf
  dernier_test: 2026-09-22 — PASS (2/2), rejoué au tour du pas 5 ; le 21/09/2026 — PASS, texte extrait et lu (pypdf, 10 149 et 13 670 caractères)
  niveaux:
    structure: chaque rubrique que l'annexe attend d'un mémoire est traitée, dans l'ordre de la trame imposée par l'acheteur lorsqu'il en impose une ; une rubrique sans objet le dit en une ligne, elle ne disparaît pas
    vocabulaire: la réponse reprend les termes de l'acheteur ; chaque engagement est chiffré ou daté ; aucune affirmation sans preuve jointe (référence, certificat, CV)
    composants: un tableau de conformité exigence → réponse → page ; des moyens humains nommés ; un planning et une méthode de pilotage
    comportement: un évaluateur retrouve la réponse à un critère de notation en moins d'une minute, sans lire le mémoire en entier
  frontiere: fixe ce qu'un acheteur public FRANÇAIS attend de trouver, rubrique par rubrique ; n'autorise aucune reprise de texte ; la trame imposée par l'acheteur du marché visé prime toujours sur celle de l'annexe. Réserves écrites et tenues : c'est une TRAME commentée, pas une réponse rédigée ; elle vise un marché de TRAVAUX, pas une prestation intellectuelle ; elle date de 2012
  justification: validée au pas 5 — seule source française et officielle trouvée, deux fois, de ce qu'un acheteur public attend d'un mémoire ; aucune réponse rédigée française n'est ouverte, les mémoires lauréats n'étant communicables qu'au cas par cas
  statut: ok (validée humain, 22/09/2026 — décision D-8 option (a) « 8a », tour dédié au pas 5 : seconde entrée de la même cible, dimension française, telle que proposée le 21/09)
