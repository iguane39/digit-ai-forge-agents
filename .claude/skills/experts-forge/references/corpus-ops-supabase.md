# Corpus propre — exploitation d'un back-end Supabase (checklist)

Constitué le 16/10/2026 pour la fiche `expert-ops-supabase`, après la baseline de
`fixtures/fixture-ops-supabase.md` (figée à 10:49, commit 85d95d7). Borné aux 3 verbes de
forge-ops (déployer, exploiter, restaurer) sur un projet **Supabase hébergé**. Chaque point
cite la page officielle qui le fonde, lue le 16/10/2026 ; rien n'y est écrit de mémoire.

1. **Service canonique et frontière** — un projet Supabase porte Postgres, l'API (PostgREST),
   l'auth, le stockage et les fonctions Edge. `supabase init` crée un dossier `supabase`
   « safe to commit to version control » et un `config.toml` ; il ne connecte à aucun projet.
   Le front applicatif se déploie ailleurs (fiche `ops-<cible>` concernée). Sources :
   https://supabase.com/docs/guides/local-development/cli/getting-started ;
   https://supabase.com/docs/reference/cli/introduction
2. **Les clés : le choix qui date le plan** — clé publiable `sb_publishable_...` pour le code
   public, clé secrète `sb_secret_...` pour le backend seulement (rôle `service_role`). Les clés
   héritées `anon` et `service_role` (JWT commençant par `eyJ`) sont dépréciées d'ici fin 2026 :
   un plan MEP écrit en octobre 2026 sur la clé `anon` part avec une échéance de quelques mois.
   Une clé secrète ne va jamais dans un navigateur, une application livrée ni le dépôt ; ne pas
   préfixer `SUPABASE_SECRET_KEY` d'un préfixe public de bundler. Source :
   https://supabase.com/docs/guides/api/api-keys
3. **Déployer sans bascule aveugle** — `supabase link --project-ref <ref>`, puis
   `supabase db push --dry-run`, puis `supabase db push --linked` ; fonctions par
   `supabase functions deploy [nom] --project-ref <ref>`. En CI, la page de gestion des
   environnements utilise `SUPABASE_ACCESS_TOKEN` (jeton personnel **à portée limitée** aux
   projets déployés), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`. Sources :
   https://supabase.com/docs/reference/cli/introduction ;
   https://supabase.com/docs/guides/deployment/managing-environments
4. **Healthcheck idiomatique** — `supabase migration list --linked` (alignement local et
   distant) ; RLS : « Enable RLS on every table in an exposed schema », une table sans RLS d'un
   schéma exposé est lisible et modifiable par tout rôle qui a un grant ; `service_role` porte
   l'attribut `bypassrls`. Les schémas exposés sont ceux de `[api] schemas` du `config.toml`
   (gabarit : `["public", "graphql_public"]`). Tests de base : `supabase test db --linked`.
   Sources : https://supabase.com/docs/guides/database/postgres/row-level-security ;
   gabarit `apps/cli-go/pkg/config/templates/config.toml` du dépôt github.com/supabase/cli
5. **Rollback : il n'existe pas de migration « down »** — la page de gestion des environnements
   ne décrit aucun retour arrière de migration ; `supabase migration repair --status
   <applied|reverted>` corrige l'historique, pas le schéma. Le retour arrière est une
   migration corrective poussée par `db push`. Dernier recours : restauration de sauvegarde
   (tableau de bord, Database > Backups) ou PITR par l'API de gestion
   (`POST https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups/restore-pitr`) ;
   le projet est inaccessible pendant l'opération et tout ce qui suit le point choisi est
   perdu. Aucune commande CLI de restauration. Sources :
   https://supabase.com/docs/guides/deployment/managing-environments ;
   https://supabase.com/docs/guides/platform/backups
6. **Sauvegardes selon le plan** — Pro 7 jours, Team 14, Enterprise jusqu'à 30 ; **Free :
   aucune**, export par `supabase db dump`. PITR : add-on Pro/Team/Enterprise, exige au moins
   le compute Small, et **l'activer arrête les sauvegardes quotidiennes**. Source :
   https://supabase.com/docs/guides/platform/backups
7. **Réseau et SSL : ce qu'ils couvrent, ce qu'ils ne couvrent pas** —
   `supabase network-restrictions get|update --project-ref <ref> --db-allow-cidr <cidr>
   --experimental` ; `update` **remplace** la liste (sauf `--append`). Ces restrictions
   couvrent Postgres et le pooler, **pas** les API HTTPS (PostgREST, Storage, Auth) : elles ne
   protègent pas les tables exposées, seule la RLS le fait.
   `supabase ssl-enforcement update --project-ref <ref> --enable-db-ssl-enforcement
   --experimental` **redémarre la base** : geste à placer avant la fenêtre de MEP. Sources :
   https://supabase.com/docs/guides/platform/network-restrictions ;
   https://supabase.com/docs/guides/platform/ssl-enforcement
8. **Stockage** — ouvert par politiques RLS sur `storage.objects` ; « Storage does not allow
   any uploads to buckets without RLS policies » ; un bucket public est lisible par tous sans
   politique. Source : https://supabase.com/docs/guides/storage/security/access-control
9. **Credentials sur le poste et dans le dépôt** — `supabase login` range le jeton dans le
   stockage natif, sinon en clair dans `~/.supabase/access-token`. Le `.gitignore` posé par
   `init` dans `supabase/` exclut `.branches`, `.temp`, `.env.keys`, `.env.local`,
   `.env.*.local` ; `supabase/.temp/` porte `project-ref` et `pooler-url`. Sources :
   https://supabase.com/docs/reference/cli/introduction ; dépôt github.com/supabase/cli,
   `apps/cli/src/shared/init/testdata/go-templates/gitignore` et
   `apps/cli-go/internal/utils/misc.go` l. 84-97 (branche develop, lus le 16/10/2026)
