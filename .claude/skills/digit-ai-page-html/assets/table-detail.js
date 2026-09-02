/* Digit-AI — Ligne de tableau depliable (TF-0432, lot Produit-05 20260820b, 21/08).
   La convention data-detail existait cote CONSOMMATEUR (table-filters exclut tr[data-detail]
   du comptage et la fait voyager avec sa ligne mere) ; ce composant la PRODUIT.
   Contrat de marquage :
     <tr><td><button type="button" class="td-btn" aria-expanded="false" aria-controls="det-1">›</button> Libelle</td>…</tr>
     <tr data-detail id="det-1" hidden><td colspan="N">… detail …</td></tr>
   Comportement : clic = bascule aria-expanded + hidden ; a l'impression TOUTES les lignes de
   detail sont visibles (regle @media print du livrable — L17 la juge) ; un #hash qui vise un
   element dans une ligne de detail fermee l'ouvre ; le filtrage (table-filters) masque la ligne
   de detail avec sa ligne mere. Le chevron est U+203A, present dans toute pile de repli (TF-0435). */
(function (root) {
  'use strict';

  function detailDe(btn) { return document.getElementById(btn.getAttribute('aria-controls') || ''); }

  function basculer(btn, ouvrir) {
    var det = detailDe(btn);
    if (!det) return;
    var etat = typeof ouvrir === 'boolean' ? ouvrir : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', etat ? 'true' : 'false');
    det.hidden = !etat;
    var mere = btn.closest ? btn.closest('tr') : null;
    if (mere) mere.classList.toggle('td-ouverte', etat);
  }

  function init(table) {
    if (!table || table.getAttribute('data-td-ready') === '1') return null;
    var boutons = Array.prototype.slice.call(table.querySelectorAll('button[aria-controls]')).filter(function (b) {
      var d = detailDe(b);
      return d && d.hasAttribute('data-detail');
    });
    if (!boutons.length) return null;
    boutons.forEach(function (b) {
      if (!b.classList.contains('td-btn')) b.classList.add('td-btn');
      if (!b.textContent.trim()) b.textContent = '›';
      b.addEventListener('click', function () { basculer(b); });
      var det = detailDe(b);
      det.hidden = b.getAttribute('aria-expanded') !== 'true';
    });

    function ouvrirDepuisHash() {
      var h = location.hash ? location.hash.slice(1) : '';
      if (!h) return;
      var cible = document.getElementById(h);
      if (!cible) return;
      var det = cible.closest ? cible.closest('tr[data-detail]') : null;
      if (!det || !table.contains(det)) return;
      var b = boutons.filter(function (x) { return detailDe(x) === det; })[0];
      if (b) { basculer(b, true); if (cible.scrollIntoView) cible.scrollIntoView(); }
    }
    window.addEventListener('hashchange', ouvrirDepuisHash);
    ouvrirDepuisHash();

    table.setAttribute('data-td-ready', '1');
    return { ouvrirTout: function () { boutons.forEach(function (b) { basculer(b, true); }); },
             fermerTout: function () { boutons.forEach(function (b) { basculer(b, false); }); } };
  }

  function initAll(racine) {
    var scope = racine || document;
    return Array.prototype.map.call(scope.querySelectorAll('table'), init).filter(Boolean);
  }

  root.DigitAITableDetail = { init: init, initAll: initAll };
})(typeof window !== 'undefined' ? window : this);
