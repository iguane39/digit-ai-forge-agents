#!/usr/bin/env node
// porte-identite-publication — refuse un envoi qui partirait sous un autre compte que celui de
// l'utilisateur de la Factory (D-175 du 05/11/2026, TF-2168).
//
// LE FAIT. Le 05/11/2026 à 09:17, l'envoi de digit-ai-forge-audit est parti sous le compte du profil
// de session d'un produit client (GH_CONFIG_DIR) et a été refusé 403 ; il a été publié à 09:18 sous le
// compte du poste. Le refus venait de l'hébergeur, par hasard : un compte client doté du droit
// d'écriture aurait publié. Décision humaine D-175 : seule l'identité de l'utilisateur de la Factory
// peut publier pour la Factory et les forges, personne d'autre (le compte autorisé vit au référentiel
// du pilot, `comptes_autorises`, jamais dans cette forge).
//
// CE QUE LA PORTE JUGE. Le compte que rendra l'assistant d'identification de git pour github.com au
// moment de l'envoi : `gh api user --jq .login`, lancé avec l'environnement de l'envoi (GH_CONFIG_DIR,
// GH_TOKEN, GITHUB_TOKEN compris, puisque le hameçon est un enfant de `git push`). Le référentiel
// (`IDENTITE-PUBLICATION.json` du pilot) donne les comptes autorisés, les dépôts visés et le remède.
// Ce fichier ne porte AUCUNE adresse électronique ni identité : seuls des identifiants de compte
// circulent, et le jeton n'est jamais lu ni imprimé.
//
// ORDRE DES JUGEMENTS, du moins coûteux au plus coûteux :
//   1. portée : le nom du dépôt distant `origin` (à défaut, celui du dossier) correspond-il à `depots` ?
//      Non (un produit) → PASS exit 0, SANS_OBJET dit, aucun appel à gh. Le référentiel absent ne
//      permet pas de lire `depots` : la portée se juge alors sur le repli DEPOTS_REPLI ci-dessous.
//   2. référentiel : variable FORGE_IDENTITE_PUBLICATION, sinon
//      <racine>/digit-ai-factory/references/IDENTITE-PUBLICATION.json (racine = FORGE_ROOT, sinon le
//      parent du dépôt). Dans la portée et introuvable ou illisible → SKIP exit 2.
//   3. destination et assistant : l'envoi doit partir en https vers github.com, et l'assistant
//      d'identification effectif pour github.com doit être `gh auth git-credential` et lui seul.
//      Un autre assistant, un envoi par ssh, des identifiants dans l'URL → SKIP exit 2.
//   4. compte : gh, borne de 20 s. Illisible (gh absent, délai, code non nul, sortie vide) → SKIP exit 2.
//   5. verdict : compte dans `comptes_autorises` (sans tenir compte de la casse) → PASS exit 0 ; sinon
//      FAIL exit 1, le compte lu et le remède du référentiel nommés.
//
// UN SKIP REFUSE L'ENVOI AUSSI (le hameçon l'impose) : un compte qu'on ne peut pas lire ne se présume pas.
//
// Variables : PORTE_IDENTITE_GH désigne l'exécutable gh (le banc y pose un faux gh ; un fichier .mjs,
// .js ou .cjs est lancé par node, ce qui évite un script shell sous Windows) ;
// PORTE_IDENTITE_DELAI_MS peut RACCOURCIR la borne de 20 s, jamais l'allonger (le banc éprouve ainsi
// le dépassement de délai sans attendre 20 s).
//
// Usage : node porte-identite-publication.mjs <dépôt>
// Sortie : JSON {oracle, regle, artefact, verdict, findings[], non_juge[], motif? (SKIP), sans_objet?,
// compte?, remede?} · exit 0 PASS · 1 FAIL · 2 SKIP.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORACLE = 'porte-identite-publication';
const REGLE = 'D-175 du 05/11/2026 : seule l’identité de l’utilisateur de la Factory publie (TF-2168)';
const BORNE_GH_MS = 20000;
// Repli quand le référentiel ne se lit pas : les dépôts visés par D-175, recopiés ici pour que la
// portée reste jugeable. Le référentiel du pilot fait foi dès qu'il se lit.
const DEPOTS_REPLI = ['digit-ai-factory', 'digit-ai-forge-*'];
// Repli du remède, dit quand le référentiel ne se lit pas ; le référentiel fait foi sinon.
const REMEDE_REPLI = 'Rejouer l\'envoi sous le compte du poste, pour cette seule commande : env -u GH_CONFIG_DIR -u GH_TOKEN -u GITHUB_TOKEN git push …';

