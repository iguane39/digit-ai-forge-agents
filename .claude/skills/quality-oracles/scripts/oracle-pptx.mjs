#!/usr/bin/env node
// oracle-pptx — Domaine « Rendu PPTX (structure & compatibilité) » (v1, déterministe).
// Vérifie l'artefact .pptx/.potx RÉEL (le zip livré, pas le code générateur) :
//   1. intégrité ZIP (python zipfile testzip) ;
//   2. [Content_Types].xml en PREMIÈRE entrée de l'archive (règle dure de la forge) ;
//   3. aucun <p:transition> dans les slides (interdit charte/compatibilité) ;
//   4. aucun média JPEG (interdit charte — PNG pré-composité attendu) ;
//   5. smoke-test de conversion `soffice --headless --convert-to pdf` (proxy déterministe
//      des bugs « viewer compatibility ») — absent → contrôle déclaré non_juge, pas PASS ;
//   6. (TF-2064) bonne formation XML de CHAQUE partie du paquet (.xml et .rels), sans LibreOffice :
//      une balise cassée (`</a:x>` pour `</a:t>`) rendait exit 0 sous le profil générique, et le seul
//      non_juge disait « smoke-test non exécuté ». Un XML mal formé = FAIL, avec la partie et la position.
// `--profil` illisible, introuvable ou sans objet JSON = erreur d'usage (exit 2), jamais les règles par défaut tues.
// non_juge : charte sémantique (kicker, logos, bijection sommaire↔intercalaires) et rendu
// visuel slide par slide → gate digit-ai-pptx. Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ premier: true });

const file = process.argv[2];
// C1 — politique par profil : jpeg_interdit / transitions_interdites (défaut : les deux, rétrocompat digit-ai)
// TF-2064 : un `--profil` sans valeur, introuvable ou illisible était avalé (`catch {}`) et l'oracle jugeait
// sous les règles par défaut sans le dire. C'est désormais une erreur d'usage (exit 2, message nommé, ci-dessous).
// Comme run-oracles, la valeur est un chemin, ou un nom résolu en profils/<nom>.json.
const SKILLDIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const iProfil = process.argv.indexOf('--profil');
const pArg = iProfil >= 0 ? process.argv[iProfil + 1] : null;
let POL = { jpeg_interdit: true, transitions_interdites: true };
let profilErreur = null, profilSansPptx = null;
if (iProfil >= 0) {
  if (!pArg || pArg.startsWith('--')) profilErreur = '--profil attend un chemin ou un nom de profil (profils/<nom>.json) ; aucune valeur reçue';
  else {
    const chemin = [pArg, path.join(SKILLDIR, 'profils', pArg + '.json')].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!chemin) profilErreur = `profil « ${pArg} » introuvable (ni un fichier existant, ni profils/${pArg}.json)`;
    else {
      try {
        const j = JSON.parse(fs.readFileSync(chemin, 'utf8'));
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('la racine n\'est pas un objet JSON');
        if (j.pptx !== undefined && (!j.pptx || typeof j.pptx !== 'object' || Array.isArray(j.pptx))) throw new Error('la clé « pptx » n\'est pas un objet');
        POL = { ...POL, ...(j.pptx || {}) };
        if (j.pptx === undefined) profilSansPptx = pArg;
      } catch (e) { profilErreur = `profil « ${pArg} » illisible : ${e.message}`; }
    }
  }
}
const findings = [], non_juge = [
  'charte sémantique (pas de kicker, logo couverture/interlocuteurs seulement, bijection sommaire↔intercalaires) → gate digit-ai-pptx',
  'rendu visuel slide par slide (débordements, contraste, chevauchements) → pipeline d\'inspection digit-ai-pptx',
  'contenu (textes, chiffres, images pertinentes)',
  // TF-1501 (01/10/2026) : cinq versions d'un deck sont sorties avec huit polices embarquées fausses,
  // PASS ici sur chacune, et ce non_juge n'en disait rien. Le trou se dit désormais, avec son juge.
  'polices embarquées (parties ppt/fonts/) : NON décodées par cet oracle — jugées par oracle-polices-embarquees.mjs (domaine « Polices embarquées d\'un PPTX », E0 décodage, E1 contours, E2 boîte englobante), que run-oracles route sur tout paquet qui en porte'
];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-pptx', domaine: 'Rendu PPTX (structure & compatibilité)', artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = msg => { non_juge.unshift(msg); out('SKIP', 2); };
if (profilErreur) { console.error('oracle-pptx : erreur d\'usage — ' + profilErreur); skip('erreur d\'usage : ' + profilErreur + ' — rien n\'a été jugé'); }
if (profilSansPptx) non_juge.push(`profil « ${profilSansPptx} » sans clé pptx : règles par défaut appliquées (JPEG et transitions interdits)`);
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!/\.(pptx|potx)$/i.test(file)) skip('extension non gérée');

const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
if (!py) skip('python indisponible (lecture zip impossible)');

// 1-4 : inspection de l'archive via zipfile (ordre réel des entrées + contenu des slides)
const script = `
import sys, zipfile, json, re
import xml.parsers.expat as ex
p = sys.argv[1]
r = {"ok": True, "first": None, "bad": None, "transitions": [], "jpegs": [], "sldsz": None, "polices": {}, "couleurs": {}, "xml": []}
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
        # TF-2064 : bonne formation de chaque partie XML, par expat (bibliothèque standard, aucun LibreOffice)
        if low.endswith(".xml") or low.endswith(".rels"):
            try:
                brut = z.read(n)
            except Exception:
                brut = None  # entrée illisible : testzip la signale déjà
            if brut is not None:
                try:
                    ex.ParserCreate().Parse(brut, True)
                except ex.ExpatError as e:
                    r["xml"].append({"part": n, "ligne": e.lineno, "col": e.offset, "msg": ex.ErrorString(e.code)})
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
  // TF-2064 : bloquant sous TOUT profil — un XML mal formé n'est pas une affaire de charte, PowerPoint propose la réparation ou refuse d'ouvrir.
  for (const x of z.xml) findings.push({ sev: 'bloquant', regle: 'X1', msg: `XML mal formé : ${x.msg} (ligne ${x.ligne}, colonne ${x.col})`, where: `${base}:${x.part}:${x.ligne}:${x.col}` });
  non_juge.push('validité des parties XML contre les schémas OOXML (XSD) : non jugée — seule la BONNE FORMATION de chaque partie .xml/.rels est contrôlée (balises équilibrées, une racine), par un analyseur XML de la bibliothèque standard');
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
  // TF-2372 : une règle qui ne se joue pas faute de clé au profil le DIT. Avant, P1 à P3 restaient muettes et le PASS
  // se lisait comme « format, polices et couleurs conformes » alors que rien n'avait été comparé.
  const inactives = [['P1', !POL.format, 'pptx.format'], ['P2', !Array.isArray(POL.polices), 'pptx.polices'], ['P3', !Array.isArray(POL.palette), 'pptx.palette']].filter(r => r[1]);
  if (inactives.length) non_juge.push(`${inactives.map(r => r[0]).join(', ')} NON jouée(s) : ${iProfil >= 0 && !profilErreur ? 'le profil « ' + pArg + ' » ne déclare pas ' + inactives.map(r => r[2]).join(', ') : 'aucun profil passé (--profil)'} — ${inactives.map(r => ({ P1: 'format de la diapositive', P2: 'polices', P3: 'couleurs de texte' })[r[0]]).join(', ')} non jugé(s)`);
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
