/* barres-empilees.js — graphique en barres empilees, SVG, vertical et horizontal
   (D-55 (a) du 03/10/2026, Produit-02 RT-119, lot C de la campagne O2).

   LE FAIT. Le socle n'avait aucun composant de graphique : chaque page ecrivait son SVG a la main
   et retenait la serie UNIQUE, la voie la plus courte, alors que la demande et la donnee en
   portaient plusieurs (pays, appareils). Retour humain : « pourquoi pas un histogramme avec
   plusieurs valeurs par colonne, avec differentes couleurs ? ».

   CONTRAT. La donnee est DECLAREE, le dessin en est derive :

     <figure class="graphe-empile" id="g-depense" data-graphe-empile>
       <figcaption>Depense par jour et par pays (euros)</figcaption>
       <script type="application/json" class="graphe-donnees">
       {"orientation":"vertical","mode":"valeurs","unite":"€","decimales":0,"totaux":true,
        "categories":["Lun","Mar"],
        "series":[{"nom":"France","valeurs":[120,90]},{"nom":"Italie","valeurs":[60,80]}]}
       </script>
     </figure>

   CONVENTION (lue par l'oracle) : le <svg> porte data-series-source="N" (N = nombre de series de
   la DONNEE) ; chaque segment porte data-serie="<nom>" ; une etiquette de segment est un
   <text class="etiquette-marque" data-etiquette-de="<id du rect>">, posee SEULEMENT si elle tient
   dans le rectangle.

   DEUX VOIES, UN SEUL CODE. (1) Au chargement, init() dessine les figures qui n'ont pas encore de
   SVG. (2) `node barres-empilees.js --injecter page.html` PRE-RENDU le SVG dans le fichier : il
   existe alors sans script (export PDF, courriel, oracle statique). Le rendu pre-fait est range
   entre deux commentaires HTML « graphe-rendu » et « /graphe-rendu » et se refait a l'identique.

   INFOBULLE. Chaque segment porte un `title` lu par infobulle.js (a poser avec lui). Son contenu
   est un COMPLEMENT de ce que la page montre deja : part du total, rang, total de la colonne si
   non affiche, valeur exacte si l'etiquette l'arrondit ou manque. Jamais la repetition du texte
   visible. Le nom de la serie et de la categorie vont dans aria-label, pas dans l'infobulle.

   PALETTE : jetons --cat-1..--cat-6 de barres-empilees.css, valides en clair et en sombre. Plus de
   six series : regrouper en « Autres ». Autonome : aucune requete reseau, aucune bibliotheque. */
