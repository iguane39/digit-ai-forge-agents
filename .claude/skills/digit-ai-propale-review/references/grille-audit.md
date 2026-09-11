# Grille d'audit canonique — digit-ai-propale-review

7 dimensions notées /5 (score global /35) + D8 checklist binaire hors score + red flags
bloquants. Chaque note doit citer ses preuves (n° de slide + extrait). Barème générique :
**5** = exemplaire, **4** = solide avec une faiblesse mineure, **3** = présent mais
insuffisant, **2** = lacunaire, **1** = absent ou contre-productif.

---

## D1 — Qualification du deal (MEDDIC / BANT-light)

La propale répond-elle aux conditions réelles de décision du client ?

| Contrôle | Question |
|---|---|
| Sponsor économique | La propale s'adresse-t-elle (vocabulaire, niveau, enjeux) à celui qui signe — pas seulement au contact opérationnel ? |
| Critères de décision | Les critères exprimés au RDV (prix, délai, réversibilité, conformité, références) sont-ils chacun explicitement adressés ? |
| Budget | Le chiffrage est-il cohérent avec l'enveloppe connue (dans la fourchette, ou dépassement justifié par un découpage en lots) ? |
| Timing | Le planning proposé colle-t-il à l'échéance métier du client (et la mentionne-t-il) ? |
| Champion | Un relais interne dispose-t-il de munitions (synthèse 1 slide, arguments réutilisables) pour vendre en interne sans Digit-AI dans la pièce ? |

- **5** : les 5 contrôles passent, dont au moins un slide pensé pour le sponsor économique.
- **3** : budget/timing OK mais critères de décision implicites, pas de matériel champion.
- **1** : propale écrite pour le mauvais interlocuteur ou hors enveloppe sans justification.
- Sans contexte deal : noter uniquement ce qui est auto-évaluable (cohérence interne,
  matériel champion) et marquer le reste **Non évaluable**.

## D2 — Orientation client

Le client doit se sentir compris avant de voir la moindre prestation.

- **Ratio lexical** sur les 5 premiers slides : occurrences `{Client} / vous / votre / vos`
  vs `Digit-AI / nous / notre / nos`. Cible : **> 60 % côté client**. Compter
  mécaniquement depuis l'extraction.
- **Ordre narratif** : contexte et enjeux client AVANT toute prestation, méthode ou
  référence Digit-AI. Un slide « Qui sommes-nous » avant le slide problème = malus.
