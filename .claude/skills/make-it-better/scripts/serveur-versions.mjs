#!/usr/bin/env node
// serveur-versions.mjs — la page de versions d'un espace, sur 127.0.0.1 seulement.
//   node serveur-versions.mjs --espace <d> [--port 4750]
// <d> est l'espace d'un document, ou leur dossier parent. Ce serveur écrit jugements.json, aveugle.json
// et classement.json ; le modèle n'écrit jamais ces fichiers, et lancer.mjs ne lit pas le classement.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enregistrerClassement, leverAveugle, lettresDepuisGraine, lireAveugle, lireClassement, ouvrirAveugle } from './lib/aveugle.mjs';
import { appelerFormats, dateIso, ecrireJson, LIBELLE_FORMAT, lireJson, pad, RACINE_SKILL } from './lib/commun.mjs';
import { comparer } from './lib/diff.mjs';
import { ARRETS_TERMINAUX, cheminVersion, LIBELLE_ARRET, listerDocuments, lireTours, precedenteGardee } from './lib/espace.mjs';
import { echapper, markdownEnHtml, pageApercu } from './lib/markdown.mjs';
import { texteDeFichier } from './lib/texte.mjs';
import { exporterWordEnPdf } from './lib/word.mjs';

const PAGE = join(RACINE_SKILL, 'assets', 'page-versions.html');

// L'aperçu ne joint rien hors de ce serveur : ni fetch, ni image, ni police, ni formulaire externes.
const CSP_APERCU = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; sandbox allow-scripts";
const CSP_PAGE = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'";

/** Un Word arrêté tient parfois son fichier un instant : un dossier temporaire resté n'arrête pas le serveur. */
function retirer(dossier) {
  try {
    rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    console.error(`dossier temporaire non retiré : ${dossier} (${e.code})`);
  }
}

