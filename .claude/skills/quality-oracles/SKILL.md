---
name: quality-oracles
description: >
  Loi transversale de qualité (audit exécuté) : avant de finaliser ou diffuser TOUT livrable (rapport, HTML, PPTX,
  SVG, données, code, calcul, document, schéma, prompt, message), le vérifier par l'ORACLE exécuté
  de son domaine — jamais par confiance ni en jugeant son propre code. Fournit la grille des classes
  de défaut (information, données, calculs, logique, complétude, cohérence, process, affichage,
  format, sécurité), le registre des oracles par domaine (registre-oracles.md, source unique), les
  profils par contexte (digit-ai, générique, client) et la règle de remontée §4 (domaine non couvert
  → définir + enregistrer un oracle). Couche méta au-dessus des oracles délégués (digit-ai-page-html,
  prompt-analyzer-l99…). Déclencher avant toute livraison, ou quand l'utilisateur demande de
  vérifier / valider / contrôler un livrable ou dit « prêt ? / diffusable ? ». Use when finalizing
  or shipping any deliverable. Ne pas déclencher pour créer un oracle (→ write-an-oracle) ni
  auditer un skill (→ ameliore-un-skill).
metadata:
  version: "2.9.0"
---

# SKILL — Oracles de qualité (loi transversale)

**Principe.** Un livrable n'est « fait » que lorsque **chaque affirmation qu'il porte est vérifiée par un oracle
exécuté** — jamais par confiance, jamais en jugeant son propre code. Charge de la preuve **inversée** : chercher activement ce qui pourrait être faux, manquant ou cassé **avant** de livrer.

## 1. Grille des classes de défaut (rien n'y échappe)
Passer en revue, pour chaque livrable, **toutes** les classes ci-dessous :
- **Information** — vraie, à jour, sourcée ; aucune affirmation invérifiée présentée comme un fait.
- **Données** — complètes, cohérentes (totaux, unités, formats, doublons), périmètre attendu couvert.
- **Calculs** — rejoués par exécution, ni estimés ni recopiés ; reproductibles.
- **Logique & complétude** — enchaînement valide, hypothèses explicites ; répond à *toute* la demande, cas limites (vide / énorme / spéciaux) traités.
- **Cohérence** — interne (un même chiffre concorde entre sections), avec les sources, avec les versions.
- **Process / méthode** — la bonne méthode réellement suivie (références *lues*, étapes non sautées).
- **Affichage / rendu** — sans débordement, contraste faible ni chevauchement ; jamais jugé depuis le code seul.
- **Format / livraison** — type réel de fichier, encodage, nommage & versioning, autoportance, liens valides.
- **Sécurité / confidentialité** — aucun secret ni donnée sensible exposé.

## 2. Vérifier par l'oracle du domaine
- **Identifier les domaines** touchés (souvent plusieurs) ; pour chacun, lancer son oracle depuis le
  **registre** [`references/registre-oracles.md`](references/registre-oracles.md) (source unique). L'oracle
  **observe l'artefact réel**, pas le code source. Puis **auto-critique adversariale** contre la grille §1 :
  « qu'est-ce qui, ici, pourrait être faux / manquant / cassé ? » (dont ce que les oracles ne mesurent pas — `non_juge`).
- **La revue manuelle est un REPLI** : autorisée uniquement si **aucun oracle n'existe**, avec preuve
  traçable (`fichier:ligne`). Un contrôle automatisable doit être **outillé** (§4) ; revue sans preuve = ✓ sans oracle (§5).

## 3. Standard d'un oracle « poussé » (pour en définir de nouveaux)
1. **Déterministe & exécutable** — verdict PASS/FAIL reproductible, adossé à une **checklist canonique** versionnée.
2. **Observateur de l'artefact réel** — rendu / exécution / données ; jamais le seul code source.
3. **Couvrant les modes de défaillance connus** du domaine **et déclarant ce qu'il ne juge pas** (`non_juge`).
4. **À sortie localisante** (code retour + *où* est le défaut) et **autoportant**, rejouable dans les deux environnements.
5. **Prouvé par fixtures** — paire rouge/verte dans `fixtures/` (+ `manifest.json`) : le self-test exige
   FAIL sur la rouge, PASS sur la verte. **Un oracle qui ne sait pas échouer n'est pas un oracle.**

