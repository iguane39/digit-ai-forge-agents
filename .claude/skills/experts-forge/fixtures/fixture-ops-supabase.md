# Fixture de valeur A/B — `ops-supabase`

## Demande témoin (rejouable)

Le pilot ouvre l'étape MEP d'un produit web « carnet-web » (front Next.js déployé ailleurs) dont le back-end est un projet Supabase : 6 migrations SQL dans supabase/migrations/, 2 tables métier dans le schéma public lues par le front avec la clé publique, un bucket de stockage « justificatifs » pour les pièces jointes des utilisateurs connectés, une fonction Edge « notifier ». Région Europe exigée par le brief, staging d'abord puis GO humain. Donne le plan de déploiement staging conforme ETAPE-MEP (déployer, vérifier, pouvoir restaurer — M-1…M-5) : commandes, permissions minimales, et où le rollback peut échouer.

## Baseline (A) — figée le 16/10/2026 à 10:49, AVANT rédaction du corpus et de la fiche

Produite par une session neuve sans outil ni documentation : `claude -p --model sonnet --tools ""`, la demande ci-dessus suivie de « Réponds en 5 points numérotés, sans outil, de mémoire, en une vingtaine de lignes au plus. » Sortie reprise sans retouche.

1. **Prérequis et permissions minimales.**
   - Je ne reprends pas ici le texte de M-1 à M-5 : le découpage déployer, vérifier, restaurer est mon hypothèse, à confronter à ETAPE-MEP.
   - Crée un projet staging distinct de la prod, en région Europe : `supabase projects create carnet-staging --org-id <ORG> --region eu-central-1`. La région est à fixer d'emblée, elle ne se change plus.
   - Le jeton personnel (`SUPABASE_ACCESS_TOKEN`) appartient à un membre de rôle Developer, pas Owner. Le mot de passe de la base va dans un coffre.
   - Le front staging reçoit seulement l'URL et la clé `anon`, jamais la `service_role`.

2. **Déployer.**
   - `supabase link --project-ref <REF_STG>`, puis `supabase db push --dry-run`, puis `supabase db push` pour les 6 migrations.
   - `supabase secrets set --env-file .env.staging`, puis `supabase functions deploy notifier`.
   - Le bucket « justificatifs » n'existe sur staging que si une migration l'insère dans `storage.buckets` (privé) avec ses politiques sur `storage.objects`. Je ne peux pas le confirmer de mémoire, donc lis les 6 fichiers avant.

3. **Vérifier.**
   - `supabase migration list` doit montrer local et distant alignés, et `supabase db diff --linked` doit sortir vide.
   - La RLS (row level security) doit être active sur les 2 tables : `select relname, relrowsecurity from pg_class where relname in (...)`.
   - Avec la clé `anon`, la lecture ne renvoie que les lignes prévues et toute écriture est refusée.
   - Sur le bucket, l'envoi par un utilisateur connecté réussit, l'anonyme est refusé et un utilisateur ne lit pas le fichier d'un autre.
   - `curl` sur `notifier` avec et sans JWT doit donner le code attendu (200, puis 401). Passe aussi les « advisors » de sécurité du tableau de bord.

4. **Pouvoir restaurer.**
   - Avant le push, fais trois sauvegardes : `supabase db dump --linked -f schema.sql`, la même commande avec `--data-only -f data.sql`, et `--role-only`.
   - Copie les fichiers du bucket avec `supabase storage cp -r ss:///justificatifs ./sauvegarde`.
   - Étiquette le dépôt git avant le déploiement de `notifier`, car l'ancienne version se redéploie depuis le tag.
   - Les sauvegardes quotidiennes ou le PITR (restauration à un instant donné) dépendent du plan Supabase, à vérifier.

5. **Où le rollback échoue.**
   - Les migrations n'ont pas de « down ». `supabase migration repair` ne corrige que l'historique, pas le schéma. Un `drop column` ou `drop table` perd les données hors du dump.
   - Rejouer `data.sql` sur une base non vide provoque des conflits de clés.
   - Le dump SQL ne contient pas les fichiers du stockage, seulement leurs métadonnées, d'où des lignes orphelines. Un bucket non vide ne se supprime pas en SQL, il faut passer par l'API.
   - Les secrets ne se relisent pas, garde donc leur source. La config Auth (URL de redirection, SMTP) et les extensions vivent hors des migrations.
   - Une restauration PITR écrase tout le projet. Une mauvaise région impose de recréer le projet.
   - Le passage en prod reste soumis au GO humain.
