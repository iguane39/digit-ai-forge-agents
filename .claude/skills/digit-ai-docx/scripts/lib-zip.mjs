// lib-zip — écrire et lire une archive ZIP sans dépendance (digit-ai-docx, TF-1027).
// Un paquet OOXML est une archive ZIP : le rendu l'ÉCRIT, l'oracle le RELIT. Zéro dépendance
// (zlib du cœur de Node pour DEFLATE, CRC-32 calculé ici), et DÉTERMINISTE : horodatage fixe au
// 1980-01-01, ordre des parties conservé — deux rendus du même plan donnent les mêmes octets.
import zlib from 'node:zlib';

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const DATE_DOS = 0x21;   // 1980-01-01 : un horodatage réel rendrait deux rendus identiques différents

/** parties : [{nom, donnees: Buffer|string}] → Buffer de l'archive. */
export function ecrireZip(parties) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const p of parties) {
    const nom = Buffer.from(p.nom, 'utf8');
    const brut = Buffer.isBuffer(p.donnees) ? p.donnees : Buffer.from(p.donnees, 'utf8');
    const comp = zlib.deflateRawSync(brut);
    const crc = crc32(brut);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(DATE_DOS, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(brut.length, 22);
    lh.writeUInt16LE(nom.length, 26); lh.writeUInt16LE(0, 28);
    locaux.push(lh, nom, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(DATE_DOS, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(brut.length, 24); ch.writeUInt16LE(nom.length, 28);
    ch.writeUInt32LE(decalage, 42);
    centraux.push(ch, nom);
    decalage += 30 + nom.length + comp.length;
  }
  const cd = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(parties.length, 8); fin.writeUInt16LE(parties.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, cd, fin]);
}

/** Buffer d'archive → Map(nom → Buffer), dans l'ordre du répertoire central. Lève si illisible. */
export function lireZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error("fin de répertoire central introuvable — ce n'est pas une archive ZIP");
  const n = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const parties = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('répertoire central corrompu');
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const nom = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('en-tête local absent : ' + nom);
    const debut = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const brut = buf.slice(debut, debut + taille);
    if (methode === 8) parties.set(nom, zlib.inflateRawSync(brut));
    else if (methode === 0) parties.set(nom, brut);
    else throw new Error(`méthode de compression ${methode} non lue : ${nom}`);
    p += 46 + nl + xl + cl;
  }
  return parties;
}
