#!/usr/bin/env node
// rendre — LE VERBE RENDRE du skill plan-d-amelioration (TF-1234, 12/10/2026).
//
// Du fichier de données (plan-d-amelioration@1.0.0) vers deux VUES : une page HTML autoportante
// au socle digit-ai-page-html, et un document Markdown. La donnée fait foi ; les vues se
// régénèrent, elles ne s'éditent pas.
//
// La page dérive du gabarit du socle (boilerplate.html, lu dans le skill voisin) : bascule de
// thème, jetons, repli des tableaux en cartes. Les composants (filtres de colonne, recherche,
// ligne dépliable) sont POSÉS par le poseur du socle (embarquer-composants.mjs), sous marqueur
// scellé — jamais collés à la main (TF-0784).
//
// Huit chapitres sous sommaire permanent (étude du 19/09/2026, section 5) : (1) les décisions en
// choix fermés ; (2) la synthèse par domaine et par horizon ; (3) toutes les fiches, filtrables,
// chacune dépliable sur ses dix champs ; (4) la couverture des domaines et les plans existants ;
// (5) la jonction avec les remédiations de l'audit ; (6) la trajectoire en lots et horizons ;
// (7) le plan de mesure ; (8) la méthode, les sources et le statut des chiffres.
//
// Usage : node rendre.mjs <plan.json> --html <page.html> [--md <vue.md>]
//         [--actions <yaml|json>] [--controles <json>]
// Le plan n'est PAS jugé ici : jouer oracle-plan-d-amelioration.mjs avant de rendre.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILLDIR, chargerAudit, lireDomaines } from './lib.mjs';

const SOCLE = path.join(SKILLDIR, '..', 'digit-ai-page-html');
const HORIZONS = [['court', 'Court terme'], ['moyen', 'Moyen terme'], ['long', 'Long terme']];
const LIB_STATUT = { neuve: 'Neuve', deja_planifiee: 'Déjà planifiée', contraire_decision: 'Contraire à une décision' };
const LIB_CHIFFRE = { mesure: 'Mesuré', lu: 'Lu', hypothese: 'Hypothèse' };
const LIB_REL = { rend_caduque: 'rend caduque', modifie: 'modifie', conditionne: 'conditionne' };
const LIB_CPLX = { simple: 'simple', moyen: 'moyenne', complexe: 'complexe', tres_complexe: 'très complexe' };
// « durée » est féminin : la donnée porte court | moyen | long, la page accorde.
const LIB_DUREE = { court: 'courte', moyen: 'moyenne', long: 'longue' };

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const effort = (e) => (e ? `complexité ${LIB_CPLX[e.complexite] ?? e.complexite} · durée ${LIB_DUREE[e.duree] ?? e.duree}` : '');
const lien = (id) => (/^AM-/.test(id) ? `<a href="#${esc(id)}">${esc(id)}</a>` : `<code>${esc(id)}</code>`);

/** Un tableau au socle : repli en cartes (data-label sur chaque cellule), et filtrable dès 8 lignes. */
function tableau({ id, entetes, lignes, legende, filtrable = null }) {
  const filtre = filtrable ?? lignes.length >= 8;
  const attrs = `id="${id}" class="repli-cartes"${filtre ? ' data-filterable' : ''}`;
  const corps = lignes.map((l) => (l.brut ? l.brut : `<tr>${l.map((c, i) => `<td data-label="${esc(entetes[i])}">${c}</td>`).join('')}</tr>`)).join('\n');
  return `<div class="table-hote"><table ${attrs}>
<caption>${esc(legende)}</caption>
<thead><tr>${entetes.map((e) => `<th scope="col">${esc(e)}</th>`).join('')}</tr></thead>
<tbody>
${corps}
</tbody></table></div>${filtre ? `\n<p class="tf-count" data-tf-count-for="${id}" aria-live="polite"></p>` : ''}`;
}

function chapitre(id, titre, chapeau, contenu, corps) {
  return `<section id="${id}">
<h2>${esc(titre)}</h2>
<div class="chap lire" data-mesure-lecture><p class="ch-apprend">${chapeau}</p>
<p class="contenu">${contenu}</p></div>
${corps}
</section>`;
}

