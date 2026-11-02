// lib/powerpoint.mjs — l'export PowerPoint vers PDF de l'aperçu. Rien n'est réécrit ici : exporter-pptx.mjs
// du skill digit-ai-pptx pose le verrou entre sessions, travaille sur une copie et ne quitte jamais une
// instance qu'il n'a pas lancée. Un PowerPoint ouvert par le porteur n'est donc jamais touché.
//
// MIB_SIM_POWERPOINT (banc seulement) : absent = PowerPoint manque ; pdf:<fichier> = l'export rend ce PDF ;
// pdf-puis-absent:<fichier> = le premier export le rend et les suivants échouent.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { cheminSkillVoisin } from './commun.mjs';

let exportsSimules = 0;
let dernierReglage = null;

function simuler(reglage, sortie) {
  const [mode, fichier] = [reglage.split(':')[0], reglage.slice(reglage.indexOf(':') + 1)];
  if (reglage !== dernierReglage) exportsSimules = 0;
  dernierReglage = reglage;
  exportsSimules++;
  if (mode === 'pdf' || (mode === 'pdf-puis-absent' && exportsSimules === 1)) {
    copyFileSync(fichier, sortie);
    return { ok: true, rapport: { simule: true } };
  }
  return { ok: false, raison: 'PowerPoint absent de ce poste' };
}

/** Les processus PowerPoint du poste : [{ pid, titre, debut }]. La recette y lit que celui du porteur n'a pas bougé. */
export function listerPowerpoint() {
  if (process.platform !== 'win32') return [];
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)|$($_.StartTime.ToString(\'o\'))|$($_.MainWindowTitle)" }'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return (r.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => {
    const [pid, debut, ...titre] = l.split('|');
    return { pid: Number(pid), debut, titre: titre.join('|') };
  });
}

/**
 * Exporte `entree` vers `sortie`, qui ne doit pas exister. Rend { ok, raison, rapport } ; jamais d'exception :
 * un échec n'est qu'un repli sur le texte extrait. Le délai est celui d'exporter-pptx, qui abandonne
 * PowerPoint sans le tuer : le lui imposer ici arrêterait son verrou sans arrêter PowerPoint.
 */
export function exporterPowerpointEnPdf(entree, sortie) {
  if (process.env.MIB_SIM_POWERPOINT) return Promise.resolve(simuler(process.env.MIB_SIM_POWERPOINT, sortie));
  const script = cheminSkillVoisin('digit-ai-pptx', 'scripts/exporter-pptx.mjs');
  if (!script) return Promise.resolve({ ok: false, raison: 'exporter-pptx introuvable : le skill digit-ai-pptx manque' });
  return new Promise((rendre) => {
    const p = spawn(process.execPath, [script, entree, '--pdf', sortie], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } });
    let sortieTexte = '';
    let erreur = '';
    p.stdout.on('data', (d) => { sortieTexte += d; });
    p.stderr.on('data', (d) => { if (erreur.length < 400) erreur += d; });
    p.on('error', (e) => rendre({ ok: false, raison: `exporter-pptx non lancé : ${e.message}` }));
    p.on('close', (code) => {
      let rapport = null;
      try {
        rapport = JSON.parse(sortieTexte);
      } catch { /* dit ci-dessous */ }
      if (code === 0 && existsSync(sortie)) return rendre({ ok: true, rapport });
      return rendre({ ok: false, raison: rapport?.motif || `export PowerPoint en échec : ${erreur.trim() || `exit ${code}`}`, rapport });
    });
  });
}
