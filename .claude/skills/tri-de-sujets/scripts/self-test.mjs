#!/usr/bin/env node
// self-test.mjs — double sens : chaque verbe sur un cas nominal et un cas limite, et l'oracle du
// skill sur ses fixtures rouge et verte. Sort en exit 1 au premier écart compté.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresseCanonique, decider, normaliser, rendreTableau, soustraire } from './tri.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
let ok = 0;
let ko = 0;
function verifier(nom, vrai) {
  if (vrai) ok++;
  else { ko++; console.log('ECHEC', nom); }
}

// normaliser
const page = `<!doctype html><a href="https://www.tiktok.com/@notif/video/111"></a>
<div data-e2e="favorites-item"><a href="https://www.tiktok.com/@a/video/222?x-expires=9&tk=z"><img alt="Un outil &amp; un agent" src="./p_files/c.jpeg"></a></div>
<div data-e2e="favorites-item"><a href="https://www.tiktok.com/@b/photo/333"><img alt="" src="./p_files/d.jpeg"></a></div>
<div data-e2e="favorites-item"><a href="https://www.tiktok.com/@a/video/222"></a></div>`;
const rp = normaliser(page);
verifier('page : 2 favoris uniques, doublon compté', rp.entrees.length === 2 && rp.doublons === 1);
verifier('page : carrousel photo lu', rp.entrees.some((e) => e.type === 'photo'));
verifier('page : lien hors favoris compté, pas rangé', rp.hors_liste === 1 && !rp.entrees.some((e) => e.id === '111'));
verifier('page : aucune signature', !JSON.stringify(rp).includes('x-expires') && !JSON.stringify(rp).includes('tk='));
verifier('page : légende décodée', rp.entrees[0].texte === 'Un outil & un agent');
const gen = normaliser('<html><a href="https://exemple.org/a?token=1">Titre A</a><a href="https://exemple.org/a">Titre A bis</a></html>');
verifier('page générique : requête retirée, doublon retiré', gen.entrees.length === 1 && gen.entrees[0].lien === 'https://exemple.org/a');
const txt = normaliser('- Un sujet\n- un sujet\n2. Un autre https://exemple.org/x?y=1\n\n# titre ignoré\n');
verifier('texte : doublon insensible à la casse', txt.entrees.length === 2 && txt.doublons === 1);
verifier('texte : lien canonique', txt.entrees[1].lien === 'https://exemple.org/x');
const js = normaliser('{"id":"a","titre":"Sujet A"}\n{"url":"https://exemple.org/b?z=1","texte":"B"}\n');
verifier('jsonl : 2 entrées', js.entrees.length === 2 && js.format === 'jsonl' && js.entrees[1].lien === 'https://exemple.org/b');
verifier('liste vide : aucune entrée', normaliser('').entrees.length === 0);
verifier('adresse illisible : null', adresseCanonique('pas une adresse') === null);

// soustraire
const entrees = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const rang = JSON.stringify({ entrees: [{ id: 'a', etat: 'retenu' }, { id: 'b', etat: 'non qualifié' }] });
const s1 = soustraire(entrees, [{ nom: 'r.json', contenu: rang }]);
verifier('soustraire : retenu retiré, non qualifié gardé', s1.garde.map((e) => e.id).join() === 'b,c');
const md = '| 1 | a | opportunité 3 |\n| 2 | b | légende trop vague |\n';
const s2 = soustraire(entrees, [{ nom: 't.md', contenu: md }], ['légende trop vague']);
verifier('soustraire : annexe Markdown et terme à reprendre', s2.garde.map((e) => e.id).join() === 'b,c');