/** Construit le corps de la page : rend { corps, chapitres, tables }. */
export function corpsDePage(plan, audit, domaines) {
  const fiches = [...(plan.fiches || [])].sort((a, b) => (a.rang ?? 1e9) - (b.rang ?? 1e9));
  const parCode = new Map(domaines.domaines.map((d) => [d.code, d]));
  for (const a of plan.ajustements || []) if (a.action === 'ajoute') parCode.set(a.domaine, { code: a.domaine, libelle: a.libelle || a.domaine });
  for (const a of plan.ajustements || []) if (a.action === 'retire') parCode.delete(a.domaine);
  const codeDe = (f) => (/^AM-([A-Z]+)-/.exec(f.id || '') || [])[1];
  const actions = new Map((audit.actions?.actions || []).map((a) => [a.id, a]));
  const chapitres = [];
  const sections = [];
  const COURTS = { decisions: 'Décisions', synthese: 'Synthèse', fiches: 'Fiches', couverture: 'Couverture', jonction: 'Jonction', trajectoire: 'Trajectoire', mesure: 'Mesure', methode: 'Méthode' };
  const ajouter = (id, titre, chapeau, contenu, corps) => { chapitres.push({ id, titre, court: COURTS[id] }); sections.push(chapitre(id, titre, chapeau, contenu, corps)); };

  // (1) Les décisions.
  const decisions = (plan.decisions || []).map((d) => `<li class="card decision">
<h3>Décision ${esc(d.rang)} — ${esc(d.question)}</h3>
<dl class="champs">
<dt>Options</dt><dd><ul class="options">${(d.options || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul></dd>
<dt>Ce qu'elle coûte</dt><dd>${esc(d.cout)}</dd>
<dt>Ce qu'elle rapporte</dt><dd>${esc(d.gain)}</dd>
<dt>Si rien n'est décidé</dt><dd>${esc(d.si_rien)}</dd>
<dt>Fiches</dt><dd>${(d.fiches || []).map(lien).join(', ') || '—'}</dd>
</dl>
</li>`).join('\n');
  ajouter('decisions', 'Les décisions à prendre', `Les ${(plan.decisions || []).length} premières décisions du plan, chacune en choix fermé, avec son coût, son gain et ce qui se passe si rien n'est décidé.`,
    'Ce chapitre contient les décisions fermées tirées des fiches les mieux classées ; le détail de chaque fiche se lit au chapitre 3.',
    `<ol class="decisions">\n${decisions}\n</ol>`);

  // (2) Synthèse par domaine et horizon.
  const sansFiche = new Map((plan.domaines_sans_fiche || []).map((d) => [d.domaine, d]));
  const lignesDom = [...parCode.values()].map((d) => {
    const fs_ = fiches.filter((f) => codeDe(f) === d.code);
    const n = (h) => fs_.filter((f) => f.horizon === h).length;
    const couv = fs_.length ? `<span class="badge ok" aria-describedby="leg-couverture">${fs_.length} fiche${fs_.length > 1 ? 's' : ''}</span>` : sansFiche.has(d.code) ? '<span class="badge info" aria-describedby="leg-couverture">ligne motivée</span>' : '<span class="badge part" aria-describedby="leg-couverture">non couvert</span>';
    return [esc(d.libelle), `<code>${esc(d.code)}</code>`, `<span data-v="${n('court')}">${n('court')}</span>`, `<span data-v="${n('moyen')}">${n('moyen')}</span>`, `<span data-v="${n('long')}">${n('long')}</span>`, couv];
  });
  const total = (h) => fiches.filter((f) => f.horizon === h).length;
  const domEx = [...parCode.values()].find((d) => fiches.some((f) => codeDe(f) === d.code));
  const ficheEx = domEx && fiches.find((f) => codeDe(f) === domEx.code);
  const exempleDomaines = domEx ? `<div class="chap lire" data-mesure-lecture><p class="exemple-lecture">Exemple de lecture : la ligne « ${esc(domEx.libelle)} » compte ${fiches.filter((f) => codeDe(f) === domEx.code).length} fiche(s), dont ${esc(ficheEx.id)} à l’horizon ${esc(ficheEx.horizon)}.</p></div>
` : '';
  ajouter('synthese', 'Synthèse par domaine et par horizon', `Où se concentrent les améliorations : ${fiches.length} fiches sur ${parCode.size} domaines, réparties en ${total('court')} à court terme, ${total('moyen')} à moyen terme et ${total('long')} à long terme.`,
    'Ce chapitre contient un tableau d’une ligne par domaine de la base, avec le nombre de fiches par horizon et l’état de couverture du domaine.',
    exempleDomaines + tableau({ id: 'tab-domaines', entetes: ['Domaine', 'Code', 'Court terme', 'Moyen terme', 'Long terme', 'Couverture'], lignes: lignesDom, legende: 'Nombre de fiches par domaine et par horizon ; un domaine sans fiche porte une ligne motivée au chapitre 4.' })
    + `<div class="chap lire" data-mesure-lecture><p class="legende" id="leg-couverture">Couverture : « n fiches » quand le domaine porte au moins une amélioration ; « ligne motivée » quand il n’en porte aucune et dit pourquoi, au chapitre 4 ; « non couvert » quand il ne dit rien, ce que le contrat refuse.</p></div>`);

  // (3) Toutes les fiches, dépliables.
  const f0 = fiches[0];
  const exempleFiches = f0 ? `<div class="chap lire" data-mesure-lecture><p class="exemple-lecture">Exemple de lecture : la fiche de rang ${esc(f0.rang)}, ${esc(f0.id)}, relève du domaine « ${esc(parCode.get(codeDe(f0))?.libelle ?? codeDe(f0))} », vise l’horizon ${esc(f0.horizon)} et coûte une ${esc(effort(f0.effort))}.</p></div>
` : '';
  const NCOL = 6;
  const lignesFiches = [];
  for (const f of fiches) {
    const det = `det-${f.id}`;
    const chiffres = (f.chiffres || []).length
      ? `<ul class="chiffres">${f.chiffres.map((c) => `<li><strong>${esc(c.valeur)}</strong> — <span aria-describedby="leg-chiffres" class="badge ${c.statut === 'mesure' ? 'ok' : c.statut === 'lu' ? 'info' : 'part'}">${esc(LIB_CHIFFRE[c.statut] ?? c.statut)}</span> ${esc(c.source || c.commande || '')}</li>`).join('')}</ul>`
      : 'aucun chiffre';
    const st = f.statut_existant || {};
    lignesFiches.push({ brut: `<tr id="${esc(f.id)}"><td data-label="Rang" data-v="${esc(f.rang)}">${esc(f.rang)}</td><td data-label="Fiche"><button type="button" class="td-btn" aria-expanded="false" aria-controls="${esc(det)}" aria-label="Déplier la fiche ${esc(f.id)}">›</button> <code>${esc(f.id)}</code> ${esc(f.titre)}</td><td data-label="Domaine">${esc(parCode.get(codeDe(f))?.libelle ?? codeDe(f))}</td><td data-label="Horizon">${esc(f.horizon)}</td><td data-label="Effort">${esc(effort(f.effort))}</td><td data-label="Statut">${esc(LIB_STATUT[st.valeur] ?? st.valeur)}</td></tr>` });
    lignesFiches.push({ brut: `<tr data-detail id="${esc(det)}" hidden><td colspan="${NCOL}"><dl class="champs">
<dt>Constat</dt><dd>${esc(f.constat?.texte)} <span class="source">Source : ${esc(f.constat?.source)}</span></dd>
<dt>Cible servie</dt><dd>${esc(f.cible?.texte)} <span class="source">Source : ${esc(f.cible?.source)}</span></dd>
<dt>Proposition</dt><dd>${esc(f.proposition?.texte)} <span class="source">Alternative écartée : ${esc(f.proposition?.alternative_ecartee)}, parce que ${esc(f.proposition?.motif_ecart)}.</span></dd>
<dt>Gain attendu</dt><dd>${esc(f.gain?.attendu)} <span class="source">Constaté par : ${esc(f.gain?.constate_par)}</span></dd>
<dt>Effort</dt><dd>${esc(effort(f.effort))}</dd>
<dt>Dépendances</dt><dd>${(f.dependances || []).map(lien).join(', ') || 'aucune'}</dd>
<dt>Statut</dt><dd>${esc(LIB_STATUT[st.valeur] ?? st.valeur)}${st.reference ? ` — référence ${esc(st.reference)}` : ''}${st.motif ? ` — ${esc(st.motif)}` : ''}</dd>
<dt>Preuve de clôture</dt><dd>${esc(f.preuve_cloture)}</dd>
<dt>Chiffres</dt><dd>${chiffres}</dd>
<dt>Test rétro</dt><dd>${esc(f.test_retro)}</dd>
</dl></td></tr>` });
  }
  ajouter('fiches', 'Toutes les fiches', 'Chaque amélioration en une ligne, triable et filtrable par colonne ; le chevron déplie la fiche sur ses dix champs, ses chiffres et leur statut.',
    'Ce chapitre contient une ligne par fiche, dans l’ordre du rang ; le chevron ouvre ses dix champs, ce que le chapitre 1 résume en décisions.',
    exempleFiches + tableau({ id: 'tab-fiches', entetes: ['Rang', 'Fiche', 'Domaine', 'Horizon', 'Effort', 'Statut'], lignes: lignesFiches, legende: 'Les fiches du plan, dans l’ordre de leur rang.', filtrable: fiches.length >= 8 })
    + `<div class="chap lire" data-mesure-lecture><p class="legende" id="leg-chiffres">Statut d’un chiffre : « Mesuré » porte la commande et sa sortie ; « Lu » cite le document et la ligne ; « Hypothèse » est déclarée comme telle et attend sa mesure.</p></div>`);

  // (4) Couverture et plans existants.
  const lignesSans = (plan.domaines_sans_fiche || []).map((d) => [esc(parCode.get(d.domaine)?.libelle ?? d.domaine), esc(d.motif), esc(d.regarde)]);
  const lignesPlans = (plan.plans_existants || []).map((p) => [esc(p.entree), esc(p.source), p.fiche ? lien(p.fiche) : `hors sujet : ${esc(p.hors_sujet_motif)}`]);
  const ajust = (plan.ajustements || []).length
    ? `<ul>${plan.ajustements.map((a) => `<li>Domaine <code>${esc(a.domaine)}</code> ${a.action === 'ajoute' ? 'ajouté' : 'retiré'} : ${esc(a.motif)}</li>`).join('')}</ul>`
    : '<p>La base de domaines est appliquée sans ajustement.</p>';
  ajouter('couverture', 'Couverture des domaines et plans existants', 'Ce qui a été regardé dans les domaines restés sans fiche, et comment chaque entrée des plans déjà écrits du produit se rattache au plan.',
    'Ce chapitre contient les domaines sans fiche avec leur motif, les ajustements de la base de domaines et la correspondance avec les plans existants du produit.',
    `<h3>Domaines sans fiche</h3>
${lignesSans.length ? tableau({ id: 'tab-sans-fiche', entetes: ['Domaine', 'Motif', 'Ce qui a été regardé'], lignes: lignesSans, legende: 'Chaque domaine sans fiche dit pourquoi et ce qui a été regardé.' }) : '<p>Tous les domaines portent au moins une fiche.</p>'}
<h3>Ajustements de la base</h3>
${ajust}
<h3>Correspondance avec les plans existants</h3>
${lignesPlans.length ? tableau({ id: 'tab-plans', entetes: ['Entrée du plan existant', 'Source', 'Rattachement'], lignes: lignesPlans, legende: 'Chaque entrée d’un plan existant est rattachée à une fiche ou déclarée hors sujet.' }) : `<p>${esc(plan.plans_existants_motif || 'Aucun plan existant.')}</p>`}`);

  // (5) Jonction.
  const lignesJ = (plan.jonction || []).map((j) => {
    const a = actions.get(j.rem);
    return [`<code>${esc(j.rem)}</code>`, esc(a?.title ?? 'titre non lu (fichier d’actions absent)'), esc(a?.severity ?? '—'), esc(LIB_REL[j.relation] ?? j.relation), lien(j.am), esc(j.note)];
  });
  const sansLien = (audit.actions?.actions || []).filter((a) => !(plan.jonction || []).some((j) => j.rem === a.id));
  ajouter('jonction', 'Jonction avec les remédiations de l’audit', `Les liens entre les remédiations de l’audit${plan.audit?.audit_ref ? ` <code>${esc(plan.audit.audit_ref)}</code>` : ''} et les améliorations : on ne paie pas deux fois une même correction.`,
    'Ce chapitre contient la table de jonction entre remédiations et améliorations, puis les remédiations de l’audit qui ne touchent aucune fiche.',
    `${lignesJ.length ? tableau({ id: 'tab-jonction', entetes: ['Remédiation', 'Action de l’audit', 'Gravité', 'Relation', 'Amélioration', 'Commentaire'], lignes: lignesJ, legende: 'Une remédiation qui rend caduque, modifie ou conditionne une amélioration.' }) : '<p>La table de jonction est vide : aucune remédiation ne touche une amélioration.</p>'}
${sansLien.length ? `<div class="chap lire" data-mesure-lecture><p>Remédiations de l’audit sans lien avec une amélioration : ${sansLien.map((a) => `<code>${esc(a.id)}</code> (${esc(a.title)})`).join(', ')}. Elles suivent le plan de remédiation tel quel.</p></div>` : ''}`);

  // (6) Trajectoire.
  const lots = plan.trajectoire?.lots || [];
  const colonnes = HORIZONS.map(([h, lib]) => {
    const ls = lots.filter((l) => l.horizon === h);
    return `<div class="horizon"><h3>${lib}</h3>${ls.length ? ls.map((l) => `<article class="card lot">
<h4>${esc(l.id)} — ${esc(l.libelle)}</h4>
<p class="lot-ligne"><strong>Remédiations</strong> ${(l.rems || []).map(lien).join(', ') || 'aucune'}</p>
<p class="lot-ligne"><strong>Améliorations</strong> ${(l.fiches || []).map(lien).join(', ') || 'aucune'}</p>
<p class="lot-ligne"><strong>Utile</strong> ${esc(l.utile)}</p>
<p class="lot-ligne"><strong>Utilisable</strong> ${esc(l.utilisable)}</p>
<p class="lot-ligne"><strong>Utilisé</strong> ${esc(l.utilise)}</p>
</article>`).join('\n') : '<p class="vide">Aucun lot à cet horizon.</p>'}</div>`;
  }).join('\n');
  ajouter('trajectoire', 'Trajectoire en lots et horizons', 'Dans quel ordre corriger et améliorer : remédiations et améliorations lotis ensemble, chaque lot dit ce qui le rend utile, utilisable et utilisé.',
    'Ce chapitre contient les lots du plan rangés en trois colonnes, du court au long terme, chacun avec ses remédiations et ses améliorations.',
    `<div class="trajectoire" role="list">\n${colonnes.replace(/<div class="horizon">/g, '<div class="horizon" role="listitem">')}\n</div>`);

  // (7) Plan de mesure.
  const lignesM = (plan.plan_de_mesure || []).map((m) => [esc(parCode.get(m.domaine)?.libelle ?? m.domaine), esc(m.quoi), esc(m.comment), esc(m.seuil_vise)]);
  ajouter('mesure', 'Plan de mesure', 'Ce qui reste à mesurer avant de conclure, là où aucune instance n’a pu être mesurée : quoi, comment, et le seuil visé.',
    'Ce chapitre contient les mesures à prendre avant toute conclusion chiffrée, domaine par domaine, avec la méthode et le seuil visé.',
    lignesM.length ? tableau({ id: 'tab-mesure', entetes: ['Domaine', 'Quoi mesurer', 'Comment', 'Seuil visé'], lignes: lignesM, legende: 'Les mesures à prendre avant toute conclusion chiffrée.' }) : '<p>Aucune mesure en attente : chaque chiffre du plan porte déjà son statut.</p>');

  // (8) Méthode.
  const lignesQ = (plan.questions_ouverture || []).map((q) => [`<code>${esc(q.id)}</code>`, esc(q.question), esc(q.valeur), q.defaut_applique ? 'défaut appliqué' : esc(q.reponse_source || 'répondue')]);
  const lignesC = fiches.flatMap((f) => (f.chiffres || []).map((c) => [lien(f.id), esc(c.valeur), esc(LIB_CHIFFRE[c.statut] ?? c.statut), esc(c.statut === 'mesure' ? `${c.commande} → ${c.sortie}` : c.source)]));
  const m = plan.methode || {};
  ajouter('methode', 'Méthode, sources et statut des chiffres', 'Comment le plan a été construit : la frontière avec l’audit, la base de domaines, les réponses aux questions d’ouverture et le statut de chaque chiffre cité.',
    'Ce chapitre contient l’intention validée, la frontière avec l’audit, les réponses aux cinq questions d’ouverture et la table des chiffres cités.',
    `<div class="chap lire" data-mesure-lecture>
<p><strong>Intention.</strong> ${esc(plan.intention?.texte)} ${plan.intention?.validee_le ? `Validée le ${esc(plan.intention.validee_le)}.` : `Posée par défaut : ${esc(plan.intention?.defaut_motif)}.`}</p>
<p><strong>Frontière.</strong> ${esc(m.frontiere || 'écart à une norme = remédiation (citée par son identifiant) ; écart à une ambition = amélioration (fiche).')}</p>
<p><strong>Base de domaines.</strong> ${esc(m.domaines || `référentiel ${domaines.version}, vérifié le ${domaines.verifie_le}`)}.</p>
<p><strong>Statut d’un chiffre.</strong> ${esc(m.statuts_chiffres || 'mesuré (commande et sortie), lu (document et ligne), hypothèse (déclarée).')}</p>
${plan.audit?.audit_ref ? `<p><strong>Audit joint.</strong> <code>${esc(plan.audit.audit_ref)}</code>${plan.audit.rapport ? `, rapport ${esc(plan.audit.rapport)}` : ''}.</p>` : ''}
</div>
<h3>Questions d’ouverture</h3>
${tableau({ id: 'tab-questions', entetes: ['Question', 'Libellé', 'Réponse retenue', 'Origine'], lignes: lignesQ, legende: 'Les cinq questions posées en ouverture, et la réponse retenue pour chacune.' })}
<h3>Chiffres cités et leur statut</h3>
${lignesC.length ? tableau({ id: 'tab-chiffres', entetes: ['Fiche', 'Valeur', 'Statut', 'Source ou commande'], lignes: lignesC, legende: 'Tout chiffre du plan, avec son statut : mesuré, lu ou hypothèse.' }) : '<p>Le plan ne cite aucun chiffre.</p>'}`);

  const ids = [...sections.join('\n').matchAll(/<table id="([^"]+)"[^>]*data-filterable/g)].map((x) => x[1]);
  return { corps: sections.join('\n\n'), chapitres, filtrables: ids };
}