export function creerServeur({ espace, port = 4750 }) {
  const memoire = new Map();
  let fileWord = Promise.resolve();
  let aveugleActif = null; // { doc, essai } : l'adresse /aveugle/A n'en dit rien

  const documents = () => listerDocuments(espace);
  const trouver = (doc, essai) => {
    const d = documents().find((x) => x.nom === doc);
    const e = d?.essais.find((x) => x.id === essai);
    return d && e ? { d, e } : null;
  };

  const fichierJugements = (e) => join(e.dossier, 'jugements.json');
  const lireJugements = (e) => lireJson(fichierJugements(e), { versions: {} });
  function ecrireJugement(e, numero, pertinente, source = 'porteur') {
    const j = lireJugements(e);
    if (pertinente === null) delete j.versions[numero];
    else j.versions[numero] = { pertinente, source, date: dateIso() };
    ecrireJson(fichierJugements(e), j);
  }

  const dossierApercu = (d, e, numero) => join(d.dossier, 'apercus', e.id, pad(numero));

  /** Les images de pages d'une version Word ou PDF, à la demande ; une version à la fois pour Word. */
  function preparerImages(d, e, numero) {
    const memo = `${d.nom}/${e.id}/${numero}`;
    if (memoire.has(memo)) return memoire.get(memo);
    const promesse = (async () => {
      const dossier = dossierApercu(d, e, numero);
      const fait = lireJson(join(dossier, 'apercu.json'));
      if (fait?.mode === 'images') return fait;
      const fichier = cheminVersion(e.dossier, numero, d.ext);
      if (!fichier) return { mode: 'absent' };
      mkdirSync(dossier, { recursive: true });
      let pdf = fichier;
      let word = null;
      if (d.ext === 'docx') {
        const travail = mkdtempSync(join(tmpdir(), 'mib-word-'));
        const copie = join(travail, 'document.docx');
        const sortie = join(travail, 'document.pdf');
        copyFileSync(fichier, copie);
        const r = await new Promise((rendre) => {
          fileWord = fileWord.then(() => exporterWordEnPdf(copie, sortie)).then(rendre, (x) => rendre({ ok: false, raison: x.message }));
        });
        if (!r.ok) {
          retirer(travail);
          const lu = texteDeFichier(fichier);
          return { mode: 'texte', raison: r.raison, texte: lu.texte ?? '', numero_word: r.numero ?? null, arrete: r.arrete ?? false };
        }
        pdf = join(dossier, 'document.pdf');
        copyFileSync(sortie, pdf);
        retirer(travail);
        word = { numero: r.numero ?? null, arrete: r.arrete ?? false, reste_ouvert: r.reste_ouvert ?? false };
      }
      const images = appelerFormats(['pdf-images', pdf, dossier]);
      if (images.code !== 0) {
        const lu = texteDeFichier(fichier);
        return { mode: 'texte', raison: images.json?.motif || 'rendu des pages impossible', texte: lu.texte ?? '' };
      }
      const a = { mode: 'images', pages: images.json.pages, ...(word ? { word } : {}) };
      ecrireJson(join(dossier, 'apercu.json'), a);
      return a;
    })().catch((x) => {
      const f = cheminVersion(e.dossier, numero, d.ext);
      return { mode: 'texte', raison: `aperçu impossible : ${x.message}`, texte: f ? texteDeFichier(f).texte ?? '' : '' };
    });
    memoire.set(memo, promesse);
    // Un repli n'est pas définitif : Word peut revenir, le prochain aperçu réessaie.
    promesse.then((a) => { if (a.mode !== 'images') memoire.delete(memo); });
    return promesse;
  }

  function corpsTexte(texte, raison, general = false) {
    const avis = general
      ? 'Aperçu en texte extrait, pour toutes les versions de cette revue : l\'export Word n\'a pas abouti.'
      : `Aperçu en texte extrait : ${raison}.`;
    return `<p class="avis">${echapper(avis)}</p><pre>${echapper(texte || '(aucun texte lisible)')}</pre>`;
  }

  /** La page de l'aperçu d'une version : le cadre sandboxé la reçoit telle quelle. */
  async function pageDeVersion(d, e, numero, { baseImages, repliTexte = false, titre = 'Aperçu' } = {}) {
    const fichier = cheminVersion(e.dossier, numero, d.ext);
    if (!fichier) {
      const t = lireTours(e.dossier).find((x) => x.numero === numero);
      return pageApercu(`<p class="avis">Cette version n'a pas de fichier${t?.motif ? ` : ${echapper(t.motif)}` : ''}. Choisis une version gardée pour voir un rendu.</p>`, titre);
    }
    if (d.ext === 'html') return readFileSync(fichier, 'utf8');
    if (d.ext === 'md') return pageApercu(markdownEnHtml(readFileSync(fichier, 'utf8')), titre);
    if (repliTexte) return pageApercu(corpsTexte(texteDeFichier(fichier).texte, '', true), titre);
    const a = await preparerImages(d, e, numero);
    if (a.mode === 'images') {
      return pageApercu(Array.from({ length: a.pages }, (_, i) => `<img src="${baseImages}/page/${i + 1}" alt="Page ${i + 1} du document">`).join(''), titre);
    }
    return pageApercu(corpsTexte(a.texte, a.raison), titre);
  }

  const servirPage = (res, d, e, numero, k) => {
    const f = join(dossierApercu(d, e, numero), `page-${pad(k)}.png`);
    if (!existsSync(f)) return repondre(res, 404, 'Page absente', 'text/plain; charset=utf-8');
    return repondre(res, 200, readFileSync(f), 'image/png');
  };

  const entetes = (type, extra = {}) => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  function repondre(res, code, corps, type, extra = {}) {
    res.writeHead(code, entetes(type, extra));
    res.end(corps);
  }
  const json = (res, code, o) => repondre(res, code, JSON.stringify(o), 'application/json; charset=utf-8');
  const apercu = (res, html) => repondre(res, 200, html, 'text/html; charset=utf-8', { 'Content-Security-Policy': CSP_APERCU });

  function etatPublic() {
    return {
      espace_vide: documents().length === 0,
      documents: documents().map((d) => ({
        nom: d.nom, ext: d.ext, format: LIBELLE_FORMAT[d.ext] || null,
        essais: d.essais.map((e) => ({ id: e.id, statut: e.etat.statut || null, arret: e.etat.arret ? LIBELLE_ARRET[e.etat.arret.type] || e.etat.arret.type : null, pause: e.etat.pause?.motif || null, tours_max: e.etat.tours_max ?? null })),
      })),
    };
  }

  function versionsPubliques(d, e) {
    const jug = lireJugements(e).versions;
    const tours = lireTours(e.dossier);
    const terminal = ARRETS_TERMINAUX.includes(e.etat.arret?.type);
    return {
      format: LIBELLE_FORMAT[d.ext], ext: d.ext,
      etat: { statut: e.etat.statut || null, arret: e.etat.arret ? LIBELLE_ARRET[e.etat.arret.type] || e.etat.arret.type : null, pause: e.etat.pause?.motif || null, tours_max: e.etat.tours_max ?? null },
      aveugle: { disponible: terminal, raison: terminal ? null : 'L\'essai n\'a pas atteint son arrêt : reprends-le par --reprendre, la revue s\'ouvre ensuite.' },
      versions: tours.map((t) => ({
        numero: t.numero, numero_texte: pad(t.numero), type: t.type || 'sans note', commentaire: t.note?.apporte || '', retire: t.note?.retire || '',
        ajoutes: t.mots?.ajoutes ?? 0, retires: t.mots?.retires ?? 0, total: t.mots?.total ?? null,
        statut: t.statut, motif: t.motif || '', pertinente: jug[t.numero]?.pertinente ?? null, fichier: Boolean(cheminVersion(e.dossier, t.numero, d.ext)),
      })),
    };
  }

  function comparaison(d, e, numero) {
    const tours = lireTours(e.dossier);
    const t = tours.find((x) => x.numero === numero);
    if (!t) return { vide: 'Choisis une version dans le menu.' };
    if (numero === 0) return { vide: 'L\'origine n\'a pas de version précédente : choisis un tour dans le menu pour comparer.' };
    const fichier = cheminVersion(e.dossier, numero, d.ext);
    if (!fichier) return { vide: `Ce tour n'a pas rendu de fichier${t.motif ? ` (${t.motif})` : ''} : choisis une autre version.` };
    const p = precedenteGardee(tours, numero);
    const fp = cheminVersion(e.dossier, p.numero, d.ext);
    const a = texteDeFichier(fp);
    const b = texteDeFichier(fichier);
    if (a.erreur || b.erreur) return { vide: `Texte illisible (${a.erreur || b.erreur}) : l'écart ne se calcule pas pour cette version.` };
    return { precedente: p.numero, precedente_texte: pad(p.numero), numero_texte: pad(numero), ...comparer(a.texte, b.texte) };
  }

  /** L'état de la revue à l'aveugle : ce que le menu a le droit de savoir, des lettres et rien d'autre. */
  function etatAveugle() {
    if (!aveugleActif) return { actif: false };
    const t = trouver(aveugleActif.doc, aveugleActif.essai);
    if (!t) return { actif: false };
    const a = lireAveugle(t.e.dossier);
    const c = lireClassement(t.e.dossier);
    const lettres = lettresDepuisGraine(a.graine, a.versions);
    const base = { actif: true, document: t.d.nom.replace(/^\d{8}-/, ''), lettres: Object.keys(lettres).sort(), repli_texte: Boolean(aveugleActif.repliTexte), classement: c ? { ordre: c.ordre, pertinentes: c.pertinentes } : null, leve: Boolean(a.leve) };
    if (a.leve) base.revele = Object.keys(lettres).sort().map((l) => ({ lettre: l, numero_texte: pad(lettres[l]), origine: lettres[l] === 0 }));
    return base;
  }

  async function ouvrirRevue(doc, essai) {
    const t = trouver(doc, essai);
    if (!t) return { erreur: 'essai introuvable', code: 404 };
    if (!ARRETS_TERMINAUX.includes(t.e.etat.arret?.type)) return { erreur: 'L\'essai n\'a pas atteint son arrêt : reprends-le par --reprendre, la revue s\'ouvre ensuite.', code: 409 };
    const a = ouvrirAveugle(t.e.dossier, lireTours(t.e.dossier));
    let repliTexte = false;
    // Si l'export d'une seule version Word échoue, toutes passent en texte : le repli ne trahit personne.
    if (t.d.ext === 'docx' || t.d.ext === 'pdf') {
      for (const numero of a.versions) {
        const p = await preparerImages(t.d, t.e, numero);
        if (p.mode !== 'images') {
          repliTexte = true;
          break;
        }
      }
    }
    aveugleActif = { doc, essai, repliTexte };
    return etatAveugle();
  }

  function lireCorps(req) {
    return new Promise((rendre, rejeter) => {
      let t = '';
      req.on('data', (d) => {
        t += d;
        if (t.length > 1e6) rejeter(new Error('corps trop long'));
      });
      req.on('end', () => {
        try {
          rendre(JSON.parse(t || '{}'));
        } catch (e) {
          rejeter(e);
        }
      });
    });
  }

  async function traiter(req, res) {
    const hote = req.headers.host || '';
    const adresse = new URL(req.url, `http://${hote || '127.0.0.1'}`);
    const chemin = adresse.pathname;
    // Une page d'un autre site ne parle pas à ce serveur, même par une adresse qui pointe ici.
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(hote)) return repondre(res, 403, 'Hôte refusé', 'text/plain; charset=utf-8');
    if (req.method === 'POST') {
      const origine = req.headers.origin;
      if (origine && !new RegExp(`^http://${hote.replace(/[.]/g, '\\.')}$`).test(origine)) return repondre(res, 403, 'Origine refusée', 'text/plain; charset=utf-8');
    }

    if (req.method === 'GET') {
      if (chemin === '/') return repondre(res, 200, readFileSync(PAGE), 'text/html; charset=utf-8', { 'Content-Security-Policy': CSP_PAGE });
      if (chemin === '/api/etat') return json(res, 200, etatPublic());
      if (chemin === '/api/aveugle') return json(res, 200, etatAveugle());
      const q = adresse.searchParams;
      if (chemin === '/api/versions' || chemin === '/api/comparer') {
        const t = trouver(q.get('doc'), q.get('essai'));
        if (!t) return json(res, 404, { erreur: 'essai introuvable' });
        if (chemin === '/api/versions') return json(res, 200, versionsPubliques(t.d, t.e));
        return json(res, 200, comparaison(t.d, t.e, Number(q.get('numero'))));
      }
      const av = /^\/aveugle\/([A-Z])(?:\/page\/(\d+))?$/.exec(chemin);
      if (av) {
        const t = aveugleActif && trouver(aveugleActif.doc, aveugleActif.essai);
        if (!t) return repondre(res, 404, 'Revue fermée', 'text/plain; charset=utf-8');
        const a = lireAveugle(t.e.dossier);
        const numero = lettresDepuisGraine(a.graine, a.versions)[av[1]];
        if (numero === undefined) return repondre(res, 404, 'Lettre inconnue', 'text/plain; charset=utf-8');
        if (av[2]) return servirPage(res, t.d, t.e, numero, Number(av[2]));
        return apercu(res, await pageDeVersion(t.d, t.e, numero, { baseImages: `/aveugle/${av[1]}`, repliTexte: aveugleActif.repliTexte }));
      }
      const ap = /^\/apercu\/([^/]+)\/([^/]+)\/(\d+)(?:\/page\/(\d+))?$/.exec(chemin);
      if (ap) {
        const t = trouver(decodeURIComponent(ap[1]), decodeURIComponent(ap[2]));
        if (!t) return repondre(res, 404, 'Essai introuvable', 'text/plain; charset=utf-8');
        const numero = Number(ap[3]);
        if (ap[4]) return servirPage(res, t.d, t.e, numero, Number(ap[4]));
        return apercu(res, await pageDeVersion(t.d, t.e, numero, { baseImages: `/apercu/${ap[1]}/${ap[2]}/${ap[3]}` }));
      }
      return repondre(res, 404, 'Page absente', 'text/plain; charset=utf-8');
    }

    if (req.method === 'POST') {
      const corps = await lireCorps(req);
      if (chemin === '/api/jugement') {
        const t = trouver(corps.doc, corps.essai);
        if (!t) return json(res, 404, { erreur: 'essai introuvable' });
        if (![true, false, null].includes(corps.pertinente) || !Number.isInteger(corps.numero)) return json(res, 400, { erreur: 'jugement illisible' });
        if (!lireTours(t.e.dossier).some((x) => x.numero === corps.numero)) return json(res, 404, { erreur: 'version inconnue' });
        ecrireJugement(t.e, corps.numero, corps.pertinente);
        return json(res, 200, { ok: true });
      }
      if (chemin === '/api/aveugle/ouvrir') {
        const r = await ouvrirRevue(corps.doc, corps.essai);
        return json(res, r.code || 200, r);
      }
      if (chemin === '/api/aveugle/fermer') {
        aveugleActif = null;
        return json(res, 200, { actif: false });
      }
      const t = aveugleActif && trouver(aveugleActif.doc, aveugleActif.essai);
      if (!t) return json(res, 409, { erreur: 'Aucune revue à l\'aveugle ouverte.' });
      if (chemin === '/api/aveugle/classer') {
        const r = enregistrerClassement(t.e.dossier, corps.ordre, corps.pertinentes);
        if (r.erreur) return json(res, r.code || 400, { erreur: r.erreur });
        return json(res, 200, etatAveugle());
      }
      if (chemin === '/api/aveugle/lever') {
        const r = leverAveugle(t.e.dossier, (numero, p, source) => ecrireJugement(t.e, numero, p, source));
        if (r.erreur) return json(res, 409, { erreur: r.erreur });
        return json(res, 200, etatAveugle());
      }
    }
    return repondre(res, 404, 'Page absente', 'text/plain; charset=utf-8');
  }

  const serveur = http.createServer((req, res) => {
    traiter(req, res).catch((e) => {
      if (!res.headersSent) json(res, 500, { erreur: e.message });
      else res.end();
    });
  });
  return { serveur, ecouter: () => new Promise((rendre, rejeter) => { serveur.once('error', rejeter); serveur.listen(port, '127.0.0.1', () => rendre(serveur.address().port)); }) };
}

async function principal(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const espace = opt('--espace');
  if (!espace) {
    console.error('usage : serveur-versions.mjs --espace <d> [--port 4750]');
    return 2;
  }
  const port = Number(opt('--port') ?? 4750);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`--port ${opt('--port')} : entier de 0 à 65535`);
    return 2;
  }
  const dossier = resolve(espace);
  if (!existsSync(dossier)) {
    console.error(`espace introuvable : ${dossier}`);
    return 2;
  }
  const { ecouter } = creerServeur({ espace: dossier, port });
  try {
    const p = await ecouter();
    console.log(`Page de versions : http://127.0.0.1:${p}/`);
  } catch (e) {
    console.error(e.code === 'EADDRINUSE' ? `le port ${port} est pris : --port <autre>` : e.message);
    return 1;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).then((code) => { if (code !== null) process.exit(code); });
}
