// lib/frontmatter.mjs — LE lecteur de frontmatter d'un SKILL.md, partagé (TF-1337, 26/09/2026).
//
// Il vivait dans `scripts/self-test.mjs` seul. Le contrôle rapide des skills de l'index
// (`scripts/frontmatter-skills-index.mjs`) doit juger EXACTEMENT ce que juge la recette, sans quoi
// un skill passerait l'un et échouerait l'autre : un contrôle recopié dérive au premier correctif.
// Les deux l'importent désormais d'ici.

/** Extraction du champ description d'un frontmatter YAML (folded > / | / inline / quoted). */
export function frontmatter(txt) {
  // CRLF toléré : un SKILL.md servi en CRLF (poste Windows, core.autocrlf, skill tiers)
  // porte un frontmatter parfaitement valide ; sans normalisation le `\r` résiduel reste
  // collé en fin de ligne et `name`/`description` étaient déclarés absents à tort.
  // On normalise la lecture — aucun contrôle n'est assoupli.
  txt = txt.replace(/\r\n/g, '\n');
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fm = { name: null, description: null };
  for (let i = 0; i < lines.length; i++) {
    const mn = lines[i].match(/^name:\s*(.*)$/); if (mn) fm.name = mn[1].trim().replace(/^["']|["']$/g, '');
    const md = lines[i].match(/^description:\s*(.*)$/);
    if (md) {
      let v = md[1].trim();
      if (v === '>' || v === '|' || v === '>-' || v === '|-') {
        const buf = [];
        for (let j = i + 1; j < lines.length; j++) { if (/^\S/.test(lines[j])) break; buf.push(lines[j].trim()); }
        fm.description = buf.filter(Boolean).join(v[0] === '|' ? '\n' : ' ');
      } else fm.description = v.replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

/** La limite d'import de la description (règle qui a déjà fait échouer une version). */
export const DESCRIPTION_MAX = 1024;

/** Les défauts d'un frontmatter, en phrases — [] quand il est recevable. Même barème que la recette. */
export function defautsFrontmatter(txt) {
  const fm = frontmatter(txt);
  if (!fm) return ['frontmatter illisible'];
  const d = [];
  if (!fm.name) d.push("champ 'name' absent");
  if (fm.description == null) d.push("champ 'description' absent");
  else if (fm.description.length > DESCRIPTION_MAX) d.push(`description ${fm.description.length} > ${DESCRIPTION_MAX} caractères`);
  return d;
}