function sommaire(chapitres) {
  const n = chapitres.length;
  const entrees = chapitres.map((c, i) => `<a href="#${c.id}"><strong>${esc(c.titre)}</strong> <span class="toc-d">Chapitre ${i + 1} sur ${n}</span></a>`).join('\n      ');
  const barre = chapitres.map((c, i) => `<a href="#${c.id}">${i + 1}. ${esc(c.court || c.titre)}</a>`).join('');
  return `<nav class="toc colle" aria-label="Sommaire">\n      ${entrees}\n    </nav>\n<nav class="barre" aria-label="Sommaire permanent">${barre}</nav>\n`;
}

// Règles propres à la page, aux JETONS du socle, espacements à l'échelle de 4 px.
const STYLE = `  <style>
    nav.toc{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0 0 20px;padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm)}
    nav.toc a{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:var(--ink)}
    nav.toc a:hover{text-decoration:underline}
    nav.toc a strong{font-size:.85rem;font-weight:600}
    .toc-d{color:var(--muted);font-size:.72rem;font-weight:400}
    nav.barre{display:none}
    @media (max-width:900px){
      nav.barre{display:flex;flex-wrap:wrap;gap:4px 16px;position:sticky;top:var(--hh);z-index:15;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 16px;margin:0 0 20px}
      nav.barre a{flex:0 0 auto;white-space:nowrap;text-decoration:none;color:var(--ink);font-size:.8rem;font-weight:600}
    }
    .ch-apprend{margin:0 0 16px;color:var(--muted)}
    main > section{margin:0 0 40px}
    .find-bar{display:flex;flex-direction:column;gap:4px;margin:0 0 20px}
    .find-bar label{font-size:.78rem;color:var(--muted);font-weight:600}
    .find-bar input{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);color:var(--ink)}
    .find-count{margin-top:4px;font-size:.72rem;color:var(--muted);min-height:1em}
    .find-count.zero{color:var(--red)}
    .tf-count{margin:8px 0 20px;font-size:.72rem;color:var(--muted);min-height:1em}
    mark.find-hit{background:var(--amber-fill);color:var(--ink);border-radius:2px;display:inline;padding:0;margin:0}
    ol.decisions{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
    ol.decisions h3{font-size:1rem;margin:0 0 8px}
    /* Dans une carte de décision, l'étiquette passe AU-DESSUS de sa valeur : la grille à deux
       colonnes de la fiche y coupait « Ce qu'elle coûte » sur deux lignes (revue du 12/10/2026). */
    ol.decisions dl.champs{grid-template-columns:1fr;gap:0}
    ol.decisions dl.champs dd{margin:0 0 8px}
    dl.champs{display:grid;grid-template-columns:minmax(12ch,18%) 1fr;gap:4px 16px;margin:0}
    dl.champs dt{font-weight:600;color:var(--muted)}
    dl.champs dd{margin:0}
    ul.options,ul.chiffres{margin:0;padding-left:20px}
    ul.options li,ul.chiffres li{margin:0 0 4px}
    .source{display:block;color:var(--muted);font-size:.85rem}
    .badge{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--ink);padding:4px 12px;border-radius:999px;border:1px solid var(--line)}
    .badge::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--_dot,var(--muted))}
    /* Fond PARTAGÉ : l'état se lit au libellé et à la puce pleine, jamais au seul fond (V16 de render_page :
       les fonds -fill du socle sont trop proches pour porter seuls un état). */
    .badge{background:var(--surface)}
    .badge.ok{--_dot:var(--green)}
    .badge.part{--_dot:var(--amber)}
    .badge.info{--_dot:var(--teal)}
    .td-btn{font:inherit;color:var(--blue);background:none;border:1px solid var(--line);border-radius:var(--r-sm);width:24px;height:24px;cursor:pointer;transition:transform .15s}
    .td-btn:focus-visible{outline:var(--focus-anneau);outline-offset:var(--focus-decalage)}
    .td-btn[aria-expanded="true"]{transform:rotate(90deg)}
    tr[data-detail] td{background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px 12px 44px}
    .trajectoire{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .horizon h3{font-size:1rem;margin:0 0 8px;padding:0 0 8px;border-bottom:2px solid var(--line)}
    .lot h4{font-size:.95rem;margin:0 0 8px}
    .lot-ligne{margin:0 0 4px;font-size:.9rem}
    .vide{color:var(--muted)}
    @media (max-width:900px){.trajectoire{grid-template-columns:1fr}dl.champs{grid-template-columns:1fr}}
    main code{overflow-wrap:anywhere}
    @media print{tr[data-detail][hidden]{display:table-row}.td-btn{display:none}tr[data-tf-hidden]{display:table-row !important}.find-bar{display:none}nav.barre{display:none}}
  </style>
`;

