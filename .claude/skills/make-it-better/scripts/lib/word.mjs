// lib/word.mjs — l'export Word vers PDF de l'aperçu, borné à 120 secondes, sans toucher un autre Word.
// Le serveur note, avant l'export, les WINWORD.EXE /Automation déjà là ; il n'arrête jamais que le
// sien, dont le numéro vient du script ou, s'il s'est figé avant de le dire, de l'écart avec ce relevé.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DOSSIER_SCRIPTS } from './commun.mjs';

export const DELAI_EXPORT_MS = 120 * 1000;

function powershell(commande) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', commande], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
}

/** Les processus WINWORD du poste : [{ pid, automation }]. */
export function listerWinword() {
  if (process.platform !== 'win32') return [];
  const r = powershell('Get-CimInstance Win32_Process -Filter "Name=\'WINWORD.EXE\'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }');
  return (r.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.indexOf('|');
    return { pid: Number(l.slice(0, i)), automation: /\/Automation/i.test(l.slice(i + 1)) };
  });
}

function arreterProcessus(pid) {
  // Dernière vérification : ce numéro est-il encore un WINWORD /Automation ?
  const encore = listerWinword().find((w) => w.pid === pid && w.automation);
  if (encore) spawnSync('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true });
  return Boolean(encore);
}

const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });
const CLE_REPRISE = String.raw`HKCU:\Software\Microsoft\Office\*\Word\Resiliency\DocumentRecovery`;

function vivant(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Un Word arrêté de force laisse une entrée de reprise : sans ce ménage, le porteur verrait cette copie
 * temporaire à sa prochaine ouverture de Word. Seule l'entrée qui nomme ce chemin exact s'efface.
 */
export function effacerReprise(chemin) {
  if (process.platform !== 'win32') return;
  const cible = chemin.replace(/'/g, "''");
  powershell(`Get-Item '${CLE_REPRISE}' -ErrorAction SilentlyContinue | Get-ChildItem | ForEach-Object { $k = $_; foreach ($n in $k.Property) { $v = (Get-ItemProperty $k.PSPath).$n; if ($v -is [byte[]] -and [Text.Encoding]::Unicode.GetString($v).Contains('${cible}')) { Remove-Item $k.PSPath -Recurse -Force; break } } }`);
}

/** Les chemins que Word garde à reprendre : la recette vérifie qu'aucune copie du serveur n'y reste. */
export function entreesDeReprise() {
  if (process.platform !== 'win32') return [];
  const r = powershell(String.raw`Get-Item '${CLE_REPRISE}' -ErrorAction SilentlyContinue | Get-ChildItem | ForEach-Object { $k = $_; foreach ($n in $k.Property) { $v = (Get-ItemProperty $k.PSPath).$n; if ($v -is [byte[]]) { ([Text.Encoding]::Unicode.GetString($v) -replace '[^\x20-\x7E]+', ' ').Trim() } } }`);
  return (r.stdout || '').split(/\r?\n/).filter(Boolean);
}

/**
 * Exporte `entree` vers `sortie`. Rend { ok, raison, numero, arrete, reste_ouvert } ; jamais d'exception :
 * un échec n'est qu'un repli sur le texte extrait.
 */
export async function exporterWordEnPdf(entree, sortie, { delaiMs = DELAI_EXPORT_MS } = {}) {
  if (process.platform !== 'win32') return { ok: false, raison: 'Word absent de ce poste' };
  const avant = new Set(listerWinword().filter((w) => w.automation).map((w) => w.pid));
  return new Promise((rendre) => {
    const script = join(DOSSIER_SCRIPTS, 'word-vers-pdf.ps1');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Entree', entree, '-Sortie', sortie], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let numero = null;
    let tampon = '';
    let delai = false;
    let fini = false;
    let erreur = '';
    let absent = false;
    let reste = 0;
    p.stdout.on('data', (d) => {
      tampon += d;
      const m = /PID=(\d+)/.exec(tampon);
      if (m) numero = Number(m[1]);
      if (/ABSENT/.test(tampon)) absent = true;
      const e = /ERREUR=(.*)/.exec(tampon);
      if (e) erreur = e[1].trim();
      const r = /RESTE=(\d+)/.exec(tampon);
      if (r) reste = Number(r[1]);
    });
    p.stderr.on('data', (d) => { if (erreur.length < 400) erreur += d; });
    const minuterie = setTimeout(async () => {
      delai = true;
      // Le numéro dit par le script, à défaut l'écart avec le relevé d'avant l'export.
      const cible = numero ?? listerWinword().find((w) => w.automation && !avant.has(w.pid))?.pid ?? null;
      spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
      const arrete = cible ? arreterProcessus(cible) : false;
      for (let i = 0; cible && i < 20 && vivant(cible); i++) await pause(250);
      effacerReprise(entree);
      terminer({ ok: false, raison: `Word n'a pas répondu en ${Math.round(delaiMs / 1000)} secondes`, numero: cible, arrete });
    }, delaiMs);
    const terminer = (res) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      rendre(res);
    };
    p.on('error', (e) => terminer({ ok: false, raison: `PowerShell indisponible : ${e.message}` }));
    p.on('close', async (code) => {
      if (delai) return;
      if (absent || code === 3) return terminer({ ok: false, raison: 'Word absent de ce poste' });
      // Après Quit, le processus met un instant à sortir ; s'il reste sans document, il s'arrête ici.
      let arrete = false;
      if (numero && !reste) {
        for (let i = 0; i < 20 && vivant(numero); i++) await pause(500);
        if (vivant(numero)) arrete = arreterProcessus(numero);
      }
      if (code === 0 && existsSync(sortie)) return terminer({ ok: true, numero, arrete, reste_ouvert: reste > 0 });
      return terminer({ ok: false, raison: `export Word en échec : ${erreur || `exit ${code}`}`, numero, arrete });
    });
  });
}
