# Le fichier de rangement

Il porte tout ce que le tableau ne montre pas, et c'est lui que l'oracle recalcule.

```json
{
  "schema": "tri-de-sujets/rangement@1",
  "perimetre": 3,
  "entrees": [
    { "id": "s1", "lien": "https://exemple.org/outil", "etat": "retenu", "motif": "nomme un outil d'agents", "voie": "légende" }
  ],
  "lignes": [
    {
      "element": "Un outil d'agents",
      "ids": ["s1"],
      "notes": "G4 N4 P4 C3 = 19",
      "seuil": "objet-durable",
      "question": "Quels rôles manquent à la flotte ?",
      "source": "https://exemple.org/outil, consultée le 2026-11-02",
      "motif": "Crée un skill pour la forge d'agents, aucun existant trouvé (termes : outil, agent).",
      "verdict": "Étude poussée"
    }
  ]
}
```

- `perimetre` vaut le nombre d'entrées. Une entrée est un contenu de la liste, une ligne un élément abordé : une vidéo peut occuper 2 lignes, et 2 vidéos partager une ligne.
- `voie` dit comment le contenu a été lu.
- Une ligne `ecarte` ou `deja_couvert` n'a pas de notes, et son `motif` cite la règle ou l'existant.
- Un `motif` cite un chemin, une adresse, un numéro `TF-` ou `D-`, ou dit « aucun existant trouvé » avec les termes cherchés.
- « Étude poussée » et « Essai court » portent une `source` : une adresse et une date.