// verdict : chaque branche, dans l'ordre
const base = { element: 'x', notes_chiffres: { G: 4, N: 4, P: 4, C: 3 } };
verifier('verdict : à écarter avant tout', decider({ ...base, ecarte: true, seuil: 'objet-durable', question: 'q' }).verdict === 'À écarter');
verifier('verdict : déjà couvert', decider({ ...base, deja_couvert: true }).verdict === 'Sans suite');
verifier('verdict : score sous 15', decider({ element: 'x', notes_chiffres: { G: 1, N: 3, P: 3, C: 3 }, seuil: 'objet-durable', question: 'q' }).verdict === 'Sans suite');
verifier('verdict : étude poussée', decider({ ...base, seuil: 'objet-durable', question: 'q' }).verdict === 'Étude poussée');
verifier('verdict : seuil sans question ne fait pas une étude', decider({ ...base, seuil: 'objet-durable' }).verdict === 'Décision directe');
verifier('verdict : essai court', decider({ element: 'x', notes_chiffres: { G: 3, N: 3, P: 3, C: 4 }, seuil: 'non', mesure: 'm' }).verdict === 'Essai court');
verifier('verdict : mesure sans coût inverse', decider({ ...base, seuil: 'non', mesure: 'm' }).verdict === 'Décision directe');
verifier('verdict : somme 2G + N + P + C', decider({ ...base, seuil: 'non' }).notes === 'G4 N4 P4 C3 = 19');
let refuse = false;
try { decider({ element: 'x', notes_chiffres: { G: 9, N: 1, P: 1, C: 1 } }); } catch { refuse = true; }
verifier('verdict : note hors bornes refusée', refuse);

// tableau
const r = { entrees: [{ id: 'a', auteur: 'z', lien: 'https://exemple.org/a' }], lignes: [{ element: 'E', ids: ['a'], verdict: 'Sans suite', motif: 'M', existant: 'X' }] };
verifier('tableau : 4 colonnes par défaut', rendreTableau(r).includes('| Motif |') && rendreTableau(r).includes('| M |'));
verifier('tableau : 3 colonnes sans motif', !rendreTableau(r, { motif: 'aucun' }).includes('Motif'));
verifier('tableau : motif réduit', rendreTableau(r, { motif: 'existant' }).includes('| X |'));
verifier('tableau : vide dit', rendreTableau({ lignes: [] }).startsWith("Rien n'a été retenu"));

// oracle, depuis la source versionnée ou la copie installée : les 2 skills sont voisins
const qo = join(ICI, '..', '..', 'quality-oracles');
const oracle = join(qo, 'scripts', 'oracle-tri-de-sujets.mjs');
if (!existsSync(oracle)) {
  ko++;
  console.log('ECHEC oracle introuvable :', oracle);
} else {
  const jouer = (f) => {
    const p = spawnSync(process.execPath, [oracle, join(qo, 'fixtures', f)], { encoding: 'utf8' });
    return { code: p.status, j: JSON.parse(p.stdout) };
  };
  const v = jouer('tri-de-sujets-green.md');
  verifier('oracle : fixture verte PASS', v.code === 0 && v.j.verdict === 'PASS');
  const g = jouer('tri-de-sujets-red.md');
  verifier('oracle : fixture rouge FAIL', g.code === 1 && g.j.verdict === 'FAIL');
  const regles = new Set(g.j.findings.map((x) => x.regle));
  for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']) verifier(`oracle : la rouge déclenche ${t}`, regles.has(t));

  // T11 et T12 : une liste qui finit sans ligne, dite ou tue
  const dossier = mkdtempSync(join(tmpdir(), 'tri-'));
  const ecrire = (nom, md, rg) => {
    const f = join(dossier, nom);
    writeFileSync(f, md);
    writeFileSync(f + '.rangement.json', JSON.stringify(rg));
    return spawnSync(process.execPath, [oracle, f], { encoding: 'utf8' });
  };
  const nq = { perimetre: 2, entrees: [{ id: 'sujet-x1', etat: 'non qualifié', motif: 'm', voie: 'légende' }, { id: 'sujet-x2', etat: 'non qualifié', motif: 'm', voie: 'légende' }], lignes: [] };
  const dit = ecrire('dit.md', "# Tri\n\nRien n'a été retenu : 2 contenus sur 2 sont non qualifiés.\n", nq);
  verifier('oracle : tableau vide dit, PASS', dit.status === 0);
  const tu = JSON.parse(ecrire('tu.md', '# Tri\n\nDeux contenus lus.\n', nq).stdout);
  verifier('oracle : tableau vide tu, T11 et T12', tu.verdict === 'FAIL' && tu.findings.some((x) => x.regle === 'T11') && tu.findings.some((x) => x.regle === 'T12'));
  rmSync(dossier, { recursive: true, force: true });
}

console.log(`self-test tri-de-sujets : ${ok}/${ok + ko} PASS`);
process.exit(ko ? 1 : 0);
