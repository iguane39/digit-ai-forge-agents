// lib/sortie.mjs — ce que le lanceur lit dans la sortie stream-json d'un tour, et rien d'autre.
// Champs relevés le 02/11/2026 sur la CLI 2.1.314 : apiKeySource et model dans l'événement system de
// sous-type init ; status, isUsingOverage et unifiedWindows.seven_day dans rate_limit_info.

/** La mesure du quota d'un événement, ou null : hors de [0, 1], `utilization` compte comme manquante. */
export function lireQuota(info) {
  const f = info?.unifiedWindows?.seven_day;
  if (!f || typeof f.utilization !== 'number' || f.utilization < 0 || f.utilization > 1) return null;
  if (typeof f.resetsAt !== 'number' || typeof info.status !== 'string') return null;
  return { utilization: f.utilization, resetsAt: f.resetsAt, status: info.status };
}

export function analyserSortie(texte) {
  const a = {
    init: false, apiKeySource: null, modele: null, modeles_servis: [], overage: false, quota: null, statuts: [],
    evenements_quota: 0, resultat: false, is_error: null, subtype: null, lectures: [], refus_outil: [], illisibles: 0,
  };
  for (const ligne of texte.split(/\r?\n/)) {
    if (!ligne.trim()) continue;
    let o;
    try {
      o = JSON.parse(ligne);
    } catch {
      a.illisibles++;
      continue;
    }
    if (o.type === 'system' && o.subtype === 'init') {
      a.init = true;
      a.apiKeySource = o.apiKeySource ?? null;
      a.modele = o.model ?? null;
    } else if (o.type === 'assistant') {
      const m = o.message?.model;
      if (m && !a.modeles_servis.includes(m)) a.modeles_servis.push(m);
      for (const c of o.message?.content || []) {
        if (c.type === 'tool_use' && c.name === 'Read' && c.input?.file_path) a.lectures.push(c.input.file_path);
      }
    } else if (o.type === 'user') {
      for (const c of (Array.isArray(o.message?.content) ? o.message.content : [])) {
        if (c.type === 'tool_result' && c.is_error) a.refus_outil.push(String(typeof c.content === 'string' ? c.content : JSON.stringify(c.content)).slice(0, 300));
      }
    } else if (o.type === 'rate_limit_event') {
      a.evenements_quota++;
      const info = o.rate_limit_info;
      if (info?.isUsingOverage === true) a.overage = true;
      if (typeof info?.status === 'string') a.statuts.push(info.status);
      const q = lireQuota(info);
      if (q) a.quota = q;
    } else if (o.type === 'result') {
      a.resultat = true;
      a.is_error = o.is_error === true;
      a.subtype = o.subtype ?? null;
    }
  }
  return a;
}

const PREFIXES = { opus: 'claude-opus-', sonnet: 'claude-sonnet-' };

/** Le contrôle d'identité : le premier écart arrête tout, tour non compté. */
export function ecartIdentite(a, modeleDemande) {
  if (a.apiKeySource !== 'none') return { type: 'identite', motif: `apiKeySource vaut ${a.apiKeySource === null ? 'absent' : a.apiKeySource}, attendu none` };
  if (a.overage) return { type: 'overage', motif: 'isUsingOverage vrai : le tour a débordé de l\'abonnement' };
  const prefixe = PREFIXES[modeleDemande];
  const servis = [a.modele, ...a.modeles_servis].filter(Boolean);
  if (!servis.length) return { type: 'modele', motif: 'aucun modèle servi lisible dans la sortie' };
  const autre = servis.find((m) => !m.startsWith(prefixe));
  if (autre) return { type: 'modele', motif: `modèle servi ${autre}, attendu ${prefixe}*` };
  return null;
}

/** La pause de quota, si le tour en porte une. */
export function pauseQuota(a) {
  if (a.quota && a.quota.utilization >= 0.8) return { type: 'quota', motif: `utilization ${a.quota.utilization} à 0,80 ou plus`, ...a.quota };
  const autre = a.statuts.find((s) => s !== 'allowed');
  if (autre) return { type: 'statut', motif: `status ${autre}, attendu allowed`, ...(a.quota || {}), status: autre };
  return null;
}
