/* Digit-AI — TABLEAU ARBORESCENT : une hierarchie rendue en tableau se PLIE (TF-0952, 08/09/2026).

   LE FAIT PAYE, ET IL EST MESURE. Un livrable rendait deux hierarchies (schema > table > colonne)
   dans des tableaux. Les lignes portaient DEJA `data-niveau`, et l'indentation etait faite
   d'espaces insecables. Mesure a l'ouverture : 134 lignes visibles d'un coup sur la premiere
   hierarchie, 296 sur la seconde — aucun pliage, aucun compte d'enfants sur la ligne parente.
   Le destinataire a du citer un composant externe pour se faire comprendre. Le socle n'avait
   AUCUN composant de tableau arborescent : chaque livrable qui en avait besoin le reecrivait,
   ou renoncait. Apres pliage : 16 lignes visibles sur 134, 18 sur 296.

   CE QUE CE COMPOSANT NE FAIT PAS, et c'est deliberé : il ne DEVINE pas la hierarchie. Le
   marquage est le contrat, comme pour le composant de filtres :

     <table data-arbre>
       <tr data-cle="s1"        data-niveau="0">…</tr>
       <tr data-cle="s1.t1" data-parent="s1" data-niveau="1">…</tr>
       <tr data-cle="s1.t1.c1" data-parent="s1.t1" data-niveau="2">…</tr>

   `data-arbre="ouvert"` ouvre tout a l'arrivee ; par defaut, seul le premier niveau est visible —
   c'est tout l'interet, et une page qui veut l'inverse le DIT.

   IL NE S'ARROGE PAS `hidden`, ET C'EST LE POINT (TF-0953). Il masque par `data-arbre-cache` et
   passe par l'arbitrage partage `DigitAIRowVisibility` : la visibilite d'une ligne est la
   DISJONCTION des attributs declares par TOUS les mecanismes. Sans cet arbitrage, le pliage
   serait ecrase au premier passage d'un filtre — c'est exactement ce qui obligeait un produit a
   poser un MutationObserver sur `hidden`, puis a deplier tout l'arbre a chaque changement de
   filtre pour ne jamais cacher un resultat. Ici, filtre et pliage coexistent sans se connaitre.

   ACCORD AVEC LE COMPOSANT DE FILTRES : un parent dont TOUS les descendants sont exclus par un
   filtre n'a plus de raison d'etre deployable ; `rafraichir()` recompte et remet a jour les
   compteurs et les chevrons. Le composant de filtres n'a pas a connaitre l'arbre.

   Viewer-only : au print, la regle du livrable reaffiche `tr[hidden]` — un arbre replie a
   l'ecran s'imprime deplie, ce qui est le comportement voulu pour un document. */
