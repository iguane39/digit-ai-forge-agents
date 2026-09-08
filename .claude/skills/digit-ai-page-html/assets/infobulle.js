/* Digit-AI — Infobulle structuree (TF-0935, lot Produit-10 20260908d, 08/09).

   LE FAIT. Le socle ne connaissait que l'attribut `title` natif, et aucune regle ne jugeait sa
   LISIBILITE : sur un livrable servi, 3 153 cellules a `title`, 2 527 portant plusieurs objets,
   la plus longue SEPT objets en 700 caracteres d'un seul bloc — conforme a L3, illisible.
   Retour humain : « formatte tous les tooltips, puces et sous-puces ».

   LE CHOIX. Une seule source de verite : le `title` de la cible. Le composant le LIT et le rend
   en liste ; il ne demande aucun balisage supplementaire, et une page qui l'oublie garde
   l'infobulle native. La version qui dupliquait le contenu dans un attribut de donnees pesait
   2,06 Mo chez le produit contre 1,25 Mo par cette voie.

   CONTRAT D'ECRITURE DU `title` — une ligne par objet, une sous-precision par ligne indentee :

     Fait mensuel des lots
       grain : un lot par mois
       volume : 1,4 million de lignes
     Dimension des batiments
       grain : un batiment

   Un `title` d'une seule ligne reste un paragraphe : le composant ne fabrique pas de puces la
   ou l'auteur n'en a pas mis.

   COMPORTEMENT. Un seul noeud `#infobulle` (role=tooltip) pour toute la page, en position fixe,
   repositionne pour rester dans l'ecran. Pendant l'affichage, le `title` natif de la cible est
   RETIRE et memorise, pour que les deux infobulles ne se superposent pas ; il est RESTITUE des
   la fermeture — un `title` perdu serait un contenu perdu a l'impression et pour les
   technologies d'assistance. Fermeture : sortie du survol, perte du focus, defilement, Echap. */
(function (root) {
  'use strict';

  var MARGE = 12;          /* garde entre l'infobulle et le bord de la fenetre */
  var DECALAGE = 14;       /* distance a la cible */

  function noeud() {
    var n = document.getElementById('infobulle');
    if (n) return n;
    n = document.createElement('div');
    n.id = 'infobulle';
    n.setAttribute('role', 'tooltip');
    n.hidden = true;
    document.body.appendChild(n);
    return n;
  }

  /* Le `title` en arbre : profondeur d'indentation = niveau de puce. */
  function analyser(texte) {
    var lignes = String(texte || '').split(/\r?\n/);
    var items = [];
    for (var i = 0; i < lignes.length; i++) {
      var brute = lignes[i];
      if (!brute.replace(/\s+/g, '')) continue;
      var creux = brute.match(/^[\s ]*/)[0].length;
      var texteLigne = brute.replace(/^[\s ]*[-•·*]?\s*/, '').trim();
      if (!texteLigne) continue;
      if (creux > 0 && items.length) items[items.length - 1].sous.push(texteLigne);
      else items.push({ objet: texteLigne, sous: [] });
    }
    return items;
  }

  function rendre(cible, texte) {
    var n = noeud();
    var items = analyser(texte);
    while (n.firstChild) n.removeChild(n.firstChild);
    if (items.length < 2 && (!items[0] || !items[0].sous.length)) {
      var p = document.createElement('p');
      p.textContent = items.length ? items[0].objet : String(texte || '');
      n.appendChild(p);
    } else {
      var ul = document.createElement('ul');
      items.forEach(function (it) {
        var li = document.createElement('li');
        var s = document.createElement('span');
        s.className = 'ib-objet';
        s.textContent = it.objet;
        li.appendChild(s);
        if (it.sous.length) {
          var sous = document.createElement('ul');
          it.sous.forEach(function (t) {
            var sli = document.createElement('li');
            sli.textContent = t;
            sous.appendChild(sli);
          });
          li.appendChild(sous);
        }
        ul.appendChild(li);
      });
      n.appendChild(ul);
    }
    n.hidden = false;
    placer(n, cible);
    return n;
  }

  /* Toujours dans l'ecran : on tente sous la cible, on bascule au-dessus si ca deborde,
     et on rentre horizontalement les bords. */
  function placer(n, cible) {
    var r = cible.getBoundingClientRect();
    var b = n.getBoundingClientRect();
    var vh = window.innerHeight, vw = window.innerWidth;
    var haut = r.bottom + DECALAGE;
    if (haut + b.height > vh - MARGE) haut = Math.max(MARGE, r.top - DECALAGE - b.height);
    var gauche = r.left;
    if (gauche + b.width > vw - MARGE) gauche = vw - MARGE - b.width;
    if (gauche < MARGE) gauche = MARGE;
    n.style.top = Math.round(haut) + 'px';
    n.style.left = Math.round(gauche) + 'px';
  }

  var courante = null;     /* cible dont le `title` est actuellement retire */

  function ouvrir(cible) {
    var texte = cible.getAttribute('title');
    if (texte === null || !texte.trim()) return;
    fermer();
    courante = { el: cible, title: texte };
    cible.removeAttribute('title');     /* neutralise l'infobulle NATIVE pendant l'affichage */
    rendre(cible, texte);
  }

  function fermer() {
    var n = document.getElementById('infobulle');
    if (n) n.hidden = true;
    if (courante) {
      /* Restitution systematique : un `title` perdu est un contenu perdu a l'impression
         et pour les technologies d'assistance. */
      courante.el.setAttribute('title', courante.title);
      courante = null;
    }
  }

  function init(racine, selecteur) {
    var scope = racine || document;
    var sel = selecteur || '[title]';
    if (scope.getAttribute && scope.getAttribute('data-ib-ready') === '1') return null;
    function estCible(e) {
      var el = e.target && e.target.closest ? e.target.closest(sel) : null;
      return el && el.id !== 'infobulle' ? el : null;
    }
    scope.addEventListener('mouseover', function (e) {
      var el = estCible(e);
      if (el) ouvrir(el);
    });
    scope.addEventListener('mouseout', function (e) {
      var el = estCible(e);
      if (el && courante && el === courante.el) fermer();
    });
    scope.addEventListener('focusin', function (e) {
      var el = estCible(e);
      if (el) ouvrir(el);
    });
    scope.addEventListener('focusout', fermer);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) fermer();
    });
    if (scope.setAttribute) scope.setAttribute('data-ib-ready', '1');
    return { ouvrir: ouvrir, fermer: fermer, analyser: analyser };
  }

  root.DigitAIInfobulle = { init: init, ouvrir: ouvrir, fermer: fermer, analyser: analyser };
})(typeof window !== 'undefined' ? window : this);