(function (root) {
  'use strict';

  var MAX_SERIES = 6;
  var FS = 13;                 /* corps du texte du graphe, en unites du viewBox */
  var LARGEUR = 420;           /* viewBox : lisible a 340 px (x0,8) comme a 560 px (x1,3) */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(v, dec) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  }
  function arrondi(v, dec) { var p = Math.pow(10, dec); return Math.round(v * p) / p; }
  function r1(x) { return Math.round(x * 10) / 10; }
  /* Nombre exact : au plus deux decimales, sans zeros inutiles. */
  function exactNum(v) { var a = arrondi(v, 2); return num(a, a % 1 ? 2 : 0); }

  function pasLisible(max, cible) {
    var brut = max / cible, p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10)), n = brut / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  function valider(d) {
    if (!d || !d.categories || !d.series) throw new Error('graphe : categories et series requises');
    if (d.series.length < 1 || d.series.length > MAX_SERIES)
      throw new Error('graphe : 1 a ' + MAX_SERIES + ' series (regrouper le reste en « Autres »)');
    d.series.forEach(function (s) {
      if (!s.nom || s.valeurs.length !== d.categories.length)
        throw new Error('graphe : la serie « ' + s.nom + ' » doit porter une valeur par categorie');
      s.valeurs.forEach(function (v) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0)
          throw new Error('graphe : valeur negative ou non numerique dans « ' + s.nom + ' »');
      });
    });
  }

  /* Rend {svg, legende, table} pour une donnee declaree. `id` prefixe les identifiants. */
  function rendre(d, id) {
    valider(d);
    var vert = d.orientation !== 'horizontal';
    var pct = d.mode === 'pourcent';
    var dec = d.decimales || 0;
    var unite = d.unite ? ' ' + d.unite : '';
    var nc = d.categories.length, ns = d.series.length;
    var totaux = d.categories.map(function (_, i) {
      return d.series.reduce(function (a, s) { return a + s.valeurs[i]; }, 0);
    });
    var maxTotal = pct ? 100 : Math.max.apply(null, totaux);
    if (!(maxTotal > 0)) maxTotal = 1;
    var pas = pct ? 25 : pasLisible(maxTotal, 4);
    var maxAxe = pct ? 100 : Math.ceil(maxTotal / pas - 1e-9) * pas;
    var fmtAxe = function (v) { return pct ? num(v, 0) + ' %' : num(v, pas < 1 ? 1 : 0); };
    var mot = vert ? 'colonne' : 'barre';

    /* --- gabarit : marges et bande par categorie --- */
    var mg, W = LARGEUR, H, bande;
    if (vert) {
      mg = { g: 44, d: 8, h: d.totaux ? 20 : 8, b: 24 };
      H = 260; bande = (W - mg.g - mg.d) / nc;
    } else {
      var maxCar = d.categories.reduce(function (a, c) { return Math.max(a, String(c).length); }, 0);
      mg = { g: Math.min(140, Math.round(maxCar * FS * 0.58) + 12), d: d.totaux ? 64 : 12, h: 8, b: 24 };
      bande = 32; H = mg.h + mg.b + nc * bande;
    }
    var pw = W - mg.g - mg.d, ph = H - mg.h - mg.b;
    var ech = function (v) { return (vert ? ph : pw) * v / maxAxe; };
    var ep = Math.min(vert ? 56 : 22, bande * 0.8);

    var out = [];
    out.push('<svg class="graphe-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + r1(H) +
      '" role="group" aria-label="' + esc(d.titre || 'Barres empilees') + '" data-series-source="' + ns +
      '" data-orientation="' + (vert ? 'vertical' : 'horizontal') + '">');

    /* --- grille et axe des valeurs --- */
    for (var t = 0; t <= maxAxe + 1e-9; t += pas) {
      var p = ech(t);
      if (vert) {
        var y = r1(mg.h + ph - p);
        out.push('<line class="graphe-grille' + (t === 0 ? ' graphe-base' : '') + '" x1="' + mg.g + '" x2="' + (W - mg.d) + '" y1="' + y + '" y2="' + y + '"/>');
        out.push('<text class="graphe-axe" x="' + (mg.g - 6) + '" y="' + r1(y + 4) + '" text-anchor="end">' + esc(fmtAxe(t)) + '</text>');
      } else {
        var x = r1(mg.g + p);
        out.push('<line class="graphe-grille' + (t === 0 ? ' graphe-base' : '') + '" x1="' + x + '" x2="' + x + '" y1="' + mg.h + '" y2="' + (H - mg.b) + '"/>');
        out.push('<text class="graphe-axe" x="' + x + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fmtAxe(t)) + '</text>');
      }
    }

    /* --- categories : une sur k si la bande est trop etroite pour le texte --- */
    var plusLong = d.categories.reduce(function (a, c) { return Math.max(a, String(c).length); }, 0);
    var k = vert ? Math.max(1, Math.ceil((plusLong * FS * 0.6 + 4) / bande)) : 1;
    d.categories.forEach(function (c, i) {
      if (i % k) return;
      if (vert) out.push('<text class="graphe-axe" x="' + r1(mg.g + bande * (i + 0.5)) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(c) + '</text>');
      else out.push('<text class="graphe-axe" x="' + (mg.g - 8) + '" y="' + r1(mg.h + bande * (i + 0.5) + 4) + '" text-anchor="end">' + esc(c) + '</text>');
    });

    /* --- segments --- */
    var segs = [], etiq = [], lignesTable = [];
    d.categories.forEach(function (cat, i) {
      var cumul = 0, tot = totaux[i];
      var rangs = d.series.map(function (s) { return s.valeurs[i]; });
      var nonNuls = rangs.filter(function (x) { return x > 0; }).length;
      d.series.forEach(function (s, j) {
        var v = s.valeurs[i];
        if (v === 0) return;
        var part = tot ? v / tot : 0;
        var vv = pct ? part * 100 : v;
        var seg = ech(vv), debut = ech(cumul);
        cumul += vv;
        var sid = id + '-' + i + '-' + j;
        var rect = vert
          ? { x: mg.g + bande * (i + 0.5) - ep / 2, y: mg.h + ph - debut - seg, w: ep, h: seg }
          : { x: mg.g + debut, y: mg.h + bande * (i + 0.5) - ep / 2, w: seg, h: ep };
        var texte = pct ? num(arrondi(part * 100, dec), dec) + ' %' : num(arrondi(v, dec), dec);   /* l'unite est dite par la legende de la figure et par le total */
        var tient = rect.w - 4 >= texte.length * FS * 0.62 + 4 && rect.h - 2 >= FS + 4;
        var rang = 1 + rangs.filter(function (x) { return x > v; }).length;
        var arrondit = arrondi(v, dec) !== arrondi(v, 2);
        var lignes = [];
        lignes.push('Part du total de la ' + mot + ' : ' + num(arrondi(part * 100, 1), 1) + ' %');
        lignes.push('Rang : ' + rang + (rang === 1 ? 'er' : 'e') + ' sur ' + nonNuls);
        if (!d.totaux) lignes.push('Total de la ' + mot + ' : ' + exactNum(tot) + unite);
        if (!tient || arrondit || pct) lignes.push('Valeur exacte : ' + exactNum(v) + unite);
        segs.push('<rect class="graphe-seg graphe-s' + (j + 1) + '" id="' + sid + '" data-serie="' + esc(s.nom) +
          '" data-categorie="' + esc(cat) + '" x="' + r1(rect.x) + '" y="' + r1(rect.y) + '" width="' + r1(rect.w) +
          '" height="' + r1(rect.h) + '" tabindex="0" role="img" aria-label="' +
          esc(s.nom + ', ' + cat + ' : ' + exactNum(v) + unite) +
          '" title="' + esc(lignes.join('\n')) + '"/>');
        if (tient) etiq.push('<text class="etiquette-marque graphe-t' + (j + 1) + '" data-etiquette-de="' + sid +
          '" data-overlap-ok="' + sid + '" x="' + r1(rect.x + rect.w / 2) + '" y="' + r1(rect.y + rect.h / 2 + 4) + '" text-anchor="middle">' + esc(texte) + '</text>');
      });
      if (d.totaux && !pct) {
        var tt = num(arrondi(tot, dec), dec) + unite;
        if (vert) etiq.push('<text class="graphe-total" x="' + r1(mg.g + bande * (i + 0.5)) + '" y="' + r1(mg.h + ph - ech(tot) - 6) + '" text-anchor="middle">' + esc(tt) + '</text>');
        else etiq.push('<text class="graphe-total" x="' + r1(mg.g + ech(tot) + 6) + '" y="' + r1(mg.h + bande * (i + 0.5) + 4) + '">' + esc(tt) + '</text>');
      }
      lignesTable.push('<tr><th scope="row">' + esc(cat) + '</th>' + d.series.map(function (s) {
        return '<td>' + esc(exactNum(s.valeurs[i])) + '</td>';
      }).join('') + '<td>' + esc(exactNum(tot)) + '</td></tr>');
    });
    out.push(segs.join(''), etiq.join(''), '</svg>');

    /* --- legende des 2 series (ou plus) --- */
    var legende = ns >= 2 ? '<ul class="graphe-legende">' + d.series.map(function (s, j) {
      return '<li><span class="graphe-pastille graphe-s' + (j + 1) + '" aria-hidden="true"></span>' + esc(s.nom) + '</li>';
    }).join('') + '</ul>' : '';

    /* --- vue tableau : le relief de la palette claire (trois teintes sous 3:1 sur fond blanc) ;
       en place si elle est courte (L9), en depliant au-dela --- */
    var tableau = '<table><caption>' +
      esc((d.titre || 'Données') + (d.unite ? ' (' + d.unite + ')' : '')) + '</caption><thead><tr><th scope="col">' +
      esc(d.titreCategories || 'Catégorie') + '</th>' +
      d.series.map(function (s) { return '<th scope="col">' + esc(s.nom) + '</th>'; }).join('') +
      '<th scope="col">Total</th></tr></thead><tbody>' + lignesTable.join('') + '</tbody></table>';
    /* L9 : un depliant qui cache moins de 200 caracteres s'affiche en place. */
    var long = tableau.replace(/<[^>]*>/g, '').length;
    var table = long < 200 ? '<div class="graphe-table">' + tableau + '</div>'
      : '<details class="graphe-table"><summary>Voir les données du graphique</summary>' + tableau + '</details>';

    return { svg: out.join(''), legende: legende, table: table };
  }

  /* Pas de debut de commentaire HTML litteral dans un script : il ouvre l'etat d'echappement. */
  var DEB = '<' + '!--graphe-rendu-->', FIN = '<' + '!--/graphe-rendu-->';
  function assembler(r) { return DEB + r.svg + r.legende + r.table + FIN; }

  /* Voie navigateur : dessine les figures dont le rendu n'est pas deja dans la page. */
  function init(racine) {
    var scope = racine || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-graphe-empile]'), function (fig) {
      if (fig.querySelector('svg.graphe-svg')) return;
      var js = fig.querySelector('script.graphe-donnees');
      if (!js) return;
      try {
        fig.insertAdjacentHTML('beforeend', assembler(rendre(JSON.parse(js.textContent), fig.id || 'g')));
      } catch (e) {
        fig.insertAdjacentHTML('beforeend', '<p class="graphe-erreur" role="alert">Graphique non dessiné : ' + esc(e.message) + '</p>');
      }
    });
  }

  root.DigitAIBarresEmpilees = { init: init, rendre: rendre, assembler: assembler };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DigitAIBarresEmpilees;

  /* Voie fichier : node barres-empilees.js --injecter page.html  (pre-rend, idempotent). */
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs'), a = process.argv, cible = a[a.indexOf('--injecter') + 1];
    if (a.indexOf('--injecter') < 0 || !cible) {
      console.error('usage : node barres-empilees.js --injecter <page.html>');
      process.exit(2);
    }
    var html = fs.readFileSync(cible, 'utf8'), n = 0;
    var re = /(<figure\b[^>]*\bdata-graphe-empile\b[^>]*>)([\s\S]*?)(<\/figure>)/g;
    html = html.replace(re, function (m, ouv, corps, clo) {
      var fid = /\bid="([^"]+)"/.exec(ouv);
      var j = /<script type="application\/json" class="graphe-donnees">([\s\S]*?)<\/script>/.exec(corps);
      if (!j || !fid) return m;
      var sans = corps.replace(new RegExp('\\s*' + DEB + '[\\s\\S]*?' + FIN), '');
      n++;
      return ouv + sans.replace(/\s+$/, '') + '\n  ' + assembler(rendre(JSON.parse(j[1]), fid[1])) + '\n' + clo;
    });
    fs.writeFileSync(cible, html);
    console.log('graphes rendus : ' + n);
  }
})(typeof window !== 'undefined' ? window : globalThis);