(function (root) {
  'use strict';

  var ATTR = 'data-arbre-cache';
  var LIB_DEPLIER = 'Tout déplier';
  var LIB_REPLIER = 'Tout replier';

  function arbitrage() { return root.DigitAIRowVisibility || null; }

  function lignesDe(table) {
    if (!table.tBodies || !table.tBodies[0]) { return []; }
    return Array.prototype.slice.call(table.tBodies[0].rows).filter(function (tr) {
      return !tr.hasAttribute('data-detail');
    });
  }

  function init(table, opts) {
    opts = opts || {};
    if (!table) { return null; }
    if (table.getAttribute('data-arbre') === 'off') { return null; }
    var lignes = lignesDe(table);
    var parNiveau = lignes.filter(function (tr) { return tr.hasAttribute('data-niveau'); });
    if (parNiveau.length < 2) { return null; }

    var V = arbitrage();
    if (V) { V.register(ATTR); }

    var parCle = {};
    lignes.forEach(function (tr) {
      var c = tr.getAttribute('data-cle');
      if (c) { parCle[c] = tr; }
    });
    var enfantsDe = {};
    lignes.forEach(function (tr) {
      var p = tr.getAttribute('data-parent');
      if (!p) { return; }
      (enfantsDe[p] = enfantsDe[p] || []).push(tr);
    });

    /* Un descendant est masque si un ANCETRE est replie — pas seulement son parent direct :
       replier une racine doit emporter tout son sous-arbre, pas une seule generation. */
    var replies = {};

    function ancetreReplie(tr) {
      var p = tr.getAttribute('data-parent');
      var garde = 0;
      while (p && garde++ < 64) {
        if (replies[p]) { return true; }
        var pere = parCle[p];
        p = pere ? pere.getAttribute('data-parent') : null;
      }
      return false;
    }

    function compteDescendants(cle) {
      var n = 0, pile = (enfantsDe[cle] || []).slice(), garde = 0;
      while (pile.length && garde++ < 10000) {
        var tr = pile.pop();
        n += 1;
        var c = tr.getAttribute('data-cle');
        if (c && enfantsDe[c]) { pile = pile.concat(enfantsDe[c]); }
      }
      return n;
    }

    function masquerSelonArbre() {
      lignes.forEach(function (tr) {
        var cache = ancetreReplie(tr);
        if (V) {
          if (cache) { V.masquer(tr, ATTR); } else { V.demasquer(tr, ATTR); }
        } else {
          /* REPLI : sans arbitrage charge, le composant fait ce qu'il peut — et il le fait
             seul, donc un filtre pourra l'ecraser. C'est le defaut que TF-0953 corrige ; il
             vaut mieux qu'une page sans pliage du tout. */
          if (cache) { tr.setAttribute(ATTR, ''); tr.hidden = true; }
          else { tr.removeAttribute(ATTR); tr.hidden = false; }
        }
      });
    }

    function majChevrons() {
      lignes.forEach(function (tr) {
        var b = tr.querySelector('button[data-arbre-chevron]');
        if (!b) { return; }
        var cle = tr.getAttribute('data-cle');
        var ouvert = !replies[cle];
        b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
        b.setAttribute('aria-label', (ouvert ? 'Replier ' : 'Déplier ')
          + (tr.getAttribute('data-arbre-libelle') || cle));
        var c = tr.querySelector('[data-arbre-compte]');
        if (c) { c.textContent = String(compteDescendants(cle)); }
      });
    }

    function majCompteur() {
      if (!compteur) { return; }
      var vues = lignes.filter(function (tr) {
        return !tr.hidden && tr.style.display !== 'none';
      }).length;
      compteur.textContent = vues + ' / ' + lignes.length + ' ligne(s) affichée(s)';
    }

    function rafraichir() { masquerSelonArbre(); majChevrons(); majCompteur(); }

    function replierTout() {
      replies = {};
      lignes.forEach(function (tr) {
        var c = tr.getAttribute('data-cle');
        if (c && enfantsDe[c]) { replies[c] = true; }
      });
      rafraichir();
    }

    /* Le chevron se pose dans la PREMIERE cellule, devant son contenu : c'est la que le lecteur
       cherche l'affordance, et c'est la que l'indentation la place. */
    parNiveau.forEach(function (tr) {
      var cle = tr.getAttribute('data-cle');
      if (!cle || !enfantsDe[cle]) { return; }
      var cellule = tr.cells && tr.cells[0];
      if (!cellule || cellule.querySelector('button[data-arbre-chevron]')) { return; }
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-arbre-chevron', '');
      b.className = 'arbre-chevron';
      b.innerHTML = '<span class="arbre-glyphe" aria-hidden="true"></span>'
        + '<span class="arbre-compte" data-arbre-compte>0</span>';
      b.addEventListener('click', function () {
        if (replies[cle]) { delete replies[cle]; } else { replies[cle] = true; }
        rafraichir();
      });
      cellule.insertBefore(b, cellule.firstChild);
    });

    /* Les deux commandes globales et le compteur vivant. Une hierarchie de trois cents lignes
       sans « tout deplier » oblige a cliquer trente fois pour chercher un mot. */
    var barre = null, compteur = null;
    if (opts.commandes !== false) {
      barre = document.createElement('p');
      barre.className = 'arbre-commandes';
      var bd = document.createElement('button');
      bd.type = 'button'; bd.textContent = LIB_DEPLIER;
      bd.addEventListener('click', function () { replies = {}; rafraichir(); });
      var br = document.createElement('button');
      br.type = 'button'; br.textContent = LIB_REPLIER;
      br.addEventListener('click', function () { replierTout(); });
      compteur = document.createElement('span');
      compteur.className = 'arbre-compteur';
      compteur.setAttribute('aria-live', 'polite');
      barre.appendChild(bd); barre.appendChild(br); barre.appendChild(compteur);
      if (table.parentNode) { table.parentNode.insertBefore(barre, table); }
    }

    /* Etat d'arrivee : replie, sauf declaration contraire. C'est tout l'interet du composant —
       une page qui veut l'inverse le DIT (`data-arbre="ouvert"`). */
    if (table.getAttribute('data-arbre') !== 'ouvert') { replierTout(); } else { rafraichir(); }
    table.setAttribute('data-arbre-ready', '1');

    var api = {
      plier: function (cle) { replies[cle] = true; rafraichir(); },
      deplier: function (cle) { delete replies[cle]; rafraichir(); },
      plierTout: replierTout,
      deplierTout: function () { replies = {}; rafraichir(); },
      rafraichir: rafraichir,
      compteDescendants: compteDescendants,
      detruire: function () {
        replies = {};
        rafraichir();
        lignes.forEach(function (tr) {
          var b = tr.querySelector('button[data-arbre-chevron]');
          if (b && b.parentNode) { b.parentNode.removeChild(b); }
          tr.removeAttribute(ATTR);
          if (V) { V.apply(tr); }
        });
        if (barre && barre.parentNode) { barre.parentNode.removeChild(barre); }
        table.removeAttribute('data-arbre-ready');
      },
    };
    table.__arbreApi = api;
    return api;
  }

  function initAll(scope) {
    scope = scope || document;
    return Array.prototype.slice.call(scope.querySelectorAll('table[data-arbre]'))
      .map(function (t) { return init(t); })
      .filter(Boolean);
  }

  root.DigitAITableArbre = { init: init, initAll: initAll, ATTR: ATTR };
}(typeof window !== 'undefined' ? window : this));
