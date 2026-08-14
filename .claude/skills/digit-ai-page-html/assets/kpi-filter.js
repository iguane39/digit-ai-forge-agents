/* Digit-AI — KPI cliquables filtrant une liste (standard H3, delta n°6 — 14/08).
   Un KPI qui compte des éléments AFFICHÉS dans la page les filtre au clic ; re-clic = tout.
   Un KPI d'éléments hors page ne se branche PAS ici : il reste un div et dit où ils vivent.

   Contrat de marquage (le composant ne devine rien) :
     <button data-kpi-filtre data-kpi-table="id-de-table"
             data-kpi-attr="statut" data-kpi-valeur="candidat" aria-pressed="false">…</button>
   Chaque ligne filtrable de la table porte data-<attr>="…" (ex. data-statut="candidat").
   Composition : le masquage passe par data-kpi-cache ; les autres mécanismes (recherche,
   facettes D-12, sévérité) gardent leurs attributs propres — visibilité dérivée, personne
   n'écrase personne. Les lignes [data-detail] suivent leur ligne mère.
   Viewer-only : au print, la règle du livrable réaffiche tr[hidden]. */
(function (root) {
  'use strict';

  function majVisibilite(tr) {
    tr.hidden = tr.hasAttribute('data-kpi-cache') || tr.hasAttribute('data-rech-cache')
      || tr.hasAttribute('data-sev-cache') || tr.hasAttribute('data-axe-cache');
    if (tr.hidden) {
      var d = tr.nextElementSibling;
      if (d && d.hasAttribute('data-detail')) d.hidden = true;
    }
  }

  function init(scope) {
    scope = scope || document;
    var kpis = Array.prototype.slice.call(scope.querySelectorAll('button[data-kpi-filtre]'));
    if (!kpis.length) return null;
    var actif = null;

    function lignesDe(kpi) {
      var t = document.getElementById(kpi.getAttribute('data-kpi-table') || '');
      if (!t || !t.tBodies || !t.tBodies[0]) return [];
      return Array.prototype.slice.call(t.tBodies[0].rows).filter(function (tr) {
        return !tr.hasAttribute('data-detail');
      });
    }

    function appliquer() {
      kpis.forEach(function (k) {
        k.setAttribute('aria-pressed', k === actif ? 'true' : 'false');
      });
      var vues = {};
      kpis.forEach(function (k) { vues[k.getAttribute('data-kpi-table')] = k; });
      Object.keys(vues).forEach(function (idTable) {
        lignesDe(vues[idTable]).forEach(function (tr) {
          var ok = !actif
            || tr.getAttribute('data-' + actif.getAttribute('data-kpi-attr'))
               === actif.getAttribute('data-kpi-valeur');
          if (ok) { tr.removeAttribute('data-kpi-cache'); } else { tr.setAttribute('data-kpi-cache', ''); }
          majVisibilite(tr);
        });
      });
      /* compteurs éventuels (mêmes conventions que l'outillage du socle) */
      document.querySelectorAll('.outil-compte').forEach(function (c) {
        var bloc = c.closest('.bloc-tableau, [data-outille]');
        if (!bloc) return;
        var lignes = Array.prototype.slice.call(bloc.querySelectorAll('table tbody tr'))
          .filter(function (tr) { return !tr.hasAttribute('data-detail'); });
        var visibles = lignes.filter(function (tr) {
          return !tr.hidden && tr.style.display !== 'none';
        }).length;
        c.textContent = visibles + ' / ' + lignes.length + ' ligne(s) affichée(s)';
      });
    }

    kpis.forEach(function (k) {
      k.addEventListener('click', function () {
        actif = (actif === k) ? null : k;
        appliquer();
      });
    });
    return { appliquer: appliquer, reinitialiser: function () { actif = null; appliquer(); } };
  }

  root.DigitAIKpiFilter = { init: init };
})(typeof window !== 'undefined' ? window : this);
