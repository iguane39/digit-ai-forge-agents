/* Digit-AI — Onglets accessibles (TF-0425, lot Produit-05 20260820a, 21/08).
   Contrat de marquage :
     <div class="tabs" data-tabs>
       <div role="tablist" aria-label="…">
         <button role="tab" id="tab-a" aria-controls="panel-a" aria-selected="true">A</button>
         <button role="tab" id="tab-b" aria-controls="panel-b" aria-selected="false" tabindex="-1">B</button>
       </div>
       <section role="tabpanel" id="panel-a" aria-labelledby="tab-a">…</section>
       <section role="tabpanel" id="panel-b" aria-labelledby="tab-b" hidden>…</section>
     </div>
   Comportement : fleches gauche/droite (cycle), Home/End, clic ; #hash qui vise un panneau OU
   un element a l'interieur d'un panneau ouvre l'onglet (liens de sommaire inter-onglets) ; a
   l'impression, TOUS les panneaux sont visibles (regle @media print du livrable — L16 la juge).
   Viewer-only : sans JS (export WeasyPrint), la regle print affiche tout. */
(function (root) {
  'use strict';

  function init(conteneur) {
    if (!conteneur || conteneur.getAttribute('data-tabs-ready') === '1') return null;
    var liste = conteneur.querySelector('[role="tablist"]');
    if (!liste) return null;
    var onglets = Array.prototype.slice.call(liste.querySelectorAll('[role="tab"]'));
    if (!onglets.length) return null;

    function panneauDe(tab) { return document.getElementById(tab.getAttribute('aria-controls') || ''); }

    function activer(tab, focus) {
      onglets.forEach(function (t) {
        var actif = t === tab;
        t.setAttribute('aria-selected', actif ? 'true' : 'false');
        t.setAttribute('tabindex', actif ? '0' : '-1');
        var p = panneauDe(t);
        if (p) p.hidden = !actif;
      });
      if (focus) tab.focus();
      if (tab.id && history.replaceState) history.replaceState(null, '', '#' + (panneauDe(tab) || tab).id);
    }

    onglets.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activer(tab, false); });
      tab.addEventListener('keydown', function (ev) {
        var j = null;
        if (ev.key === 'ArrowRight') j = (i + 1) % onglets.length;
        else if (ev.key === 'ArrowLeft') j = (i - 1 + onglets.length) % onglets.length;
        else if (ev.key === 'Home') j = 0;
        else if (ev.key === 'End') j = onglets.length - 1;
        if (j === null) return;
        ev.preventDefault();
        activer(onglets[j], true);
      });
    });

    /* Un #hash ouvre le bon onglet : cible = un panneau, ou un element dans un panneau. */
    function ouvrirDepuisHash() {
      var h = location.hash ? location.hash.slice(1) : '';
      if (!h) return false;
      var cible = document.getElementById(h);
      if (!cible) return false;
      var panneau = cible.closest ? cible.closest('[role="tabpanel"]') : null;
      if (!panneau || !conteneur.contains(panneau)) return false;
      var tab = onglets.filter(function (t) { return panneauDe(t) === panneau; })[0];
      if (!tab) return false;
      activer(tab, false);
      if (cible !== panneau && cible.scrollIntoView) cible.scrollIntoView();
      return true;
    }
    window.addEventListener('hashchange', ouvrirDepuisHash);

    var initial = onglets.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || onglets[0];
    activer(initial, false);
    ouvrirDepuisHash();
    conteneur.setAttribute('data-tabs-ready', '1');
    return { activer: activer, onglets: onglets };
  }

  function initAll(racine) {
    var scope = racine || document;
    return Array.prototype.map.call(scope.querySelectorAll('[data-tabs]'), init);
  }

  root.DigitAITabs = { init: init, initAll: initAll };
})(typeof window !== 'undefined' ? window : this);
