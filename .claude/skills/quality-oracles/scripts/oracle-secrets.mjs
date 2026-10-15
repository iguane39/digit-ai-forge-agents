#!/usr/bin/env node
// oracle-secrets — Domaine « Sécurité / secrets ».
// Scanne un fichier (ou dossier) à la recherche de secrets exposés : clés privées,
// clés AWS/GCP, tokens GitHub/Slack, PAT, chaînes de connexion, affectations
// mot de passe/clé avec valeur réelle. Scanner intégré (sans dépendance) ; utilise
// gitleaks en complément s'il est installé. NE COUVRE PAS les vulnérabilités de
// dépendances (SCA : pip-audit / npm audit / OSV) → déclaré en non_juge.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ecrivainDeContrat } from './lib/contrat.mjs';
import { perimetreVersionneDemande, fichiersVersionnes, cleDeChemin } from './lib/perimetre.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ info: true });

const target = process.argv[2];
const DOM = 'Sécurité / secrets';
const NJ = ['vulnérabilités de dépendances (SCA : pip-audit / npm audit / OSV)', 'secrets dans l\'historique git (scanner le dépôt, pas seulement le fichier)'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(contratJSON({ oracle: 'oracle-secrets', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!target || !fs.existsSync(target)) emit('SKIP', [{ sev: 'info', msg: 'cible absente' }]);
// TF-1702 (lot Produit-82 20261014b, RA-3) — `--versionne` (ou QO_PERIMETRE=versionne, posé par
// run-oracles) : seul le contenu que git suit ou suivrait est jugé (lib/perimetre.mjs). Un `.env`
// ignoré n'est pas une fuite du dépôt ; il reste nommé au non_juge. Hors dépôt git : disque entier, dit.
let PERIMETRE = null;
if (perimetreVersionneDemande()) {
  const p = fichiersVersionnes(target);
  if (p.fichiers) PERIMETRE = p.fichiers;
  else NJ.push('périmètre VERSIONNÉ demandé, mais ' + p.motif + ' : le DISQUE entier est jugé (TF-1702)');
}
const horsPerimetre = [];
const dansPerimetre = f => { if (!PERIMETRE || PERIMETRE.has(cleDeChemin(f))) return true; horsPerimetre.push(f); return false; };

const HIGH = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/, 'clé privée'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'clé d\'accès AWS'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'token GitHub (ghp_)'],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, 'GitHub fine-grained PAT'],
  [/\bAIza[0-9A-Za-z\-_]{35}\b/, 'clé API Google'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'token Slack'],
  [/(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/=]{20,}/, 'chaîne de connexion (clé)'],
  [/\bBearer\s+[A-Za-z0-9\-_.]{24,}\b/, 'jeton Bearer en clair']
];
const ASSIGN = /\b(pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]([^'"]{6,})['"]/gi;
const PLACEHOLDER = /\{\{|\$\{|<[^>]+>|x{3,}|changeme|example|redacted|\*{3,}|placeholder|todo|env[:.]|process\.env|os\.environ|getenv/i;

// TF-1349 (24/09/2026) — DONNÉES DE TEST ET LIBELLÉS. Mesuré chez un produit : 4 constats bloquants sur
// 5, tous faux — des mots de passe de FIXTURES et un libellé d'interface (« password: 'Mot de passe' »).
// Une affectation dans un fichier de test (dossier tests/, fixtures/, __tests__/, spec/, e2e/,
// testdata/ ; fichier *.test.*, *.spec.*, test_*.py, conftest.py) est RÉTROGRADÉE en avertissement,
// jamais retirée : elle reste nommée. Une valeur faite de mots séparés par des espaces est un libellé,
// pas un secret. Les FORMATS de jeton reconnus (HIGH : clé AWS, PAT GitHub, clé privée…) restent
// bloquants partout, fichiers de test compris : un vrai jeton dans une fixture est une fuite.
const FICHIER_DE_TEST = /(?:^|[\\/])(?:tests?|__tests__|spec|specs|fixtures?|e2e|testdata)[\\/]|(?:^|[\\/])(?:[^\\/]+\.(?:test|spec)\.[a-z0-9]+|test_[^\\/]+\.py|[^\\/]+_test\.(?:py|go)|conftest\.py)$/i;
const LIBELLE = /^[\p{L}'’.,!?:\-]+(?:\s+[\p{L}'’.,!?:\-]+)+$/u;
function scanText(txt, file, findings) {
  for (const [re, label] of HIGH) { const m = txt.match(re); if (m) findings.push({ sev: 'bloquant', msg: 'secret probable : ' + label, where: file + ' · ' + m[0].slice(0, 6) + '…' }); }
  // Le chemin jugé est RELATIF À LA CIBLE scannée : un dossier de test du produit compte, le dossier
  // où la cible elle-même est rangée ne compte pas (une cible fichier n'est jugée que sur son nom).
  const rel = fs.statSync(target).isDirectory() ? path.relative(target, file) : path.basename(file);
  const deTest = FICHIER_DE_TEST.test(rel);
  let m;
  while ((m = ASSIGN.exec(txt))) {
    const val = m[2];
    if (PLACEHOLDER.test(val) || /^(true|false|null|none|)$/i.test(val)) findings.push({ sev: 'warn', msg: 'affectation « ' + m[1] + ' » à valeur non réelle (placeholder/env) — OK', where: file });
    else if (LIBELLE.test(val.trim())) findings.push({ sev: 'warn', msg: 'affectation « ' + m[1] + ' » à un LIBELLÉ (mots séparés par des espaces), pas à un secret — rétrogradée (TF-1349)', where: file });
    else if (deTest) findings.push({ sev: 'warn', msg: 'valeur en clair dans un fichier de TEST : affectation « ' + m[1] + ' » — rétrogradée en avertissement (TF-1349) ; vérifier qu\'elle n\'ouvre aucun service réel', where: file + ' · ' + val.slice(0, 4) + '…' });
    else findings.push({ sev: 'bloquant', msg: 'secret en clair : affectation « ' + m[1] + ' »', where: file + ' · ' + val.slice(0, 4) + '…' });
  }
}
function listFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (['node_modules', '.git', '.venv', 'dist', 'build'].includes(e.name)) continue;
    const fp = path.join(p, e.name);
    if (e.isDirectory()) out.push(...listFiles(fp));
    else out.push(fp);
  }
  return out;
}

const findings = [];
for (const f of listFiles(target).filter(dansPerimetre)) {
  let buf; try { buf = fs.readFileSync(f); } catch { continue; }
  if (buf.includes(0)) continue; // binaire
  try { scanText(new TextDecoder('utf-8', { fatal: false }).decode(buf), f, findings); } catch {}
}
// gitleaks en complément si présent
// TF-1701 (lot Produit-82 20261014b, RA-2) — SES CONSTATS SE LISENT UN PAR UN. Le verdict ne lisait
// que le code de sortie de gitleaks : sa règle `generic-api-key` prenait pour des clés les empreintes
// SHA-256 d'un journal d'oracles (`"scripts/masquer_secrets.py": "<64 hex>"`), et l'oracle rendait
// FAIL sur la preuve d'un run. Le rapport JSON de gitleaks est lu : une valeur qui est EXACTEMENT
// une empreinte hexadécimale (16 ou 64 caractères), dans un fichier nommé comme un journal de
// run-oracles, est rétrogradée en avertissement et reste nommée ; tout autre constat, y compris dans
// un journal, reste bloquant et se localise (fichier:ligne, règle). Rapport illisible : bloquant.
const JOURNAL_ORACLES = /^(?:_oracles-journal(?:-historique)?\.jsonl?|.+\.oracles(?:-historique)?\.jsonl?|(?:.+)?\.oracles-cache\.json)$/i;
const EMPREINTE = /^(?:[0-9a-f]{16}|[0-9a-f]{64})$/;
if (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gitleaks'], { encoding: 'utf8' }).status === 0) {
  const rapport = path.join(os.tmpdir(), `qo-gitleaks-${process.pid}-${Date.now()}.json`);
  const g = spawnSync('gitleaks', ['detect', '--no-git', '--no-banner', '-s', target, '--report-format', 'json', '--report-path', rapport], { encoding: 'utf8' });
  let lus = null; try { lus = JSON.parse(fs.readFileSync(rapport, 'utf8')); } catch { /* illisible : bloquant ci-dessous */ }
  try { fs.rmSync(rapport, { force: true }); } catch { /* rapport temporaire : rien à garder */ }
  if (g.status === 1) {
    if (!Array.isArray(lus) || !lus.length) findings.push({ sev: 'bloquant', msg: 'gitleaks a détecté des secrets', where: (g.stdout || g.stderr || '').split('\n').slice(0, 2).join(' | ') });
    else for (const x of lus) {
      if (x.File && !dansPerimetre(String(x.File))) continue;     // TF-1702 : hors du contenu versionné
      const ou = String(x.File || '?') + ':' + (x.StartLine ?? '?');
      if (JOURNAL_ORACLES.test(path.basename(String(x.File || ''))) && EMPREINTE.test(String(x.Secret || ''))) findings.push({ sev: 'warn', msg: 'gitleaks ' + (x.RuleID || '?') + ' sur une EMPREINTE SHA-256 d\'un journal d\'oracles, pas un secret — rétrogradée (TF-1701)', where: ou });
      else findings.push({ sev: 'bloquant', msg: 'gitleaks ' + (x.RuleID || '?') + ' : secret probable', where: ou + ' · ' + String(x.Secret || '').slice(0, 4) + '…' });
    }
  }
} else NJ.push('gitleaks non installé — scanner intégré utilisé (couverture moindre)');
if (PERIMETRE) {
  const noms = [...new Set(horsPerimetre.map(f => path.relative(fs.statSync(target).isDirectory() ? target : path.dirname(target), path.resolve(f)).split(path.sep).join('/')))];
  NJ.push('périmètre VERSIONNÉ (git ls-files -co --exclude-standard, TF-1702) : ' + noms.length + ' fichier(s) du disque ignoré(s) par git et NON jugé(s)'
    + (noms.length ? ' — ' + noms.slice(0, 5).join(', ') + (noms.length > 5 ? ' (+' + (noms.length - 5) + ')' : '') : ''));
}

const blocking = findings.filter(f => f.sev === 'bloquant');
if (blocking.length) emit('FAIL', findings);
emit('PASS', findings.length ? findings : [{ sev: 'info', msg: 'aucun secret détecté' }]);
