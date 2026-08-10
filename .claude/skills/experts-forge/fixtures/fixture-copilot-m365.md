# Fixture de valeur A/B — `copilot-m365`

## Demande témoin (rejouable)

« Cadrer un pilote d'assistants IA dans un environnement 100 % Microsoft : ~330 licences E3, une cinquantaine de licences M365 Copilot envisagées, exigence du RSSI : aucun LLM externe au tenant. Objectif : un agent Teams qui répond aux questions RH internes. Proposer le dispositif du pilote. »

## Baseline (A) — figée le 23/07/2026, AVANT rédaction de la fiche et de sa checklist

> **Baseline reconstituée (fil d'origine inaccessible)** — la baseline citée par l'inventaire P2 §5 (réponse à l'AO : « volet A générique ») vit dans un fil claude.ai non accessible depuis le repo ; produite à neuf sans lecture de la fiche ni du corpus (règle transverse du brief §4).

Cadrage sans expertise écosystème Microsoft outillée :

Pilote en 3 phases : (1) cadrage des cas d'usage RH avec la DRH (FAQ, congés, onboarding) et constitution de la base de connaissances ; (2) développement de l'agent Teams avec restitution sourcée sur les documents RH, tests avec un panel de 20 utilisateurs ; (3) bilan du pilote — usage, satisfaction, précision des réponses — et décision d'extension. Points d'attention : qualité et fraîcheur de la base documentaire RH, gouvernance des accès aux documents, mesure de la satisfaction. Durée indicative : 8 à 10 semaines.

## Contribution (B) — par la rubrique de la fiche, produite le 23/07/2026 (session S ; jugement différé en S′)

**Contribution expert-copilot-m365** (annotations rattachées au cadrage de base) :

- **Axe 1 · Licences** — la baseline ne traite pas la question qui conditionne le run : E3 seul ne donne pas M365 Copilot, et un agent Copilot Studio a son propre modèle de coût (messages/capacité). Décider qui parmi les ~330 E3 accède à l'agent (capacité Studio, pas licence Copilot par tête) et réserver les ~50 M365 Copilot aux cas justifiés (corpus §1).
- **Axe 2 · Anatomie de l'agent** — figer dès le cadrage : source de connaissances (quel SharePoint RH, qui le gouverne), connecteur, environnement de développement et canal de publication Teams — sinon le POC se construit dans l'environnement par défaut, ingérable ensuite (corpus §2).
- **Axe 3 · Gouvernance tenant** — le pilote DOIT livrer un environnement Power Platform dédié + une stratégie DLP (connecteurs autorisés), pas seulement l'agent : c'est le précédent que toute l'entreprise suivra (corpus §3).
- **Axe 4 · « Aucun LLM externe »** — faire qualifier par le RSSI, avant développement, si Copilot/Azure OpenAI dans la frontière de service M365 satisfait le cadre — la baseline suppose le sujet réglé alors qu'il peut invalider l'approche (corpus §4).
- **Axe 5 · Permissions sources** — revue des permissions du SharePoint RH avant ouverture au panel : l'agent expose ce que les ACL laissent passer (dossiers RH ≠ public interne) (corpus §5).

Chaque annotation ajoute un élément actionnable absent de la baseline (qui traitait cas d'usage, qualité documentaire et mesure de satisfaction).

## Critère de différence matérielle

Au moins un élément actionnable absent de la baseline (contrainte de licence, exigence de gouvernance tenant, limite de plateforme), ancré dans le corpus cité — verdict par `oracle-judge` en session S′ ≠ S.
