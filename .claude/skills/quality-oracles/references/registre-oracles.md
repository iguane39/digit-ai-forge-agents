# Registre des oracles de qualité par domaine

> **Vue humaine** (v2.16.0, alignée sur le JSON le 03/09/2026). Source machine (orchestrateur `scripts/run-oracles.mjs`) : `registre-oracles.json`.
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
| État de la forge (versions, couverture, fixtures, dormance) | `scripts/oracle-etat-forge.mjs versions-livrees.json [--restitution <fichier>] [--ledger <run.jsonl>]` — F1 versions montées vs livrées, F2 fixtures présentes, F3 corpus résolus, F4 ligne de couverture, F5 dormance, **F6 maquette validée avant le code d'une vue**, **F7 l'auteur du contrat de sortie n'est pas son exécutant** | cli | ✅ |
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
| Calculs / chiffres | `scripts/oracle-calculs.mjs` — re-somme exécutée des lignes Total des tables md/html (+ déclenchement par contenu) ; **N1 (TF-0718, 02/09/2026)** effectif annoncé en **chiffres OU en lettres** suivi d'un nom dénombrable, en tête d'une liste ou d'un tableau, rapproché du **cardinal réel** de l'ancre (identifiants distincts si la 1re colonne en porte) ; **N2** compte contradictoire pour le même nom dans le même document ; hors tables → recompute manuel ; **N3 (TF-0760, 02/09/2026)** un **pourcentage mesuré publié sans sa formule** écrite à côté (fraction, colonne de comptes, ou note « base : … » / « dénominateur … ») est un défaut — cibles, seuils, poids et bandes exemptés ; **N4 (TF-0777)** les **unités des en-têtes se lisent** : même grandeur à deux unités, cellule qui contredit son en-tête, unité de **flux** (€/an) consommée par une multiplication par un **compte d'événements** ; **N5 (TF-0777, avertissement)** une **hypothèse portant sur une grandeur que la source de données déclarée contient** est calculable | cli | ⚙️ |
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
| Nom de client dans un dépôt publiable | `scripts/oracle-nom-client-publie.mjs <dépôt|bundle> [--referentiel=<chemin HORS dépôt>] [--produits=<chemin HORS dépôt>]` — C1 contenus des fichiers suivis, C2 noms des fichiers suivis, C3 messages de commit de tout l'historique, C4 noms et contenus dans tout l'historique (fichiers retirés de l'arbre compris), C5 **noms de produits** de la table des pseudonymes dans les contenus, les noms de fichiers et les messages de commit (TF-0820). Les deux référentiels sont des **données vivant hors des dépôts publiés** — sans celui des clients l'oracle rend SKIP, jamais PASS ; sans la table des produits il joue C1-C4 et **déclare** « C5 non jouée : table absente » | cli | ✅ |
| ↳ *câblage* du contrôle ci-dessus | `scripts/installer-hamecon-publication.mjs <dépôt…> [--retirer] [--verifier]` — pose un `pre-push` qui REFUSE la publication sur FAIL **et sur SKIP** (un oracle qui ne mesure pas ne laisse pas passer) ; contournement explicite par `git push --no-verify`. Prouvé par `scripts/self-test-hamecon-publication.mjs` : 4 cas sur de vrais dépôts et de vrais push (porteur refusé, propre accepté, contournement effectif, référentiel absent refusé) | cli | ✅ |
## Injection du 03/09/2026 — une COPIE d'un composant ne reçoit aucun correctif (TF-0784)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Parité d'une copie embarquée d'un asset du socle | `scripts/oracle-parite-assets.mjs [<dossier|page.html>] [--socle=<dossier d'assets>]` — **P1** toute copie d'un asset du socle trouvée dans une page se **déclare** (`data-composant`) ou porte une **exemption écrite** · **P2** la déclaration scelle l'**empreinte** de la source (`data-empreinte="sha256:…"`) et cette empreinte est celle du **jour** · **P3** le texte embarqué est celui de la source **octet pour octet**, au seul échappement `</script` près (RA-1) · **P4** une exemption porte une **date** et un **motif** | cli | ✅ |

> **Sept correctifs, et une copie qui n'en a reçu aucun.** `digit-ai-schemas/assets/exemple-reference.html`
> embarquait une copie **manuelle** de `digit-ai-page-html/assets/table-filters.js`, collée un jour
> où elle était juste. Le composant a été corrigé sept fois (TF-0429/0430/0431 le 21/08 ;
> TF-0768/0769/0781/0782 le 02/09) : la copie n'a pas bougé d'un octet. Elle triait encore
> « 1 000 » comme 1, rangeait les mois par ordre alphabétique et privait de facette la colonne
> clé — **dans le même dépôt que les correctifs, à deux dossiers de distance**. Classe TF-0761 /
> RT-39 (*un générateur réécrit hors d'atteinte des corrections*), transposée **entre deux skills**.

- **La copie n'est pas le défaut ; la copie MANUELLE l'est.** La règle A1 du socle exige une page
  autoportante : un livrable qui charge un fichier voisin perd son composant dès qu'il part par
  courriel. La copie est le prix de l'autoportance. Ce qui se corrige, c'est qu'elle soit posée
  **à la construction** et **scellée** : `digit-ai-page-html/scripts/embarquer-composants.mjs`
  (`--constat` / `--ecrire`) pose les blocs marqués, l'oracle les juge **sans rien écrire**.
- **Une exemption reste comptée.** Une fixture dont le sujet **est** une copie figée se déclare,
  datée et motivée ; l'oracle l'accepte et la **nomme au `non_juge`** — un PASS qui tait ses
  exemptions ment sur ce qu'il a vu.
- **Bruit mesuré** (03/09/2026, **178 pages `.html`** du dépôt forge-agents, fixtures comprises) :
  **6 détections, 6 vraies, zéro faux positif**. Le détecteur reconnaît une copie à la **première
  ligne** de sa source — un signal qu'un copier-coller conserve et qu'aucune prose ne reproduit.
  Contrepartie **déclarée** : une copie dont on a retiré l'en-tête devient invisible, et c'est P1
  (la déclaration) qui rend ce contournement visible à la revue.
- **Frontière** : cet oracle ne juge **pas** le comportement de la copie chez son hôte — une copie
  à la parité peut échouer faute des jetons CSS qu'elle consomme, et c'est `check_html.py` et
  `render_page.py` qui le voient.

## Injection du 02/09/2026 — autorité et livrabilité (TF-0715, TF-0716, v2.14.0)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Autorité d'une décision affirmée | `scripts/oracle-autorite-decision.mjs <fichier.md\|.html> --profil <profil.json>` — **A1** tout bloc se déclarant décision porte un décideur · **A2** un décideur appartenant à l'**ÉMETTEUR** du livrable rend le bloc non conforme (c'est une *recommandation*, pas une décision) · **A3** trace de **rang décision** citée, **existante**, et de ce rang (ADR accepté, registre daté) · **A4** propagation « décidé / arbitré / tranché / acté » hors du bloc résolue vers lui à sa première occurrence | cli | ✅ |
| Livrabilité d'une conséquence déclarée | `scripts/oracle-livrabilite-consequence.mjs <fichier.md\|.html> --profil <profil.json>` — **L1** toute forme décrivant un **utilisateur final qui subit la découverte** (« découvriront en production », « le support n'aura pas de réponse », « vague d'appels », « sans les prévenir »), énoncée en **contexte de repli**, exige soit une reformulation en **impasse**, soit un élément du même livrable couvrant l'**information de cet utilisateur** · **L2** l'absence totale de couverture est **dite** dans le finding | cli | ✅ |

- **Déclenchement par CONTENU, jamais par extension** : les deux entrées ont `ext: []` et des
  `content_patterns` (« Décideur », « clos par arbitrage », « découvriront », « vague d'appels »…).
  Déclarer `.md` ferait juger *tout* document du parc — l'union ext ∪ contenu de `run-oracles`
  rend `ext` inclusif, pas restrictif.
- **Bruit mesuré avant enregistrement** (02/09/2026, 467 documents `.md`/`.html` du dépôt) :
  `autorite-decision` → 0 FAIL, 3 PASS, 464 SKIP ; `livrabilite-consequence` → 0 FAIL, 1 PASS,
  467 SKIP. Deux bornes anti-bruit sont dans le code et commentées à cet endroit : l'accent
  **exigé** sur les participes (`acté` ≠ le nom « acte ») et l'exemption d'A3 pour un artefact
  qui **est** lui-même un relevé/registre de décisions.
- **Émetteur lu au profil** : `autorite.emetteur_motifs` (repli `nommage.prefixe`). Profil sans
  émetteur → A2 **déclaré non jugé**, jamais deviné (`profils/generique.json`).

## Injection du 02/09/2026 — dette d'angle d'expertise (TF-0717, v2.14.0)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Angle d'expertise déclaré vide (dette de couverture) | `node {skillsroot}/experts-forge/scripts/oracle-angles-vides.mjs <registre-experts.md> [--date AAAA-MM-JJ]` — **G1** six colonnes renseignées · **G2** vocabulaire fermé (`ouvert` · `comblé` · `écarté`) · **G3** « comblé » : artefact cité dont l'**existence est vérifiée par exécution** · **G4** « ouvert » au-delà de son échéance = **ÉCHEC** · **G5** « écarté » : raison écrite | cli | ✅ |

> **Un angle vide déclaré et non comblé n'est pas neutre.** Un angle nommé le 20/08/2026
> (« fiche expert migration de plateforme brownfield ») est resté ouvert onze jours sans que
> rien ne le rappelle, et a produit exactement le défaut qu'il aurait attrapé. La table des
> dettes vit dans `experts-forge/references/registre-experts.md`, section « Angles déclarés
> vides — dettes nommées » ; l'oracle vit chez `experts-forge` (invocation `{skillsroot}`) et
> ses fixtures rouge/verte sont rejouées par le self-test de `quality-oracles`, avec une
> `--date` figée au manifest pour un rejeu déterministe.

## Règle de PRÉCÉDENCE — une charte posée prime sur les fontes réflexes (TF-0732, D-41 (b))

**Profil `digit-ai`, section `polices`.** La liste des « fontes réflexes » — dont la règle
« DM Sans bannie » — s'adresse au **choix de fontes pour un travail neuf**. Elle **ne s'applique
pas** à un livrable dont la **charte déclarée** prescrit ces fontes : le socle
`digit-ai-page-html` prescrit **Roboto (titres) / DM Sans (corps) / JetBrains Mono**.

**Le fait payé.** Le 31/08/2026, quatre éditions de **trois lignes** sur des gabarits HTML de la
bibliothèque ont été bloquées en un seul tour, la police parmi les motifs. Or ce motif ne vient
d'**aucun détecteur du socle** : ni `check_html.py` ni `check_markdown.py` ne nomment DM Sans.
Il vient de `reference/new-work.md`, appliqué à un livrable **qui a déjà sa charte**. Les deux
doctrines ne se contredisaient pas mécaniquement — il manquait une règle de **précédence**, et
son emplacement. D-41 (b) l'a tranché : **elle vit ici**, et elle est **câblée**.

**Câblage** (loi transverse n° 1 — une affordance non câblée n'existe pas) : gate d'écriture C7,
`~/.claude/hooks/qo-gate-write.mjs` (source versionnée dans `digit-ai-forge-agents`). La
précédence s'applique **avant** le partage neufs/préexistants : un constat neutralisé par la
charte n'est pas « préexistant », il n'avait pas lieu d'être. Le verdict le **dit** et nomme la
charte reconnue.

**Trois conditions cumulées, et la troisième est la garde.** Un constat n'est écarté que si
(1) c'est un constat de **police** ou de **fonte**, (2) le fichier **déclare** une charte — un
marqueur explicite, jamais une devinette —, et (3) **toutes** les fontes nommées dans le constat
appartiennent à cette charte. Un constat de police qui ne **nomme aucune fonte** n'est **pas**
neutralisé : « je ne sais pas » ne vaut jamais « c'est bon », même garde que le jugement au delta.
Une page **sans charte déclarée reste accusée** — sans quoi la précédence serait une
désactivation déguisée.

**Fixture à double sens** (banc du gate, `node .claude/hooks/qo-gate-write.mjs --self-test`,
**21/21**, dont **6 cas de précédence dans les deux sens**) : un gabarit charté n'est plus accusé
sur « DM Sans » ni sur les trois fontes du socle ; une page sans charte l'est toujours ; une fonte
**hors charte** (« Inter ») dans un fichier charté l'est aussi ; un constat sans fonte nommée
n'est jamais neutralisé ; et un constat qui n'est pas de police n'est jamais touché.

## Injection du 02/09/2026 — la page lue par quelqu'un qui n'a pas le brief (TF-0774)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Lecture d'une page par un tiers sans contexte | `scripts/oracle-lecture-tiers.mjs <page.html> --profil <profil.json> [--juge <cli>] [--reponse <lecture.json>]` — **T1** la page dit ce qu'elle permet de **décider** · **T2** tout en-tête de colonne et tout **sigle** d'en-tête est **glosé de façon atteignable** (`data-definition`, `<abbr title>`, `title=`, glossaire, prose) · **T3** la page offre au moins un **geste**, ou **déclare** être en lecture seule · **T4** *(invocation explicite, coût modèle)* le juge reçoit l'**instantané seul**, sans brief ni code, et répond à trois questions — **un « je ne sais pas » = FAIL** | cli | ✅ |

> **Quatre portes vertes, et « on n'y comprend absolument rien ».** Le 02/09/2026, la vue V6 —
> huit comptes par marché, aucun mot-clé visible, aucun geste — a passé le contrat de sortie, les
> filtres, le rendu et les interactions. Puis l'humain a lu la page. **Tous les contrôles la
> regardaient depuis l'intérieur du projet**, c'est-à-dire depuis quelqu'un qui savait déjà ce
> qu'elle voulait dire.

- **Invocation explicite** : `ext: []` et **aucun** `content_patterns` — cet oracle n'entre
  jamais dans le routage par défaut, parce que T4 appelle un modèle et coûte. T1-T3 sont
  déterministes et gratuits ; **T4 s'arme** par `--juge <cli>`, par `--reponse <lecture.json>`
  ou par `lecture_tiers.actif: true` au profil (**faux** dans les deux profils livrés).
- **La règle de T4 est prouvable sans dépense**, et c'est le point de conception : la **lecture**
  d'un tiers n'est pas reproductible, la **règle** qui l'exploite l'est. `--reponse` applique la
  règle à une lecture déjà rendue ; deux fixtures la rejouent sur la **même page**, seule la
  lecture change. Sans juge ni lecture, T4 est **SKIP motivé** — jamais un PASS de complaisance.
- **Bruit mesuré** (02/09/2026, 7 pages `.html` suivies du dépôt, hors fixtures) : **6 SKIP**
  (gabarits et boilerplate — *un gabarit n'a pas de lecteur*, exemption **déclarée au verdict**
  avec sa limite) et **1 FAIL** sur `digit-ai-schemas/assets/exemple-reference.html` (T1, T2),
  retenu comme **vrai positif**.
- **Frontière avec `check_html.py` G7** : G7 exige l'**attribut** `data-definition` sur les
  `th` — c'est une règle de balisage. T2 demande qu'une glose soit **atteignable par le
  lecteur**, par quelque moyen que ce soit. Les deux se renforcent, aucun ne remplace l'autre.
- **Câblage côté pilot** (le pilot câble de son côté) : le hook de restitution appelle
  `node <skills>/quality-oracles/scripts/oracle-lecture-tiers.mjs <page.html> --profil <profil>
  --juge claude` sur les pages du lot **avant poussée** ; sur FAIL, la restitution s'arrête et
  **nomme la page**. R-38 reste entier : aucune poussée sans GO humain.

## Injection du 02/09/2026 — le ledger devient un artefact jugé (TF-0780, TF-0776)

`oracle-etat-forge` accepte désormais `--ledger <run.jsonl>` et y juge deux choses que
personne ne regardait.

**F6 — aucune maquette validée avant le code d'une vue nouvelle.** Le 02/09/2026, sept vues
d'interface (V1-V7) ont été définies par un tableau *question / dimensions / mesures / action*
écrit par la session elle-même ; **rien n'a été montré au destinataire avant production**, et le
compagnon visuel n'a pas été offert, au motif de l'autonomie. Verdict humain sur la vue livrée :
« on n'y comprend absolument rien ». Le ledger du run (seq 97-98) ne porte **aucune** entrée de
maquette — il n'y avait rien à contredire. Un run dont le ledger déclare `portee: "interface"`
doit désormais porter `maquette_validee { fichier, validee_par, date }` **avant** le premier
événement de production ; une maquette validée après le code ne valide plus rien, elle enregistre.

**F7 — l'auteur d'un brief juge son propre contrat de sortie.** Les 22 critères du contrat de
sortie du 02/09 (13:00Z) ont été **rédigés et vérifiés par la même session**. Les 22 critères
étaient **vrais** ; le livrable était **illisible**. Un contrat qu'on s'écrit à soi-même mesure ce
qu'on a fait, jamais ce qu'on devait faire — il rend vert par construction. Quand le ledger porte
`contrat_de_sortie { auteur }` et une exécution `{ executant }`, **auteur == exécutant est un
échec nommé**.

**Format attendu au ledger** (JSON Lines, une entrée par ligne) :

```
{"type":"run_open","portee":"interface"}
{"type":"maquette_validee","fichier":"…","validee_par":"…","date":"AAAA-MM-JJ"}
{"type":"contrat_de_sortie","auteur":"<identité>"}
{"type":"execution","executant":"<identité>","etape":"development"}
```

- **Bornes déclarées**, et elles sont au `non_juge` : F6 et F7 ne jugent **que ce que le ledger
  porte**. Sans `--ledger`, sans portée déclarée, sans contrat de sortie ou sans exécutant, rien
  n'est jugé — et le verdict le **dit** plutôt que de laisser croire que la séparation est tenue.
  F7 compare des **chaînes** : deux noms différents pour le même acteur lui échappent.
- **Fixture à double sens** : le manifeste jugé est le **même** dans les deux cas (la fixture
  verte d'`etat-forge`) ; **seul le ledger change**. Le rouge n'a pas de maquette et fait rédiger
  le contrat par son exécutant ; le vert montre sa maquette avant de produire et fait dériver le
  contrat par un acteur distinct.

## Injection du 02/09/2026 — « un chiffre publié énonce son dénominateur » (TF-0760, TF-0777)

> **Une mesure exacte case par case peut être fausse dans son ensemble.** Le 31/08/2026, une
> carte de chaleur donnait un produit à **0 % en tests** — ce produit porte une porte de
> couverture **bloquante**. Deux défauts de conception cumulés, tous deux invisibles à un
> contrôle de forme : le **dénominateur** était fabriqué par les déclarations des **autres**
> acteurs (une règle déclarée par un seul mettait les trois autres « en écart » alors qu'ils
> n'avaient jamais eu à se prononcer), et la règle du produit accusé avait été **routée hors du
> corpus** parce qu'elle était générique. Le défaut a été trouvé par l'**étonnement du lecteur**,
> pas par un contrôle. *Un rapport qui surprend son lecteur sur des faits qu'il connaît a perdu
> sa crédibilité sur ceux qu'il ne connaît pas.*

**Règle de doctrine (six énoncés, un seul mécanisable — les cinq autres restent une revue) :**
tout chiffre publié énonce son dénominateur et ce qu'il inclut · on ne mesure un acteur que sur
ce qu'il a eu l'occasion de faire · une absence de déclaration n'est pas un échec et ne se compte
pas comme un zéro · un objet écarté d'un canal n'est pas retiré de la mesure · préférer un compte
à un pourcentage quand le dénominateur est petit ou hétérogène · **mécanisable : un pourcentage
affiché sans sa formule écrite à côté est un défaut** (N3).

**TF-0777 — le dictionnaire de colonnes, volet mesure.** Une hypothèse exprimée **en euros par
an** était consommée par « séjours × valeur », et `oracle-calculs` rendait **SKIP**. N4 lit
désormais les unités des en-têtes ; N5 signale, en **avertissement**, une hypothèse portant sur
une grandeur que la **source de données déclarée par le document** contient — *on ne suppose pas
ce qu'on peut compter*. **Borne déclarée** : N5 ne fait **pas** le calcul, il nomme le fichier.

- **Bruit mesuré avant enregistrement** (02/09/2026, 103 documents `.md`/`.html` suivis du
  dépôt, hors fixtures) : **0 FAIL**. **Couverture** sur le même corpus : **1 PASS / 102 SKIP
  avant → 4 PASS / 99 SKIP après** — trois documents de plus réellement jugés, aucun accusé à
  tort. Quatre bornes anti-bruit, chacune née d'un faux positif constaté et commentée dans
  `lib/mesure.mjs` : liste **fermée** des unités (« Oracle (invocation) » n'est pas une unité),
  exemption des pourcentages **cible / seuil / poids / bande** (ils bornent, ils ne mesurent pas),
  « dénominateur » ne vaut formule que **suivi d'un chiffre ou d'un deux-points** (une prose qui
  dit que le dénominateur manque désarmait le contrôle), et le **gras Markdown n'est pas un signe
  de multiplication** (une page qui décrivait le défaut était elle-même accusée).
- **Deux fixtures vertes existantes ont été complétées, pas assouplies** : `calculs-green.md` et
  `calculs-pct-green.md` publiaient des parts sans dénominateur. La doctrine s'applique aussi
  aux jeux d'essai de la forge — elles portent désormais leur base.

## Injection du 02/09/2026 — conception d'un livrable (TF-0758, v2.15.0)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Conception d'un livrable (glossaire, listes autoportantes, intention de chapitre) | `scripts/oracle-conception-livrable.mjs <fichier.md|.html> --profil <profil.json>` — **C1** un terme de méthode érigé en vocabulaire est **défini** dans le livrable · **C2** un ensemble annoncé par son cardinal (« 17 dimensions ») est **énuméré quelque part** · **C3** une entrée de liste dont l'**unique porteur de détail est un renvoi interne** est un défaut · **C4** tout chapitre de niveau 2 porte le bloc « question du lecteur / ce que le chapitre apporte / ce qu'il permet de décider » | cli | ✅ |

> **Un livrable intégralement conforme et refusé deux fois.** Le 31/08/2026, un livrable de
> consolidation passait 17 contrôles de forme sur 17 quand son lecteur l'a refusé pour la
> deuxième fois. Quatre griefs, aucun cherché par un contrôle : « 17 dimensions » écrit une
> trentaine de fois sans que le document dise ce qu'est une dimension ni ne les nomme, une liste
> de décisions dont chaque ligne renvoyait à un chapitre plus bas, un chapitre exact dont on ne
> savait pas de quoi il parlait, une carte de chaleur juste case par case et fausse dans son
> ensemble (→ oracle-calculs). La doctrine documents énonçait pourtant D6, « conformité mécanique
> n'est pas qualité » : **D6 nommait le mal, rien ne le cherchait**.

- **Déclenchement par CONTENU** (`ext: []` + `content_patterns` sur les annonces de cardinal et
  le vocabulaire de grille) — jamais sur tout `.md` du parc.
- **Bruit mesuré avant enregistrement** (02/09/2026, 103 documents `.md`/`.html` suivis du dépôt,
  hors fixtures) : **0 FAIL · 37 PASS · 66 SKIP**. Trois bornes anti-bruit, chacune née d'une
  mesure et commentée dans le code :
  1. **C1 ne bloque que sur les DEUX marques** du défaut mesuré — un cardinal annoncé **et** au
     moins 5 occurrences. Une seule marque **avertit**. Sans cette borne : 35 documents accusés
     sur 103 (34 %), pour des mots ordinaires (« 5 axes » cité une fois, « gate » six fois).
  2. **Une énumération nommée vaut définition** du terme de tête — listes, tables, familles
     d'identifiants (D1…D7) et énumérations en ligne comptent toutes.
  3. **C4 est un avertissement tant qu'aucun chapitre ne porte son bloc** (taux d'adoption du
     parc mesuré à 0 %) et devient **bloquant dès qu'un chapitre le porte** : une discipline
     entamée puis abandonnée en cours de document n'est pas du bruit, c'est un défaut que
     l'auteur a lui-même déclaré vouloir éviter.
- **Frontière avec oracle-calculs (N1)** : N1 juge un effectif annoncé contre le cardinal réel de
  son **ancre immédiate** ; C2 ne juge que les annonces **sans** ancre immédiate. Aucun
  recouvrement, et c'est écrit des deux côtés.

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