## 4. Règle de remontée (la liste grandit)
Domaine sans oracle au registre → **définir** (scaffold en une commande : skill compagnon **`write-an-oracle`** —
squelette + fixtures + entrées registre/manifest), **enregistrer**, **appliquer**. Chaque audit enrichit la bibliothèque — un domaine n'est jamais « jugé à l'œil » deux fois.
**Signalement = écriture (M1, D1, 23/07/2026)** : tout contrôle manuel sur un domaine hors registre produit **dans le tour même** une entrée dans la **file des candidats** (`file-candidats.md` du repo forge ; côté claude.ai : `/areas/forge-file-candidats.md`) — domaine, chantier, contrôle fait, défaut observé, date. Scaffold **obligatoire** (N1) dès : 2e occurrence **du même candidat** dans la file · rejeu d'un contrôle ad hoc dans un même fil · angle A1/A2 vide en contre-expertise d'un livrable client.
**Règle de famille (M1, D1, 08/08/2026)** — le compteur porte sur le **candidat**, jamais sur le libellé exact du domaine. Deux entrées comptent pour le même candidat si elles partagent **(a)** le **préfixe de domaine** — segment avant le premier tiret : `cadrage-reponse-ao`, `cadrage-acquisition` et `cadrage-programme-formation` forment la famille `cadrage` —, **ou (b)** la **même classe de défaut** consignée, quels que soient les libellés. Motif : trois occurrences d'un même motif sous trois noms différents ne déclenchaient jamais N1, le candidat restait gelé indéfiniment (constaté le 08/08/2026 sur `gabarits de cadrage A0 par famille de livrable`, en attente depuis le 24/07/2026). Le critère (a) est mécanique et s'applique seul ; le critère (b) est un rattrapage, à instruire quand les préfixes divergent.

**Spécification en amont (arbitrage Leviers, TF-0052, 11/08/2026 — « C armé par A »)** : avant tout
**livrable substantiel** (page, deck, rapport, dashboard, gabarit), produire un **plan de contenu**
— la liste des blocs et ce que chacun porte — et le confronter au **gabarit A0 de sa famille**
quand il existe (première famille instanciée : page HTML de restitution, gabarit A0 chez
forge-organization). Un écart se corrige sur 15 lignes de plan, pas sur 400 lignes de HTML.
L'injection automatique par hook (option B) est écartée : le type d'un livrable n'est pas
détectable avant l'écriture.

## 5. Honnêteté & fiabilité du process
- Ne **jamais recopier** un résultat d'une itération précédente ; itérer par **copie + éditions chirurgicales**.
- Toute valeur non vérifiable est **marquée** (« à vérifier »), jamais maquillée ; rapporter fidèlement,
  échecs inclus. **Un ✓ sans oracle exécuté n'est pas un ✓** (0 PASS = INCONCLUSIF, pas conforme).
- L'oracle est en **lecture seule** pendant la boucle : ni seuils, ni références, ni registre ne bougent
  entre deux itérations. Toute **exemption** vit dans `.oracles-exemptions.json` (fichier, domaine,
  justification, échéance — expirée = FAIL) et est listée dans la restitution. Modifier l'oracle en cours de boucle = gaming.
- **Un verdict dit sur quoi il porte (22/08/2026)** : le journal scelle l'empreinte du contenu jugé, et
  `--verifier-empreinte` refuse (exit 1) de confirmer un verdict dont la cible a changé depuis. Citer un `CONFORME`
  rendu sur un autre contenu est une affirmation fausse, pas une approximation.
