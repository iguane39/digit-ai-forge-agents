#!/usr/bin/env node
/**
 * retablir-pseudonymes.mjs — rétablit les valeurs réelles dans un texte revenu d'un modèle, PAR MOTIF
 * (TF-2163, 05/11/2026).
 *
 * LE FAIT (Produit-86, lot 20261104a, RA-2). Un produit pseudonymise ses données avant un appel de
 * modèle : le texte envoyé porte `[Client-A]`, la table pseudonyme → valeur réelle reste chez lui. Le
 * modèle a ôté les crochets en reformulant : « Client-A » nu dans sa réponse, que le rétablissement par
 * chaîne exacte `[Client-A]` ne reconnaissait plus. Trois propositions sur trois ont été refusées
 * « hors périmètre » parce que leur pseudonyme n'était pas revenu à sa valeur.
 *
 * CE QUE FAIT LA FONCTION. Pour chaque pseudonyme de la table, du plus long au plus court, elle reconnaît
 * le pseudonyme par un MOTIF et non par une chaîne exacte :
 *   · les crochets sont facultatifs un à un : `[Client-A]`, `[[Client-A]]`, `Client-A`, `[Client-A` (fermant
 *     perdu), `Client-A]` (ouvrant perdu). Un `]` qui ferme un `[` ouvert PLUS TÔT dans le texte
 *     (« [voir Client-A] ») n'est pas consommé : il n'appartient pas au pseudonyme ;
 *   · les espaces dans les crochets (`[ Client-A ]`) sont admis ;
 *   · le séparateur entre les morceaux du pseudonyme peut devenir une espace, un tiret ou un soulignement
 *     (`Client A`, `Client_A`) ;
 *   · le pseudonyme est borné : `Client-A` ne s'applique pas dans `Client-AB` ni dans `Client-A2`.
 * Le motif est SENSIBLE À LA CASSE : « le client a signé » n'est pas `Client-A`.
 *
 * CE QU'ELLE NE FAIT PAS, et le dit. Un pseudonyme que le modèle a traduit ou réécrit au-delà des
 * séparateurs et des crochets (« le premier client », « Client Alpha ») n'est pas reconnu. Un pseudonyme
 * de la FORME de ceux de la table (même préfixe) mais absent de la table (`Client-Z` inventé) n'est pas
 * rétabli : il est RENDU dans `inconnus`, pour que l'appelant refuse le texte au lieu de le laisser
 * passer avec un pseudonyme orphelin.
 *
 * Usage :
 *   import { retablirPseudonymes } from "./retablir-pseudonymes.mjs";
 *   const { texte, retablis, inconnus } = retablirPseudonymes(reponse, { "Client-A": "Société Exemple" });
 *   node retablir-pseudonymes.mjs --table table.json [--fichier reponse.txt]   # sinon le texte vient de stdin
 * Sortie CLI : JSON { texte, retablis: [{ pseudonyme, occurrences, sansCrochets }], inconnus: [] }.
 * Exit 0 ; 1 si `inconnus` n'est pas vide (le texte n'est pas sûr) ; 2 usage.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SEPARATEURS = /[-_\s]+/;

/** Le corps du motif d'un pseudonyme : ses morceaux, séparés par UN séparateur admis. */
function corpsDuMotif(pseudonyme) {
  const morceaux = pseudonyme.split(SEPARATEURS).filter(Boolean);
  return morceaux.map(echapper).join("[-_\\s\\u00a0]");
}

/** Les préfixes de la table (« Client » pour « Client-A »), pour reconnaître un pseudonyme orphelin. */
function prefixesDeLaTable(pseudonymes) {
  const prefixes = new Set();
  for (const p of pseudonymes) {
    const m = /^(.*?)[-_\s]?[A-Z0-9]{1,4}$/.exec(p);
    if (m && m[1]) prefixes.add(m[1]);
  }
  return [...prefixes];
}

/**
 * @param {string} texte        le texte revenu du modèle
 * @param {Record<string,string>} table  pseudonyme → valeur réelle
 * @param {{ motifOrphelin?: RegExp }} [options]  motif des pseudonymes orphelins (défaut : préfixes de la table)
 * @returns {{ texte: string, retablis: {pseudonyme:string, occurrences:number, sansCrochets:number}[], inconnus: string[] }}
 */
export function retablirPseudonymes(texte, table, options = {}) {
  const pseudonymes = Object.keys(table).filter((p) => p.trim()).sort((a, b) => b.length - a.length);
  const retablis = [];
  let courant = String(texte ?? "");
  for (const p of pseudonymes) {
    // Bornes : ni lettre, chiffre, `_` ou `-` avant ; ni lettre, chiffre, `_` ni `-lettre` après.
    const motif = new RegExp(
      `(\\[\\[?\\s*)?(?<![\\p{L}\\p{N}_-])${corpsDuMotif(p)}(?![\\p{L}\\p{N}_])(?!-[\\p{L}\\p{N}])(\\s*\\]\\]?)?`, "gu");
    let occurrences = 0, sansCrochets = 0;
    courant = courant.replace(motif, (tout, ouvrant, fermant, decalage, entier) => {
      occurrences++;
      let rendu = table[p];
      if (!ouvrant && !fermant) sansCrochets++;
      if (!ouvrant && fermant) {
        // Fermant seul : il appartient à un `[` ouvert plus tôt dans le texte, ou il est orphelin.
        const avant = entier.slice(0, decalage);
        const profondeur = (avant.match(/\[/g) || []).length - (avant.match(/\]/g) || []).length;
        if (profondeur > 0) rendu += fermant;    // le crochet n'est pas le nôtre : on le rend
      }
      return rendu;
    });
    if (occurrences) retablis.push({ pseudonyme: p, occurrences, sansCrochets });
  }
  const prefixes = prefixesDeLaTable(pseudonymes);
  const motifOrphelin = options.motifOrphelin
    || (prefixes.length ? new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${prefixes.map(echapper).join("|")})[-_ ][A-Z0-9]{1,4}(?![\\p{L}\\p{N}_])`, "gu") : null);
  const inconnus = motifOrphelin ? [...new Set(courant.match(motifOrphelin) || [])] : [];
  return { texte: courant, retablis, inconnus };
}

// ---- CLI ----------------------------------------------------------------------------------------
function main(argv) {
  const iT = argv.indexOf("--table"), iF = argv.indexOf("--fichier");
  if (iT < 0 || !argv[iT + 1] || argv.some((a) => a.startsWith("--") && !["--table", "--fichier"].includes(a))) {
    console.error("usage : retablir-pseudonymes.mjs --table <table.json> [--fichier <texte>]   (sinon stdin)");
    return 2;
  }
  let table;
  try { table = JSON.parse(readFileSync(argv[iT + 1], "utf8").replace(/^﻿/, "")); }
  catch (e) { console.error(`table illisible : ${e.message}`); return 2; }
  const brut = readFileSync(iF >= 0 && argv[iF + 1] ? argv[iF + 1] : 0, "utf8");
  const r = retablirPseudonymes(brut, table);
  console.log(JSON.stringify(r, null, 2));
  return r.inconnus.length ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
