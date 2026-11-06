# Corpus d'expert (extrait) — plateforme Supabase

Extrait du corpus ops-supabase : seul le point des réglages de sécurité y figure. Cas ROUGE : le TLS imposé, classé défaut par le registre, est classé décision (G6).

9. **Credentials sur le poste et dans le dépôt** — (point précédent, non rejoué ici).
10. **Réglages de sécurité de la plateforme** — registre du pilot lu le 06/11/2026 (copie de l'étude
   « Sécurité par défaut de bout en bout » 20261106a ; classements repris, pages des éditeurs non relues ici).
   Chaque réglage est classé **défaut** (appliqué à la création, relu à chaque livraison) ou **décision**
   (option posée au cadrage avec son coût, écart accepté consigné). La source est
   `references/REGLAGES-SURS-PAR-DEFAUT.json` du pilot, qui porte les commandes d'application et de lecture
   et les attendus : un plan renvoie au registre, il ne les redit pas.
   - TLS imposé sur les connexions Postgres (ssl-enforcement, database=true) — **décision** : aucune connexion
     en clair chez le produit témoin ; le redémarrage de la base impose de le jouer avant la fenêtre de MEP (point 7).
   - Restriction des adresses admises sur Postgres et le pooler (network-restrictions) — **défaut** sous condition :
     migrations par l'API de gestion en HTTPS, que la restriction ne couvre pas, et au moins une plage déclarée
     (une liste vide laisse tout passer) ; un `supabase db push` depuis un exécuteur est une connexion directe,
     incompatible avec elle (point 3).
   - Double vérification imposée aux membres de l'organisation (Require MFA to access organization) — **décision** :
     offre Pro au minimum, aucune route d'API ne pose ni ne lit l'obligation (seule la double vérification de chaque
     membre se lit) ; option et coût posés au cadrage, choix du porteur consigné.
   - Restauration à la minute (PITR, 7 jours) — entrée de contrôle, hors matrice et hors liste fermée — **décision** :
     add-on payant, et l'activer arrête les sauvegardes quotidiennes (point 6) ; à poser au cadrage avec son coût.