- **Ligne de couverture obligatoire (M1, D1, 23/07/2026)** : toute restitution d'audit se clôt par
  « domaines jugés : N · hors registre : M → M candidats écrits ». Une restitution sans cette ligne
  est non conforme — contrôlable par l'oracle `etat-forge` (F4).

## 6. Proportionnalité
Calibrer l'effort à l'**enjeu** et à la **réversibilité** — mécanisé (v2.4) : `--niveau note|diffuse|production`
(défaut `diffuse`, env `QO_NIVEAU`) sélectionne les domaines et sévérités déclarés dans la section `niveaux` du profil
(`exclus`, `warn_toleres` — production promeut les warns en FAIL). **Plancher non désactivable codé en dur**
(format, secrets, calculs, claims) : un profil qui l'exclut = exit 2. Niveau tracé au journal et intégré à la clé de cache
(un PASS de niveau inférieur n'est jamais recyclé plus haut) — sans jamais descendre sous §2 et §5.

## Outillage (scripts)
- **Orchestrateur** — `node scripts/run-oracles.mjs <cible> [--profil <nom|chemin>] [--niveau note|diffuse|production] [--no-cache]` : matching
  par **extension + `trigger_files` + contenu** (`content_patterns`), **type réel** (magic bytes ≠ extension = FAIL), exécution
  **parallèle** + **cache** par hash (jamais sur FAIL/SKIP) + `timeout_ms`, verdict **PASS / FAIL / INCONCLUSIF** (exit 0/1/2),
  **bilan 4 états** par fichier (jugé / exempté / délégué / signalé — somme = nb de fichiers, aucun silence), exemptions, journal `<cible>.oracles.json` + historique `*-historique.jsonl`.
  Le journal et chaque ligne d'historique portent l'**empreinte du contenu jugé** au format existant `forge-ops/empreinte@1`
  (`{format, release, ts, fichiers:{chemin: sha256 complet}}`) : un verdict dit désormais SUR QUOI il a été rendu.
- **Où vivent les journaux** — sous un segment de livraison (`output/`, `old/`, `dist/`, `build/`), les journaux
  sortent AU-DESSUS du premier segment rencontré, dans un `.oracles/` qui rejoue l'arborescence relative.
  Corrigé le 22/08/2026 (TF-0501) : l'intention « ce que le client reçoit ne contient pas les traces de son audit »
  était écrite depuis TF-0428 et n'était pas tenue — `_oracles/` était un dossier ENFANT du dossier livré, et le
  message annonçait pourtant « HORS livraison », ce qui rendait le défaut invisible. Un journal écrit avant ce
  correctif reste lu en repli dans l'ancien `_oracles/`, jamais réécrit.
- **Registre injectable** — `--registre <chemin>` charge un registre d'oracles autre que celui du skill.
  Sert les recettes qui doivent faire passer un oracle particulier sur une cible (TF-0497).
- **Fraîcheur d'un verdict** — `node scripts/run-oracles.mjs <cible> --verifier-empreinte` : confronte l'empreinte du journal au
  contenu présent, **sans rejouer les oracles**. `FRAIS` (exit 0) · **`PERIME` (exit 1) — un verdict périmé BLOQUE**, il n'avertit pas
  (arbitrage humain du 22/08/2026) · `NON JUGEABLE` (exit 2) quand il n'y a pas de journal, ou quand le journal est ANTÉRIEUR au
  mécanisme et ne porte pas d'empreinte — antériorité **déclarée, jamais mise en échec** : un verdict ancien n'est pas un verdict faux.
  Pourquoi : mesuré le 22/08/2026, 2 journaux confrontables sur 2 portaient un `PASS` rendu avant une modification de leur cible ;
  un `CONFORME` cité dans une restitution vieillissait en silence, ni re-vérifiable ni invalidable.
- **Profils** — `profils/digit-ai.json` · `generique.json` (défaut : digit-ai, env `QO_PROFIL`) : budgets perf,
  politique pptx, convention de nommage, marqueurs de sources et motifs additionnels (claims : `motifs_bloquants` / `motifs_warn`),
  niveaux d'exigence (§6), seuils `visual_diff` (seuil_ratio, breakpoints, tolerance_pixel), rubrique du juge, `ignore_patterns`. Un contexte client = un JSON, zéro code.
- **Oracles CLI** (contrat JSON `{oracle,domaine,artefact,verdict,findings[],non_juge[]}`, exit 0/1/2) :
  format (UTF-8, zip, placeholders) · code (compilation) · perf (budgets du profil) · **calculs** (re-somme exécutée des
  lignes Total, **sous-totaux et Total général**, répartitions % totalisées — tables md/html) · **claims** (montant, **TJM ou charge
  j.h en contexte d'engagement** sans source ni « à vérifier » = FAIL ; dates d'échéance = warn ; incohérence intra-document, unités €/%/j/j.h) ·
  **coherence** (`oracle-coherence.mjs <dossier>` : divergences de grandeurs **entre livrables** d'un dossier, versions antérieures exclues par la convention de nommage) ·
  **visual-diff** (`oracle-visual-diff.py` : rendu vs **goldens** versionnés `.oracles-goldens/`, masques de zones dynamiques,
  entérinement **hors boucle uniquement** via `--accepter` — refusé après un FAIL non re-jugé, R5) ·
  **nommage** (convention du profil) · **pptx** ([Content_Types].xml 1re entrée, transitions/JPEG selon profil, smoke-test LibreOffice) ·
  secrets · sca · sast · a11y (WCAG structurel) · llm (schéma JSON) · **judge** (LLM-juge externe `claude -p`, rubrique figée — avis outillé, invocation explicite).
- **Oracles délégués** (registre) : rendu HTML → `render_page.py` (digit-ai-page-html) ; données → `data-quality-auditor` ; prompts → `prompt-analyzer-l99` ; schémas → `digit-ai-schemas` ; kit RefAudit (externe, projet client). Skill/kit délégué absent de l'environnement → **jamais de substitution silencieuse** : contrôle manuel tracé (§2) et signalement (R6).
- **Bibliothèque partagée** — `scripts/lib/` : `num.mjs` (parsing des nombres affichés, libellés de totaux), `tables.mjs`
  (extraction tables md/html), `claims-extract.mjs` (affirmations labellisées) — source unique consommée par calculs, claims et coherence.
- **Utilitaires** — `self-test.mjs` (frontmatters, registre, **cohérence registre↔environnement des délégués**, profils et niveaux §6, compilation dont `lib/`, **rejeu des fixtures**) · `bootstrap.mjs
  [--install]` (outils externes, dégradations motivées) · `report-couverture.mjs <racine>` (verdicts, top FAIL/SKIP, exemptions, bilan cumulé).

## Gouvernance du registre
- Registre **versionné**, double vue JSON (machine) ↔ MD (humaine) ; domaine ❌ rencontré → **§4**. Les priorités se lisent dans `report-couverture`, pas à l'intuition.
- **Application forcée** (recommandé) : hook PreToolUse bloquant toute livraison sans run PASS — snippet : [`references/hook-pretooluse.md`](references/hook-pretooluse.md).

## Workflow
1. `node scripts/run-oracles.mjs <cible>` → verdict + bilan 4 états + journal + actions.
2. Traiter les domaines **délégués / signalés** (invoquer le skill ; aucun oracle → §3 + §4 via write-an-oracle), puis auto-critique §1/§2.
3. **Ne livrer** que si verdict PASS (ou écarts marqués et assumés, §5). Boucle **bornée à 3 itérations** ;
   au plafond, handoff humain avec l'historique — jamais d'abaissement de seuils.

```bash
node scripts/run-oracles.mjs "Digit-AI - Fiche Client - Scope - AAAAMMJJa.html" --profil digit-ai
```
