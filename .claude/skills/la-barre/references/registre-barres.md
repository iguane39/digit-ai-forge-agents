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
    gabarits d'Atlassian ou de GOV.UK. La charte du client (ici Nhood, vert
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
  statut: todo (pas 5 du protocole — validation humaine en un tour — NON exécuté ;
    barre rédigée sous mandat TF-0198, elle ne s'auto-valide pas)
