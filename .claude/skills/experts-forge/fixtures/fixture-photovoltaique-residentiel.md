# Fixture de valeur A/B — `photovoltaique-residentiel`

## Demande témoin (rejouable)

« Comparer trois devis photovoltaïques reçus pour une maison individuelle à forte consommation électrique (chauffage électrique, relevés annuels disponibles) et recommander lequel retenir. »

## Baseline (A) — figée le 23/07/2026, AVANT rédaction de la fiche et de sa checklist

> **Baseline reconstituée (fil d'origine inaccessible)** — la baseline citée par l'inventaire P2 §5 (comparatif solaire Vessey de juillet) vit dans un fil claude.ai non accessible depuis le repo ; produite à neuf sans lecture de la fiche ni du corpus (règle transverse du brief §4).

Comparaison sans expertise photovoltaïque outillée :

Mettre les trois devis en tableau : puissance proposée, prix total, prix au kWc, marque des panneaux et garanties, délai d'installation, avis sur l'installateur. Vérifier que chaque devis détaille pose et matériel, écarter le devis le plus cher si les prestations sont équivalentes, et demander une visite technique avant engagement. Choisir l'installateur certifié offrant le meilleur rapport garanties/prix.

## Contribution (B) — par la rubrique de la fiche, produite le 23/07/2026 (session S ; jugement différé en S′)

**Contribution expert-photovoltaique-residentiel** (annotations rattachées à la comparaison de base) :

- **Axe 1 · Dimensionnement** — avant tout tableau comparatif : confronter la puissance proposée par chaque devis aux relevés annuels réels (répartition jour/nuit, été/hiver) ; un devis calé sur la surface de toit et non sur le profil optimise la marge de l'installateur (précédent Vessey : 12 vs 20 kWc face au profil ENGIE réel) (corpus §1).
- **Axe 2 · Hypothèses de valorisation** — exiger de chaque devis son taux d'autoconsommation supposé et le challenger contre les relevés ; vérifier prime et tarif d'achat aux barèmes EN VIGUEUR (trimestriels), et la distinction prix brut / net d'aides (corpus §2-§3).
- **Axe 3 · Lecture des devis** — normaliser en €/Wc posé ; comparer la nature des onduleurs (central vs micro : ombrage, garanties, coût de remplacement) et les garanties séparées (produit/production/main-d'œuvre) — des lignes absentes du tableau de la baseline (corpus §4).
- **Axe 4 · Batterie** — si un devis inclut une batterie au forfait : la sortir et chiffrer sa VAN propre ; son intérêt dépend de l'écart production diurne / consommation nocturne, pas du package commercial (corpus §5).
- **Axe 5 · Scénarios** — décider sur plusieurs scénarios comparés en VAN/TRI (puissances, avec/sans batterie, prix de l'électricité) — comparatif outillable par l'oracle `simulateur-js` (tolérance ±1 % déclarée, mode opératoire Vessey 8 scénarios) (corpus §6).

Chaque annotation ajoute un élément actionnable absent de la baseline (tableau prix/garanties/délais et choix au meilleur rapport).

## Critère de différence matérielle

Au moins un élément actionnable absent de la baseline (dimensionnement vs profil réel, mécanisme de valorisation, point technique du devis), ancré dans le corpus cité — verdict par `oracle-judge` en session S′ ≠ S.
