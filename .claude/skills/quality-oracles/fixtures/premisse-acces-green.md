# Chapitre 4 — Factcheck · Audit des prémisses

Fixture VERTE (TF-1185, 17/09/2026) : la même analyse, prémisses d'accès mesurées avant d'être
classées. Le prompt analysé désigne deux rapports par leur URL et affirme de l'un qu'il est
« accessible ici ». Quatre lectures en lecture seule, émises avec la même identité dans la même
seconde, tranchent la question — et l'une des trois prémisses reste invérifiable, avec le test qui
lui manque.

| Prémisse | Verdict | Mesure (code · date · identité · contrôle positif) |
|---|---|---|
| « l'ancien rapport est accessible ici » (URL de l'espace a590428a) | faux pour l'exécutant | `GET /groups/a590428a…/reports` → 401 le 2026-09-17 à 17:12 · identité : compte humain, profil isolé · contrôle positif la même seconde : `GET /v1.0/myorg/groups` → 200, un seul espace visible |
| « le nouveau rapport est publié dans l'espace de travail 7c5ac50b » | vrai | `GET /groups/7c5ac50b…/reports` → 200 le 2026-09-17 à 17:12 · identité : même compte humain · 50 rapports listés |
| « le connecteur de l'éditeur expose les mesures du modèle » | invérifiable | aucun test bon marché : l'accès exige une licence payante ; test qui manque : un appel en lecture à l'API de l'éditeur avec une identité sous licence |

Le refus porte sur l'appartenance à l'espace, pas sur le jeton : la même identité a obtenu 200 sur
la liste des espaces le 2026-09-17. Familles d'accès énumérées avant de conclure — espace personnel
(essayé, 200, un seul espace), espace partagé a590428a (401), API d'administration (non essayée,
exige un rôle de locataire), partage par lien (non essayé, demande une décision humaine), copie
locale du 2025-12-08 (disponible, déclarée comme repli et datée). Un refus prouve qu'une porte est
fermée, jamais qu'il n'y en a qu'une.
