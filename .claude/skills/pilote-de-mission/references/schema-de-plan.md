# Schéma de plan — structure d'une instance

Règle de séparation : ce schéma est agnostique au domaine. Ce qui varie entre missions
vit dans l'instance, jamais dans le schéma.

Toute instance de plan contient exactement ces 7 blocs :

1. **En-tête de mission** — objectif daté en une phrase ; critère de « mission accomplie »
   vérifiable ; responsables (utilisateur, Claude, tiers nommés) ; échéance cible avec
   statut (ferme / hypothèse).
2. **Hypothèses & conditions** — tout ce dont le plan dépend sans le contrôler.
   Champs : id (Hx) · énoncé · statut (à vérifier / confirmée / infirmée) · étapes impactées.
   Une hypothèse infirmée déclenche le protocole d'adaptation.
3. **Workstreams** — 3 à 6 chantiers parallèles. Un workstream = un angle de la mission
   avec sa logique propre, pas une phase temporelle.
4. **Étapes** — champs obligatoires : id (préfixé workstream) · intitulé · type
   (typologie ci-dessous) · dépendances (ids) · échéance proposée · statut
   (à faire / en cours / faite / bloquée / caduque) · critère de « fait » vérifiable.
   Une étape « faite » porte sa preuve. Une mission déjà en cours s'absorbe en reprenant
   l'historique comme étapes faites avec preuve.
5. **Communications planifiées** — objets de plan à part entière. Champs : id (Cx) ·
   destinataire · objet · échéance · statut (à préparer / prête / envoyée / répondue).
   Préparées par Claude, envoyées par l'utilisateur.
6. **Chemin critique** — la chaîne d'étapes qui borne l'échéance cible, nommée
   explicitement. Tout glissement sur cette chaîne re-date la mission.
7. **Journal des adaptations** — trace datée de chaque cycle : information entrante →
   impacts → décisions prises ou soulevées.

## Typologie des tâches (bloc 4)

- **produire** : livrable réalisé par Claude (document, plan, analyse, page…).
- **préparer** : courrier, email ou dossier livré prêt à envoyer — l'envoi reste à l'utilisateur.
- **rappeler** : action que seul l'utilisateur peut faire (décision, appel, rendez-vous).
- **tiers** : action d'un acteur externe, suivie au plan ; relances préparées.
- **hors périmètre** : toute action exigeant signature, engagement juridique ou financier,
  ou présence physique — jamais promise.
