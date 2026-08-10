#!/usr/bin/env node
// oracle-secrets — Domaine « Sécurité / secrets ».
// Scanne un fichier (ou dossier) à la recherche de secrets exposés : clés privées,
// clés AWS/GCP, tokens GitHub/Slack, PAT, chaînes de connexion, affectations
// mot de passe/clé avec valeur réelle. Scanner intégré (sans dépendance) ; utilise
// gitleaks en complément s'il est installé. NE COUVRE PAS les vulnérabilités de
// dépendances (SCA : pip-audit / npm audit / OSV) → déclaré en non_juge.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} ; exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const DOM = 'Sécurité / secrets';
const NJ = ['vulnérabilités de dépendances (SCA : pip-audit / npm audit / OSV)', 'secrets dans l\'historique git (scanner le dépôt, pas seulement le fichier)'];
function emit(verdict, findings = [], non_juge = NJ) {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-secrets', domaine: DOM, artefact: target || null, verdict, findings, non_juge }));
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'SKIP' ? 2 : 0);
}
if (!target || !fs.existsSync(target)) emit('SKIP', [{ sev: 'info', msg: 'cible absente' }]);

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

function scanText(txt, file, findings) {
  for (const [re, label] of HIGH) { const m = txt.match(re); if (m) findings.push({ sev: 'bloquant', msg: 'secret probable : ' + label, where: file + ' · ' + m[0].slice(0, 6) + '…' }); }
  let m;
  while ((m = ASSIGN.exec(txt))) {
    const val = m[2];
    if (PLACEHOLDER.test(val) || /^(true|false|null|none|)$/i.test(val)) findings.push({ sev: 'warn', msg: 'affectation « ' + m[1] + ' » à valeur non réelle (placeholder/env) — OK', where: file });
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
for (const f of listFiles(target)) {
  let buf; try { buf = fs.readFileSync(f); } catch { continue; }
  if (buf.includes(0)) continue; // binaire
  try { scanText(new TextDecoder('utf-8', { fatal: false }).decode(buf), f, findings); } catch {}
}
// gitleaks en complément si présent
if (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gitleaks'], { encoding: 'utf8' }).status === 0) {
  const g = spawnSync('gitleaks', ['detect', '--no-git', '--no-banner', '-s', target], { encoding: 'utf8' });
  if (g.status === 1) findings.push({ sev: 'bloquant', msg: 'gitleaks a détecté des secrets', where: (g.stdout || g.stderr || '').split('\n').slice(0, 2).join(' | ') });
} else NJ.push('gitleaks non installé — scanner intégré utilisé (couverture moindre)');

const blocking = findings.filter(f => f.sev === 'bloquant');
if (blocking.length) emit('FAIL', findings);
emit('PASS', findings.length ? findings : [{ sev: 'info', msg: 'aucun secret détecté' }]);
