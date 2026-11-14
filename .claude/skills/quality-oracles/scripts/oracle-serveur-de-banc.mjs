#!/usr/bin/env node
// oracle-serveur-de-banc — Domaine « Banc ou recette : un serveur local lancé en arrière-plan s'arrête dans la même commande ».
// TF-2414 (14/11/2026, Produit-84 lot 20261110a RU-17) : `wrangler pages dev`, lancé en arrière-plan le 09/11/2026 à 20:16 pour un
// banc d'accessibilité, tournait encore le 10/11 ; son `esbuild` avait consommé 25 880 s de processeur (mesuré par Get-Process) et la
// campagne forge_tests, 2 minutes la veille, n'avait fini aucun pan après 15 minutes. Un serveur lancé pour un banc qui survit au tour
// fausse toutes les mesures suivantes : le banc l'arrête dans la MÊME commande que celle qui le lance.
//
// Contrôle STATIQUE d'un script de banc ou de recette (.mjs .js .cjs .py .sh .bash .ps1 .cmd .bat), par lignes : un SERVEUR de
// développement ou de fichiers statiques (wrangler dev, npm run dev|start|serve|preview, vite, next, astro, ng serve, http-server,
// live-server, json-server, python -m http.server, uvicorn, flask run, gunicorn, php -S, nodemon, webpack serve) LANCÉ EN ARRIÈRE-PLAN
// (`&` final, nohup, setsid, start /b, Start-Process, Start-Job, spawn/fork/exec asynchrones, subprocess.Popen, run_in_background) doit
// être suivi, plus bas dans le même fichier, d'un geste d'arrêt (kill, terminate, Stop-Process, taskkill, pkill, killall, .close(),
// .stop(), .shutdown(), process.kill, tree-kill, `trap … EXIT|INT|TERM`). Sans lui : un constat bloquant par lancement.
//
// Gestes que le message propose, rejoués par la fixture verte : un `try … finally` qui tue le processus lancé, un `trap 'kill $PID'
// EXIT`, un `try { … } finally { Stop-Process … }`. Exemption déclarée, l'oracle la lit : `serveur-banc-ok: <raison, 8 caractères au
// moins>` dans un commentaire de la ligne du lancement ou de la précédente — un refus jugé faux se rapporte, il ne se contourne pas
// en déformant le code (TF-1912).
//
// Usage : node oracle-serveur-de-banc.mjs <script>
// Exit : 0 PASS · 1 FAIL · 2 SKIP (fichier absent, extension non gérée).
import fs from 'node:fs';
import path from 'node:path';
import { ecrivainDeContrat } from './lib/contrat.mjs';

const contratJSON = ecrivainDeContrat({ premier: true });
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = "Banc ou recette : un serveur local lancé en arrière-plan s'arrête dans la même commande";
const NJ = [
  "Les lignes du script seulement : un serveur lancé par une commande tapée en session (hors de tout fichier) n'est pas vu — c'est le contrôle de fin de tour du pilot qui liste les tâches d'arrière-plan encore actives.",
  "Un arrêt n'est cherché que DANS LE MÊME FICHIER, après le lancement : qu'il s'exécute sur tous les chemins (sortie anticipée, exception, interruption) n'est pas jugé — `try … finally`, `trap … EXIT` sont les formes sûres que le message propose.",
  "Un serveur lancé sous un autre nom (script npm, binaire d'un projet) n'est pas reconnu, sauf dans la liste connue ; un serveur lancé dans un AUTRE fichier que celui jugé n'est pas suivi.",
  "Que l'arrêt vise bien le processus lancé (et non un autre) : un `kill` quelconque suffit à lever le constat.",
];
const out = (verdict, findings, code, motif) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-serveur-de-banc', domaine: DOM, artefact: file || null, verdict, ...(verdict === 'SKIP' ? { motif } : {}), findings, non_juge: verdict === 'SKIP' ? [motif, ...NJ] : NJ }));
  process.exit(code);
};
const EXT = ['.mjs', '.js', '.cjs', '.py', '.sh', '.bash', '.ps1', '.cmd', '.bat'];
if (!file || !fs.existsSync(file)) out('SKIP', [], 2, 'fichier absent : ' + (file || '(aucun argument)'));
if (!EXT.includes(path.extname(file).toLowerCase())) out('SKIP', [], 2, `extension non gérée : ${path.extname(file) || '(aucune)'} (attendu ${EXT.join(' ')})`);

