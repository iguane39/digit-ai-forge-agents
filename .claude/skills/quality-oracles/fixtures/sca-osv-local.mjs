#!/usr/bin/env node
// Serveur OSV LOCAL pour la recette d'oracle-sca (TF-2450) : joue POST /v1/querybatch et GET /v1/vulns/<id> depuis les
// données figées (fixtures/sca-osv-fige.json), sans réseau. Désigné par QO_SCA_OSV_URL ; jamais utilisé hors du self-test.
//   argv[2]            → le fichier de données figées
//   stdout             → une ligne « PORT <n> » quand il écoute (port choisi par le système, sur 127.0.0.1)
//   GET /v1/vulns/<id> → {id, database_specific:{severity}} ; un id inconnu des données répond 404
//                        (une entrée sans sévérité répond une fiche SANS database_specific, comme un avis PYSEC)
//   QO_SIM_OSV_SANS_FICHE=1 → toute fiche répond 404 (fiche injoignable : la sévérité reste « inconnue »)
//   s'arrête seul au bout de 120 s, ou quand son entrée standard se ferme.
import fs from 'node:fs';
import http from 'node:http';

const figees = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).reponses || {};
const parId = new Map();
for (const liste of Object.values(figees)) for (const x of liste) if (x && typeof x === 'object') parId.set(x.id, x.severite);
const cle = (q) => `${q.package.ecosystem}:${q.package.name}@${q.version}`;
const serveur = http.createServer((req, rep) => {
  const json = (code, o) => { rep.writeHead(code, { 'content-type': 'application/json' }); rep.end(JSON.stringify(o)); };
  if (req.method === 'POST' && req.url === '/v1/querybatch') {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      const { queries } = JSON.parse(corps);
      json(200, { results: queries.map((q) => { const l = figees[cle(q)]; return (l && l.length) ? { vulns: l.map((x) => ({ id: typeof x === 'object' ? x.id : x })) } : {}; }) });
    });
    return;
  }
  const m = /^\/v1\/vulns\/([^/]+)$/.exec(req.url || '');
  if (req.method === 'GET' && m && process.env.QO_SIM_OSV_SANS_FICHE !== '1' && parId.has(decodeURIComponent(m[1]))) {
    const id = decodeURIComponent(m[1]);
    return json(200, parId.get(id) ? { id, database_specific: { severity: parId.get(id) } } : { id });
  }
  json(404, { code: 5, message: 'Bug not found.' });
});
serveur.listen(0, '127.0.0.1', () => { console.log('PORT ' + serveur.address().port); });
setTimeout(() => process.exit(0), 120000).unref();
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
