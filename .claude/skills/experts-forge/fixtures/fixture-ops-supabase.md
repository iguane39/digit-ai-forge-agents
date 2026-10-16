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

## Contribution (B) — par la rubrique de la fiche, produite le 16/10/2026 (jugement différé, session S′)

Contribution expert-ops-supabase :

1. **[Axe 1 · clés et échéance]** La baseline branche le front sur la clé `anon`. Cette clé
   héritée (JWT `eyJ…`) est dépréciée d'ici fin 2026 : un staging ouvert en octobre 2026 sur
   elle impose une seconde MEP dans les semaines qui suivent. Livrer d'emblée la clé publiable
   `sb_publishable_…` au front, et la clé secrète `sb_secret_…` à la seule fonction `notifier`,
   jamais sous un préfixe public de bundler (`NEXT_PUBLIC_…`) puisque le front est un Next.js
   (corpus §2 ; demande : « lues par le front avec la clé publique », « fonction Edge notifier »).
2. **[Axe 2 · déploiement]** Le jeton CI n'est pas seulement « non Owner » : c'est un jeton
   personnel **limité aux projets** que le workflow déploie (`SUPABASE_ACCESS_TOKEN`), avec
   `SUPABASE_DB_PASSWORD` et `SUPABASE_PROJECT_ID`, un jeu par environnement, pour que le
   staging ne puisse pas pousser en production avant le GO (corpus §3 ; demande : « staging
   d'abord puis GO humain »).
3. **[Axe 3 · restauration, le choix de plan qui conditionne tout]** Avant le premier
   `db push`, établir le plan du projet de production : en Free, **aucune** sauvegarde
   automatique, le `db dump` est la seule restauration ; en Pro, 7 jours. Si M-1…M-5 exigent
   un retour à l'instant, le PITR est un add-on qui exige au moins le compute Small, et
   **l'activer arrête les sauvegardes quotidiennes** : c'est une dépense et un arbitrage à
   poser au GO, pas un « à vérifier ». La restauration PITR passe par l'API de gestion
   (`…/database/backups/restore-pitr`), pas par le CLI, et rend le projet inaccessible pendant
   l'opération : le plan de MEP doit nommer qui la déclenche (corpus §5-§6 ; demande :
   « pouvoir restaurer — M-1…M-5 », « GO humain »).
4. **[Axe 4 · ce que protègent réseau, SSL et RLS]** Les restrictions réseau
   (`network-restrictions update --db-allow-cidr … --experimental`) ne couvrent que Postgres et
   le pooler, **pas** PostgREST ni Storage : les 2 tables lues par le front et le bucket
   « justificatifs » ne sont protégés que par la RLS et les politiques de `storage.objects`.
   Sans politique d'insertion, l'envoi des pièces jointes échoue : « Storage does not allow
   any uploads to buckets without RLS policies ». Activer le SSL imposé
   (`ssl-enforcement update --enable-db-ssl-enforcement --experimental`) **redémarre la
   base** : le placer avant la fenêtre de MEP, jamais pendant (corpus §4, §7, §8 ; demande :
   « 2 tables métier dans le schéma public », « bucket justificatifs »).
5. **[Axe 5 · credentials du dépôt]** `supabase link` écrit `supabase/.temp/project-ref` et
   `pooler-url` ; sur un runner sans stockage natif, `supabase login` écrit le jeton en clair
   dans `~/.supabase/access-token`. Vérifier que le `.gitignore` de `supabase/` exclut
   `.temp`, `.branches`, `.env.keys`, `.env.local` avant le premier commit du staging
   (corpus §9 ; demande : « 6 migrations SQL dans supabase/migrations/ », dossier versionné).

## Critère de différence matérielle

Verdict `MATERIEL` exigé : axes 1, 2 et 4 de la rubrique juge à OUI, et au moins un des
axes 3 ou 5 — sinon la fiche reste `todo`/`refuse` et n'est jamais routée.
