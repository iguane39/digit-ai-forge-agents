#!/usr/bin/env node
// oracle-pptx — Domaine « Rendu PPTX (structure & compatibilité) » (v1, déterministe).
// Vérifie l'artefact .pptx/.potx RÉEL (le zip livré, pas le code générateur) :
//   1. intégrité ZIP (python zipfile testzip) ;
//   2. [Content_Types].xml en PREMIÈRE entrée de l'archive (règle dure de la forge) ;
//   3. aucun <p:transition> dans les slides (interdit charte/compatibilité) ;
//   4. aucun média JPEG (interdit charte — PNG pré-composité attendu) ;
//   5. smoke-test de conversion `soffice --headless --convert-to pdf` (proxy déterministe
//      des bugs « viewer compatibility ») — absent → contrôle déclaré non_juge, pas PASS.
// non_juge : charte sémantique (kicker, logos, bijection sommaire↔intercalaires) et rendu
// visuel slide par slide → gate digit-ai-pptx. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePython } from './lib/python.mjs';

const file = process.argv[2];
// C1 — politique par profil : jpeg_interdit / transitions_interdites (défaut : les deux, rétrocompat digit-ai)
const pArg = process.argv.includes('--profil') ? process.argv[process.argv.indexOf('--profil') + 1] : null;
let POL = { jpeg_interdit: true, transitions_interdites: true };
if (pArg) { try { POL = { ...POL, ...(JSON.parse(fs.readFileSync(pArg, 'utf8')).pptx || {}) }; } catch {} }
const findings = [], non_juge = [
  'charte sémantique (pas de kicker, logo couverture/interlocuteurs seulement, bijection sommaire↔intercalaires) → gate digit-ai-pptx',
  'rendu visuel slide par slide (débordements, contraste, chevauchements) → pipeline d\'inspection digit-ai-pptx',
  'contenu (textes, chiffres, images pertinentes)'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-pptx', domaine: 'Rendu PPTX (structure & compatibilité)', artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = msg => { non_juge.unshift(msg); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!/\.(pptx|potx)$/i.test(file)) skip('extension non gérée');

const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
if (!py) skip('python indisponible (lecture zip impossible)');

// 1-4 : inspection de l'archive via zipfile (ordre réel des entrées + contenu des slides)
const script = `
import sys, zipfile, json, re
p = sys.argv[1]
r = {"ok": True, "first": None, "bad": None, "transitions": [], "jpegs": [], "sldsz": None, "polices": {}, "couleurs": {}}
try:
    z = zipfile.ZipFile(p)
    r["bad"] = z.testzip()
    names = z.namelist()
    r["first"] = names[0] if names else None
    for n in names:
        low = n.lower()
        if low.startswith("ppt/slides/") and low.endswith(".xml"):
            if b"<p:transition" in z.read(n): r["transitions"].append(n)
        if low.startswith("ppt/media/") and (low.endswith(".jpg") or low.endswith(".jpeg")): r["jpegs"].append(n)
        # TF-1130 : de quoi juger le FORMAT d'un support (taille, polices, couleurs de texte)
        if low == "ppt/presentation.xml":
            m = re.search(rb'<p:sldSz\\b[^>]*?cx="(\\d+)"[^>]*?cy="(\\d+)"', z.read(n))
            if m: r["sldsz"] = [int(m.group(1)), int(m.group(2))]
        if low.endswith(".xml") and low.startswith(("ppt/slides/slide", "ppt/slidelayouts/", "ppt/slidemasters/", "ppt/theme/")):
            data = z.read(n)
            for tf in re.findall(rb'<a:(?:latin|ea|cs)\\b[^>]*?typeface="([^"]*)"', data):
                t = tf.decode("utf-8", "replace")
                if t and not t.startswith("+"): r["polices"].setdefault(t, n)
            if low.startswith("ppt/slides/slide"):
                for rpr in re.findall(rb'<a:rPr\\b[^>]*?>(.*?)</a:rPr>', data, re.S):
                    for c in re.findall(rb'<a:srgbClr val="([0-9A-Fa-f]{6})"', rpr):
                        r["couleurs"].setdefault(c.decode().upper(), n)
except Exception as e:
    r["ok"] = False; r["err"] = str(e)
print(json.dumps(r))
`;
const insp = spawnSync(py[0], [...py.slice(1), '-c', script, file], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
let z = null; try { z = JSON.parse((insp.stdout || '').trim()); } catch {}
if (!z) skip('inspection zip inexécutable');
const base = path.basename(file);
if (!z.ok) findings.push({ sev: 'bloquant', msg: 'archive illisible : ' + (z.err || '?'), where: base });
else {
  if (z.bad) findings.push({ sev: 'bloquant', msg: 'entrée corrompue dans le zip : ' + z.bad, where: base });
  if (z.first !== '[Content_Types].xml') findings.push({ sev: 'bloquant', msg: '[Content_Types].xml n\'est pas la première entrée (trouvé : ' + z.first + ') — casse certains viewers', where: base });
  for (const t of z.transitions) findings.push({ sev: POL.transitions_interdites ? 'bloquant' : 'warn', msg: '<p:transition> présent' + (POL.transitions_interdites ? ' (interdit par le profil)' : ' (toléré par le profil — avertissement)'), where: base + ':' + t });
  for (const j of z.jpegs) findings.push({ sev: POL.jpeg_interdit ? 'bloquant' : 'warn', msg: 'média JPEG présent' + (POL.jpeg_interdit ? ' (interdit par le profil — PNG attendu)' : ' (toléré par le profil)'), where: base + ':' + j });
}

// TF-1130 (15/09/2026) — LE FORMAT D'UN SUPPORT DE DIAPOSITIVES, PILOTÉ PAR LE PROFIL. Faute de
// domaine au registre, un produit a dû écrire son oracle de format, puis le DUPLIQUER pour un second
// type de séance : cinq règles identiques sur huit dans deux fichiers du même dépôt. L'hygiène du
// paquet vivait déjà ici ; les trois règles de format qui ne dépendent que de la marque y entrent,
// chacune active SEULEMENT si le profil la déclare (`pptx.format`, `pptx.polices`,
// `pptx.palette`) — un appel sans ces clés juge exactement comme avant. Les règles propres à un
// type de séance (pied de page, couverture, faits) restent des invocations locales au produit.
if (z.ok) {
  if (POL.format) {
    const [a, b] = String(POL.format).split(':').map(Number);
    if (!z.sldsz) findings.push({ sev: 'bloquant', regle: 'P1', msg: `format attendu ${POL.format} : taille de diapositive introuvable (ppt/presentation.xml, p:sldSz)`, where: base });
    else {
      const ratio = z.sldsz[0] / z.sldsz[1];
      if (!(a > 0 && b > 0) || Math.abs(ratio - a / b) > 0.01 * (a / b))
        findings.push({ sev: 'bloquant', regle: 'P1', msg: `format ${ratio.toFixed(3)}:1 (${z.sldsz[0]} × ${z.sldsz[1]} EMU) au lieu du ${POL.format} du profil`, where: base + ':ppt/presentation.xml' });
    }
  }
  if (Array.isArray(POL.polices)) {
    const admises = new Set(POL.polices.map(s => String(s).toLowerCase()));
    for (const [police, ou] of Object.entries(z.polices))
      if (!admises.has(police.toLowerCase())) findings.push({ sev: 'bloquant', regle: 'P2', msg: `police « ${police} » hors du jeu du profil (${POL.polices.join(', ')})`, where: base + ':' + ou });
  }
  if (Array.isArray(POL.palette)) {
    const admises = new Set(POL.palette.map(s => String(s).replace('#', '').toUpperCase()));
    for (const [couleur, ou] of Object.entries(z.couleurs))
      if (!admises.has(couleur)) findings.push({ sev: 'bloquant', regle: 'P3', msg: `couleur de texte #${couleur} hors de la palette du profil`, where: base + ':' + ou });
  }
  if (POL.format || Array.isArray(POL.polices) || Array.isArray(POL.palette)) non_juge.push(
    'débordement de texte hors de son cadre : non jugé par heuristique — le rendu PowerPoint le montre (TF-1130 : les deux défauts réels du support l’ont été au rendu)',
    'couleurs héritées du thème ou des masques (schemeClr) : seules les couleurs EXPLICITES des runs de texte sont jugées par P3');
}

// 5 : smoke-test de conversion LibreOffice (si présent) — un échec de conversion = FAIL
const soffice = ['soffice', 'libreoffice'].find(c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c]).status === 0);
if (soffice && z.ok && !z.bad) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-pptx-'));
  const conv = spawnSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, file], { encoding: 'utf8', timeout: 120000 });
  const pdf = fs.existsSync(path.join(tmp, base.replace(/\.(pptx|potx)$/i, '.pdf')));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (conv.error || conv.status !== 0 || !pdf) findings.push({ sev: 'bloquant', msg: 'échec du smoke-test de conversion LibreOffice (fichier non ouvrable de façon fiable)', where: base });
} else if (!soffice) non_juge.unshift('smoke-test de conversion non exécuté (LibreOffice absent)');

const bloquants = findings.filter(f => f.sev === 'bloquant').length;
out(bloquants ? 'FAIL' : 'PASS', bloquants ? 1 : 0);
