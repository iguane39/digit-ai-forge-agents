# Corpus propre — écosystème d'agents Microsoft 365 (checklist)

Constitué le 23/07/2026 pour la fiche `expert-copilot-m365` (inventaire P2 §5 E5). Ancré dans trois chantiers réels : un pilote 330 E3 / ~50 Copilot (cadre « aucun LLM externe »), un agent Teams retail, une plateforme M365.

1. **Licences : la première contrainte d'architecture** — E3 seul ne donne pas M365 Copilot ; les agents Copilot Studio ont leur propre modèle (capacité par messages ou par utilisateur). Le dispositif du pilote doit dire QUI a besoin de quelle licence et ce que font les non-licenciés — le différentiel de coût structure le déploiement.
2. **Copilot Studio : topics, connecteurs, publication** — un agent = topics + sources de connaissances + connecteurs (SharePoint, Dataverse…) + canal de publication (Teams). Instruire dès le cadrage : où vivent les documents sources, qui les gouverne, quel connecteur y accède, qui publie l'agent et dans quel environnement.
3. **Gouvernance tenant : environnements et DLP** — les agents vivent dans des environnements Power Platform ; sans environnement dédié + stratégies DLP (quels connecteurs autorisés), le pilote crée un précédent de shadow IT. Le pilote DOIT inclure la création de l'environnement et de la stratégie DLP, pas seulement l'agent.
4. **« Aucun LLM externe » : traduire la contrainte** — vérifier ce que le cadre PSSI qualifie d'« externe » : Copilot/Azure OpenAI dans la frontière de service Microsoft 365 vs API tierces ; documenter la frontière de données (le tenant ne sort pas) et la faire valider par le RSSI AVANT le développement.
5. **Périmètre d'accès de l'agent = périmètre de fuite potentielle** — un agent RH qui indexe un SharePoint mal permissionné exposera aux collaborateurs ce que les permissions laissent passer ; revue des permissions sources obligatoire avant l'ouverture au panel.
6. **Limites vs LLM externes** — contexte et personnalisation plus contraints qu'une intégration API directe ; certains besoins (traitement de gros volumes, formats exotiques) sortent du cadre Copilot — les identifier au cadrage pour ne pas les promettre.

Frontière du corpus : les canaux d'échange inter-systèmes → fiche `interop-archi` ; la conformité RGPD/AI Act des traitements → fiche `conformite-rgpd-ia` ; la plateforme data sous-jacente → fiche `data-platform-cloud`.
