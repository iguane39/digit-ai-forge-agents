# Registre des oracles de qualité par domaine

> **Vue humaine** (v2.34.0, alignée sur le JSON le 01/10/2026). Source machine (orchestrateur `scripts/run-oracles.mjs`) : `registre-oracles.json`.
> Un oracle = un contrôle **déterministe, exécuté, à verdict PASS/FAIL** (standard §3 du SKILL).
> Ce registre **grandit** : tout domaine sans oracle reçoit un oracle (standard §3) **remonté ici** (règle §4).
>
> Statut : ✅ exécutable · ⚙️ partiel · manuel · ❌ à outiller · 💤 dormant (6 mois sans usage journalisé — désactivé, conservé) · 🛑 broken (fixture verte cassée ou dépendance non résolue — réparer ou retirer).
> Champs M3 (23/07/2026) : `dernier_usage` dérivé des journaux `_oracles-journal*` par la passe d'hygiène `etat-forge` (jamais tenu à la main) ; `provenance` (chantier + date) obligatoire au manifest pour la fixture rouge de tout oracle créé à partir du 23/07/2026.

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Rendu HTML / visuel | `render_page.py` (digit-ai-page-html) — V1–V18 ; **V18** (TF-1066, 12/09/2026, règle E5 du pilot ; plafond porté à 135 par la décision humaine du 15/09/2026, « 13a », TF-1069) ne se joue qu'aux largeurs ≥ 2560 px : mesure de lecture au-delà de 135 caractères par ligne sur une prose que rien ne tient, tableau principal d'une page de données sous 85 % de la largeur offerte. Grille par défaut : 3840, 2560, 1920, 1280, 768, 390 | cli (délégué) | ✅ |
| Conformité charte HTML (charte, sémantique, print) | `check_html.py` (digit-ai-page-html) — DOCTYPE, `lang="fr"`, charset prioritaire, viewport, `<h1>` unique, `:root`, `<title>`, `@media print`, police Syne interdite | cli (délégué) | ✅ |
| Complétude d'un rendu par rapport à sa source (texte perdu à la génération) | `check_completude.py <page.html> --source <source.md>` (digit-ai-page-html) — **invocation explicite** : rendu = mots visibles du corps HTML, source = mots visibles du Markdown dont il sort, `rendu < source` ⇒ ARRÊT. Seuil par défaut 1.0 ; `--seuil` en dessous reste possible mais la dérogation est écrite au `non_juge` de chaque exécution. **TF-1174** : une page ayant perdu les trois quarts de son texte (11 996 → ~3 000 mots) passait les SIX oracles de forme — ils mesurent une grandeur *corrélée*, pas l'invariant. **TF-1436** : titres par niveau et éléments de liste se comptent aussi ; un seau du rendu sous la source est un écart, un surplus jamais | cli (délégué) | ✅ |
| Filtres de colonne sur tableaux de données | `scripts/oracle-filtres-tableau.mjs <page.html>` — G1 marquage ou exemption motivée, G2 asset référencé, G3 initialisation, G4 id + thead, G5 compteur aria-live, G6 réaffichage à l'impression | cli | ✅ |
| Rendu PPTX (structure & compatibilité) | `scripts/oracle-pptx.mjs` — zip, [Content_Types].xml 1re entrée, zéro transition/JPEG, smoke-test LibreOffice ; charte sémantique → gate digit-ai-pptx ; polices embarquées NON décodées, et dit au `non_juge` → domaine ci-dessous (TF-1501) | cli | ⚙️ |
| Polices embarquées d'un PPTX | `scripts/oracle-polices-embarquees.mjs <deck.pptx> [--polices <dossier de référence>]` — **E0** chaque partie `ppt/fonts/` (flux EOT) se décode par le décodeur de Windows (`t2embed.dll`, chargé en privé) · **E1** ses contours sont ceux de la police installée de même famille, graisse, pente et version · **E2** aucun glyphe simple hors de la boîte englobante que la police déclare. **Déclenché par la présence d'une partie `ppt/fonts/`** dans le paquet (`parties_paquet`, critère neuf de `run-oracles`). Prérequis : Python 3 et fontTools (importé, sinon fourni par `uv`), Windows pour le MTX ; absent → SKIP qui le nomme (TF-1501) | cli | ✅ |
| Polices embarquées d'un DOCX | `scripts/oracle-polices-embarquees.mjs <document.docx>` — **E0** chaque police que `word/fontTable.xml` déclare embarquée est dans le paquet et se désobscurcit par sa clé `w:fontKey` (ECMA-376, 17.8.1) · **E1** contours = police installée (aux mêmes indices si la cmap Unicode le confirme, sinon par point de code) · **E2** boîte englobante. Déclenché par une partie `word/fonts/` (`parties_paquet`). Sans dépendance au système (TF-1504) | cli | ✅ |
| Polices embarquées d'un PDF | `scripts/oracle-polices-embarquees.mjs <document.pdf>` — **E0** chaque programme TrueType d'un descripteur (`FontFile2`, `FontFile3 /OpenType`) se décode, **avertissement** pour un PDF (un lecteur de PDF répare ce qu'il peut) · **E1** · **E2** comme ci-dessus ; programmes CFF et Type 1 comptés, non jugés. Tout PDF est routé ; pypdf requis (TF-1504) | cli | ✅ |
| Polices embarquées d'une page HTML | `scripts/oracle-polices-embarquees.mjs <page.html>` — **E0** chaque police en `data:` d'une règle `@font-face` se décode (base64, WOFF2, WOFF ou sfnt) · **E1** · **E2** comme ci-dessus, constats à la ligne de la règle. Déclenché par le **contenu** (`content_patterns`) ; brotli requis pour le WOFF2 (TF-1504) | cli | ✅ |
| Accessibilité (WCAG structurel) | `scripts/oracle-a11y.py` — lang, alt, labels, titres, id, zoom (Playwright) | cli | ✅ |
| Performance / poids | `scripts/oracle-perf.mjs` — budgets poids/DOM/JS inline/refs | cli | ✅ |
| Format / livraison / versioning | `scripts/oracle-format.mjs` — UTF-8, ZIP, placeholders, autoportance | cli | ✅ |
| Code source | `scripts/oracle-code.mjs` — compilation `node --check`/`py_compile`/`tsc` | cli | ✅ |
| Sécurité / secrets | `scripts/oracle-secrets.mjs` — clés/tokens/PAT (+ gitleaks) | cli | ✅ |
| Sécurité : dépendances (SCA) | `scripts/oracle-sca.mjs` — pip-audit / npm audit / OSV ; fixtures jouées sur données OSV figées (`--osv-fige`), ressource injoignable = SKIP nommé (TF-1107) | cli | ✅ |
| Sécurité : SAST (injection/exécution) | `scripts/oracle-sast.mjs` — injection SQL/commande, eval/exec, désérialisation (semgrep/bandit + repli) | cli | ✅ |
| Configuration d'infrastructure (Terraform) | `scripts/oracle-terraform.mjs <fichier.tf|.tfvars|dossier> [--date-application AAAA-MM-JJ]` — étape **standard** : **T1** `terraform fmt -check` (première ligne réécrite), **T2** `terraform validate -json`, sans `terraform init`, rien d'écrit dans la cible ; Terraform absent → l'étape rend SKIP motivé. Étape **maison** : **D1** une valeur datée écrite en dur dont le mois précède le mois d'application est refusée (banc du lot rejoué) ; remède : la date calculée à la création (TF-1492) | cli | ✅ |
| Sortie LLM / IA générative | `scripts/oracle-llm.mjs` — schéma JSON (auto) + checklist véracité | cli | ⚙️ |
| Programme de formation (structure pédagogique) | `scripts/oracle-programme-formation.mjs` — C1 sommes de durées, C2 part de pratique déclarée, C3 couverture vs référence, C4 segment ≤ 50 min, C5 évaluation par bloc (.md/.docx) | cli | ✅ |
| Support de diapositives (parité de format par profil) | `scripts/oracle-pptx.mjs --profil <profil>` — P1 format (`pptx.format`), P2 polices (`pptx.polices`), P3 couleurs de texte (`pptx.palette`), plus l'hygiène du paquet ; règles propres à un type de séance = invocation locale au produit (TF-1130) | cli | ⚙️ |
| Charte PPTX sémantique (sommaire, kicker, logos, footer) | `scripts/oracle-charte-pptx-semantique.mjs <deck.pptx> --profil <profil>` — S1 bijection sommaire↔intercalaires, S2 kicker, S3 logos hors de la zone admise, S4 footer+pagination dans la forme admise, S5 lexique du destinataire sur textes **et notes** (`lib-lexique.mjs` du pilot, celui d'EC-7 et de S46). **S3 et S4 suivent le profil** (TF-1490) : `pptx.logos` (`couverture-interlocuteurs` ou `partout`), `pptx.pied_de_page` (`espace-reserve` ou `zone-texte`) ; digit-ai déclare la charte d'avant, generique ne déclare rien (S3 et S4 non jouées, et dites) | cli | ✅ |
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
| Prémisse d'accès mesurée avant d'être classée (analyse L99) | `scripts/oracle-premisse-acces.mjs <analyse.md>` — A1 « invérifiable » sans mesure ni test manquant déclaré, A2 refus sans contrôle positif à identité égale, A3 mesure sans horodatage ni identité, A4 conclusion d'indisponibilité sans énumération des familles d'accès (*scopes*, points d'entrée parallèles). **Invocation explicite** sur une analyse L99 ou son chapitre 4 — aucun déclenchement automatique sur `.md`. TF-1185 : un refus prouve qu'une porte est fermée, jamais qu'il n'y en a qu'une | cli | ✅ |
| Versions de dépendances | `maj-versions.mjs` (kit RefAudit) | kit | ✅ |
| Conformité rapport d'audit | `verifier-rapport-audit.mjs` (kit RefAudit) — checks 1-10 | kit | ✅ |
| Clôture de remédiation | `verifier-remediation.mjs --status` (kit RefAudit) | kit | ✅ |
| Skill (audit) | skill `ameliore-un-skill` (grille /5 pondérée) + volet R1–R10 (`regles-oracles.md`) | skill | ✅ |
| Cohérence inter-documents | `oracle-coherence.mjs <dossier\|fichier>` — divergences de grandeurs entre livrables (versions antérieures exclues) ; **v2 (TF-1352, 24/09/2026) le FOND** : CF1 statut d'une ligne nié par son propre texte, CF2 affirmation absolue démentie par une ligne de table (« 0 colonne inventée » contre « source introuvable »), CF3 compte figé dans l'amorce de sa table, CF4 préséance non déclarée entre deux documents dont les tables décrivent les mêmes objets. **Avant de répondre « cohérent » sur des documents dérivés d'une même source, jouer cet oracle sur le DOSSIER : un grep de noms vérifie un invariant vrai qui n'est pas celui de la question.** Bruit mesuré le 24/09, cible fichier : 3 FAIL sur 694 documents du pilot et 8 sur 1 450 chez 8 produits, tous des comptes figés ; CF4 est majeur | cli | ✅ |
| Régression visuelle (golden diff) | `oracle-visual-diff.py` — captures vs goldens versionnés (masques, `--accepter` hors boucle) | cli | ✅ |
| Calculs / chiffres | `scripts/oracle-calculs.mjs` — re-somme exécutée des lignes Total des tables md/html (+ déclenchement par contenu) ; **N1 (TF-0718, 02/09/2026)** effectif annoncé en **chiffres OU en lettres** suivi d'un nom dénombrable, en tête d'une liste ou d'un tableau, rapproché du **cardinal réel** de l'ancre (identifiants distincts si la 1re colonne en porte) ; **N2** compte contradictoire pour le même nom dans le même document ; hors tables → recompute manuel ; **N3 (TF-0760, 02/09/2026)** un **pourcentage mesuré publié sans sa formule** écrite à côté (fraction, colonne de comptes, ou note « base : … » / « dénominateur … ») est un défaut — cibles, seuils, poids et bandes exemptés ; **N4 (TF-0777)** les **unités des en-têtes se lisent** : même grandeur à deux unités, cellule qui contredit son en-tête, unité de **flux** (€/an) consommée par une multiplication par un **compte d'événements** ; **N5 (TF-0777, avertissement)** une **hypothèse portant sur une grandeur que la source de données déclarée contient** est calculable | cli | ⚙️ |
| Traçabilité des affirmations chiffrées | `scripts/oracle-claims.mjs` — montant € sans source ni « à vérifier » = bloquant ; incohérence intra-document ; actif selon profil | cli | ⚙️ |
| Nommage / convention de livraison | `scripts/oracle-nommage.mjs` — convention du profil (**Q3-bis, 09/08/2026** : `<Projet> - <Objet> - AAAAMMJJ{a…}` — le nom du projet prime sur l'émetteur, le motif date + indice est le discriminant) ; nom ne se réclamant pas de la convention → SKIP | cli | ✅ |
| Jugement rédactionnel (LLM-juge externe) | `scripts/oracle-judge.mjs` — rubrique figée 5 axes via CLI claude ; AVIS OUTILLÉ, invocation explicite, jamais promu en verdict | cli | ⚙️ |
| Design généré : marqueurs de slop | `node {pilot}/../digit-ai-forge-design/oracles/run-oracles-design.mjs <page.html> --oracle slop --contrat-runner` — **emprunte le point d'entrée de forge-design** pour que la passe d'imputation au socle s'applique (TF-1241, 22/09/2026 : appelé en direct, le juge imputait à l'auteur les constats d'un composant embarqué qu'il n'a pas le droit de modifier) — S1 bandeau latéral > 1px, S2 texte en dégradé, S3 polices réflexes, S4 noir/blanc purs, S5 palette IA, S6 emojis, S7 grille clonée, S8 easing daté, S9 rayon uniforme, S10 sparkline décoratif ; déclenché par contenu (« Données de démonstration »), jamais sur toute page HTML | cli | ✅ |
| Système de marque : traçabilité des tokens | `node {pilot}/../digit-ai-forge-design/oracles/run-oracles-design.mjs <page.html> --oracle tokens --contrat-runner` — **emprunte le point d'entrée de forge-design**, même motif (TF-1241) — T1 couleur en dur, T2 police en dur, T3 échelle 4pt, T4 parité clair/sombre, T5 contraste ≥ 4.5:1 (paires opaques seulement), T6 chroma aux extrêmes | cli | ✅ |
| Mouvement : craft de l'animation | `node {forges}/digit-ai-forge-design/oracles/oracle-motion.mjs <page.html>` — R1 `transition: all`, R2 entrée en `scale(0)`, R3 `ease-in` sur de l'UI, R4 durée > 300 ms sans justification déclarée, R5 `transform-origin: center` sur élément ancré, R6 propriété de layout animée, R7 survol animé sans `@media (hover: hover) and (pointer: fine)` ; dérivé de `review-animations` (Emil Kowalski, MIT) | cli | ✅ |
| Cible mobile : contrat d'usage tactile | `node {forges}/digit-ai-forge-design/oracles/oracle-mobile.mjs <page.html> --si-cible-mobile` — joué sur les seules cibles mobiles, SANS OBJET ailleurs, règle partagée avec le point d'entrée de forge-design (lib/cible-mobile.mjs, TF-1322, 23/09/2026) — M1 viewport et zoom, M2 cibles ≥ 44 px, M3 safe-area-inset, M4 reflow des tables sous 768 px, M5 orientation paysage, M6 prefers-reduced-motion, M7 prefers-reduced-transparency | cli | ✅ |
| Visuels générés : traçabilité et budget | `node {forges}/digit-ai-forge-design/oracles/oracle-images.mjs <page.html>` — I1 alt utile, I2 plafond unitaire, I3 plafond global 10 Mo, I4 zéro image réseau, I5 manifeste de génération, I6 complétude prompt/modèle/date | cli | ✅ |
| Corpus design : résolution des sources | `node {forges}/digit-ai-forge-design/oracles/oracle-corpus.mjs <dossier>` — C1 colonnes, C2 cellules, C3 statuts, C4 unicité, C5 polices réflexes, C6 sources résolues, C7 monoculture inter-clients (invocation explicite par dossier) | cli | ✅ |
| Exigences produit : testabilité de l'énoncé | `node {forges}/digit-ai-forge-conception/oracles/oracle-exigences.mjs <EXIGENCES.json>` — E1 champs obligatoires, E2 identifiant unique et non réaffecté, E3 critère chiffré avec unité ou binaire observable, E4 liste noire de termes subjectifs, E5 palier valide, E6 énoncé atomique | cli | ✅ |
| Traçabilité besoin ↔ exigence ↔ vue (référentiel de conception) | `node {forges}/digit-ai-forge-conception/oracles/oracle-tracabilite.mjs <EXIGENCES.json> [--vue <fichier>]…` — T1 aucun orphelin des deux côtés, T2 exactement un critère, T3 vue alignée sur l'empreinte sha256 de sa source, T4 statut épistémique porteur de sa source | cli | ✅ |
| Couverture de la surface fonctionnelle | `node {forges}/digit-ai-forge-conception/oracles/oracle-surface.mjs <EXIGENCES.json> [--seuil 95]` — S1 tout élément non couvert est NOMMÉ, S2 ratio publié avec sa liste, S3 lien de surface valide ou raison `hors_surface` | cli | ✅ |
| Affirmations chiffrées d'un référentiel d'exigences | `node {forges}/digit-ai-forge-conception/oracles/oracle-claims.mjs <EXIGENCES.json>` — A1 chiffre d'un champ narratif tracé à une source ou marqué « à vérifier », A2 périmètre écarté déclaré (un chiffre de critère est une cible, pas une affirmation) | cli | ✅ |
| Style rédactionnel d'un texte Markdown (plancher E-1..E-12 du pilot) | `node {pilot}/oracles/oracle-ecriture.mjs <texte.md>` — **EC-1** densité par famille (huit familles de tournures creuses, seuils en ‰ de mots de prose) · **EC-2** phrases > 35 mots en série · **EC-3** puces ≤ 2 niveaux · **EC-4** gras de phrase et puces emoji · **EC-5** attaques répétées (avertissement) · **EC-6** antériorité (un texte normatif antérieur à la doctrine rend SKIP, jamais FAIL). La doctrine (`references/ECRITURE.md`, E-1 à E-12), la donnée (`references/tics-redactionnels.json`, datée et sourcée) et l'oracle vivent chez le **pilot** : ce registre les INDEXE, il ne les réimplémente pas (R3). `{pilot}` = `FORGE_ROOT/digit-ai-factory`, sinon le dépôt **frère** `../../../../digit-ai-factory` du skill ; introuvable → **SKIP motivé** qui nomme les pistes, jamais un PASS. **`ext` vide à dessein** : invocation explicite, hook `ecriture` du pilot, ou `check_markdown.py --style` — brancher tout `.md` du parc n'est pas mandaté au 12/09/2026, faute de mesure de bruit sur les produits | cli (délégué) | ⚙️ |
| Traduction : invariants et langue effective | `node {pilot}/oracles/oracle-invariants-traduction.mjs --paires <paires.json> --langue-cible <code> [--invariants <liste.json>]` — **F1** nombres conservés (séparateurs de milliers et de décimales neutralisés) · **F2** mois nommés conservés (table fermée fr/pt/es/en/it/de) · **F3** URL et courriels à l'identique · **F4** invariants déclarés verbatim · **F5** langue effective (pas de recopie, densité de mots-outils). **Ne juge PAS la fidélité du sens**, et le déclare : sans référence humaine, aucune machine ne la mesure sans rendre un avis déguisé en verdict (TF-1232, troisième issue retenue). Déterministe, sans modèle, sans dépense. **`ext` vide à dessein** : l'entrée est un fichier de PAIRES `{id, source, cible}`, pas une page | cli (délégué) | ⚙️ |
| Livrable d'un run de conseil (diagnostic d'exploitation, démarche ROI) | `node {pilot}/oracles/oracle-livrable-conseil.mjs <livrable.md>` — **LC1** sections du gabarit du type · **LC2** tout montant ou pourcentage sourcé ou « à vérifier » · **LC3** chaque recommandation d'un diagnostic cite une mesure M-xx existante · **LC4** chaque lot d'une démarche ROI porte utile / utilisable / utilisé et un jalon daté · **LC5** plan de revue daté. Deux types reconnus AU TITRE ; tout autre document rend **exit 2, non jugeable** — dont le plan d'amélioration multi-domaines que le run produit aussi (TF-1237 ; son juge naîtra avec le skill `plan-d-amelioration`, TF-1234). L'oracle vit chez le **pilot** depuis le 19/08 et n'était indexé nulle part avant le 22/09 : ce registre l'INDEXE, il ne le réimplémente pas (R3). **`ext` vide à dessein** : invocation sur le livrable nommé par le run de conseil | cli (délégué) | ⚙️ |
| Remise d'une chaîne de traduction : relecture native, ancres, arbitrages, verdicts cités (T1-T4 ; T5-T8 pour une remise d'audit) | `node {pilot}/oracles/oracle-remise-traduction.mjs <FICHE-REMISE.md> [--racine <dossier>] [--catalogue <dossier>]` — **T1** relecture native déclarée (faite ou refusée avec son motif) · **T2** 100 % des ancres verbatim présentes dans le fichier visé · **T3** arbitrages posés à l'humain non vides · **T4** verdicts des contrôles mécaniques cités ; pour une remise d'**audit** (`role:` … audit) **T5** verdict de chaque étape B1-B10, **T6** locales couvertes ou déclarées, **T7** carte des sources de vérité, **T8** confrontation aux données citée. Déclenché par le frontmatter `role:` … remise/livraison … traduction/multilingue. Indexé le 26/09/2026 (TF-1318, D-17 (a) ; TF-1334) | cli | ✅ |
| Glossaire : preuve de marché rejouable et périssable (sondes scellées, péremption déclarée) | `node {pilot}/scripts/verifier-sonde-glossaire.mjs <GLOSSAIRE.md|dossier> [--peremption <jours>]` — **S-3** une ligne de visibilité dont `verifie_le` dépasse la durée DÉCLARÉE par le glossaire (`peremption_preuves_jours`, aucune durée par défaut — D-17 (a)) est échue · **S-4** une durée illisible est un constat. Joué par le lanceur **sans `--rejouer`** : il ne juge que l'âge et n'exécute aucune commande tirée d'un glossaire ; le rejeu des sondes reste un appel explicite. Déclenché par un fichier `GLOSSAIRE.md`. Indexé le 26/09/2026 (TF-1318, D-17 (a) ; TF-1334) | cli | ✅ |
| Dossier CAB (DOCX, template Client-A) | `scripts/oracle-dossier-cab.mjs <dossier.docx> [--depot AAAA-MM-JJ] [--couleur-titres RRGGBB]` — C1 sections du template, C2 tableau d'en-tête renseigné, C3 zéro placeholder, C4 sections non vides, C5 date du nom == date prévue, C6 règle Easyvista J+5, C7 numérotation Word (numId non partagé), C8 marqueurs [À COMPLÉTER] recensés, C9 couleur de titres de la charte | cli | ✅ |
| Validité d'un paquet DOCX avant remise | `node {skillsroot}/digit-ai-docx/scripts/oracle-docx.mjs <document.docx>` — **D1** archive lisible · **D2** `[Content_Types].xml` · **D3** relations internes résolues · **D4** XML bien formé · **D5** ordre des enfants exigé par Word · **D6** ordre DrawingML délégué à `verifier-ooxml.py` du pilot (introuvable → non jugée et dite). Recette dans digit-ai-docx. Indexé le 26/09/2026 (TF-1334) | cli | ✅ |
| Régression de qualité des sorties d'agents (fixtures versionnées, juge distinct de l'exécutant) | `node {skillsroot}/forge-agents/scripts/oracle-agent-evals.mjs <dossier-cas>` — critères figés de `cas.json` rejoués sur la sortie de l'agent : EXISTS, CONTAINS, REGEX mécaniques, juge distinct (`claude -p`) pour le reste, indisponible → SKIP motivé. Déclenché par un fichier `cas.json` dans la cible. Recette dans forge-agents. Indexé le 26/09/2026 (TF-1334) | cli | ✅ |
| Cohérence du graphe des définitions d'agents (de:/vers:) | `node {skillsroot}/forge-agents/scripts/oracle-defs.mjs <dossier-de-defs \| def.yaml…>` — chaque def valide au compilateur, id uniques, liens de:/vers: réciproques entre defs du lot, aucun cycle. Déclenché par un YAML qui porte `mandat:` puis `arbitre:` ; le graphe entier se juge sur le DOSSIER des defs. Recette dans forge-agents. Indexé le 26/09/2026 (TF-1334) | cli | ✅ |
| Promesses d'un texte dérivé des faits du produit : équipements absents, distances, capacités | `scripts/oracle-promesses.mjs <fichier|dossier> [--referentiel <promesses.json>]` — **P1** un terme d'un équipement ABSENT au référentiel promis (mot entier, sans casse ni accents ; mention niée et ligne d'EXCLUSION d'un fichier d'annonces écartées et comptées) · **P2** une distance annoncée plus COURTE que la distance déclarée vers le même lieu · **P3** une capacité annoncée plus GRANDE que le maximum déclaré. Référentiel `promesses.json` (format `quality-oracles/promesses@1`) déclaré par le produit, cherché au-dessus de la cible ; absent → SKIP motivé. Déclenché par un fichier d'annonces (`.csv`, `.tsv`) ou un dossier qui porte `promesses.json`. Une garde tenue une fois, jouée par chaque générateur de texte dérivé des mêmes faits (TF-1365, lot Produit-02 20260922a, RT-97) | cli | ✅ |
| Nom de client dans un dépôt publiable | `scripts/oracle-nom-client-publie.mjs <dépôt|bundle> [--referentiel=<chemin HORS dépôt>] [--produits=<chemin HORS dépôt>]` — C1 contenus des fichiers suivis, C2 noms des fichiers suivis, C3 messages de commit de tout l'historique, C4 noms et contenus dans tout l'historique (fichiers retirés de l'arbre compris), C5 **noms de produits** de la table des pseudonymes dans les contenus, les noms de fichiers et les messages de commit (TF-0820), chaque graphie **bornée par des non-alphanumériques** (TF-0880 : une clé courte cherchée sans frontière accusait des blobs base64). Les deux référentiels sont des **données vivant hors des dépôts publiés** — sans celui des clients l'oracle rend SKIP, jamais PASS ; sans la table des produits il joue C1-C4 et **déclare** « C5 non jouée : table absente ». **Pistes par défaut** (TF-0887) : `--referentiel`/`--produits`, puis `FORGE_NOMS_INTERDITS`/`FORGE_PRODUITS_PSEUDO`, puis le **canal confidentiel** `<racine>/_confidentiel/tables/{noms-interdits,produits-pseudonymes}.json`, puis les anciens fichiers libres `<racine>/_*.json` en dernier recours — la racine étant `FORGE_ROOT` quand elle est posée, sinon le parent du dépôt jugé puis le parent de la forge. La table **retenue** est nommée au `non_juge` (« table lue : … »). **Borne de date** (TF-0982) : les deux tables portent un bloc `depuis` — `{ "<clé>": "AAAA-MM-JJ" }` — et une occurrence de l'**HISTOIRE** antérieure à la date d'inscription de son terme est déclarée **antériorité** : nommée dans le rapport, comptée à part au `non_juge`, **non bloquante**. L'**arbre courant** et les **messages de commit** restent jugés **sans borne** (ils se corrigent par une édition), et un terme absent du bloc `depuis` ou porteur d'une date malformée aussi — l'absence de date ne vaut jamais exemption. La date d'une occurrence est celle d'**auteur** de sa révision, jamais celle de validation, qu'une réécriture d'historique remet à zéro. Motif mesuré : chaque extension de table rendait le passé fautif **rétroactivement** — trois réécritures d'historique en douze jours | cli | ✅ |
| ↳ *câblage* du contrôle ci-dessus | `scripts/installer-hamecon-publication.mjs <dépôt…> [--retirer] [--verifier]` — pose un `pre-push` qui REFUSE la publication sur FAIL **et sur SKIP** (un oracle qui ne mesure pas ne laisse pas passer) ; contournement explicite par `git push --no-verify`. Sur SKIP il **répète le motif de la porte en clair** (« porte SKIP : … ») avant de refuser, et il ne grave **aucun chemin de table** : la porte les résout à chaque appel (TF-0887). Prouvé par `scripts/self-test-hamecon-publication.mjs` : 5 cas sur de vrais dépôts et de vrais push (porteur refusé, propre accepté, contournement effectif, référentiel absent refusé **avec son motif en clair**, tables dans le canal et **aucune variable d'environnement** → porteur refusé et propre accepté). Les trois hameçons posés ont **`trap '' PIPE` pour première commande** (TF-1360) : un refus tient même quand la sortie de `git push` ou de `git commit` part dans un filtre déjà fini — sans la ligne, le hameçon meurt de SIGPIPE à son premier écho et git, sous Windows, publie (cas 9 de la même recette : sens rouge publié, sens vert refusé, pour le `pre-push` comme pour le `commit-msg`) | cli | ✅ |
| ↳ *avant commit* : frontmatter des skills de l'index | `scripts/frontmatter-skills-index.mjs [<dépôt>] [--tous] [--json]` — juge le frontmatter des SEULS skills dont un fichier est dans l'index git, lus DANS l'index, avec le lecteur de la recette (`scripts/lib/frontmatter.mjs`) : description de 1 024 caractères au plus, `name` et `description` présents. `--tous` juge tous les skills de l'index — la forme à jouer AVANT de propager les skills. Son hameçon `pre-commit` se pose sur demande seulement (`installer-hamecon-publication.mjs <dépôt> --seul=pre-commit-skills`), jamais par le jeu par défaut ; un dépôt qui porte déjà le pre-commit d'anonymisation le signale en CONFLIT. Prouvé par le cas 10 de `scripts/self-test-hamecon-publication.mjs` (rouge : description de 1 101 caractères refusée au commit ; vert : la même entrée sous la limite passe ; `--tous` rouge et vert) et par la recette de quality-oracles (le contrôle rapide refuse les mêmes skills qu'elle). Né de TF-1337 : `accueil-factory` est entré au dépôt le 22/09 avec une description de 1 244 caractères | cli | ✅ |
| ↳ *câblage* du contrôle du canal confidentiel | `scripts/installer-hamecon-publication.mjs <canal> --seul=pre-push-canal` — pose sur le seul canal confidentiel un `pre-push` qui joue SON contrôle, `oracle-confidentiel.mjs` à la racine du canal (K1 dépôt privé chez l'hébergeur, K3 aucun secret, et ses autres règles), et REFUSE l'envoi sur tout échec. La porte des noms ne peut pas juger le canal : ses tables SONT les noms (144 bloquants par construction, mesuré le 27/09/2026). L'envoi passe sur code 0 **et** verdict PASS lu dans la sortie, jamais sur l'un seul (TF-1373) ; contrôle introuvable, sortie illisible ou muette → refus qui le dit. Sur demande seulement, jamais dans le jeu par défaut ; là où le pre-push du parc est posé, l'installeur dit CONFLIT. Prouvé par le cas 11 de `scripts/self-test-hamecon-publication.mjs` : le contrôle y est remplacé par un jouet — PASS → la branche arrive au distant ; FAIL → refusé, rien au distant, la seule règle en échec imprimée ; code 0 sans verdict → refusé ; filtre déjà fini dans les deux sens ; `--no-verify` ; retrait. Rouge sur l'installeur d'avant : 8 échecs sur 50 cas. Né de la décision humaine du pilot du 27/09/2026 (D-30 (a)) | cli | ✅ |
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
| Lecture d'une page par un tiers sans contexte | `scripts/oracle-lecture-tiers.mjs <page.html> --profil <profil.json> [--juge <cli>] [--reponse <lecture.json>]` — **T1** la page dit ce qu'elle permet de **décider** · **T2** tout en-tête de colonne et tout **sigle** d'en-tête est **glosé de façon atteignable** (`data-definition`, `<abbr title>`, `title=`, `aria-describedby` vers un élément non vide, glossaire, prose — frontières Unicode depuis TF-1445) · **T3** la page offre au moins un **geste**, ou **déclare** être en lecture seule · **T4** *(invocation explicite, coût modèle)* le juge reçoit l'**instantané seul**, sans brief ni code, et répond à trois questions — **un « je ne sais pas » = FAIL**. **Routé par défaut sur les pages sous `output`** (TF-1446 : `ext` .html/.htm, `chemins` output) — T1-T3 seulement, T4 restant explicite | cli | ✅ |

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
`{forges}/digit-ai-forge-design/oracles/`, avec fixtures verte/rouge et self-test
(`node oracles/self-test.mjs` — 6 cas, 38 règles). Deux conséquences assumées :

- **Racine des forges par `{forges}` (TF-1334, 26/09/2026).** Ces oracles ne sont pas
  empaquetés dans un skill : ils ne suivent pas `{skillsroot}`/`{skilldir}`. Leurs commandes
  portaient un chemin absolu `c:/dev/…`, vrai sur un poste et faux sur tout autre (23 commandes
  sur 71 au 26/09). Elles passent par `{forges}` : `FORGE_ROOT`, sinon le parent du dépôt
  `digit-ai-forge-agents`, sinon — copie installée — le parent du pilot résolu
  (`scripts/lib/forges.mjs`). Racine introuvable ou script absent de ce poste : **SKIP motivé**
  au lanceur, jamais un FAIL muet. Plus aucun chemin absolu dans une commande du JSON : la
  recette `scripts/self-test.mjs` le vérifie, dans les deux sens.
- **Déclenchement par contenu, pas par extension.** `ext` est vide et
  `content_patterns` exige le bandeau « Données de démonstration », obligatoire
  sur toute maquette. Sans ce garde-fou, `oracle-slop` S4 (noir et blanc purs)
  ferait échouer **chaque page chartée Digit-AI**, dont le boilerplate utilise
  `#FFFFFF`. Le conflit charte/S4 est documenté en tête de
  `{forges}/digit-ai-forge-design/corpus/tokens-digit-ai.css` et reste ouvert.

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
`{forges}/digit-ai-forge-conception/oracles/`, avec fixtures verte/rouge et self-test
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

## Oracles de la forge data (chantier forge-data, remontées §4 des 17/09 et 20/09/2026, v2.25.0)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Périmètre d'un livrable migré : ce que les visuels lisent, excédent non motivé refusé | `node {forges}/digit-ai-forge-data/oracles/oracle-delimiter.mjs <perimetre.json> --json-only` — format `forge-data/perimetre@1` ; DL1 forme, DL2 relevé identifié (par/date/source), DL3 rien de ce que le lecteur voyait n'est perdu, DL4 excédent non motivé BLOQUE, DL5 déclarations résolvent, DL6 taux recalculé (TF-1180) | cli | ✅ |
| Chaîne de travail déclarée : étapes ordonnées, chacune avec un porteur qui existe | `node {forges}/digit-ai-forge-data/oracles/oracle-enchainer.mjs <chaine.json> --json-only` — format `forge-data/chaine@1` ; CH1 forme, CH2 rangs contigus, CH3 porteur existant, CH4 règles retrouvées chez leur porteur, CH5 geste humain enregistré, CH6 document ↔ étapes (TF-1179) | cli | ✅ |
| Reconstruction d'un rapport existant : mise en page conservée, jamais réinventée | `node {forges}/digit-ai-forge-data/oracles/oracle-reconstruire.mjs <reconstruction.json> --json-only` — format `forge-data/reconstruction@1` ; RS1 forme, RS2 doctrine du repli (motif ≥ 6 mots), RS3 bijection des pages, RS4 bijection des visuels au pixel, RS5 écarts motivés, RS6 ressources portées et référencées (TF-1176) | cli | ✅ |
| Livrable dont l'usage est un rendu : liaisons, mesures, visuels vides, geste de vérification déclaré | `node {forges}/digit-ai-forge-data/oracles/oracle-rendre.mjs <rendu.json> --json-only` — format `forge-data/rendu@1` ; RN1 forme, RN2 liaisons visuel → modèle, RN3 mesures existantes et typées, RN4 visuels vides dits, RN5 geste de vérification du rendu réel déclaré (TF-1175) | cli | ✅ |
| Lineage déclaré complet (niveau OpenLineage) | `node {forges}/digit-ai-forge-data/oracles/oracle-tracer.mjs <lineage.json> --json-only` — format `forge-data/lineage@1` ; T1 forme, T2 entrées datées, T3 transformations typées, T4 sorties horodatées, T5 méta-lineage (confiance), T6 granularité colonne, T7 namespace de chaque dataset, T8 cibles structurées (TF-1197) | cli | ✅ |
| Qualité de données : assertions exécutables (niveau Great Expectations) | `node {forges}/digit-ai-forge-data/oracles/oracle-profiler.mjs <assertions.json> --json-only` — format `forge-data/assertions@1` ; P1 forme, P2 objet + type du jeu fermé avec ses paramètres exacts, P3 aucun vocabulaire subjectif, P4 pont qualité↔lineage (TF-1197) | cli | ✅ |
| Restitution : chiffres ancrés, déclaré → généré (niveau dbt) | `node {forges}/digit-ai-forge-data/oracles/oracle-restituer.mjs <rapport.md> --json-only` — frontmatter `lineage_ref:` ; R1 forme, R2 chiffres complets, R3 bijection corps ↔ déclarations, R4 lineage_ref existant, R5 couverture des nombres de prose, R6/R7/R9 références croisées, R8 vocabulaire du destinataire (TF-1197) | cli | ✅ |
| Modèle dimensionnel déclaré (niveau Kimball) | `node {forges}/digit-ai-forge-data/oracles/oracle-modeliser.mjs <modele.json> --json-only` — format `forge-data/modele-dimensionnel@1\|@2` ; M1 forme, M2 granularité écrite, M3 dimensions conformes, M4 clés de substitution et naturelle, M5 dimension temps, M6 matrice en bus, M7 décisions d'architecture portées (TF-1197) | cli | ✅ |
| Data contract exécutable (niveau ODCS v3.1) | `node {forges}/digit-ai-forge-data/oracles/oracle-contractualiser.mjs <contrat.json> --json-only` — format `forge-data/contrat@1` ; C1 forme, C2 schéma typé, C3 SLA du jeu fermé, C4 propriétaire joignable, C5 semver + statut ODCS (TF-1197) | cli | ✅ |
| Couverture d'un mapping contre l'inventaire de sa source | `node {forges}/digit-ai-forge-data/oracles/oracle-couvrir.mjs <couverture.json> --json-only` — format `forge-data/couverture@1` ; CV1 forme, CV2 source identifiée, CV3 objets cités existants, CV4 règles de rattachement déclarées, CV5 orphelins nommés et comptés, CV6 taux recalculé (TF-1197) | cli | ✅ |
| Projection des évolutions d'une couche : complétude ligne à ligne, provenance typée | `node {forges}/digit-ai-forge-data/oracles/oracle-evoluer.mjs <evolutions.json> --json-only` — format `forge-data/evolutions@1` ; EV1 forme, EV2 lignes complètes, EV3 complétude interne, EV4 provenance sans objet remontée en dette, EV5 comptes recalculés, EV6 arbre schéma › table › colonne, EV7 objets résolus listés (TF-1197) | cli | ✅ |
| Rapprochement modèle ↔ extrait externe, bijection dans les deux sens | `node {forges}/digit-ai-forge-data/oracles/oracle-rapprocher.mjs <rapprochement.json> --json-only` — format `forge-data/rapprochement@1` ; RA1 forme, RA2 bijection des deux sens, RA3 correspondance non littérale référencée au dictionnaire, RA4 absence motivée (TF-1197) | cli | ✅ |
| Réconciliation Gold ↔ modèle sémantique sous tolérance déclarée | `node {forges}/digit-ai-forge-data/oracles/oracle-reconcilier.mjs <reconciliation.json> --json-only` — format `forge-data/reconciliation@1` ; RC1 forme, RC2 tolérance déclarée, RC3 deux lots nommés, RC4 homologues présents, RC5 écarts dans la tolérance, RC6 fraîcheur des lots, RC7 info (TF-1197) | cli | ✅ |
| Projet de transformation : dépendances, description, tests rejoués, doc générée (niveau dbt-core) | `node {forges}/digit-ai-forge-data/oracles/oracle-transformer.mjs <target/manifest.json> --json-only` — signature `dbt_schema_version` ; TR1 manifest lisible, TR2 dépendances déclarées, TR3 description, TR4 test attaché, TR5 tests rejoués, TR6 catalog.json présent (TF-1197) | cli | ✅ |
| Bascule d'un rapport migré : six dimensions, angle mort, définition changée, verdict composé | `node {forges}/digit-ai-forge-data/oracles/oracle-qualifier.mjs <qualification.json> --json-only` — format `forge-data/qualification-rapport@1` ; QR1 forme, QR2 angle mort écrit, QR3 chaque classe porte sa pièce, QR4 interactions non jugeables déclarées, QR5 écarts qualifiés, QR6 bascule composée, QR7 définition changée, QR8 fractions régulières recalculées (TF-1197) | cli | ✅ |

Les quatre premiers oracles ci-dessus vivent hors `~/.claude/skills` : leur source est
`{forges}/digit-ai-forge-data/oracles/`, avec fixtures verte/rouge et self-test
(`node oracles/self-test.mjs` — 324 PASS, 0 FAIL au 17/09/2026, sur l'ensemble des oracles du
dépôt). Mêmes conséquences assumées que pour les forges design et conception :

- **Chemins absolus dans `cmd`.** Ces oracles ne sont pas empaquetés dans un skill ;
  déplacer le dépôt casse l'invocation — la remonter ici le jour où ça arrive.
- **Déclenchement par contenu, pas par extension.** `ext` est vide et `content_patterns`
  matche la signature `"format": "forge-data/<nom>@1"` de chaque artefact JSON — router
  tout `.json` du parc ferait juger n'importe quel fichier de configuration par un oracle
  qui n'attend qu'un périmètre, une chaîne, une reconstruction ou un rendu.
- **Frontières croisées, déclarées dans chaque `non_juge`.** Les quatre oracles se
  découpent le même incident (retour Produit-62, RF-21/RF-22/RF-24/RF-25) sans se
  recouvrir : `oracle-rendre` juge les liaisons du rapport CONSTRUIT, `oracle-reconstruire`
  juge la fidélité de sa mise en page à un rapport d'origine, `oracle-delimiter` juge le
  périmètre AVANT que le rapport existe (le symétrique d'`oracle-couvrir`, déjà au
  registre), `oracle-enchainer` juge que la procédure qui enchaîne ces étapes est écrite et
  que chaque étape nomme un porteur qui existe — y compris ces quatre oracles eux-mêmes.
- **Les onze autres oracles du dépôt sont inscrits** (TF-1197, 20/09/2026, v2.25.0) —
  `oracle-tracer`, `oracle-profiler`, `oracle-restituer`, `oracle-modeliser`,
  `oracle-contractualiser`, `oracle-couvrir`, `oracle-evoluer`, `oracle-rapprocher`,
  `oracle-reconcilier`, `oracle-transformer` et `oracle-qualifier` (livré le 19/09). Le
  dépôt en compte quinze au 20/09/2026 (relevé sur disque : `oracles/oracle-*.mjs`), et les
  quinze ont désormais une entrée. Chaque `non_juge` de ce registre est la sortie RÉELLE de
  l'oracle, recopiée à la lettre : les onze ont été exécutés sur leur fixture verte, tous
  PASS, et leur `non_juge` lu dans le JSON émis — jamais rédigé ici.
- **Deux artefacts sans signature `format`.** Le rapport de restitution est un `.md` à
  frontmatter (routé par `^lineage_ref\s*:`) et le projet de transformation est le
  `manifest.json` que dbt produit (routé par `"dbt_schema_version": "https://schemas.getdbt.com/dbt/manifest`).
  Les deux motifs sont aussi étroits que les signatures `format` : déclarer `.md` ou `.json`
  ferait juger tout le parc par un oracle qui n'attend qu'un rapport ou qu'un manifeste.
- **`fixtures/manifest.json` de ce skill non modifié.** Convention constatée sur les deux
  précédents de ce type (forge-design, forge-conception) : un oracle délégué vivant dans un
  dépôt frère prouve sa paire rouge/verte par le self-test de CE dépôt, pas par le manifest
  de `quality-oracles` — aucune des entrées forge-design/forge-conception déjà au registre
  n'y figure. Reconduit ici plutôt qu'inventé.

## Injection du 15/08/2026 — restitution lisible (TF-0235, v2.11.0-v2.11.1)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Restitution lisible : la page se conçoit pour ses lecteurs | `node {forges}/digit-ai-forge-design/oracles/oracle-restitution.mjs <page.html> --json-only` — RL-1 vue d'ensemble (verdict, ≥ 3 KPI, navigation de vues), RL-3 KPI complets (valeur, définition, repère), RL-4 question des graphiques, RL-9 chemins de lecteurs, RL-10 manifeste d'écarts | cli | ✅ |

- **Périmètre déclaratif** : ne juge que les pages portant `data-restitution` ;
  les autres reçoivent SKIP motivé — jamais un FAIL sur une page hors périmètre.
- **Référentiel** : `{forges}/digit-ai-forge-design/REFERENTIEL-RESTITUTION.md` ;
  RL-2/5/6/7/8 déclarées non jugées (socle L7, composant filtres G1-G6, rendu,
  revue D8 de critique-le-design, iso-contenu de campagne). Règle opposable : R-36
  (`REGLES-PROJET.md` §P du pilot).
- **v2.11.1** : `timeout_ms: 600000` posé sur les deux oracles claims — le budget
  par défaut de 120 s tuait `oracle-claims` sur les livrables de ~500 Ko (PASS en
  7 min lancé seul, constaté sur le rapport SEO Produit-02 du 15/08, TF-0239).

<!-- Section REPORTÉE par le pilot le 10/09/2026 (TF-1006, mandat humain A-6). Une session d'engagement l'avait écrite le 10/09 à 08:21 dans la COPIE INSTALLÉE (~/.claude/skills), jamais dans cette source ; la propagation suivante l'a effacée en silence, et le pilot l'a reportée ici depuis sa lecture d'avant l'effacement, après pseudonymisation par la chaîne du parc. L'oracle décrit vit dans le dépôt du produit ; ce registre ne fait que l'indexer. Règle rappelée : une remontée §4 s'écrit ICI, dans la source versionnée — la copie installée est réécrite à chaque propagation. -->

### Oracles portés par un engagement (remontée §4 — 10/09/2026)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Support Design Authority Client-A (parité de format avec le deck de référence + faits portés) | `node c:/dev/_Client-A/Produit-64/tools/design-authority/oracle-da-pptx.mjs <deck.pptx> --faits <faits.json>` — F1 format 16:9, F2 polices ⊆ {Century Gothic, Arial, Courier New}, F3 couleurs de texte ⊆ palette relevée, F4 pied de page + pagination continue, F5 couverture / intercalaires / MERCI, F6 faits attendus présents, F7 débordement probable (heuristique), F8 zip ([Content_Types].xml 1re entrée, zéro JPEG/transition). Oracle visuel de confirmation : `tools/design-authority/rendre-pptx.ps1` (export PNG par PowerPoint COM — remplace le smoke-test LibreOffice absent du poste) | cli | ✅ |

## Injection du 17/09/2026 — transparence des contenus publics générés (TF-1030, v2.21.0)

| Domaine | Oracle (invocation) | Type | Statut |
|---|---|---|---|
| Transparence des contenus publics générés par IA (article 50 du règlement européen sur l'IA) | `scripts/oracle-transparence.mjs <fichier.md .html .txt> [--mentions <mentions.json>] [--echeances <echeances.json>] [--date AAAA-MM-JJ] [--non-genere]` — **TR1** mention d'assistance par IA dans le texte **lisible par un humain**, formules **fournies** par `--mentions` (aucune formule d'émetteur codée dans l'oracle), bloquant **sans échéance** · **TR2** marquage **lisible par machine** sur une page HTML, sévérité pilotée par une échéance en donnée · **TR3** contenu déclaré non généré (`--non-genere`, ou frontmatter `genere: false`) → **SKIP motivé, jamais PASS** | cli | ✅ |

- **L'obligation existait, le contrôle n'existait pas.** L'article 50 s'applique depuis le
  2026-08-02. La règle de transparence a été écrite le 11/09/2026 dans la règle de marque d'un
  émetteur, et elle citait un contrôle exécutable — `scripts/controler-transparence.mjs`, appelé
  **17 fois dans 9 fichiers** d'un produit et présent nulle part (mesure du 14/09/2026). Cette
  entrée est ce contrôle, écrit une fois pour le parc au lieu d'une fois par produit.
- **Agnostique de l'émetteur.** Les formules admises sont une **donnée** passée par `--mentions`
  (tableau de chaînes, ou objet à champs `mentions` et `expressions`) ; sans fichier, un jeu
  **générique** français et anglais s'applique. La fixture verte porte une formule **inventée**
  qui ne correspond à aucun motif par défaut : son PASS prouve que l'oracle lit ce qu'on lui
  donne. Une marque qui change sa formule change son fichier, pas cet oracle.
- **La date vit en donnée, et le banc le prouve.** L'échéance du marquage machine — 2026-12-02,
  report réglementaire **rapporté et non vérifié**, source `references/PLATEFORME-LINKEDIN.md` §3
  du pilot — vit dans `references/echeances.json`, au format `echeances@1` **repris** du socle
  `digit-ai-page-html` et non redécoupé. Le banc joue une donnée d'essai à date **différente**
  (2026-10-15) : un oracle qui coderait la vraie date en dur ferait rougir le self-test.
- **La convention de marquage est INTERNE, pas une norme.** Une balise meta `ai-generated` au
  contenu non vide dans le `<head>`, la forme la plus simple qu'une machine sache lire ; la balise
  meta `generator` portant un marqueur d'IA est admise, parce que c'est la forme que **nomment**
  les règles de marque rencontrées dans le parc. Aucun texte publié n'impose l'une ou l'autre.
- **`ext` vide à dessein.** Le contrôle porte sur les contenus **destinés au public**, et rien
  dans une extension ne dit qu'un fichier est public : router tout `.md` du parc ferait rougir
  chaque note interne. Invocation explicite, comme `oracle-exigences-ao` ou `oracle-post-linkedin`.
- **Appel historique côté produit.** Un produit qui appelle encore son
  `scripts/controler-transparence.mjs` invoque désormais celui-ci, sans rien créer chez lui :
  `node <racine>/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/oracle-transparence.mjs <fichier> --mentions <formules de la marque>.json`

## Injection du 26/09/2026 — une garde des promesses, tenue une fois (TF-1365, v2.28.0)

Le lot `Produit-02 - RETOURS - 20260922a` (RT-97) : la garde de vocabulaire d'un produit refusait
« spa » sur ses pages, mais le générateur de ses annonces ne l'appelait pas — deux mots-clés « spa »
achetés pour un domaine sans spa, vus par l'exploitant. Même classe la veille, corrigée à la main :
« piscine privée » pour une piscine partagée, 10 minutes annoncées pour 15. La réponse est une
DONNÉE déclarée par le produit (loi n° 4), jugée par un seul oracle pour tous les textes dérivés des
mêmes faits. Le format, le plus simple qui tienne les trois familles — chacune optionnelle :

```json
{
  "format": "quality-oracles/promesses@1",
  "source": "fiche d'exploitation du domaine, relevée le AAAA-MM-JJ",
  "absents":   [ { "equipement": "spa", "termes": ["spa", "jacuzzi", "hot tub"], "motif": "pas de spa" } ],
  "distances": [ { "lieu": "…", "termes": ["du Phare"], "valeur": 15, "unite": "min" } ],
  "capacites": [ { "objet": "personnes", "termes": ["personnes", "voyageurs"], "max": 6 } ]
}
```

- **Où le poser** : `promesses.json` (ou `donnees/promesses.json`) à la racine du produit ; l'oracle
  le cherche au-dessus de la cible, ou le reçoit par `--referentiel`. Absent → SKIP motivé.
- **Ce qui n'est pas une promesse** : une mention niée dans les trois mots qui la précèdent
  (« pas de spa », « sans jacuzzi ») et une ligne d'EXCLUSION d'un fichier d'annonces (cellule
  « Négatif… », « Negative… », « Exclusion ») — exclure « spa » est précisément la correction de RT-97.
  Les deux sont comptées au `non_juge`.
- **Preuve** : deux paires au manifest (`promesses-annonces`, `promesses-page`), rouge FAIL sur P1,
  P2 et P3, verte PASS avec exclusions et négations écartées.

## Routage du 28/09/2026 — lecture-tiers juge les pages livrées (TF-1446, v2.30.0)

Le lot `Produit-78 - RETOURS - 20260928b` (RQ-3) : `run-oracles` a rendu CONFORME une étude et sa
page sans appeler trois oracles qui y trouvaient des défauts réels, joués ensuite un par un. Pour
l'un d'eux, `oracle-lecture-tiers`, rien ne justifiait ce silence : T1-T3 sont déterministes et
gratuits, et T4, qui appelle un modèle, ne s'arme que par `--juge`, `--reponse` ou
`lecture_tiers.actif: true` au profil, faux dans les deux profils livrés.

- **Le routage** : `ext` [.html, .htm] et un critère neuf, `chemins` [output]. `run-oracles` ne
  route un fichier vers cet oracle que si son chemin résolu traverse un dossier `output`.
- **Pourquoi `output` seulement** : mesuré sur les 74 pages suivies du pilot et des forges, les
  10 pages sous `output` échouent toutes pour de vrais manques (phrase d'intention absente, en-têtes
  non glosés) ; les 64 autres sont des vues générées, de la documentation et des gabarits, dont la
  précision n'a pas été mesurée.
- **Ce qui n'est pas routé, et pourquoi** : `oracle-transparence` rendrait FAIL sur 325 des 343
  livrables sous `output` du pilot, alors que son `non_juge` réserve l'obligation aux contenus
  PUBLICS, décidés à l'invocation (TF-1030) ; `oracle-premisse-acces` a rendu 37 FAIL sur 335
  documents du pilot, et l'échantillon lu montre des blocs de synthèse pris pour des prémisses
  d'accès. Les deux restent à invocation explicite ; les étendre est une décision du pilot.
- **Coût** : sur une page d'étude du pilot, `run-oracles` passe de 30,3 s à 29,1 s (bruit de mesure) ;
  l'oracle joue en 55 ms environ par page.
- **Preuve** : bloc TF-1446 de la recette, l'entrée réelle du registre jouée sur une page sous
  `output` (FAIL, intention absente) et sur la même page hors `output` (non routée).

## Injection du 01/10/2026 — les polices embarquées d'un PPTX (TF-1501, v2.31.0)

Le lot du 30/09/2026 (RA-02) : cinq versions d'un deck de propale sont sorties avec huit polices
embarquées fausses, 232 contours faux sur 235 pour la police du corps de texte. Sur un poste qui
n'a pas la police, le texte s'affichait en éclats. Toutes les portes du registre ont rendu PASS,
`oracle-pptx` compris, dont le `non_juge` ne disait rien des polices : aucune ne décodait la copie
embarquée, et le poste producteur lit la police installée. La cause mesurée chez le produit tient
au composant de Windows qui embarque les polices, `t2embed.dll` : la table de son codage en
triplets était altérée dans la mémoire du processus PowerPoint qui exportait.

- **Le juge** : `scripts/oracle-polices-embarquees.mjs`, scaffoldé par `write-an-oracle` puis durci
  avec le contrôle écrit par le produit, porté sans nom, sans deck ni rapport. Son moteur,
  `scripts/polices-embarquees.py`, décode chaque partie `ppt/fonts/` par `t2embed.dll` chargée en
  privé, puis joue E0, E1 et E2. E1 compare la copie à la police de référence de même famille,
  graisse, pente et version : celle du poste, ou celle du dossier désigné par `--polices`. Une
  autre version de la police n'a pas les mêmes glyphes aux mêmes indices : E1 est alors déclarée
  non jouée, et E2 juge seule.
- **Le déclencheur** : un critère neuf de `run-oracles`, `parties_paquet` [`ppt/fonts/`]. Un `.pptx`
  ou un `.potx` n'est routé vers ce domaine que si son paquet porte une partie sous ce préfixe ; le
  répertoire central se lit sans rien décompresser, et un paquet illisible reste routé. Appelé à la
  main sur un deck sans police embarquée, l'oracle rend un SKIP motivé « sans objet ».
- **Ce que le poste doit avoir** : Node, un Python 3 et fontTools, importé par l'interpréteur
  résolu ou à défaut fourni par `uv run --with fonttools`, et Windows pour décoder le MTX. Il en
  manque un : SKIP dont le motif nomme le prérequis, jamais un PASS.
- **Hors de Windows** : le décodeur de référence est `t2embed.dll`. Le portage par libeot, qui
  rend les mêmes contours selon le produit, n'a pas été mesuré sur ce poste (ni libeot ni
  compilateur) : il n'est pas branché, et le SKIP le dit.
- **Mesure** : sur les 22 decks à polices embarquées d'un produit, lus en place le 01/10/2026,
  l'oracle rend 22 verdicts sur 22 identiques à ceux de l'outil d'origine. Les 5 versions fautives
  échouent par E1 et E2, les 17 autres passent, en 1,2 à 4,4 s par deck.
- **Preuve** : la paire `polices-embarquees` du manifest, sur une police FICTIVE « Essai Fictif »
  embarquée par `TTEmbedFont` comme le fait PowerPoint (`fixtures/gen-polices-embarquees-fixtures.py`).
  La rouge a 5 glyphes sur 17 aux contours déplacés hors de la boîte déclarée, la verte est le
  même deck sain. Le bloc TF-1501 de la recette exige FAIL par E1 et par E2, puis PASS, et
  n'admet un SKIP que si son motif nomme un prérequis absent. Il joue aussi `parties_paquet` sur un
  registre jouet : le deck qui porte `ppt/fonts/` est routé, le deck sans police ne l'est pas,
  le paquet illisible l'est.

## Extension du 01/10/2026 — le même juge pour chaque document généré (TF-1504, v2.32.0)

La décision humaine du 30/09/2026 (RP-04) demande que l'erreur des polices embarquées ne se
reproduise dans aucun document généré. Le juge des PPTX s'étend aux trois autres formes de
livrable qui embarquent des polices, chacune décodée comme la décode le poste du destinataire.

- **DOCX** : les polices que `word/fontTable.xml` déclare embarquées (`w:embedRegular`,
  `w:embedBold`…) sont désobscurcies par leur clé `w:fontKey` (ECMA-376, partie 1, 17.8.1) ; une
  police déclarée dont la partie manque, ou dont la clé est illisible, est un constat E0. Déclenché
  par une partie `word/fonts/` dans le paquet.
- **PDF** : les programmes de police de tous les descripteurs du fichier, lus par pypdf. Les
  programmes TrueType (`FontFile2`, `FontFile3 /OpenType` à contours `glyf`) sont jugés ; les
  programmes CFF et Type 1 sont comptés et dits, non jugés. Un lecteur de PDF répare ce qu'il peut
  d'un programme de police : pour un PDF, E0 **avertit** (le niveau production le promeut), il ne
  bloque pas. Tout PDF est routé ; sans programme embarqué, SKIP « sans objet ».
- **Page HTML** : les polices en `data:` d'une règle `@font-face`, la forme des pages du socle
  (A1), décodées depuis le base64 puis le WOFF2, le WOFF ou le sfnt. Déclenché par le contenu
  (`content_patterns`) : seules les pages qui embarquent une police sont routées.
- **E1 hors PPTX** : un sous-ensemble peut renuméroter ses glyphes. Les indices servent si la
  cmap Unicode de la copie les confirme pour chaque point de code commun ; sinon les glyphes
  s'apparient par point de code, contours aplatis. Sans cmap Unicode commune, E1 n'est pas jouée,
  et c'est dit.
- **Une table que les lecteurs ne lisent pas ne fait pas un constat** : la première passe sur les
  PDF du poste rendait 4 E0 sur une table `post` de format inconnu. La table est ignorée et dite ;
  seules les tables des contours (`head`, `maxp`, `loca`, `glyf`) font un E0.
- **Mesure du 01/10/2026, sur les documents du poste lus en place** : 2 DOCX (22 polices), 2 PASS,
  E2 jouée sur 22 polices et E1 sur 20, sans constat. 198 PDF (844 programmes TrueType décodés),
  E2 jouée sur 840 et E1 sur 447, sans constat E1 ni E2 : 164 PASS, dont 4 avec un avertissement
  E0 (une table `glyf` plus courte que ne l'annonce `loca`, chez un même producteur), 34 SKIP sans
  objet, 0 FAIL. 44 pages à police en `data:` (148 polices WOFF2), E2 jouée sur 148, E1 sur aucune
  faute de police de référence de même version sur ce poste, sans constat : 42 PASS et 2 SKIP, des
  gabarits dont la donnée base64 est un espace réservé. De 0,5 à 11 s par document.
- **Preuve** : trois paires au manifest (`polices-embarquees-docx`, `-pdf`, `-html`), sur la police
  fictive « Essai Fictif » ; le bloc TF-1504 de la recette exige FAIL par E1 et par E2 sur chaque
  rouge, PASS sur chaque verte, et joue les entrées réelles sur un dossier jetable — le DOCX qui
  porte `word/fonts/`, la page à police en `data:` et le PDF sont jugés, le DOCX et la page sans
  police embarquée ne sont pas routés.
- **Ce qui reste hors de ce juge** : une police appelée par URL depuis une page (fichier voisin,
  réseau), qui n'est pas embarquée ; une page de plus de 1 Mo, dont `run-oracles` ne lit pas le
  contenu pour le routage (aucune parmi les 44 mesurées) ; les contours CFF et Type 1 ; le rendu
  réel chez le destinataire.

## Correction du 01/10/2026 — la charte PPTX sémantique suit le profil (TF-1490, v2.33.0)

Le lot `Produit-64 - RETOURS - 20260928c` (RA-5) : sous `--profil generique`, le support d'un
client au format de ce client rendait 69 constats de la charte sémantique, 21 S3 sur des icônes de
contenu et 48 S4 faute d'espace réservé, quand son pied de page et sa pagination vivent en zones de
texte. Le deck de référence du format, produit hors de la forge, en porte autant. Seule issue au
vert : une exemption par fichier, à renouveler pour chaque support. La règle qui l'aurait évité
était déjà écrite pour le domaine voisin (TF-1130) : les règles de marque passent par le profil.

- **La commande** passe désormais `--profil {profil}`, comme celle du domaine « Support de
  diapositives ». L'oracle lit deux clés de la politique `pptx` du profil :
  `logos`, la zone admise pour les logos (`couverture-interlocuteurs` ou `partout`), et
  `pied_de_page`, la forme admise (`espace-reserve`, ou `zone-texte` : un texte sous 80 % de la
  hauteur de la diapositive, et une pagination qui finit par un numéro).
- **Les profils livrés** : digit-ai déclare `couverture-interlocuteurs` et `espace-reserve`, la
  charte d'avant, messages compris mot pour mot ; generique ne déclare rien, et S3 et S4 sont dites
  NON jouées. Un profil client déclare sa propre forme. Sans `--profil`, l'oracle juge comme avant.
- **Mesure du 01/10/2026 sur les 91 decks du poste lus en place**, hors fixtures et archives : la
  commande d'avant rendait 742 constats S3 et 1 636 constats S4, et 80 decks en FAIL ; sous
  generique, 0 constat S3 ou S4 et 11 decks en FAIL, pour S1, S2 ou S5 ; sous digit-ai, des
  constats identiques à ceux d'avant sur les 91 decks.
- **Preuve** : deux paires au manifest sur un support FICTIF au format d'un client
  (`fixtures/gen-charte-pptx-client-fixtures.py`, profil de jeu d'essai `fixtures/profil-charte-client.json`).
  `charte-pptx-profil-client` : vert sous son profil, rouge quand une diapositive perd pied de page
  et pagination. `charte-pptx-profil-digit-ai` : le même support vert est rouge sous digit-ai, par S3
  et S4. Le bloc TF-1490 de la recette joue aussi l'entrée réelle par le lanceur : PASS sous
  generique, FAIL sous le profil par défaut, et la rouge historique garde ses messages.

## Injection du 01/10/2026 — la configuration d'infrastructure (TF-1492, v2.34.0)

Le lot `Produit-03 - RETOURS - 20260929a` (RA-48) : le fichier de variables de production portait
`budget_start_date = "2026-08-01T00:00:00Z"`, écrit pour une mise en production prévue le 26/08.
Appliqué le 29/09, il a été refusé (400, date de début antérieure au mois courant) : 10 ressources
créées sur 11, le budget absent. La valeur était juste le jour où elle a été écrite, et rien ne
l'a rejugée contre la date d'application. Aucun oracle du registre ne jugeait une configuration
d'infrastructure.

- **L'oracle** : `scripts/oracle-terraform.mjs`, scaffoldé par `write-an-oracle` puis durci, en deux
  étapes, les standards avant la maison (R3). L'étape **standard** joue `terraform fmt -check` (T1),
  localisé à la première ligne que fmt réécrirait, puis `terraform validate -json` (T2) sur le
  dossier de configuration, sans `terraform init` : l'oracle n'écrit rien dans la cible et ne
  télécharge rien. L'étape **maison** joue D1 en Node sur les `.tf` et `.tfvars`.
- **D1** : une valeur datée écrite en dur (une chaîne qui est une date ISO 8601, hors des blocs
  `tags` et `labels`) dont le mois précède le mois d'application est refusée. La date d'application
  se donne par `--date-application AAAA-MM-JJ`, sinon c'est le jour du poste. Le remède prescrit
  est la date calculée à la création : `formatdate("YYYY-MM-01'T'00:00:00'Z'", timestamp())`,
  avec `lifecycle { ignore_changes }`.
- **Ce que T2 ne juge pas** : quand `validate` parle du poste et non de la configuration
  (fournisseur ou module non installé ou abîmé, version de Terraform hors de `required_version`),
  T2 est dite non jouée. La première passe sur le parc rendait 21 faux constats T2 de cette sorte.
- **Terraform absent du poste** : l'étape standard rend SKIP avec son motif ; D1 juge toujours. La
  sortie porte le verdict de chaque étape (`etapes`), et l'oracle ne rend SKIP que si aucune étape
  n'a jugé.
- **Mesure du 01/10/2026** sur les 212 fichiers `.tf` et `.tfvars` du poste (33 dossiers), lus en
  place et appliqués au 01/10 : 203 PASS et 9 FAIL. Les 3 D1 sont des dates de début d'août dans des
  budgets, la classe même du lot ; les 6 T1 sont des fichiers hors du format canonique. Aucun
  fichier n'a été écrit dans les dossiers jugés ; de 0,3 à 6 s par fichier.
- **Preuve** : deux paires au manifest, `terraform` (D1, jouée partout) et `terraform-forme` (T1,
  Terraform requis). Le bloc TF-1492 de la recette rejoue le banc du lot (août au 29/09 refusée,
  septembre au 29 et au 30/09 acceptée, septembre au 01/10 refusée) et l'étalonnage sur Azure (juin
  refusé en juillet, juin et juillet acceptés à leur mois). Il joue aussi les remèdes que les
  messages prescrivent (`terraform fmt`, la date calculée), T2 dans ses deux sens, et le poste sans
  Terraform.
