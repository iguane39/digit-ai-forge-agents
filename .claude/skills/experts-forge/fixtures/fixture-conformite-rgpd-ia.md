# Fixture de valeur A/B — `conformite-rgpd-ia`

## Demande témoin (rejouable)

« Cadrer l'architecture d'un assistant IA qui lit et classe les 7 boîtes mail d'un cabinet (clients particuliers et entreprises), avec extraction des pièces jointes vers un espace documentaire, LLM hébergé chez un fournisseur cloud, et restitution dans Teams. Propose l'architecture cible et les étapes. »

## Baseline (A) — figée le 23/07/2026, AVANT rédaction de la fiche et de sa checklist

> **Baseline reconstituée (fil d'origine inaccessible)** — la baseline citée par l'inventaire P2 §5 (cadrage ASD : « architecture sans volet conformité ») vit dans un fil claude.ai non accessible depuis le repo ; produite à neuf sans lecture de la fiche ni du corpus (règle transverse du brief §4).

Cadrage sans expertise conformité outillée :

Architecture proposée : connecteur Graph API sur les 7 boîtes → file d'ingestion → classification LLM (catégorie, urgence, client) → extraction des pièces jointes vers l'espace documentaire avec nommage normalisé → notifications et synthèses dans Teams. Étapes : (1) POC sur 1 boîte avec règles de classification validées par le cabinet ; (2) généralisation aux 7 boîtes ; (3) tableaux de bord. Points d'attention : qualité de la classification à mesurer sur un échantillon annoté, gestion des doublons, quotas API. Choix du LLM selon coût/latence ; prévoir un mode dégradé si l'API est indisponible.

## Contribution (B) — par la rubrique de la fiche, produite le 23/07/2026 (session S ; jugement différé en S′)

**Contribution expert-conformite-rgpd-ia** (annotations rattachées au cadrage de base) :

- **Axe 1 · Bases légales** — le cadrage ne pose aucune base légale : les 7 boîtes mélangent clients, prospects et tiers ; l'intérêt légitime devra être documenté par une mise en balance écrite, finalité par finalité (classification ≠ extraction ≠ synthèse) — à instruire avant le POC, pas après (corpus §1).
- **Axe 2 · Sous-traitance LLM** — le « LLM hébergé chez un fournisseur cloud » est un sous-traitant art. 28 : DPA signé, liste des sous-traitants ultérieurs, et clause de **non-réutilisation pour entraînement** vérifiée dans l'offre exacte souscrite (les conditions grand public ne suffisent pas) (corpus §2).
- **Axe 3 · Localisation** — exiger la région d'inférence UE dès le choix du fournisseur ; si un transfert hors UE subsiste, l'encadrer (CCT/DPF). Ce critère peut inverser le choix de LLM : l'instruire AVANT l'architecture (corpus §3).
- **Axe 4 · Minimisation, conservation, droits** — ne pas envoyer le mail entier quand la classification se joue sur l'objet et les 500 premiers caractères ; définir des durées de conservation par catégorie (source, sorties, journaux) avec purge outillée ; prévoir l'information des clients et tiers dont les mails sont traités (corpus §4, §6).
- **Axe 5 · AI Act et sécurité** — qualifier le système (assistant documentaire = risque limité → obligations de transparence ; vigilance si des usages RH s'y greffent) ; journalisation des accès et revue des habilitations sur l'espace documentaire cible (corpus §5, §7).

Chaque annotation ajoute un élément actionnable absent de la baseline (qui traitait qualité de classification, quotas et coûts — aucun volet conformité).

## Critère de différence matérielle

Au moins un élément actionnable absent de la baseline (base légale manquante, exigence de localisation, clause sous-traitant, obligation AI Act), ancré dans le corpus cité — verdict par `oracle-judge` en session S′ ≠ S.
