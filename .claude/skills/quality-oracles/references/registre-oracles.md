# Registre des oracles de qualité par domaine

> **Vue humaine** (v2.13.0, alignée sur le JSON le 20/08/2026). Source machine (orchestrateur `scripts/run-oracles.mjs`) : `registre-oracles.json`.
> Un oracle = un contrôle **déterministe, exécuté, à verdict PASS/FAIL** (standard §3 du SKILL).
> Ce registre **grandit** : tout domaine sans oracle reçoit un oracle (standard §3) **remonté ici** (règle §4).
>
> Statut : ✅ exécutable · ⚙️ partiel · manuel · ❌ à outiller · 💤 dormant (6 mois sans usage journalisé — désactivé, conservé) · 🛑 broken (fixture verte cassée ou dépendance non résolue — réparer ou retirer).
> Champs M3 (23/07/2026) : `dernier_usage` dérivé des journaux `_oracles-journal*` par la passe d'hygiène `etat-forge` (jamais tenu à la main) ; `provenance` (chantier + date) obligatoire au manifest pour la fixture rouge de tout oracle créé à partir du 23/07/2026.

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Rendu HTML / visuel | `render_page.py` (digit-ai-page-html) — V1–V7 | cli (délégué) | ✅ |
| Conformité charte HTML (charte, sémantique, print) | `check_html.py` (digit-ai-page-html) — DOCTYPE, `lang="fr"`, charset prioritaire, viewport, `<h1>` unique, `:root`, `<title>`, `@media print`, police Syne interdite | cli (délégué) | ✅ |
| Filtres de colonne sur tableaux de données | `scripts/oracle-filtres-tableau.mjs <page.html>` — G1 marquage ou exemption motivée, G2 asset référencé, G3 initialisation, G4 id + thead, G5 compteur aria-live, G6 réaffichage à l'impression | cli | ✅ |
| Rendu PPTX (structure & compatibilité) | `scripts/oracle-pptx.mjs` — zip, [Content_Types].xml 1re entrée, zéro transition/JPEG, smoke-test LibreOffice ; charte sémantique → gate digit-ai-pptx | cli | ⚙️ |
| Accessibilité (WCAG structurel) | `scripts/oracle-a11y.py` — lang, alt, labels, titres, id, zoom (Playwright) | cli | ✅ |
| Performance / poids | `scripts/oracle-perf.mjs` — budgets poids/DOM/JS inline/refs | cli | ✅ |
| Format / livraison / versioning | `scripts/oracle-format.mjs` — UTF-8, ZIP, placeholders, autoportance | cli | ✅ |
| Code source | `scripts/oracle-code.mjs` — compilation `node --check`/`py_compile`/`tsc` | cli | ✅ |
| Sécurité / secrets | `scripts/oracle-secrets.mjs` — clés/tokens/PAT (+ gitleaks) | cli | ✅ |
| Sécurité : dépendances (SCA) | `scripts/oracle-sca.mjs` — pip-audit / npm audit / OSV | cli | ✅ |
| Sécurité : SAST (injection/exécution) | `scripts/oracle-sast.mjs` — injection SQL/commande, eval/exec, désérialisation (semgrep/bandit + repli) | cli | ✅ |
| Sortie LLM / IA générative | `scripts/oracle-llm.mjs` — schéma JSON (auto) + checklist véracité | cli | ⚙️ |
| Programme de formation (structure pédagogique) | `scripts/oracle-programme-formation.mjs` — C1 sommes de durées, C2 part de pratique déclarée, C3 couverture vs référence, C4 segment ≤ 50 min, C5 évaluation par bloc (.md/.docx) | cli | ✅ |
| Charte PPTX sémantique (sommaire, kicker, logos, footer) | `scripts/oracle-charte-pptx-semantique.mjs` — S1 bijection sommaire↔intercalaires, S2 kicker, S3 logos hors couverture/interlocuteurs, S4 footer+pagination | cli | ✅ |
| État de la forge (versions, couverture, fixtures, dormance) | `scripts/oracle-etat-forge.mjs versions-livrees.json [--restitution <fichier>]` — F1 versions montées vs livrées, F2 fixtures présentes, F3 corpus résolus, F4 ligne de couverture, F5 dormance | cli | ✅ |
| Traçabilité exigences AO → réponse | `scripts/oracle-exigences-ao.mjs <réponse.md> --exigences <référentiel>` — X1 exigences tracées, X2 rubriques à l'identique, X3 pièces livrées (invocation explicite par dossier) | cli | ✅ |
| Simulateur JS (KPI vs modèle de référence) | `scripts/oracle-simulateur-js.mjs <page.html> --attendus <json>` — J1 autoportance des libs, J2 KPI aux valeurs par défaut vs attendus à tolérance déclarée | cli | ✅ |
| Parité de migration (routes symétriques) | `scripts/oracle-parite-migration.mjs <routes.txt>` — P1 captures, P2 canonical/og normalisés, P3 domaine cible, P4 liens, P5 noindex ; verdict go/no-go | cli | ✅ |
| Inventaire de connecteurs (interop) | `scripts/oracle-inventaire-interop.mjs <inventaire.md>` — I1 colonnes obligatoires, I2 cellules renseignées, I3 vocabulaire fermé des statuts (établi sourcé / à vérifier / divergence datée), I4 doublons | cli | ✅ |
| Plan de mission (cohérence structurelle) | `scripts/oracle-plan-de-mission.mjs <plan.md>` — W1 deadlines, W2 dépendances acycliques, W3 critères de sortie, W4 chemin critique, **W5 registre de risques** (probabilite, impact, proprietaire, parade), **W6 parties prenantes** (role, attente, canal), **W7 mesures de succès** (cible, source) — W5-W7 ajoutés le 17/08/2026 (TF-0323) : l'échelle de cotation n'est pas arrêtée, la valeur est exigée non vide | cli | ✅ |
| CDC de cadrage (contrat de sortie) | `scripts/oracle-cdc-cadrage.mjs <cdc.md>` — C1 7 sections non vides, C2 inventaire exécuté ou arrêt déclaré, C3 verdicts RÉUTILISÉ/ÉTENDU/CRÉÉ, C4 ≥6 seuils chiffrés sans objectif de volume, C5 doublet surface+mutation, C6 noyau/adaptateurs et limite déclarée, C7 termes subjectifs comme critère, C8 marquage [FAIT]/[HYP], C9 zéro bloc de code, C10 questions indicées en fin | cli | ✅ |
| Post LinkedIn (contraintes de publication) | `scripts/oracle-post-linkedin.mjs <post.txt> [--fenetre 210]` — L1 longueur, L2 hook, L3 zéro URL, L4 Unicode Bold réversible, L5 hashtags 3-5 | cli | ✅ |
| Fiches prospection ICE (structure et classement) | `scripts/oracle-fiche-prospection-ice.mjs <diagnostic.html>` — K1 9 champs du skill, K2 bornes ICE 1-10, K3 classement = re-tri exécuté | cli | ✅ |
| Données / dataset | skill `data-quality-auditor` (profilage : complétude, cohérence, distributions, anomalies, model-readiness) | skill | ✅ |
| Schémas / diagrammes | skill `digit-ai-schemas` (marque paramétrable — un engagement client ne se forke plus) | skill | ✅ |
| Prompts | skill `prompt-analyzer-l99` | skill | ✅ |
| Versions de dépendances | `maj-versions.mjs` (kit RefAudit) | kit | ✅ |
| Conformité rapport d'audit | `verifier-rapport-audit.mjs` (kit RefAudit) — checks 1-10 | kit | ✅ |
| Clôture de remédiation | `verifier-remediation.mjs --status` (kit RefAudit) | kit | ✅ |
| Skill (audit) | skill `ameliore-un-skill` (grille /5 pondérée) + volet R1–R10 (`regles-oracles.md`) | skill | ✅ |
| Cohérence inter-documents | `oracle-coherence.mjs <dossier>` — divergences de grandeurs entre livrables (versions antérieures exclues) | cli | ✅ |
| Régression visuelle (golden diff) | `oracle-visual-diff.py` — captures vs goldens versionnés (masques, `--accepter` hors boucle) | cli | ✅ |
| Calculs / chiffres | `scripts/oracle-calculs.mjs` — re-somme exécutée des lignes Total des tables md/html (+ déclenchement par contenu) ; hors tables → recompute manuel | cli | ⚙️ |
| Traçabilité des affirmations chiffrées | `scripts/oracle-claims.mjs` — montant € sans source ni « à vérifier » = bloquant ; incohérence intra-document ; actif selon profil | cli | ⚙️ |
| Nommage / convention de livraison | `scripts/oracle-nommage.mjs` — convention du profil (**Q3-bis, 09/08/2026** : `<Projet> - <Objet> - AAAAMMJJ{a…}` — le nom du projet prime sur l'émetteur, le motif date + indice est le discriminant) ; nom ne se réclamant pas de la convention → SKIP | cli | ✅ |
| Jugement rédactionnel (LLM-juge externe) | `scripts/oracle-judge.mjs` — rubrique figée 5 axes via CLI claude ; AVIS OUTILLÉ, invocation explicite, jamais promu en verdict | cli | ⚙️ |
| Design généré : marqueurs de slop | `node c:/dev/digit-ai-forge-design/oracles/oracle-slop.mjs <page.html>` — S1 bandeau latéral > 1px, S2 texte en dégradé, S3 polices réflexes, S4 noir/blanc purs, S5 palette IA, S6 emojis, S7 grille clonée, S8 easing daté, S9 rayon uniforme, S10 sparkline décoratif ; déclenché par contenu (« Données de démonstration »), jamais sur toute page HTML | cli | ✅ |
| Système de marque : traçabilité des tokens | `node c:/dev/digit-ai-forge-design/oracles/oracle-tokens.mjs <page.html> [--tokens t.css]` — T1 couleur en dur, T2 police en dur, T3 échelle 4pt, T4 parité clair/sombre, T5 contraste ≥ 4.5:1 (paires opaques seulement), T6 chroma aux extrêmes | cli | ✅ |
| Mouvement : craft de l'animation | `node c:/dev/digit-ai-forge-design/oracles/oracle-motion.mjs <page.html>` — R1 `transition: all`, R2 entrée en `scale(0)`, R3 `ease-in` sur de l'UI, R4 durée > 300 ms sans justification déclarée, R5 `transform-origin: center` sur élément ancré, R6 propriété de layout animée, R7 survol animé sans `@media (hover: hover) and (pointer: fine)` ; dérivé de `review-animations` (Emil Kowalski, MIT) | cli | ✅ |
| Cible mobile : contrat d'usage tactile | `node c:/dev/digit-ai-forge-design/oracles/oracle-mobile.mjs <page.html>` — M1 viewport et zoom, M2 cibles ≥ 44 px, M3 safe-area-inset, M4 reflow des tables sous 768 px, M5 orientation paysage, M6 prefers-reduced-motion, M7 prefers-reduced-transparency | cli | ✅ |
| Visuels générés : traçabilité et budget | `node c:/dev/digit-ai-forge-design/oracles/oracle-images.mjs <page.html>` — I1 alt utile, I2 plafond unitaire, I3 plafond global 10 Mo, I4 zéro image réseau, I5 manifeste de génération, I6 complétude prompt/modèle/date | cli | ✅ |
| Corpus design : résolution des sources | `node c:/dev/digit-ai-forge-design/oracles/oracle-corpus.mjs <dossier>` — C1 colonnes, C2 cellules, C3 statuts, C4 unicité, C5 polices réflexes, C6 sources résolues, C7 monoculture inter-clients (invocation explicite par dossier) | cli | ✅ |
| Exigences produit : testabilité de l'énoncé | `node c:/dev/digit-ai-forge-conception/oracles/oracle-exigences.mjs <EXIGENCES.json>` — E1 champs obligatoires, E2 identifiant unique et non réaffecté, E3 critère chiffré avec unité ou binaire observable, E4 liste noire de termes subjectifs, E5 palier valide, E6 énoncé atomique | cli | ✅ |
| Traçabilité besoin ↔ exigence ↔ vue (référentiel de conception) | `node c:/dev/digit-ai-forge-conception/oracles/oracle-tracabilite.mjs <EXIGENCES.json> [--vue <fichier>]…` — T1 aucun orphelin des deux côtés, T2 exactement un critère, T3 vue alignée sur l'empreinte sha256 de sa source, T4 statut épistémique porteur de sa source | cli | ✅ |
| Couverture de la surface fonctionnelle | `node c:/dev/digit-ai-forge-conception/oracles/oracle-surface.mjs <EXIGENCES.json> [--seuil 95]` — S1 tout élément non couvert est NOMMÉ, S2 ratio publié avec sa liste, S3 lien de surface valide ou raison `hors_surface` | cli | ✅ |
| Affirmations chiffrées d'un référentiel d'exigences | `node c:/dev/digit-ai-forge-conception/oracles/oracle-claims.mjs <EXIGENCES.json>` — A1 chiffre d'un champ narratif tracé à une source ou marqué « à vérifier », A2 périmètre écarté déclaré (un chiffre de critère est une cible, pas une affirmation) | cli | ✅ |
| Dossier CAB (DOCX, template Client-A) | `scripts/oracle-dossier-cab.mjs <dossier.docx> [--depot AAAA-MM-JJ] [--couleur-titres RRGGBB]` — C1 sections du template, C2 tableau d'en-tête renseigné, C3 zéro placeholder, C4 sections non vides, C5 date du nom == date prévue, C6 règle Easyvista J+5, C7 numérotation Word (numId non partagé), C8 marqueurs [À COMPLÉTER] recensés, C9 couleur de titres de la charte | cli | ✅ |
| Nom de client dans un dépôt publiable | `scripts/oracle-nom-client-publie.mjs <dépôt|bundle> [--referentiel=<chemin HORS dépôt>]` — C1 contenus des fichiers suivis, C2 noms des fichiers suivis, C3 messages de commit de tout l'historique, C4 noms et contenus dans tout l'historique (fichiers retirés de l'arbre compris). Le référentiel des noms interdits est une **donnée vivant hors des dépôts publiés** — sans lui l'oracle rend SKIP, jamais PASS | cli | ✅ |
| ↳ *câblage* du contrôle ci-dessus | `scripts/installer-hamecon-publication.mjs <dépôt…> [--retirer] [--verifier]` — pose un `pre-push` qui REFUSE la publication sur FAIL **et sur SKIP** (un oracle qui ne mesure pas ne laisse pas passer) ; contournement explicite par `git push --no-verify`. Prouvé par `scripts/self-test-hamecon-publication.mjs` : 4 cas sur de vrais dépôts et de vrais push (porteur refusé, propre accepté, contournement effectif, référentiel absent refusé) | cli | ✅ |
## Oracles de la forge design (chantier forge-design, 04/08/2026)

Les cinq oracles ci-dessus vivent hors `~/.claude/skills` : leur source est
`c:/dev/digit-ai-forge-design/oracles/`, avec fixtures verte/rouge et self-test
(`node oracles/self-test.mjs` — 6 cas, 38 règles). Deux conséquences assumées :

- **Chemins absolus dans `cmd`.** Ils ne suivent pas la convention
  `{skillsroot}`/`{skilldir}` : ces oracles ne sont pas empaquetés dans un skill.
  Déplacer le dépôt casse l'invocation — la remonter ici le jour où ça arrive.
- **Déclenchement par contenu, pas par extension.** `ext` est vide et
  `content_patterns` exige le bandeau « Données de démonstration », obligatoire
  sur toute maquette. Sans ce garde-fou, `oracle-slop` S4 (noir et blanc purs)
  ferait échouer **chaque page chartée Digit-AI**, dont le boilerplate utilise
  `#FFFFFF`. Le conflit charte/S4 est documenté en tête de
  `c:/dev/digit-ai-forge-design/corpus/tokens-digit-ai.css` et reste ouvert.

## Orchestration
`node scripts/run-oracles.mjs <fichier|dossier>` lance les oracles **cli** dont l'extension matche, agrège un verdict, signale les domaines **skill/kit/manuel** touchés (action), et écrit un **journal** `<cible>.oracles.json`. Contrôle de **couverture** intégré.

## Ce que les oracles ✅ NE jugent PAS (à instruire à part)
- **Rendu** : V5 (croisements de flèches), V6 (images déformées) → inspection PNG.
- **a11y** : ruleset axe complet, contraste (→ render_page V2), navigation clavier.
- **perf** : temps de rendu réel / LCP sous charge (navigateur, non déterministe).
- **secrets** : SCA (→ oracle-sca), historique git.
- **LLM** : véracité factuelle (revue sourcée / recompute — loi §5), non-régression sans golden.

## Justification des oracles maison (R3 — standards avant maison)
- **oracle-a11y.py** (custom vs axe-core) : tourne avec les seules dépendances déjà exigées par la forge (Playwright/Chromium, requis par `render_page.py`), sans paquet npm supplémentaire ; l'audit axe-core complet est déclaré en `non_juge`, pas remplacé.
- **oracle-secrets.mjs** (custom vs gitleaks) : scanner intégré sans dépendance (Node seul) ; gitleaks est utilisé **en complément** s'il est installé, et son absence est signalée en `non_juge`.
- Les autres oracles CLI s'appuient sur les outils faisant foi (`node --check`, `py_compile`, `tsc`, pip-audit / npm audit / OSV) — pas de réimplémentation maison.

## Gouvernance
- Le registre est **versionné** (`version` du JSON). Le **self-test** (`scripts/self-test.mjs`) affiche la **couverture** (nombre d'oracles par statut) et rappelle les domaines sans oracle automatique.
- **Revue périodique** : faire passer les ❌/⚙️ → ✅ ; toute rencontre d'un domaine ❌ **déclenche la règle §4** (définir + remonter un oracle).

## Procédure de remontée d'un nouvel oracle (règle §4)
1. Oracle au **standard §3** (déterministe, checklist versionnée, artefact réel, PASS/FAIL localisant, déclare le non-jugé), sortie JSON commune.
2. Entrée dans **`registre-oracles.json`** (+ ligne dans ce tableau).
3. Si substantiel, **packager en skill** dédié.
4. Statut ❌/⚙️ → ✅ ; le self-test le valide.

## Oracles de la forge conception (chantier forge-conception, 04/08/2026 — enregistrés le 09/08/2026)

Les quatre oracles ci-dessus vivent hors `~/.claude/skills` : leur source est
`c:/dev/digit-ai-forge-conception/oracles/`, avec fixtures verte/rouge et self-test
(`node oracles/self-test.mjs` — 4 oracles, 14 règles, vert au 09/08/2026). Trois
conséquences assumées, alignées sur celles déjà consignées pour la forge design :

- **Chemins absolus dans `cmd`.** Même raison : ces oracles ne sont pas empaquetés
  dans un skill. Déplacer le dépôt casse l'invocation.
- **Déclenchement par contenu, pas par extension.** `ext` est vide et
  `content_patterns` exige la signature d'un référentiel (`"exigences": [`). Déclarer
  `.json` ferait juger *tout* fichier JSON par quatre oracles qui n'attendent qu'un
  `EXIGENCES.json`.
- **Artefact unique.** Les quatre jugent le même fichier sous quatre angles
  (énoncé, traçabilité, couverture, affirmations chiffrées) : un référentiel qui passe
  les quatre est celui que les forges aval peuvent consommer.

## Injection du 15/08/2026 — restitution lisible (TF-0235, v2.11.0-v2.11.1)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Restitution lisible : la page se conçoit pour ses lecteurs | `node c:/dev/digit-ai-forge-design/oracles/oracle-restitution.mjs <page.html> --json-only` — RL-1 vue d'ensemble (verdict, ≥ 3 KPI, navigation de vues), RL-3 KPI complets (valeur, définition, repère), RL-4 question des graphiques, RL-9 chemins de lecteurs, RL-10 manifeste d'écarts | cli | ✅ |

- **Périmètre déclaratif** : ne juge que les pages portant `data-restitution` ;
  les autres reçoivent SKIP motivé — jamais un FAIL sur une page hors périmètre.
- **Référentiel** : `c:/dev/digit-ai-forge-design/REFERENTIEL-RESTITUTION.md` ;
  RL-2/5/6/7/8 déclarées non jugées (socle L7, composant filtres G1-G6, rendu,
  revue D8 de critique-le-design, iso-contenu de campagne). Règle opposable : R-36
  (`REGLES-PROJET.md` §P du pilot).
- **v2.11.1** : `timeout_ms: 600000` posé sur les deux oracles claims — le budget
  par défaut de 120 s tuait `oracle-claims` sur les livrables de ~500 Ko (PASS en
  7 min lancé seul, constaté sur le rapport SEO Produit-02 du 15/08, TF-0239).