export const NON_JUGE = [
  'le compte d\'un envoi par ssh : il est celui de la clé, que gh ne dit pas ; la porte REFUSE (SKIP) un dépôt visé dont la destination est en ssh',
  'un assistant d\'identification autre que `gh auth git-credential` (gestionnaire du système, jeton dans l\'URL) : la porte REFUSE (SKIP), elle ne sait pas lire le compte qu\'il présentera',
  'le jeton réellement présenté à GitHub : jamais lu. La porte lit le compte par `gh api user` avec l\'environnement de l\'envoi ; un environnement modifié entre ce contrôle et l\'envoi n\'est pas vu',
  'le droit d\'écriture du compte sur le dépôt distant : la porte juge QUI publie, pas CE QU\'IL PEUT publier',
  'une URL distante qui ne vise que github.com par un sous-chemin (`credential.https://github.com/<organisation>.helper`) ou par `useHttpPath` : seules les clés `credential.helper` et `credential.https://github.com.helper` sont lues',
  'un dépôt visé sans remote `origin` est jugé comme un envoi vers github.com, sur le nom de son dossier',
  'un `git push --no-verify` ne passe pas par la porte : c\'est le contournement explicite de tous les hameçons du parc, il ne se cache pas',
];

const lanceEnDirect = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase().replaceAll('\\', '/')
     === path.resolve(process.argv[1]).toLowerCase().replaceAll('\\', '/');

const sortie = (verdict, depot, extra = {}, findings = [], motif) => {
  const o = { oracle: ORACLE, regle: REGLE, artefact: depot, verdict, findings,
    non_juge: motif ? [motif, ...NON_JUGE] : NON_JUGE, ...extra };
  if (motif) o.motif = motif;
  process.stdout.write(JSON.stringify(o));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2);
};

