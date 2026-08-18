---
name: skill-hors-manifeste
description: >
  Fixture ROUGE de F1-bis (TF-0362, 18/08/2026). Ce skill est MONTÉ dans l'arbre de la
  fixture et ABSENT de son manifeste : c'est exactement la situation que F1 ne voyait pas,
  parce qu'elle itère sur le manifeste et ne regarde jamais ce qui n'y figure pas.
  Cas réel à l'origine : `la-barre`, livré, monté, hors de tout contrôle de version, et
  trouvé par un second outil plutôt que par cet oracle.
metadata:
  version: "9.9.9"
---

# skill-hors-manifeste — fixture

Aucun contenu utile : cette fixture existe pour être PRÉSENTE. Si F1-bis disparaissait,
la fixture verte passerait toujours et celle-ci cesserait silencieusement de rien prouver —
c'est pourquoi le self-test vérifie que l'avertissement SORT, pas seulement que le verdict tient.
