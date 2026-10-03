/* tuiles-indicateurs.js — mini-courbe de tendance des tuiles d'indicateurs (RT-120, D-55 (a)
   du 03/10/2026). Le reste de la tuile est du HTML et du CSS ECRITS (valeur, ecart, comparaison) :
   ils doivent se lire sans script, a l'impression et en PDF. Ce fichier ne dessine que la
   tendance OPTIONNELLE, depuis un attribut de donnees :

     <article class="tuile" data-tendance="12,14,13,18,21,24" data-tendance-libelle="6 derniers mois">

   Il ajoute un <svg class="tuile-tendance" role="img"> dont l'aria-label dit le point de depart,
   le point d'arrivee et l'extremite haute : la courbe n'est jamais la seule porteuse du sens (le
   sens est dans l'ecart ecrit de la tuile). Idempotent. Aucune requete reseau. */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 120, H = 32, PAD = 3;

  function nombre(v) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v); }

  /* Points de la courbe pour une serie de valeurs, dans un viewBox W x H. */
  function points(valeurs) {
    var min = Math.min.apply(null, valeurs), max = Math.max.apply(null, valeurs);
    var etendue = max - min || 1;
    return valeurs.map(function (v, i) {
      var x = PAD + (W - 2 * PAD) * (valeurs.length === 1 ? 0.5 : i / (valeurs.length - 1));
      var y = H - PAD - (H - 2 * PAD) * (v - min) / etendue;
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
  }

  function dessiner(tuile) {
    if (tuile.querySelector('.tuile-tendance')) return;
    var brut = tuile.getAttribute('data-tendance');
    if (!brut) return;
    var valeurs = brut.split(',').map(function (s) { return parseFloat(s); }).filter(function (v) { return isFinite(v); });
    if (valeurs.length < 2) return;
    var pts = points(valeurs);
    var libelle = tuile.getAttribute('data-tendance-libelle') || 'tendance';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tuile-tendance');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Tendance (' + libelle + ') : de ' + nombre(valeurs[0]) + ' à ' +
      nombre(valeurs[valeurs.length - 1]) + ', maximum ' + nombre(Math.max.apply(null, valeurs)));
    var ligne = document.createElementNS(NS, 'polyline');
    ligne.setAttribute('class', 'tt-ligne');
    ligne.setAttribute('points', pts.map(function (p) { return p.join(','); }).join(' '));
    svg.appendChild(ligne);
    tuile.appendChild(svg);
  }

  function init(racine) {
    Array.prototype.forEach.call((racine || document).querySelectorAll('.tuile[data-tendance]'), dessiner);
  }

  root.DigitAITuiles = { init: init, points: points };
})(window);