const git = (depot, ...a) => spawnSync('git', ['-C', depot, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', timeout: 20000 });

/** Motif de nom → expression : `*` couvre n'importe quelle suite, tout le reste est littéral. */
const motifVersRegex = (m) => new RegExp('^' + String(m).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');

/** Nom du dépôt distant : dernier segment de l'URL, sans `.git` ni séparateur final. */
export function nomDepuisUrl(url) {
  const nettoye = String(url).trim().replace(/[\\/]+$/, '').replace(/\.git$/i, '');
  const m = nettoye.match(/([^\\/:]+)$/);
  return m ? m[1] : '';
}

/** La destination d'une URL : `https` + hôte, `ssh` (scp-like ou ssh://), `autre` (chemin local, file://). */
export function destinationDe(url) {
  const u = String(url).trim();
  const h = u.match(/^https?:\/\/(?:([^/@]*)@)?([^/:]+)/i);
  if (h) return { type: 'https', hote: h[2].toLowerCase(), identifiants: h[1] !== undefined };
  if (/^ssh:\/\//i.test(u) || /^[^/\\:]+@[^/\\:]+:/.test(u)) return { type: 'ssh', hote: null, identifiants: false };
  return { type: 'autre', hote: null, identifiants: false };
}

/** Les assistants d'identification EFFECTIFS pour github.com, dans l'ordre où git les interroge : une
 *  valeur vide remet la liste à zéro (c'est ainsi que `gh auth setup-git` écarte le gestionnaire du système). */
export function assistantsEffectifs(depot) {
  const r = git(depot, 'config', '-z', '--get-regexp', '^credential\\..*helper$');
  if (r.error) return { erreur: 'git config illisible : ' + String(r.error.message).slice(0, 120), liste: [] };
  let liste = [];
  for (const entree of String(r.stdout || '').split('\0').filter(Boolean)) {
    const i = entree.indexOf('\n');
    const cle = (i < 0 ? entree : entree.slice(0, i)).trim();
    const valeur = i < 0 ? '' : entree.slice(i + 1).trim();
    const m = cle.match(/^credential\.(?:(.*)\.)?helper$/i);
    if (!m) continue;
    const sous = m[1];
    if (sous !== undefined && !/^(?:https:\/\/)?github\.com\/?$/i.test(sous)) continue;
    if (valeur === '') liste = [];
    else liste.push(valeur);
  }
  return { liste };
}

/** `!'C:\Program Files\GitHub CLI\gh.exe' auth git-credential` et ses variantes de guillemets ou de chemin. */
export const estAssistantGh = (v) => /^!\s*(?:"[^"]*[\\/]gh(?:\.exe)?"|'[^']*[\\/]gh(?:\.exe)?'|(?:[^\s'"]*[\\/])?gh(?:\.exe)?)\s+auth\s+git-credential\s*$/i.test(String(v).trim());

function lireReferentiel(chemin) {
  try {
    const o = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    const comptes = Array.isArray(o.comptes_autorises) ? o.comptes_autorises.filter((c) => typeof c === 'string' && c.trim()) : [];
    const depots = Array.isArray(o.depots) ? o.depots.filter((c) => typeof c === 'string' && c.trim()) : [];
    if (!comptes.length) return { erreur: 'comptes_autorises vide ou absent' };
    if (!depots.length) return { erreur: 'depots vide ou absent' };
    return { comptes, depots, remede: typeof o.remede === 'string' && o.remede.trim() ? o.remede.trim() : REMEDE_REPLI };
  } catch (e) { return { erreur: 'illisible (' + String(e.message).slice(0, 120) + ')' }; }
}

/** Le compte que rend gh, lancé avec l'environnement courant. {login} ou {erreur}. */
function lireCompte() {
  const exe = process.env.PORTE_IDENTITE_GH || 'gh';
  const demande = Number(process.env.PORTE_IDENTITE_DELAI_MS);
  const borne = Number.isFinite(demande) && demande > 0 ? Math.min(demande, BORNE_GH_MS) : BORNE_GH_MS;
  const args = ['api', '--hostname', 'github.com', 'user', '--jq', '.login'];
  const parNode = /\.(mjs|cjs|js)$/i.test(exe);
  const r = spawnSync(parNode ? process.execPath : exe, parNode ? [exe, ...args] : args,
    { encoding: 'utf8', timeout: borne, windowsHide: true, env: process.env });
  if (r.error) return { erreur: r.error.code === 'ETIMEDOUT' ? 'gh sans réponse après ' + Math.round(borne / 1000) + ' s' : 'gh ne se lance pas (' + String(r.error.code || r.error.message).slice(0, 80) + ')' };
  if (r.status !== 0) return { erreur: 'gh api user a rendu le code ' + r.status + ' : ' + String(r.stderr || '').trim().split('\n')[0].slice(0, 160) };
  const login = String(r.stdout || '').trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) return { erreur: 'gh api user n\'a pas rendu un identifiant de compte lisible' };
  return { login };
}

