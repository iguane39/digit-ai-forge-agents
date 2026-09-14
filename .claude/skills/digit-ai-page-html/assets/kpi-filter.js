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

  /* LES ATTRIBUTS DE MASQUAGE CONNUS DE CE COMPOSANT — et rien de plus (TF-0953, 08/09/2026).
     Cette liste etait la DEFINITION de la visibilite d'une ligne : `tr.hidden` s'y calculait
     entierement, donc tout mecanisme absent de la liste etait ecrase sans avertissement. Un
     produit qui avait besoin d'un pliage d'arbre a du poser un MutationObserver sur `hidden`
     pour reappliquer son pliage apres chaque passage des filtres. La liste reste, mais elle
     n'est plus la definition : elle est ce que CE composant DECLARE a l'arbitrage partage
     (assets/visibilite-lignes.js), qui calcule la disjonction de TOUS les attributs declares,
     a un seul endroit. Ajouter un mecanisme n'oblige plus a modifier ce fichier. */
  var MIENS = ['data-kpi-cache', 'data-rech-cache', 'data-sev-cache', 'data-axe-cache'];

  function arbitrage() {
    return root.DigitAIRowVisibility || null;
  }

  function majVisibilite(tr) {
    var V = arbitrage();
    if (V) { V.apply(tr); return; }
    /* REPLI : l'arbitrage n'est pas charge sur cette page. Le composant retrouve alors son
       comportement d'avant — un composant du socle ne cesse pas de fonctionner parce qu'un
       autre fichier manque. */
    tr.hidden = MIENS.some(function (a) { return tr.hasAttribute(a); });
    if (tr.hidden) {
      var d = tr.nextElementSibling;
      if (d && d.hasAttribute('data-detail')) d.hidden = true;
    }
  }

  function init(scope) {
    scope = scope || document;
    var kpis = Array.prototype.slice.call(scope.querySelectorAll('button[data-kpi-filtre]'));
    if (!kpis.length) return null;
    /* DECLARER SES ATTRIBUTS, jamais deviner ceux des autres : c'est tout le contrat. */
    var V = arbitrage();
    if (V) { MIENS.forEach(function (a) { V.register(a); }); }
    /* TF-0970 (08/09) — UNE CARTE ACTIVE PAR TABLEAU, jamais une pour la page. `actif` etait
       unique : l'attribut et la valeur de la carte active s'appliquaient a TOUS les tableaux du
       perimetre. Mesure sur une page livree : un clic sur une carte du mapping faisait passer les
       mesures DAX de 160 lignes a 0, sans un mot. Une carte ne filtre QUE le tableau qu'elle
       designe (data-kpi-table) ; init(document) redevient sur. */
    var actifs = {};

    function lignesDe(kpi) {
      var t = document.getElementById(kpi.getAttribute('data-kpi-table') || '');
      if (!t || !t.tBodies || !t.tBodies[0]) return [];
      return Array.prototype.slice.call(t.tBodies[0].rows).filter(function (tr) {
        return !tr.hasAttribute('data-detail');
      });
    }

    function appliquer() {
      kpis.forEach(function (k) {
        k.setAttribute('aria-pressed', actifs[k.getAttribute('data-kpi-table')] === k ? 'true' : 'false');
      });
      var vues = {};
      kpis.forEach(function (k) { vues[k.getAttribute('data-kpi-table')] = k; });
      Object.keys(vues).forEach(function (idTable) {
        var actif = actifs[idTable] || null;
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
        var idTable = k.getAttribute('data-kpi-table');
        actifs[idTable] = (actifs[idTable] === k) ? null : k;
        appliquer();
      });
    });
    return { appliquer: appliquer, reinitialiser: function () { actifs = {}; appliquer(); } };
  }

  root.DigitAIKpiFilter = { init: init };
})(typeof window !== 'undefined' ? window : this);