/** La page entière, dérivée du gabarit du socle. Lève une erreur si le socle a changé de forme. */
export async function pageHtml(plan, audit, { domaines = lireDomaines(), socle = SOCLE } = {}) {
  const gabarit = fs.readFileSync(path.join(socle, 'assets', 'boilerplate.html'), 'utf8');
  const { poserComposants } = await import(pathToFileURL(path.join(socle, 'scripts', 'embarquer-composants.mjs')).href);
  const { corps, chapitres, filtrables } = corpsDePage(plan, audit, domaines);
  const titre = `${plan.titre || 'Plan d’amélioration post-audit'} — ${plan.produit}`;
  const indice = plan.indice || String(plan.date || '').replace(/-/g, '') + 'a';
  let h = gabarit.replace(/<!--[\s\S]*?-->/g, '');
  const remplir = (motif, par, nom) => {
    if (!motif.test(h)) throw new Error(`gabarit du socle : emplacement « ${nom} » introuvable — le socle a changé de forme`);
    h = h.replace(motif, () => par);
  };
  remplir(/<title>[\s\S]*?<\/title>/, `<title>Digit-AI — Plan d’amélioration · ${esc(plan.produit)} — ${esc(indice)}</title>`, 'titre du document');
  remplir(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(`Plan d’amélioration post-audit de ${plan.produit} : ${(plan.fiches || []).length} fiches, décisions fermées, jonction avec les remédiations de l’audit et trajectoire.`)}">\n  <meta name="ai-generated" content="${esc(plan.assistant || 'Claude Code')}">`, 'description');
  remplir(/<p class="eyebrow">[^<]*<\/p>/, '<p class="eyebrow">Digit-AI · Plan d’amélioration</p>', 'surtitre');
  remplir(/<h1>[^<]*<\/h1>/, `<h1>${esc(titre)}</h1>\n        <p class="meta">Indice ${esc(indice)} · ${esc(plan.date)} · vue générée depuis le fichier de données, ne pas éditer</p>`, 'titre principal');
  const barre = `<div class="find-bar">
      <label for="find">Rechercher dans le plan</label>
      <input id="find" type="search" placeholder="Rechercher une fiche, un domaine, une source…">
      <p id="findCount" class="find-count" aria-live="polite"></p>
    </div>\n`;
  remplir(/<main>[\s\S]*?<\/main>/, `<main>\n${sommaire(chapitres)}${barre}${corps}\n    </main>`, 'corps');
  remplir(/<footer class="doc">[\s\S]*?<\/footer>/, `<footer class="doc">\n      Digit-AI — Plan d’amélioration · ${esc(plan.produit)} — ${esc(indice)} · vue générée par le skill plan-d-amelioration\n    </footer>`, 'pied de page');
  h = h.replaceAll('{L}', 'P');
  const reste = h.match(/\{[A-ZÉ][^{}<>\n]{0,60}\}/);
  if (reste) throw new Error(`gabarit du socle : l'emplacement ${reste[0]} n'a pas été rempli`);
  const composants = ['table-filters.css', 'table-filters.js', 'find-in-page.js', 'table-detail.js'];
  const { html: pose, manquants } = poserComposants(h, composants);
  if (manquants && manquants.length) throw new Error(`composants du socle absents : ${manquants.join(', ')}`);
  const init = `  <script>
    ${filtrables.length ? 'DigitAITableFilters.initAll(document);' : ''}
    DigitAITableDetail.initAll();
    DigitAIFindInPage.init(document.getElementById('find'), document.querySelector('main'), document.getElementById('findCount'));
  </script>
`;
  const fin = pose.lastIndexOf('</body>');
  return `${pose.slice(0, fin)}${init}${pose.slice(fin)}`.replace('</head>', `${STYLE}</head>`);
}