if (lanceEnDirect) {
  const depotArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const racineGit = depotArg ? git(depotArg, 'rev-parse', '--show-toplevel') : { status: 1 };
  if (!depotArg || racineGit.status !== 0) sortie('SKIP', String(depotArg), {}, [], 'dépôt introuvable ou illisible : « ' + String(depotArg) + ' »');
  const depot = path.resolve(String(racineGit.stdout).trim());

  // 1. Portée : le nom de origin, à défaut celui du dossier.
  const urlOrigin = git(depot, 'config', '--get', 'remote.origin.url');
  const urlDeclaree = urlOrigin.status === 0 ? String(urlOrigin.stdout).trim() : '';
  const nom = urlDeclaree ? nomDepuisUrl(urlDeclaree) : path.basename(depot);

  // 2. Référentiel.
  const racine = process.env.FORGE_ROOT || path.dirname(depot);
  const cheminRef = process.env.FORGE_IDENTITE_PUBLICATION
    || path.join(racine, 'digit-ai-factory', 'references', 'IDENTITE-PUBLICATION.json');
  const ref = fs.existsSync(cheminRef) ? lireReferentiel(cheminRef) : { erreur: 'introuvable' };
  const depotsVises = ref.erreur ? DEPOTS_REPLI : ref.depots;
  const dansLaPortee = depotsVises.some((m) => motifVersRegex(m).test(nom));
  const sansObjet = (extra, raison) => sortie('PASS', depot, { ...extra, sans_objet: true, note: 'SANS_OBJET : ' + raison });
  if (!dansLaPortee) {
    sansObjet({ depot_distant: nom }, 'le dépôt distant « ' + nom + ' » n’est pas visé par depots (' + depotsVises.join(', ') + ') : ce n’est ni la Factory ni une forge, la porte ne juge pas son compte');
  }
  if (ref.erreur) {
    sortie('SKIP', depot, { depot_distant: nom, remede: REMEDE_REPLI }, [],
      'référentiel d\'identité de publication ' + ref.erreur + ' (« ' + cheminRef + ' ») alors que le dépôt « ' + nom
      + ' » est visé : sans lui la porte ne sait pas quels comptes sont autorisés. Variable FORGE_IDENTITE_PUBLICATION, sinon <racine>/digit-ai-factory/references/IDENTITE-PUBLICATION.json.');
  }

  // 3. Destination et assistant d'identification.
  const urlPush = git(depot, 'config', '--get', 'remote.origin.pushurl');
  const declaree = destinationDe((urlPush.status === 0 && String(urlPush.stdout).trim()) || urlDeclaree);
  const effective = git(depot, 'remote', 'get-url', '--push', 'origin');
  const reelle = effective.status === 0 ? destinationDe(String(effective.stdout).trim()) : null;
  const extra = { depot_distant: nom, referentiel: cheminRef, remede: ref.remede };
  if (urlDeclaree && declaree.type === 'https' && declaree.hote !== 'github.com') {
    sansObjet(extra, 'la destination déclarée (' + declaree.hote + ') n’est pas github.com : la porte ne juge que les envois vers github.com');
  }
  if (urlDeclaree && declaree.type === 'autre') {
    sansObjet(extra, 'la destination déclarée est un chemin local ou un fichier, pas github.com : aucun compte GitHub ne publie');
  }
  if (declaree.type === 'ssh' || (reelle && reelle.type === 'ssh')) {
    sortie('SKIP', depot, extra, [], 'envoi par ssh : le compte est celui de la clé et gh ne le dit pas, la porte ne peut pas le lire.');
  }
  if (declaree.identifiants || (reelle && reelle.identifiants)) {
    sortie('SKIP', depot, extra, [], 'l\'URL distante porte des identifiants : le compte est celui de l\'URL et non celui de gh, la porte ne peut pas le lire.');
  }
  const assistants = assistantsEffectifs(depot);
  if (assistants.erreur) sortie('SKIP', depot, extra, [], assistants.erreur);
  if (!assistants.liste.length || !assistants.liste.every(estAssistantGh)) {
    sortie('SKIP', depot, extra, [], 'l\'assistant d\'identification de git pour github.com n\'est pas `gh auth git-credential` seul (lu : '
      + (assistants.liste.length ? assistants.liste.map((v) => '« ' + v.slice(0, 80) + ' »').join(', ') : 'aucun, git demandera les identifiants') + ') : la porte ne sait pas quel compte il présentera.');
  }

  // 4. Compte.
  const compte = lireCompte();
  if (compte.erreur) sortie('SKIP', depot, extra, [], 'le compte de publication ne se lit pas : ' + compte.erreur + '.');

  // 5. Verdict.
  const autorise = ref.comptes.some((c) => c.toLowerCase() === compte.login.toLowerCase());
  if (autorise) sortie('PASS', depot, { ...extra, compte: compte.login });
  sortie('FAIL', depot, { ...extra, compte: compte.login }, [{
    regle: 'D-175', sev: 'bloquant', where: nom,
    msg: 'l\'envoi partirait sous le compte « ' + compte.login + ' », hors de comptes_autorises (' + ref.comptes.join(', ')
      + '). Remède : ' + ref.remede,
  }]);
}