- **Language mirroring** (si transcript fourni) : les 5-8 expressions exactes du client
  (noms d'outils internes, formulations des irritants, vocabulaire métier) sont-elles
  reprises telles quelles ? Relever les paraphrases qui « traduisent » le client en
  jargon conseil.
- **Cadrage en opportunités** : les constats négatifs sont formulés en écart-vers-cible
  (« votre taux X est à A, le standard est B, voici le chemin ») jamais en jugement.

**5** : ratio > 60 %, ordre correct, ≥ 5 expressions miroir, zéro jugement.
**3** : ratio 40-60 % ou « Qui sommes-nous » trop tôt. **1** : la propale parle d'abord
de Digit-AI.

## D3 — Narratif et promesses

- **Executive summary** (ou slide d'ouverture) : reconnaît la situation → nomme le
  problème central → prévisualise l'approche → laisse entrevoir le résultat → crée une
  raison d'agir maintenant. Les 5 temps doivent être identifiables.
- **Promesse testable par lot** (règle digit-ai-propale) : « À la fin de Lx, {persona}
  {accomplit un parcours métier complet} ». Une liste de tâches ou de technologies n'est
  pas une promesse.
- **Sous-titres narratifs** : chaque slide porte un message (une phrase qui affirme),
  pas une étiquette (« Planning », « Budget »).
- **Test des 90 secondes** : en ne lisant que titres + sous-titres, la trajectoire
  complète (problème → approche → lots → investissement → décision) est-elle lisible ?

**5** : 5 temps + 100 % des lots avec promesse testable + test 90 s concluant.
**3** : promesses présentes mais ~la moitié non testables. **1** : sommaire de tâches.

## D4 — Ancrage ROI du chiffrage

- **Jamais un prix nu** : chaque montant est mis en regard d'un gain quantifié, d'un coût
  de l'inaction, ou d'un comparatif (coût complet interne, coût du statu quo).
- **Le calcul est montré** : « à {valeur unitaire client}, le point d'équilibre est atteint
  à {n} {unités} » — point d'équilibre et rythme de croisière plutôt que ROI 12 mois gonflé.
- **Prudence conforme digit-ai-propale** : fourchettes, « hypothèses médianes, à calibrer »,
  « sans engagement de résultat ». Un ROI précis sans source dans les entrants = malus
  même s'il est vendeur.
- **Proximité spatiale** : le contexte de valeur est sur le slide investissement ou
  immédiatement adjacent — pas 8 slides plus tôt.

**5** : tous les montants contextualisés + calcul montré + disclaimers. **3** : gains
évoqués mais déconnectés du slide prix. **1** : tableau de prix sec.

## D5 — Architecture de l'offre

- **Point d'entrée dé-risqué** : un lot L0/POC court à engagement réduit existe (rôle du
  tier bas), avec critères de succès explicites.
- **Ancrage** : une trajectoire complète chiffrée (vision haute) est montrée avant le
  point d'entrée, pour que le L0 paraisse raisonnable. Si pertinent pour le deal : 2-3
  scénarios nommés par l'ambition (jamais Bronze/Argent/Or), recommandation marquée.
- **Anti scope-creep** : exclusions de périmètre explicites + responsabilités client
  (validations sous SLA, accès, interlocuteur désigné) + règle d'avenant.
- **Modalités récurrentes Digit-AI** rappelées : forfait par lot, avenant après validation
  des specs, données en région UE si LLM.

**5** : entrée dé-risquée + ancrage + exclusions + responsabilités client.
**3** : lots corrects mais ni exclusions ni responsabilités client. **1** : offre
monolithique à prendre ou à laisser.

## D6 — Objections pré-traitées

Croiser [objections.md](objections.md) avec le contexte deal : identifier les **2-3
objections les plus probables** de CE deal (budget serré → « trop cher » ; DSI présente →
« données sensibles » ; échec IA passé → « déjà essayé »), puis vérifier qu'elles sont
désamorcées **dans** la propale (points de vigilance assumés, slide risques, garanties
de réversibilité) plutôt que laissées à la soutenance.

**5** : les objections probables sont traitées frontalement, vigilances assumées.
**3** : un slide risques générique. **1** : aucun risque ni objection anticipé —
la propale prétend que tout est simple.

## D7 — Closing et next steps

- **Next step daté et spécifique** : ce qui se passe après le oui (signature → kickoff
  sous {n} jours → démarrage), qui contacte qui, créneau proposé.
- **Validité de l'offre** : date limite explicite (30 jours par défaut) — crée l'urgence
  sans la fabriquer.
- **Friction minimale** : une seule action demandée au client pour avancer.
- **Séquence de relance** prête ([relance.md](relance.md)) — bonus généré, pas exigé
  dans la propale elle-même.

**5** : next step daté + validité + action unique. **3** : « nous restons à votre
disposition ». **1** : la propale se termine sur le prix.

---

## D8 — Conformité forme (checklist binaire, HORS SCORE)

> **L'extraction est textuelle** : le `.extract.md` ne porte ni polices, ni couleurs, ni
> positions. La charte visuelle **et le rendu** se vérifient donc **sur le PPTX rasterisé**
> (`soffice --convert-to pdf` puis `pdftoppm`), ou par inspection XML — **jamais** depuis le
> seul extract. Les deux premiers contrôles ci-dessous **exigent le rendu**.

☐ **Rendu visuel sain** (rasteriser + inspecter chaque slide) : aucun **débordement**, aucun
  **chevauchement** (titre↔sous-titre, texte↔carte, photo↔texte), aucun texte **hors cadre ou
  hors slide**. Un `.extract.md` ne détecte PAS ces défauts — passe QA déléguée à `digit-ai-pptx`
  (rasterisation + checklist anti-débordement, ou contrôle déterministe des bandes d'encre).
☐ Charte digit-ai-pptx (Montserrat/Inter, #2563EB, fond #FAFBFF, filets, footer, pagination) — **sur le rendu**
☐ Slide canonique « Vos interlocuteurs chez Digit-AI » en clôture
☐ Convention de nommage du fichier respectée
☐ Cohérence typographique des montants (k€/€ HT, séparateurs)
☐ Zéro placeholder résiduel (`[à chiffrer]`, `{{...}}`, lorem)

Tout ☐ non coché → renvoyer vers `digit-ai-pptx`, sans impact sur le **score commercial**.
**Exceptions bloquantes pour le verdict** : un **placeholder résiduel** (red flag 8) **ou un
rendu visuel non vérifié / défaillant** (chevauchement, débordement, texte hors slide) est un
défaut d'envoi — il **interdit le verdict ✅ Envoyer** tant qu'il n'est pas corrigé via
`digit-ai-pptx`, **même si le score commercial est ≥ 28/35**. Le défaut de rendu ne force pas
« Refondre » (le fond commercial reste sain) : il **suspend** l'envoi jusqu'à correction de la forme.

---

## Red flags bloquants (verdict forcé : Refondre — ne pas envoyer)

1. **Prix sans aucun contexte de valeur** nulle part dans la propale.
2. **Aucun next step daté** (la propale se termine sur l'investissement).
3. **Promesse non testable sur un lot facturé** (lot = liste de tâches sans critère de
   mise en production vérifiable).
4. **Incohérence de chiffrage interne** : somme des lots ≠ total, ou montants
   contradictoires entre slides. Recompter systématiquement.
5. **Périmètre sans exclusions ni responsabilités client** sur une mission ≥ 2 lots.
6. **Digit-AI avant le client** : aucune mention du contexte client dans les 3 premiers
   slides de contenu.
7. **ROI affirmé sans source ni disclaimer** (violation règle dure digit-ai-propale).
8. **Placeholder résiduel** (`[à chiffrer]`, `{{...}}`) dans un document présenté
   comme prêt à envoyer.
9. **Fuite inter-clients** : nom, montant ou donnée d'un autre client dans la propale.

## Priorisation du top 5 (impact × effort)

Pour chaque écart : Impact commercial (1-5 : effet sur la probabilité de signature) ×
Effort de correction inversé (1-5 : 5 = correction en minutes). Trier par produit
décroissant ; départager par red-flag-proximité. Format de restitution par correction :
**slide visé · constat · pourquoi ça coûte · réécriture avant/après injectable**.
