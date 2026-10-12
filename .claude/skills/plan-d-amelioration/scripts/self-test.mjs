#!/usr/bin/env node
// Recette du skill plan-d-amelioration (TF-1234, 12/10/2026). Exit 0 = PASS, 1 = FAIL.
//
// Double sens, règle par règle : le plan vert passe ; chaque rouge est dérivé du vert en ne
// changeant QU'UN élément, et doit échouer sur SA règle (pas seulement échouer). Puis le verbe
// joindre (refus d'un doublon, acceptation du vert, écriture consolidée), l'extracteur du fichier
// d'actions, et le verbe rendre : la page du vert passe check_html.py et oracle-filtres-tableau
// (non joué et DIT si Python ou le socle manquent).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILLDIR, lireActions, lireControles } from './lib.mjs';

const ORACLE = path.join(SKILLDIR, 'scripts', 'oracle-plan-d-amelioration.mjs');
const JOINDRE = path.join(SKILLDIR, 'scripts', 'joindre.mjs');
const RENDRE = path.join(SKILLDIR, 'scripts', 'rendre.mjs');
const FIX = path.join(SKILLDIR, 'fixtures');
const VERT = path.join(FIX, 'plan-vert.json');
const ok = [], ko = [];
const bon = (m) => { ok.push(m); console.log(`  ✅ ${m}`); };
const mal = (m) => { ko.push(m); console.log(`  ❌ ${m}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-amel-'));
fs.cpSync(path.join(FIX, 'audit'), path.join(tmp, 'audit'), { recursive: true });
const base = () => JSON.parse(fs.readFileSync(VERT, 'utf8'));
const juger = (plan, nom) => {
  const f = path.join(tmp, `${nom}.json`);
  fs.writeFileSync(f, JSON.stringify(plan, null, 2));
  const r = spawnSync(process.execPath, [ORACLE, f], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* dit ci-dessous */ }
  return { exit: r.status, j, regles: new Set((j?.findings || []).map((x) => x.regle)) };
};
const fiche = (p, id) => p.fiches.find((f) => f.id === id);

try {
  // ── Le vert ──
  const v = juger(base(), 'vert');
  v.exit === 0 && v.j?.verdict === 'PASS' && v.j.findings.length === 0
    ? bon(`vert : PASS, 0 constat (${v.j.mesure.fiches} fiches, ${v.j.mesure.jonction} liens de jonction)`)
    : mal(`vert : attendu PASS, lu ${v.j?.verdict} exit ${v.exit} — ${(v.j?.findings || []).map((x) => x.msg).join(' | ').slice(0, 400)}`);

  // ── Un rouge par règle, un seul élément changé ──
  const rouges = [
    ['PA1', 'champ cible retiré', (p) => { delete fiche(p, 'AM-FON-01').preuve_cloture; }],
    ['PA1', 'identifiant hors motif', (p) => { fiche(p, 'AM-FON-01').id = 'AM-FON-1'; p.decisions[1].fiches = ['AM-FON-1']; }],
    ['PA2', 'constat sans source', (p) => { fiche(p, 'AM-BACK-01').constat.source = ''; }],
    ['PA3', 'chiffre sans statut', (p) => { fiche(p, 'AM-PERF-01').chiffres[0].statut = 'estime'; }],
    ['PA3', 'quantité écrite hors liste des chiffres', (p) => { fiche(p, 'AM-COUT-01').gain.attendu = 'une marge par client calculable, soit 12 % de coût évité'; }],
    ['PA4', 'cas limite 2 : constat rattaché à un contrôle évalué', (p) => { fiche(p, 'AM-QUA-01').constat.texte = 'Aucun test de charge sur la recherche (contrôle CTL-D06-01).'; }],
    ['PA4', 'constat qui reprend un constat d audit', (p) => { fiche(p, 'AM-EXP-01').constat.source = 'rapport d audit, constat CST-D10-01'; }],
    ['PA5', 'domaine sans fiche ni ligne motivée', (p) => { p.domaines_sans_fiche = p.domaines_sans_fiche.filter((d) => d.domaine !== 'DOC'); }],
    ['PA6', 'plan existant non rattaché', (p) => { delete p.plans_existants[2].hors_sujet_motif; }],
    ['PA7', 'table de jonction absente', (p) => { delete p.jonction; }],
    ['PA7', 'renvoi REM orphelin', (p) => { fiche(p, 'AM-EXP-01').dependances = ['REM-D99-009']; }],
    ['PA8', 'rang en double', (p) => { fiche(p, 'AM-COUT-01').rang = 1; }],
    ['PA8', 'décision manquante', (p) => { p.decisions.pop(); }],
    ['PA9', 'effort en jours', (p) => { p.decisions[0].cout = 'environ 3 jours'; }],
    ['PA10', 'archive modifiée pendant le run', (p) => { p.empreinte_archive = { ouverture: 'sha256:aaa', cloture: 'sha256:bbb' }; }],
    ['PA11', 'cas limite 3 : contraire à une décision sans motif', (p) => { delete fiche(p, 'AM-ARC-01').statut_existant.motif; }],
    ['PA12', 'intention non validée', (p) => { delete p.intention.validee_le; }],
    ['PA13', 'cas limite 1 : performance mesurée sans instance', (p) => { Object.assign(fiche(p, 'AM-PERF-01').chiffres[0], { statut: 'mesure', commande: 'k6 run charge.js', sortie: 'p95=812ms' }); }],
    ['PA13', 'plan de mesure absent sans instance', (p) => { p.plan_de_mesure = []; }],
    ['PA14', 'question d ouverture absente', (p) => { p.questions_ouverture = p.questions_ouverture.filter((q) => q.id !== 'Q4'); }],
  ];
  for (const [regle, cas, muter] of rouges) {
    const p = base(); muter(p);
    const r = juger(p, `rouge-${regle}-${cas.replace(/\W+/g, '-')}`);
    r.exit === 1 && r.regles.has(regle)
      ? bon(`rouge ${regle} (${cas}) : FAIL par ${regle}${r.regles.size > 1 ? ` (+ ${[...r.regles].filter((x) => x !== regle).join(', ')})` : ''}`)
      : mal(`rouge ${regle} (${cas}) : attendu FAIL par ${regle}, lu exit ${r.exit} règles [${[...r.regles].join(', ')}]`);
  }
  // Le remède que PA9 recommande passe (TF-1013) : complexité × durée, sans jour.
  { const p = base(); p.decisions[0].cout = 'complexité moyenne, durée courte'; const r = juger(p, 'remede-PA9'); r.exit === 0 ? bon('remède PA9 joué : un coût en complexité × durée passe') : mal(`remède PA9 : attendu PASS, lu exit ${r.exit}`); }
  // Une durée de prose n'est pas un effort (non-jugé déclaré, sens vert).
  { const p = base(); fiche(p, 'AM-EXP-01').constat.texte = 'Les journaux ne sont conservés que trente jours, et l’installation suit un runbook manuel.'; const r = juger(p, 'prose-jours'); r.exit === 0 ? bon('une durée de prose dans un constat ne déclenche pas PA9') : mal(`prose : PA9 a mordu hors des zones d effort — ${[...r.regles]}`); }

  // ── Non jugeable ──
  { const f = path.join(tmp, 'pas-un-plan.json'); fs.writeFileSync(f, '{"titre":"autre chose"}'); const r = spawnSync(process.execPath, [ORACLE, f], { encoding: 'utf8' }); r.status === 2 ? bon('un JSON qui n est pas un plan rend exit 2 (SKIP), jamais PASS') : mal(`non jugeable : attendu exit 2, lu ${r.status}`); }
  // ── Sans fichiers d'audit : PA4 déclaré non jugé, pas PASS silencieux sur la frontière ──
  { const p = base(); delete p.audit; const r = juger(p, 'sans-audit'); (r.j?.non_juge || []).some((x) => x.startsWith('PA4')) ? bon('sans fichiers d audit, PA4 est déclaré non jugé') : mal('sans fichiers d audit, PA4 n est pas déclaré non jugé'); }

  // ── L'extracteur du fichier d'actions ──
  const a = lireActions(path.join(FIX, 'audit', 'remediation-actions.yaml'));
  const c = lireControles(path.join(FIX, 'audit', 'controles-evalues.json'));
  (a.audit_ref === 'ESSAI-AUD-2026-10' && a.actions.length === 3 && a.actions[1].control_ref === 'CTL-D10-01' && a.actions[1].finding_ref === 'CST-D10-01' && a.actions[2].severity === 'Majeur' && a.actions[0].title.startsWith('Purger'))
    ? bon('extracteur YAML : audit_ref, 3 actions, clés scalaires lues, blocs imbriqués ignorés') : mal(`extracteur YAML : ${JSON.stringify(a).slice(0, 300)}`);
  c.audit_ref === a.audit_ref ? bon('les deux fichiers de l audit d essai portent la même audit_ref') : mal('audit_ref divergente entre les fichiers d essai');
  // Le même extracteur sur l'exemple réel de forge-audit, quand la forge est sur le poste.
  const racine = process.env.FORGE_ROOT || path.resolve(SKILLDIR, '..', '..', '..', '..');
  const exemple = path.join(racine, 'digit-ai-forge-audit', 'tests', 'fixtures', 'remediation-actions.example.yaml');
  if (fs.existsSync(exemple)) {
    const e = lireActions(exemple);
    e.audit_ref && e.actions.length >= 3 && e.actions.every((x) => /^REM-D\d{2}-\d{3}$/.test(x.id) && x.control_ref)
      ? bon(`extracteur sur l exemple de forge-audit : ${e.actions.length} actions, chacune avec son control_ref`) : mal(`extracteur sur l exemple de forge-audit : ${JSON.stringify(e).slice(0, 300)}`);
  } else bon(`exemple de forge-audit absent de ce poste (${exemple}) — extracteur non confronté au fichier réel, et dit`);

  // ── Le verbe joindre ──
  { const r = spawnSync(process.execPath, [JOINDRE, path.join(tmp, 'vert.json')], { encoding: 'utf8' }); let j = null; try { j = JSON.parse(r.stdout); } catch {}
    r.status === 0 && j?.doublons.length === 0 && j.remediations_sans_lien?.includes('REM-D03-001') ? bon('joindre sur le vert : exit 0, 0 doublon, REM-D03-001 rendue sans lien') : mal(`joindre vert : exit ${r.status} ${r.stderr.slice(0, 200)}`); }
  { const p = base(); fiche(p, 'AM-QUA-01').control_ref = 'CTL-D06-01'; const f = path.join(tmp, 'joindre-doublon.json'); fs.writeFileSync(f, JSON.stringify(p));
    const avant = fs.readFileSync(f, 'utf8');
    const r = spawnSync(process.execPath, [JOINDRE, f, '--ecrire'], { encoding: 'utf8' });
    r.status === 1 && fs.readFileSync(f, 'utf8') === avant ? bon('joindre refuse un doublon (control_ref évalué), exit 1, fichier intact malgré --ecrire') : mal(`joindre doublon : exit ${r.status}`); }
  { const p = base(); p.jonction = []; const f = path.join(tmp, 'joindre-ecrire.json'); fs.writeFileSync(f, JSON.stringify(p));
    const r = spawnSync(process.execPath, [JOINDRE, f, '--ecrire'], { encoding: 'utf8' }); const apres = JSON.parse(fs.readFileSync(f, 'utf8'));
    r.status === 0 && apres.jonction.length === 2 && apres.jonction.every((x) => x.relation === 'conditionne') ? bon('joindre --ecrire dérive la jonction des dépendances REM : 2 liens « conditionne » écrits') : mal(`joindre --ecrire : exit ${r.status}, ${JSON.stringify(apres.jonction)}`); }

  // ── Le verbe rendre, et les oracles des vues ──
  const page = path.join(tmp, 'page.html'), vue = path.join(tmp, 'vue.md');
  const rr = spawnSync(process.execPath, [RENDRE, path.join(tmp, 'vert.json'), '--html', page, '--md', vue], { encoding: 'utf8' });
  if (rr.status !== 0) mal(`rendre : exit ${rr.status} — ${rr.stderr.slice(0, 300)}`);
  else {
    const h = fs.readFileSync(page, 'utf8');
    const ch = ['decisions', 'synthese', 'fiches', 'couverture', 'jonction', 'trajectoire', 'mesure', 'methode'].filter((id) => h.includes(`<section id="${id}">`));
    // Les blocs scellés du socle se retirent avant le balayage : leur commentaire d'usage cite
    // « <script src="find-in-page.js"> » à titre d'exemple, ce n'est pas un chargement.
    const horsSocle = h.replace(/<!-- COMPOSANT-EMBARQUE:DEBUT [\s\S]*?<!-- COMPOSANT-EMBARQUE:FIN [^>]*-->/g, '');
    ch.length === 8 && !/<script[^>]+src=|<link[^>]+href="http/i.test(horsSocle) ?bon('rendre : huit chapitres, aucune ressource externe') : mal(`rendre : ${ch.length} chapitres, ou ressource externe`);
    /COMPOSANT-EMBARQUE:DEBUT table-filters\.js/.test(h) && /COMPOSANT-EMBARQUE:DEBUT table-detail\.js/.test(h) ? bon('rendre : composants du socle posés sous marqueur scellé') : mal('rendre : composants du socle absents');
    const filtres = spawnSync(process.execPath, [path.join(SKILLDIR, '..', 'quality-oracles', 'scripts', 'oracle-filtres-tableau.mjs'), page], { encoding: 'utf8' });
    filtres.status === 0 ? bon('page rendue : oracle-filtres-tableau PASS') : mal(`page rendue : oracle-filtres-tableau exit ${filtres.status}`);
    const py = ['python', 'python3', 'py'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
    if (!py) bon('python introuvable : check_html.py et check_markdown.py NON joués sur la page rendue, et dit');
    else {
      const env = { ...process.env, PYTHONUTF8: '1' };
      const c1 = spawnSync(py, [path.join(SKILLDIR, '..', 'digit-ai-page-html', 'scripts', 'check_html.py'), page], { encoding: 'utf8', env });
      c1.status === 0 ? bon('page rendue : check_html.py PASS') : mal(`page rendue : check_html.py exit ${c1.status} — ${(c1.stdout || '').split('\n').filter((l) => /^\s+x /.test(l)).slice(0, 3).join(' | ')}`);
      const c2 = spawnSync(py, [path.join(SKILLDIR, '..', 'digit-ai-page-html', 'scripts', 'check_markdown.py'), vue], { encoding: 'utf8', env });
      c2.status === 0 ? bon('vue Markdown : check_markdown.py PASS') : mal(`vue Markdown : check_markdown.py exit ${c2.status}`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(ko.length ? `\n❌ FAIL (${ko.length} échec(s) sur ${ok.length + ko.length})` : `\n✅ PASS (${ok.length} contrôles)`);
process.exit(ko.length ? 1 : 0);
