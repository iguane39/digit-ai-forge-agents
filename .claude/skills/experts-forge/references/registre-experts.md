# Registre des experts — v0.5.0 (02/09/2026)

Calqué sur `registre-oracles.md` de quality-oracles. Statuts : `ok` (admis après verdict « matériel »), `todo` (fiche rédigée, verdict en attente), `refuse` (verdict « non matériel », fiche conservée pour trace), `dormant` (fiche `ok` jamais routée depuis 6 mois — routage désactivé, conservée pour trace ; M3, 23/07/2026), `broken` (un chemin du corpus ne se résout plus — réparer ou retirer, jamais router ; M3, 23/07/2026).

Champs M3 (23/07/2026) : `Dernier usage` — dérivé des routages journalisés par `route-experts.mjs` (M4), calculé par la passe d'hygiène `etat-forge`, jamais tenu à la main ; `Corpus vérifié le` — date du dernier test d'existence exécuté sur les chemins du corpus (renseigné à la création par le scaffolder, puis par la passe d'hygiène).

| Domaine | Statut | Fiche | Fixture | Date d'admission | Dernier usage | Corpus vérifié le |
|---|---|---|---|---|---|---|
| data | ok | `fiches/expert-data.md` | Analyse import/export X14 (pilote E2, brief 20260721b) — verdict MATERIEL (Sébastien) | 21/07/2026 | — | — |
| interop-archi | ok | `fiches/expert-interop-archi.md` | Analyse import/export X14 (pilote E2, brief 20260721b) — verdict MATERIEL (Sébastien) | 21/07/2026 | — | — |
| accessibilite | ok | `fiches/expert-accessibilite.md` | fixture A/B rejouée (`fixtures/fixture-accessibilite.md`) — verdict MATERIEL — Sébastien, 23/07/2026, après SKIP motivé oracle-judge | 23/07/2026 | — | — |
| ingenierie-pedagogique | ok | `fiches/expert-ingenierie-pedagogique.md` | `fixtures/fixture-ingenierie-pedagogique.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-ingenierie-pedagogique.json` | 24/07/2026 | — | 23/07/2026 |
| marches-publics-ao | ok | `fiches/expert-marches-publics-ao.md` | `fixtures/fixture-marches-publics-ao.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-marches-publics-ao.json` | 24/07/2026 | — | 23/07/2026 |
| conformite-rgpd-ia | ok | `fiches/expert-conformite-rgpd-ia.md` | `fixtures/fixture-conformite-rgpd-ia.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-conformite-rgpd-ia.json` | 24/07/2026 | — | 23/07/2026 |
| data-platform-cloud | ok | `fiches/expert-data-platform-cloud.md` | `fixtures/fixture-data-platform-cloud.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-data-platform-cloud.json` | 24/07/2026 | — | 23/07/2026 |
| copilot-m365 | ok | `fiches/expert-copilot-m365.md` | `fixtures/fixture-copilot-m365.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-copilot-m365.json` | 24/07/2026 | — | 23/07/2026 |
| hebergement-touristique | ok | `fiches/expert-hebergement-touristique.md` | `fixtures/fixture-hebergement-touristique.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-hebergement-touristique.json` | 24/07/2026 | — | 23/07/2026 |
| acquisition-fonds-immobilier | ok | `fiches/expert-acquisition-fonds-immobilier.md` | `fixtures/fixture-acquisition-fonds-immobilier.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-acquisition-fonds-immobilier.json` | 24/07/2026 | — | 23/07/2026 |
| seo-web | ok | `fiches/expert-seo-web.md` | `fixtures/fixture-seo-web.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-seo-web.json` | 24/07/2026 | — | 23/07/2026 |
| photovoltaique-residentiel | ok | `fiches/expert-photovoltaique-residentiel.md` | `fixtures/fixture-photovoltaique-residentiel.md` (baseline reconstituée figée le 23/07/2026) — verdict MATERIEL — oracle-judge armé de rubrique-juge-experts v1.0.0, session S′ (`claude -p`), 24/07/2026 ; verdict JSON : `run-admission/verdict-photovoltaique-residentiel.json` | 24/07/2026 | — | 23/07/2026 |
| ops-railway | ok | `fiches/expert-ops-railway.md` | `fixtures/fixture-ops-railway.md` (baseline figée le 11/08/2026 AVANT rédaction — TF-0081) — verdict MATERIEL (5 axes OUI) — oracle-judge armé de la rubrique d'admission (profil run-admission), session S′ (`claude -p`), 11/08/2026 ; verdict JSON : `run-admission/verdict-ops-railway.json` | 11/08/2026 | — | 11/08/2026 |
| ops-gcp | ok | `fiches/expert-ops-gcp.md` | `fixtures/fixture-ops-gcp.md` (baseline figée le 11/08/2026 AVANT rédaction — TF-0081) — verdict MATERIEL (5 axes OUI) — oracle-judge armé de la rubrique d'admission (profil run-admission), session S′ (`claude -p`), 11/08/2026 ; verdict JSON : `run-admission/verdict-ops-gcp.json` | 11/08/2026 | — | 11/08/2026 |
| ops-azure | ok | `fiches/expert-ops-azure.md` | `fixtures/fixture-ops-azure.md` (baseline figée le 11/08/2026 AVANT rédaction — TF-0081) — verdict MATERIEL (5 axes OUI) — oracle-judge armé de la rubrique d'admission (profil run-admission), session S′ (`claude -p`), 11/08/2026 ; verdict JSON : `run-admission/verdict-ops-azure.json` | 11/08/2026 | — | 11/08/2026 |
| ops-aws | ok | `fiches/expert-ops-aws.md` | `fixtures/fixture-ops-aws.md` (baseline figée le 11/08/2026 AVANT rédaction — TF-0081) — verdict MATERIEL (5 axes OUI) — oracle-judge armé de la rubrique d'admission (profil run-admission), session S′ (`claude -p`), 11/08/2026 ; verdict JSON : `run-admission/verdict-ops-aws.json` | 11/08/2026 | — | 11/08/2026 |
| migration-plateforme-brownfield | ok | `fiches/expert-migration-plateforme-brownfield.md` | `fixtures/fixture-migration-plateforme-brownfield.md` (cas réel, baseline = les 7 constats de la contre-expertise du 22/08/2026, figée avant rédaction du corpus) — verdict MATERIEL (5 axes OUI) — `oracle-judge` armé de la rubrique d'admission (profil `run-admission`), 02/09/2026 ; verdict JSON : `run-admission/verdict-migration-plateforme-brownfield.json` | 02/09/2026 | — | 02/09/2026 |

> Entrée `accessibilite` : scaffoldée par `write-an-expert` puis **durcie le 21/07/2026** (périmètre, checklist propre, rubrique 5 axes, frontières) ; fixture A/B rejouée (`fixtures/fixture-accessibilite.md`) — **admise le 23/07/2026** : verdict MATERIEL — Sébastien, 23/07/2026, après SKIP motivé oracle-judge (CLI `claude` absente en claude.ai — jamais de verdict simulé, R6).

## Angles déclarés vides — dettes nommées (TF-0717, 02/09/2026)

> **Un angle vide déclaré et non comblé n'est pas neutre.** Un angle nommé le 20/08/2026 —
> « fiche expert migration de plateforme brownfield » — est resté ouvert **onze jours** sans que
> rien ne le rappelle, et a produit exactement le défaut qu'il aurait attrapé : un programme de
> migration qui ne prévoit nulle part de prévenir les utilisateurs, trouvé par le client après
> qu'une contre-expertise complète et quatre portes automatiques l'aient laissé passer.
>
> Cette table est la **porte** : tout angle d'expertise rendu vide (contre-expertise, revue,
> audit) s'y écrit avec son **échéance**, et `scripts/oracle-angles-vides.mjs` **échoue** tant
> qu'une dette reste `ouvert` au-delà de son échéance. Statuts : `ouvert` · `comblé` (artefact
> cité, dont l'existence est **vérifiée par exécution**) · `écarté` (raison écrite obligatoire).
>
> Contrôle : `node scripts/oracle-angles-vides.mjs references/registre-experts.md`

| Angle | Déclaré le | Produit | Échéance | Statut | Comblé par / raison |
|---|---|---|---|---|---|
| migration de plateforme brownfield | 20/08/2026 | Produit-05 | 20/09/2026 | comblé | `fiches/expert-migration-plateforme-brownfield.md` — admise le 02/09/2026 (verdict MATERIEL) |

## Règles du registre

- Aucune fiche n'entre en `ok` sans verdict « matériel » sur sa `fixture_valeur` (juge : Sébastien pour les 2 premières fiches, `oracle-judge` avec `rubrique-juge-experts.md` ensuite).
- **Tout angle d'expertise rendu vide** dans une revue ou une contre-expertise s'écrit **dans le tour même** à la table « Angles déclarés vides » ci-dessus, avec une échéance. `oracle-angles-vides` la fait tenir.
- Toute admission ou refus est daté et laisse la fixture rejouable.
- Un domaine retiré du registre entraîne le retrait des `expert_refs` qui le pointent (phase E4, méta-skill).