// Le serveur : la forme d'une commande qui ne rend pas la main. Les guillemets, virgules, crochets et parenthèses d'un appel
// (spawn('npx', ['wrangler', 'pages', 'dev'])) sont blanchis avant lecture : la commande se lit comme au clavier.
const SERVEURS = [
  ['wrangler dev', /\bwrangler(?:\.cmd)?\s+(?:pages\s+)?dev\b/i],
  ['npm run dev|start|serve|preview', /\b(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?(?:dev|start|serve|preview)\b/i],
  ['npx (vite|serve|http-server|live-server|next|astro)', /\bnpx(?:\.cmd)?\s+(?:--?\w+\s+)*(?:vite|serve|http-server|live-server|next|astro|json-server)\b/i],
  ['vite dev|preview|serve', /\bvite(?:\.cmd)?\s+(?:dev|preview|serve)\b/i],
  ['next dev|start', /\bnext\s+(?:dev|start)\b/i],
  ['astro dev|preview', /\bastro\s+(?:dev|preview)\b/i],
  ['ng serve', /\bng\s+serve\b/i],
  ['http-server', /\bhttp-server\b/i],
  ['live-server', /\blive-server\b/i],
  ['json-server', /\bjson-server\b/i],
  ['python -m http.server', /\bpython3?(?:\.exe)?\s+-m\s+http\.server\b/i],
  ['uvicorn', /\buvicorn\b/i],
  ['flask run', /\bflask\s+run\b/i],
  ['gunicorn', /\bgunicorn\b/i],
  ['php -S', /\bphp\s+-S\b/],
  ['nodemon', /\bnodemon\b/i],
  ['webpack serve', /\bwebpack(?:-dev-server|\s+serve)\b/i],
];
// L'arrière-plan : le lancement ne rend pas la main au script. `spawnSync`/`execSync`/`subprocess.run` BLOQUENT (un tel script se
// suspend de lui-même, c'est un autre défaut) : ils ne sont pas lus comme un arrière-plan.
const ARRIERE_PLAN = [
  /(?<!&)&\s*$/,                                        // shell : `commande &` (et non `&&`)
  /(?<![\w-])(?:nohup|setsid|disown)\b/i,
  /\bstart\s+\/b\b/i,
  /\bStart-(?:Process|Job|ThreadJob)\b/i,
  /(?<![\w.])(?:child_process\.)?(?:spawn|fork|exec|execFile)\s*\(/,   // node asynchrone (`spawnSync`, `execSync` : `\s*\(` ne suit pas)
  /\b(?:subprocess\.)?Popen\s*\(/,
  /\basyncio\.create_subprocess_(?:exec|shell)\b/,
  /\brun_in_background\b/i,
  /\bdetached\s*:\s*true\b/,
];
// L'arrêt : un geste qui coupe le processus ou ferme le serveur.
const ARRET = /\b(?:kill|killall|pkill|taskkill|Stop-Process|terminate|treeKill|tree-kill|process\.kill)\b|\.(?:close|stop|shutdown)\s*\(|\btrap\b[^\n]*\b(?:EXIT|INT|TERM)\b/i;
const EXEMPTION = /serveur-banc-ok\s*:\s*(\S.*)$/i;
const RAISON_MIN = 8;

const lignes = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const nom = path.basename(file);
const blanchie = l => l.replace(/["'`,[\]()]/g, ' ').replace(/\s+/g, ' ');
const lancements = [];
lignes.forEach((l, i) => {
  if (/^\s*(?:#|\/\/|\/\*|\*|REM\b|::|<#)/i.test(l)) return;   // un commentaire nomme un serveur sans le lancer
  const s = blanchie(l);
  const serveur = SERVEURS.find(([, re]) => re.test(s));
  if (!serveur) return;
  // L'arrière-plan se lit sur la ligne et sur les trois précédentes (un spawn( sur plusieurs lignes), jamais sur la suite.
  const fenetre = lignes.slice(Math.max(0, i - 3), i + 1).join('\n');
  const fond = ARRIERE_PLAN.some(re => re.test(l.trimEnd()) || re.test(fenetre));
  if (!fond) return;
  lancements.push({ ligne: i + 1, serveur: serveur[0], texte: l.trim().slice(0, 120) });
});

const findings = [];
const exemptes = [];
for (const lc of lancements) {
  const i = lc.ligne - 1;
  const decl = [lignes[i], lignes[i - 1]].map(x => (x ? EXEMPTION.exec(x) : null)).find(Boolean);
  if (decl) {
    const raison = decl[1].replace(/(?:\*\/|-->)\s*$/, '').trim();
    if (raison.length >= RAISON_MIN) { exemptes.push({ sev: 'info', msg: `serveur local (${lc.serveur}) lancé en arrière-plan ligne ${lc.ligne}, EXEMPTÉ par déclaration : ${raison}`, where: `${nom}:${lc.ligne}` }); continue; }
    findings.push({ sev: 'bloquant', msg: `serveur local (${lc.serveur}) lancé en arrière-plan ligne ${lc.ligne} : l'exemption « serveur-banc-ok » n'a pas de raison d'au moins ${RAISON_MIN} caractères (« ${raison} ») — une exemption sans raison ne couvre rien`, where: `${nom}:${lc.ligne}` });
    continue;
  }
  const arret = lignes.findIndex((l, j) => j >= i && ARRET.test(l));
  if (arret === -1) {
    findings.push({
      sev: 'bloquant',
      msg: `serveur local (${lc.serveur}) lancé en arrière-plan ligne ${lc.ligne} (« ${lc.texte} ») sans AUCUN arrêt plus bas dans ce fichier : un serveur lancé pour un banc survit au tour et sature le poste `
        + `(wrangler pages dev du 09/11/2026 : 25 880 s de processeur d'esbuild le lendemain, la campagne forge_tests bloquée). Geste : l'arrêter dans la même commande — un \`try … finally\` qui tue le processus, un \`trap 'kill $PID' EXIT\`, un \`Stop-Process\` en \`finally\` ; `
        + `une dette tenue s'exempte par « serveur-banc-ok: <raison> » dans un commentaire de la ligne du lancement ou de la précédente`,
      where: `${nom}:${lc.ligne}`,
    });
  }
}
if (findings.length) out('FAIL', [...findings, ...exemptes], 1);
out('PASS', exemptes.length ? exemptes : [{ sev: 'info', msg: lancements.length ? `${lancements.length} serveur(s) lancé(s) en arrière-plan, chacun suivi d'un arrêt dans le même fichier` : `aucun serveur local lancé en arrière-plan (${lignes.length} ligne(s) lues)`, where: nom }], 0);