/** La vue Markdown : même contenu, sans composant. */
export function vueMarkdown(plan, audit, domaines = lireDomaines()) {
  const L = [];
  const fiches = [...(plan.fiches || [])].sort((a, b) => (a.rang ?? 1e9) - (b.rang ?? 1e9));
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  L.push(`# ${plan.titre || 'Plan d’amélioration post-audit'} — ${plan.produit} — ${plan.indice || plan.date}`, '');
  L.push(`Vue générée depuis le fichier de données par le skill plan-d-amelioration : ne pas l’éditer, régénérer.`, '');
  L.push('## 1. Les décisions à prendre', '');
  for (const d of plan.decisions || []) L.push(`${d.rang}. **${d.question}** Options : ${(d.options || []).join(' ; ')}. Coût : ${d.cout}. Gain : ${d.gain}. Si rien n’est décidé : ${d.si_rien}.`);
  L.push('', '## 2. Synthèse par domaine et par horizon', '', 'Comment lire ce tableau : une ligne par domaine de la base, dans l’ordre du référentiel ; chaque colonne compte les fiches de cet horizon ; un domaine à zéro partout est exclu des fiches et porte une ligne motivée au chapitre 4.', '', '| Domaine | Court | Moyen | Long |', '|---|---|---|---|');
  for (const d of domaines.domaines) {
    const fs_ = fiches.filter((f) => (f.id || '').startsWith(`AM-${d.code}-`));
    L.push(`| ${cell(d.libelle)} | ${fs_.filter((f) => f.horizon === 'court').length} | ${fs_.filter((f) => f.horizon === 'moyen').length} | ${fs_.filter((f) => f.horizon === 'long').length} |`);
  }
  L.push('', '## 3. Toutes les fiches', '');
  for (const f of fiches) {
    L.push(`### ${f.id} — ${f.titre}`, '');
    L.push(`- Constat : ${f.constat?.texte} (source : ${f.constat?.source})`);
    L.push(`- Cible servie : ${f.cible?.texte} (source : ${f.cible?.source})`);
    L.push(`- Proposition : ${f.proposition?.texte} Alternative écartée : ${f.proposition?.alternative_ecartee}, parce que ${f.proposition?.motif_ecart}.`);
    L.push(`- Gain : ${f.gain?.attendu} ; constaté par : ${f.gain?.constate_par}`);
    L.push(`- Effort : ${effort(f.effort)} · horizon ${f.horizon} · rang ${f.rang}`);
    L.push(`- Dépendances : ${(f.dependances || []).join(', ') || 'aucune'}`);
    L.push(`- Statut : ${LIB_STATUT[f.statut_existant?.valeur] ?? f.statut_existant?.valeur}${f.statut_existant?.reference ? ` (${f.statut_existant.reference})` : ''}`);
    L.push(`- Preuve de clôture : ${f.preuve_cloture}`, '');
  }
  L.push('## 4. Couverture des domaines et plans existants', '');
  for (const d of plan.domaines_sans_fiche || []) L.push(`- ${d.domaine} : ${d.motif} (regardé : ${d.regarde})`);
  for (const p of plan.plans_existants || []) L.push(`- Plan existant « ${p.entree} » (${p.source}) : ${p.fiche ? `rattaché à ${p.fiche}` : `hors sujet, ${p.hors_sujet_motif}`}`);
  L.push('', '## 5. Jonction avec les remédiations de l’audit', '');
  for (const j of plan.jonction || []) L.push(`- ${j.rem} ${LIB_REL[j.relation] ?? j.relation} ${j.am} : ${j.note}`);
  if (!(plan.jonction || []).length) L.push('Table de jonction vide.');
  L.push('', '## 6. Trajectoire en lots et horizons', '');
  for (const l of plan.trajectoire?.lots || []) L.push(`- ${l.id} (${l.horizon}) ${l.libelle} : ${[...(l.rems || []), ...(l.fiches || [])].join(', ')}`);
  L.push('', '## 7. Plan de mesure', '');
  for (const m of plan.plan_de_mesure || []) L.push(`- ${m.domaine} : ${m.quoi} ; ${m.comment} ; seuil visé : ${m.seuil_vise}`);
  if (!(plan.plan_de_mesure || []).length) L.push('Aucune mesure en attente.');
  L.push('', '## 8. Méthode, sources et statut des chiffres', '');
  L.push(`Intention : ${plan.intention?.texte}`, '');
  for (const q of plan.questions_ouverture || []) L.push(`- ${q.id} ${q.question} ${q.valeur}${q.defaut_applique ? ' (défaut appliqué)' : ''}`);
  L.push('');
  return L.join('\n');
}

// ── Point d'entrée ─────────────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const fichier = args.find((a, i) => !a.startsWith('--') && !['--html', '--md', '--actions', '--controles'].includes(args[i - 1]));
  if (!fichier || (!opt('--html') && !opt('--md'))) { console.error('usage : node rendre.mjs <plan.json> --html <page.html> [--md <vue.md>] [--actions <f>] [--controles <f>]'); process.exit(2); }
  let plan;
  try { plan = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) { console.error(`plan illisible : ${e.message}`); process.exit(2); }
  const audit = chargerAudit(plan, fichier, { actions: opt('--actions'), controles: opt('--controles') });
  for (const e of audit.erreurs) console.error(`avertissement : ${e}`);
  try {
    if (opt('--html')) { fs.writeFileSync(opt('--html'), await pageHtml(plan, audit)); console.error(`page écrite : ${opt('--html')}`); }
    if (opt('--md')) { fs.writeFileSync(opt('--md'), vueMarkdown(plan, audit)); console.error(`vue Markdown écrite : ${opt('--md')}`); }
  } catch (e) { console.error(`rendu impossible : ${e.message}`); process.exit(2); }
}
