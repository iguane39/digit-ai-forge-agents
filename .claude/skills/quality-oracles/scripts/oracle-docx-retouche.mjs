#!/usr/bin/env node
// oracle-docx-retouche — Domaine « Document Word retouché, jugé contre sa version d'origine » (TF-2370,
// 10/11/2026 ; squelette write-an-oracle).
//
// LE FAIT. Aucun oracle du registre ne vérifiait qu'une retouche de DOCX ne touche que ce qui est déclaré :
// oracle-docx juge le paquet, validate.py le schéma, aucun ne compare au document d'origine. Le 28/09/2026,
// un produit a écrit un contrôle pour le tour (huit vérifications K1 à K8, neuf variantes fautives tombées
// chacune sur son contrôle ; K8 passait d'abord, un identifiant de rangée recopié sur un paragraphe).
// Cet oracle porte au standard §3 les six vérifications qui valent pour toute retouche ; K4 (durées d'un
// CV recalculées) et K7 (mise en page mesurée sur le PDF que rend Word) sont propres à un document ou à un
// poste, et sont déclarés non jugés.
//
// Confidentialité : la sortie ne recopie AUCUN texte du document ; un paragraphe se désigne par son rang,
// un tableau par son numéro d'ordre (un document retouché porte souvent des noms de personnes et de clients).
//
// Checklist canonique (versionnée ici) :
//   K1 PARTIES — même liste de parties ; toute partie autre que word/document.xml et docProps/*.xml est
//      identique octet pour octet à l'origine (styles, numérotation, thème, polices, en-têtes, pieds).
//   K2 PARAGRAPHES — les paragraphes retirés et ajoutés sont exactement ceux que la déclaration nomme
//      (multiensembles) ; les paragraphes communs gardent l'ordre de l'origine, déplacements déclarés exceptés.
//   K3 TABLEAUX — un tableau non déclaré retouché a un XML identique à celui de même rang de l'origine ; un
//      tableau déclaré « pagination » n'en diffère que par w:cantSplit et w:keepNext ; le nombre de
//      tableaux ne change que si la déclaration le dit.
//   K5 NOMS — le texte AJOUTÉ ne porte aucun nom interdit, jugé par la porte des noms (oracle-nom-client-
//      publie, R3) ; `--referentiel=` et `--produits=` lui sont transmis.
//   K6 MARQUEURS — aucun marqueur de travail ajouté (à vérifier, à confirmer, TODO, XXX, ??).
//   K8 IDENTIFIANTS — les w14:paraId (paragraphes et rangées) sont uniques.
//
// Déclaration (`--declaration <retouches.json>`, hors dépôt quand elle porte du texte du document) :
//   { "retires": ["texte"], "ajoutes": ["texte"], "deplaces": [{ "texte": "…", "avant": "paragraphe suivant" }],
//     "tableaux": { "retouches": [rangs], "pagination": [rangs], "nombre": N } }
//
// Usage : node oracle-docx-retouche.mjs <retouche.docx> --origine <origine.docx> --declaration <retouches.json>
//         [--referentiel=<noms.json>] [--produits=<produits.json>]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python.mjs';
import { jugerNoms } from './lib/noms-texte.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe ; ici, son domicile est le premier non_juge.
const contratJSON = ecrivainDeContrat({ premier: true });

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const AVEC_VALEUR = ['--origine', '--declaration'];
const file = args.find((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const optEgal = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const DOM = "Document Word retouché, jugé contre sa version d'origine";
const nonJuge = [
  'K4 durées recalculées (« … / Aujourd\'hui – N mois », années d\'une synthèse) : propres à un CV, non jugées ici',
  'K7 mise en page mesurée sur le PDF que rend Word (encart sur une page, blanc en haut de page) : exige Word sur le poste, non jugée ici',
  'la VÉRITÉ des paragraphes ajoutés, la qualité rédactionnelle et la pertinence du document',
  'le schéma du paquet (→ validate.py) et sa validité d\'ouverture (→ oracle-docx)',
  'un tableau imbriqué dans un autre est lu avec lui, comme un seul tableau',
];
const findings = [];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-docx-retouche', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge })); process.exit(code); };
const skip = motif => { nonJuge.unshift(motif); out('SKIP', 2); };

if (!file || !fs.existsSync(file)) skip('fichier absent : ' + (file || '(aucun argument)'));
if (path.extname(file).toLowerCase() !== '.docx') skip('extension non gérée : ' + path.extname(file) + ' (attendu .docx)');
const origine = opt('origine');
if (!origine || !fs.existsSync(origine)) skip('--origine absente ou introuvable : sans la version d\'origine, la retouche ne se juge pas');
const declF = opt('declaration');
if (!declF || !fs.existsSync(declF)) skip('--declaration absente ou introuvable : sans la liste des retouches déclarées, rien ne sépare une retouche voulue d\'une retouche subie');
let decl;
try { decl = JSON.parse(fs.readFileSync(declF, 'utf8')); } catch (e) { skip('--declaration illisible : ' + e.message); }
const py = resolvePython();
if (!py) skip('python indisponible : les paquets ne peuvent pas être lus (zipfile)');
const r = spawnSync(py[0], [...py.slice(1), path.join(ICI, 'lib', 'comparer_docx.py'), origine, file],
  { encoding: 'utf8', timeout: 120000, maxBuffer: 256e6, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
let c = null; try { c = JSON.parse(String(r.stdout || '').trim()); } catch { /* dit ci-dessous */ }
if (!c) skip('comparaison illisible : ' + String(r.stderr || r.error || '').trim().slice(0, 200));
const base = path.basename(file);
if (!c.ok) { findings.push({ sev: 'bloquant', regle: 'K1', msg: `K1 — un des deux paquets est illisible : ${c.erreur}`, where: base }); out('FAIL', 1); }

// K1 — parties du paquet
if (c.parties_en_plus.length || c.parties_en_moins.length) findings.push({ sev: 'bloquant', regle: 'K1', msg: `K1 — liste des parties différente : ${c.parties_en_plus.length} en plus (${c.parties_en_plus.join(', ')}), ${c.parties_en_moins.length} en moins (${c.parties_en_moins.join(', ')})`, where: base });
if (c.parties_modifiees_hors_corps.length) findings.push({ sev: 'bloquant', regle: 'K1', msg: `K1 — partie(s) modifiée(s) hors du corps : ${c.parties_modifiees_hors_corps.join(', ')} — le format, les en-têtes ou les pieds ont bougé`, where: base });

// K2 — paragraphes retirés, ajoutés, ordre
const nf = s => String(s || '').normalize('NFKC');
const compte = l => l.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
const moins = (a, b) => { const m = new Map(); for (const [t, n] of a) { const d = n - (b.get(t) || 0); if (d > 0) m.set(t, d); } return m; };
const po = c.paragraphes_origine, pr = c.paragraphes_retouche;
const co = compte(po), cr = compte(pr);
const reelR = moins(co, cr), reelA = moins(cr, co);
const dR = compte((decl.retires || []).map(nf)), dA = compte((decl.ajoutes || []).map(nf));
const rangs = (liste, t) => liste.map((x, i) => (x === t ? i + 1 : 0)).filter(Boolean).slice(0, 3).join(', ');
for (const [t, n] of moins(reelR, dR)) findings.push({ sev: 'bloquant', regle: 'K2', msg: `K2 — paragraphe retiré sans déclaration (${n} fois)`, where: `${base}:origine, paragraphe(s) ${rangs(po, t)}` });
for (const [t, n] of moins(dR, reelR)) findings.push({ sev: 'bloquant', regle: 'K2', msg: `K2 — retrait déclaré, absent du document retouché (${n} fois)`, where: `${base}:origine, paragraphe(s) ${rangs(po, t) || '(texte introuvable)'}` });
for (const [t, n] of moins(reelA, dA)) findings.push({ sev: 'bloquant', regle: 'K2', msg: `K2 — paragraphe ajouté sans déclaration (${n} fois)`, where: `${base}:paragraphe(s) ${rangs(pr, t)}` });
for (const [t, n] of moins(dA, reelA)) findings.push({ sev: 'bloquant', regle: 'K2', msg: `K2 — ajout déclaré, absent du document retouché (${n} fois)`, where: `${base}:déclaration n° ${[...dA.keys()].indexOf(t) + 1}` });
const deplaces = new Map((decl.deplaces || []).map(d => [nf(d.texte), nf(d.avant)]));
const communs = new Map([...co].map(([t, n]) => [t, Math.min(n, cr.get(t) || 0)]).filter(([, n]) => n > 0));
const premiers = liste => { const vus = new Map(), o = []; for (const t of liste) if (t.trim() && !deplaces.has(t) && (vus.get(t) || 0) < (communs.get(t) || 0)) { vus.set(t, (vus.get(t) || 0) + 1); o.push(t); } return o; };
const so = premiers(po), sr = premiers(pr);
const iDiff = so.findIndex((t, i) => t !== sr[i]);
if (iDiff >= 0 || so.length !== sr.length) findings.push({ sev: 'bloquant', regle: 'K2', msg: `K2 — l'ordre des paragraphes communs diffère de l'origine à partir du ${iDiff >= 0 ? iDiff + 1 : Math.min(so.length, sr.length) + 1}e paragraphe commun, sans déplacement déclaré`, where: base });
for (const [t, suivant] of deplaces) {
  const i = pr.indexOf(t);
  if (i < 0 || pr[i + 1] !== suivant) findings.push({ sev: 'bloquant', regle: 'K2', msg: 'K2 — déplacement déclaré non constaté', where: `${base}:paragraphe ${i < 0 ? '(introuvable)' : i + 1}` });
}

// K3 — tableaux
const T = decl.tableaux || {};
const retouches = new Set(T.retouches || []), pagination = new Set(T.pagination || []);
const nAttendu = Number.isInteger(T.nombre) ? T.nombre : c.tableaux_origine;
if (c.tableaux.length !== nAttendu) findings.push({ sev: 'bloquant', regle: 'K3', msg: `K3 — ${c.tableaux.length} tableau(x) au document retouché, ${nAttendu} attendu(s) (origine : ${c.tableaux_origine}${Number.isInteger(T.nombre) ? ', nombre déclaré' : ''})`, where: base });
for (const t of c.tableaux) {
  if (t.identique || retouches.has(t.rang)) continue;
  if (pagination.has(t.rang) && t.pagination_seule) continue;
  findings.push({ sev: 'bloquant', regle: 'K3', msg: `K3 — tableau n° ${t.rang} modifié sans déclaration${t.pagination_seule ? ' (pagination seule : le déclarer « pagination »)' : ''}`, where: `${base}:tableau ${t.rang}` });
}

// K5 — noms interdits dans le texte AJOUTÉ (la porte des noms)
const ajoute = [...reelA.keys()].join('\n');
if (ajoute.trim()) {
  const n = jugerNoms(ajoute, { referentiel: optEgal('referentiel'), produits: optEgal('produits') });
  if (!n.juge) nonJuge.push('K5 non jugé : ' + n.motif);
  if (n.constats.length) findings.push({ sev: 'bloquant', regle: 'K5', msg: `K5 — ${n.constats.length} nom(s) interdit(s) de la table des noms dans le texte ajouté (la porte des noms les nomme ; ils ne sont pas recopiés ici)`, where: base });
}

// K6 — marqueurs de travail ajoutés
const MARQUEURS = /\b(?:à vérifier|a verifier|à confirmer|a confirmer|TODO|XXX)\b|\?\?/i;
for (const [t] of reelA) if (MARQUEURS.test(t) && !po.some(x => MARQUEURS.test(x) && x === t))
  findings.push({ sev: 'bloquant', regle: 'K6', msg: `K6 — marqueur de travail ajouté (« ${t.match(MARQUEURS)[0]} »)`, where: `${base}:paragraphe(s) ${rangs(pr, t)}` });

// K8 — identifiants w14:paraId uniques
if (c.paraid_doubles.length) findings.push({ sev: 'bloquant', regle: 'K8', msg: `K8 — ${c.paraid_doubles.length} identifiant(s) w14:paraId en double (${c.paraid_doubles.slice(0, 5).join(', ')}) : Word les répare à l'ouverture, en perdant les liens qui s'y rattachent`, where: base });

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
findings.push({ sev: 'info', msg: `retouche conforme à sa déclaration : ${c.parties_identiques_hors_corps} partie(s) hors corps identiques, ${reelR.size} retrait(s) et ${reelA.size} ajout(s) déclarés, ${c.tableaux.length} tableau(x), ${c.paraid_total} identifiant(s) uniques`, where: base });
out('PASS', 0);
