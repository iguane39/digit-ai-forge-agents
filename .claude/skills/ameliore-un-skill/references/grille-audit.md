# Grille d'audit canonique — ameliore-un-skill

Barème détaillé des **7 dimensions** notées **/5** (score global **/35**), des **red flags**,
et de la **pondération par type**. Découle directement du `SKILL.md` (workflow étapes 3–5,
table de verdict, règles dures) — ni élargissement ni réduction du périmètre déclaré.

## Échelle générique (0 → 5)

Chaque dimension est notée sur une échelle 0→5 ; **chaque point retiré cite sa preuve**
(ligne, section ou nom de fichier), réexploitable à la passe de correction (règle dure 1).

| Note | Signification |
|---|---|
| **5** | Exemplaire — rien à corriger |
| **4** | Solide, une faiblesse mineure (nit) |
| **3** | Présent mais insuffisant |
| **2** | Lacunaire |
| **1** | Absent ou à peine esquissé |
| **0** | Contre-productif (souvent doublé d'un red flag) |

> **Dimension non évaluable ≠ note basse** (règle dure 5). Si le contexte manque, la
> dimension est **neutralisée** et le score rapporté sur le **total évaluable** — le signaler.

---

## D1 — Déclenchement

**Évalue** la fidélité du trigger : la `description` (seule chose vue par l'agent) active-t-elle
le skill au bon moment, sans faux positifs ?

- Présence d'un « Use when / déclencher dès que… » avec contextes et mots-clés concrets.
- Couverture des formulations réelles (variantes, synonymes, bilingue si attendu).
- Exclusions nettes (« Ne pas déclencher pour… ») contre le sur-déclenchement.
- Description ≤ 1024 caractères (validator `skill_description_validator`).

**5** trigger + exclusions + couverture, validator PASS · **3** trigger sans exclusions
(risque de faux positifs) · **1** pas de « Use when » · **0** description trompeuse.

## D2 — Frontière

**Évalue** la netteté du périmètre et le non-chevauchement avec les skills voisins
(règle dure 4 : « Ce skill améliore des skills. Création → write-a-skill… »).

- Renvois sortants explicites vers le bon skill pour toute tâche hors périmètre.
- Aucun renvoi vers un skill **inexistant** (sinon red flag).
- Aucune capacité dupliquée à l'identique d'un autre skill.
- Conformité/méthodo déléguée **non recodée** localement (anti-drift).

**5** frontière nette, renvois résolus, zéro duplication · **3** un renvoi flou ou une
capacité qui empiète · **1** périmètre indéfini · **0** chevauche un skill sans renvoi.

## D3 — Exécutabilité

**Évalue** si un agent peut dérouler le workflow **de bout en bout sans trou**.

- Étapes ordonnées : chaque étape a entrée → action → sortie exploitable par la suivante.
- **Toute ressource citée** (`scripts/…`, `references/…`) **existe réellement**.
- Commandes/scripts invoqués réellement exécutables (chemins, args, dépendances).
- Critère d'arrêt défini (« boucler jusqu'à convergence », runner 6/6 = PASS).

**5** workflow complet, 100 % des ressources présentes et exécutables · **3** une commande
approximative ou une étape sous-spécifiée · **1** ressource *load-bearing* manquante · **0**
workflow inexécutable. ⚠️ Dimension la plus souvent fatale : un SKILL.md élégant qui cite
une grille ou un script absent **n'est pas exécutable**, quel que soit le soin rédactionnel.

## D4 — Disclosure

**Évalue** la progressive disclosure et la structure (validator `skill_structure_validator`).

- **SKILL.md < 100 lignes** : le détail lourd est déporté en `references/`.
- **References one level deep** : pas de chaîne `a → b → c` que l'agent abandonne.
- Pas de sur-conditionnement / digression tangentielle qui ferait misrouter.

**5** SKILL.md compact, détail en references one-level-deep · **3** une section à déporter ·
**1** monolithe > 100 lignes ou références enfouies · **0** structure illisible.

## D5 — Déterminisme

**Évalue** l'outillage. Skill **sans `scripts/`** ⇒ dimension **Non évaluable** (cf. règle 5).

- Scripts **stdlib-only**, sans dépendance externe surprise.
- **`--output {text,json}`** pour chaînage machine.
- **Embedded sample** : tourne sans argument sur un cas témoin.
- **Déterministe** : aucune randomness, aucun appel LLM, même entrée → même sortie.
- **Anti-drift** : la conformité mécanique est **déléguée** aux validators canoniques,
  jamais réimplémentée.

**5** scripts stdlib, déterministes, json, sample, conformité déléguée · **3** sans `--output
json` ni sample · **1** dépendances lourdes non justifiées · **0** non déterministe ou recode
une conformité déjà déléguée.

## D6 — Cohérence

**Évalue** l'alignement interne et la terminologie.

- **description ↔ workflow ↔ règles dures** : ce que la description promet = ce que le
  workflow exécute (pas de promesse orpheline ni d'étape non annoncée).
- Terminologie stable (un concept = un terme).
- Pas d'info time-sensitive (dates/versions qui pourrissent — validator checklist).
- Exemples concrets : ≥ 1 bloc de code / cas travaillé.

**5** promesses et exécution alignées, terminologie verrouillée, exemple présent · **3** un
terme qui dérive ou une promesse partielle · **1** la description annonce X, le workflow fait
Y · **0** auto-contradiction.

## D7 — Robustesse

**Évalue** les garde-fous comportementaux et l'anti-régression (cœur des skills
comportementaux, garde-fou pour tous — règles dures 2 et 3).

- **Règles dures explicites** : invariants non négociables énoncés (« jamais de note sans
  preuve », « modifications chirurgicales », « non-régression sacrée »).
- **Anti-régression** : un comportement/déclencheur présent avant la passe ne disparaît pas
  après (baseline = filet).
- **Proportionnalité du verdict** : sévérité graduée (nit additif ≠ refonte).
- **Résistance aux dérives** (skill comportemental) : garde-fous contre le contournement.

**5** règles dures nettes, baseline anti-régression, verdict proportionné · **3** règles
présentes mais pas de filet anti-régression explicite · **1** garde-fous quasi absents ·
**0** comportement non spécifié ou auto-contradictoire.

---

## Red flags

Un **red flag de conception** force le verdict **🔴 Refondre**, quel que soit le score
(workflow non exécutable, frontière inexistante, incohérence interne, régression introduite —
liste de la table de verdict du SKILL.md) :

- **Workflow non exécutable** : ressource *load-bearing* manquante, commande qui ne tourne pas.
- **Frontière inexistante** : chevauche un autre skill sans renvoi, ou renvoie vers un skill inexistant.
- **Incohérence interne** : la description promet une capacité que le workflow n'exécute pas.
- **Description sans trigger** : aucun « Use when » → activation au hasard.
- **Régression introduite** : la passe supprime un déclencheur/comportement de la baseline.
- **Script non déterministe** ou qui **recode** une conformité déléguée (drift).

> **Proportionnalité** (cf. SKILL.md). Un red flag **réparable en additif** — ressource citée
> **reconstructible**, nit de conformité, exemple manquant — sur un SKILL.md par ailleurs sain
> (score ≥ 21/35) route vers **🟡 Renforcer** : on crée le fichier ou on corrige le nit, on ne
> scrappe pas. **Refondre** est réservé aux red flags de **conception**.

## Pondération par type

Le type **oriente la priorisation** (étape 1 du SKILL.md), il **ne crée pas un barème
concurrent** : les seuils de verdict restent ceux de la table du SKILL.md (source unique).
Par type, 2–3 **dimensions critiques** exigent la preuve la plus solide et **dominent le
top 5** des corrections (impact×effort) ; une faiblesse y pèse davantage dans la priorisation.

| Type | Dimensions critiques | Pourquoi |
|---|---|---|
| **Métier** (digit-ai-prospection, digit-ai-propale) | D1, D2, D3 | Déclencher au bon moment, ne pas empiéter, livrer de bout en bout. |
| **Comportemental** (la-boucle, karpathy, clarifie-une-idee) | D7, D6, D1 | La valeur tient à la discipline imposée et à sa cohérence ; mal déclenché, le skill nuit. |
| **Technique** (digit-ai-schemas, github-repo-analyzer) | D5, D3, D4 | Outillage déterministe, workflow exécutable, disclosure propre priment. |

## Rappel — les 3 niveaux de verdict (table du SKILL.md)

| Verdict | Condition |
|---|---|
| ✅ **Ajuster** | Score ≥ 28/35 **et** zéro red flag |
| 🟡 **Renforcer** | Score 21–27/35, zéro red flag **de conception** (red flag additif toléré, on le répare) |
| 🔴 **Refondre** | Score < 21/35 **ou** ≥ 1 red flag **de conception** |

---

## Exemple d'audit travaillé — auto-audit de `ameliore-un-skill`

**Type** : technique/comportemental (méta-skill auditant des skills).

| Dim | Note | Preuve |
|---|---|---|
| D1 Déclenchement | 5/5 | Description 836 c., trigger + exclusions (→ write-a-skill, propale-review, prompt-analyzer-l99), validator PASS. |
| D2 Frontière | 5/5 | Frontière nette (intro + règle dure 4), renvois résolus, conformité déléguée (anti-drift assumé). |
| D3 Exécutabilité | **2/5** | Étapes 2–3 citent `scripts/skill_audit_baseline.py` (l.33) et `references/grille-audit.md` (l.44/91) — **deux ressources absentes** du dossier. Workflow non déroulable. |
| D4 Disclosure | 4/5 | SKILL.md 89 lignes < 100, détail déporté en references une fois le fichier créé. |
| D5 Déterminisme | 4/5 | Le script délègue aux 3 validators sans les recoder (bon), mais il manquait. |
| D6 Cohérence | 4/5 | Description ↔ workflow alignés ; 7 dimensions non listées hors grille. |
| D7 Robustesse | 5/5 | Règles dures explicites, baseline anti-régression, proportionnalité codifiée. |

**Total : 29/35.** Le red flag (ressource *load-bearing* manquante) est **réparable en
additif** ⇒ verdict **🟡 Renforcer** : on **crée** la grille et le script, on ne refond pas.
