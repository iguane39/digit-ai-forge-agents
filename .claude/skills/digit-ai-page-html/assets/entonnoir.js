/* entonnoir.js — entonnoir de conversion : une serie d'etapes qui ne font que decroitre
   (TF-1875, 19/10/2026 ; retour du constructeur de TF-1855, 18/10/2026).

   LE FAIT. Aucun composant d'entonnoir n'existait : une barre horizontale a une serie du composant
   « barres empilees » repetait l'effectif trois fois (etiquette dans le segment, total au bout, ligne de
   la vue tableau) et ne disait jamais ce qui compte dans un entonnoir, la CONVERSION d'une etape a la
   suivante. Une page ecrivait donc son entonnoir a la main.

   CONTRAT. La donnee est DECLAREE, le dessin en est derive :

     <figure class="entonnoir" id="e-parcours" data-entonnoir>
       <figcaption>Parcours d'inscription</figcaption>
       <script type="application/json" class="entonnoir-donnees">
       {"unite":"visiteurs","titre":"Parcours d'inscription",
        "etapes":[{"nom":"Visites","valeur":12000},{"nom":"Inscriptions","valeur":3400}]}
       <\/script>   (écrit « <\/script> » ici : un commentaire d'asset inliné ne ferme jamais la balise hôte, TF-1062)
     </figure>

   CE QUI EST DIT, ET UNE SEULE FOIS. Chaque etape ecrit son nom et son effectif sur UNE ligne, sa barre
   (largeur proportionnelle a l'effectif de la premiere etape, centree : la forme d'un entonnoir), puis sa
   conversion : « x % de l'etape precedente · y % du depart ». La barre ne repete pas l'effectif (il va a
   son aria-label), l'infobulle ne porte que le COMPLEMENT (les effectifs perdus depuis l'etape precedente).
   Une vue tableau (details) garde les chiffres exacts, lisible sans CSS ni script.

   REGLES DE LA DONNEE. De 2 a 8 etapes ; des effectifs positifs ou nuls, entiers ou non ; la premiere
   etape est strictement positive ; aucune etape ne depasse la precedente — sinon ce n'est pas un
   entonnoir et le composant REFUSE (« etape X plus grande que la precedente ») au lieu de dessiner un
   mensonge. Autonome : aucune requete reseau, aucune bibliotheque.

   DEUX VOIES, UN SEUL CODE (comme barres-empilees.js). (1) Au chargement, init() dessine les figures qui
   n'ont pas encore de rendu. (2) `node entonnoir.js --injecter page.html` PRE-RENDU le marquage dans le
   fichier (export PDF, courriel, oracle statique) ; il est range entre deux commentaires HTML
   « entonnoir-rendu » et « /entonnoir-rendu » et se refait a l'identique. */
(function (root) {
  'use strict';

  var MAX_ETAPES = 8;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(v, dec) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  }
  function arrondi(v, dec) { var p = Math.pow(10, dec); return Math.round(v * p) / p; }
  /* Nombre exact : au plus deux decimales, sans zeros inutiles. */
  function exactNum(v) { var a = arrondi(v, 2); return num(a, a % 1 ? 2 : 0); }
  /* Un pourcentage : une decimale au plus, sans zero inutile (« 28 % », « 28,3 % »). */
  function pct(x) { var a = arrondi(x, 1); return num(a, a % 1 ? 1 : 0) + ' %'; }

  function valider(d) {
    if (!d || !d.etapes) throw new Error('entonnoir : etapes requises');
    if (d.etapes.length < 2 || d.etapes.length > MAX_ETAPES)
      throw new Error('entonnoir : 2 a ' + MAX_ETAPES + ' etapes (regrouper le reste)');
    d.etapes.forEach(function (e, i) {
      if (!e.nom || typeof e.valeur !== 'number' || !isFinite(e.valeur) || e.valeur < 0)
        throw new Error('entonnoir : l\'etape ' + (i + 1) + ' doit porter un nom et un effectif positif ou nul');
      if (i > 0 && e.valeur > d.etapes[i - 1].valeur)
        throw new Error('entonnoir : l\'etape « ' + e.nom + ' » est plus grande que la precedente — ce n\'est pas un entonnoir');
    });
    if (!(d.etapes[0].valeur > 0)) throw new Error('entonnoir : la premiere etape doit etre strictement positive');
  }

  /* Rend {liste, table} pour une donnee declaree. `id` prefixe les identifiants. */
  function rendre(d, id) {
    valider(d);
    var unite = d.unite ? ' ' + d.unite : '';
    var depart = d.etapes[0].valeur;
    var lignes = [], tableLignes = [];
    d.etapes.forEach(function (e, i) {
      var prec = i ? d.etapes[i - 1].valeur : null;
      var partDepart = 100 * e.valeur / depart;
      var partPrec = prec === null ? null : (prec > 0 ? 100 * e.valeur / prec : 0);
      var perdus = prec === null ? null : prec - e.valeur;
      /* A l'etape 2 la part du depart EST la part de l'etape precedente : on ne l'ecrit pas deux fois. */
      var conversion = prec === null
        ? 'Point de départ'
        : pct(partPrec) + ' de l\'étape précédente' + (i > 1 ? ' · ' + pct(partDepart) + ' du départ' : '');
      /* L'infobulle est un COMPLEMENT : ce qui s'est perdu en route, jamais le texte visible. */
      var titre = perdus === null ? '' : ' title="' + esc('Perdus depuis l\'étape précédente : ' + exactNum(perdus) + unite) + '"';
      var largeur = r1(Math.max(partDepart, 0));
      lignes.push(
        '<li class="entonnoir-etape" style="--part:' + largeur + '%">' +
          '<p class="entonnoir-ligne"><span class="entonnoir-nom">' + esc(e.nom) + '</span>' +
          '<span class="entonnoir-valeur">' + esc(num(arrondi(e.valeur, d.decimales || 0), d.decimales || 0) + unite) + '</span></p>' +
          '<div class="entonnoir-barre" id="' + esc(id) + '-b' + i + '" role="img" tabindex="0" aria-label="' +
            esc(e.nom + ' : ' + exactNum(e.valeur) + unite + ', ' + pct(partDepart) + ' du départ') + '"' + titre + '>' +
            '<span class="entonnoir-remplissage"></span></div>' +
          '<p class="entonnoir-conversion">' + esc(conversion) + '</p>' +
        '</li>');
      tableLignes.push('<tr><th scope="row">' + esc(e.nom) + '</th><td>' + esc(exactNum(e.valeur)) + '</td><td>' +
        (partPrec === null ? '—' : esc(pct(partPrec))) + '</td><td>' + esc(pct(partDepart)) + '</td></tr>');
    });
    var liste = '<ol class="entonnoir-liste" aria-label="' + esc(d.titre || 'Entonnoir') + '">' + lignes.join('') + '</ol>';
    var tableau = '<table><caption>' + esc((d.titre || 'Données') + (d.unite ? ' (' + d.unite + ')' : '')) +
      '</caption><thead><tr><th scope="col">Étape</th><th scope="col">Effectif</th>' +
      '<th scope="col">De l\'étape précédente</th><th scope="col">Du départ</th></tr></thead><tbody>' +
      tableLignes.join('') + '</tbody></table>';
    /* L9 : un depliant qui cache moins de 200 caracteres s'affiche en place. */
    var long = tableau.replace(/<[^>]*>/g, '').length;
    var table = long < 200 ? '<div class="entonnoir-table">' + tableau + '</div>'
      : '<details class="entonnoir-table"><summary>Voir les données de l\'entonnoir</summary>' + tableau + '</details>';
    return { liste: liste, table: table };
  }
  function r1(x) { return Math.round(x * 10) / 10; }

  /* Pas de debut de commentaire HTML litteral dans un script : il ouvre l'etat d'echappement. */
  var DEB = '<' + '!--entonnoir-rendu-->', FIN = '<' + '!--/entonnoir-rendu-->';
  function assembler(r) { return DEB + r.liste + r.table + FIN; }

  /* Voie navigateur : dessine les figures dont le rendu n'est pas deja dans la page. */
  function init(racine) {
    var scope = racine || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-entonnoir]'), function (fig) {
      if (fig.querySelector('ol.entonnoir-liste')) return;
      var js = fig.querySelector('script.entonnoir-donnees');
      if (!js) return;
      try {
        fig.insertAdjacentHTML('beforeend', assembler(rendre(JSON.parse(js.textContent), fig.id || 'e')));
      } catch (e) {
        fig.insertAdjacentHTML('beforeend', '<p class="entonnoir-erreur" role="alert">Entonnoir non dessiné : ' + esc(e.message) + '</p>');
      }
    });
  }

  root.DigitAIEntonnoir = { init: init, rendre: rendre, assembler: assembler };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DigitAIEntonnoir;

  /* Voie fichier : node entonnoir.js --injecter page.html  (pre-rend, idempotent). */
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs'), a = process.argv, cible = a[a.indexOf('--injecter') + 1];
    if (a.indexOf('--injecter') < 0 || !cible) {
      console.error('usage : node entonnoir.js --injecter <page.html>');
      process.exit(2);
    }
    var html = fs.readFileSync(cible, 'utf8'), n = 0;
    var re = /(<figure\b[^>]*\bdata-entonnoir\b[^>]*>)([\s\S]*?)(<\/figure>)/g;
    html = html.replace(re, function (m, ouv, corps, clo) {
      var fid = /\bid="([^"]+)"/.exec(ouv);
      var j = /<script type="application\/json" class="entonnoir-donnees">([\s\S]*?)<\/script>/.exec(corps);
      if (!j || !fid) return m;
      var sans = corps.replace(new RegExp('\\s*' + DEB + '[\\s\\S]*?' + FIN), '');
      n++;
      return ouv + sans.replace(/\s+$/, '') + '\n  ' + assembler(rendre(JSON.parse(j[1]), fid[1])) + '\n' + clo;
    });
    fs.writeFileSync(cible, html);
    console.log('entonnoirs rendus : ' + n);
  }
})(typeof window !== 'undefined' ? window : globalThis);
