/* Digit-AI — Filtres de colonne sur tableaux de données.
   Socle commun : voir references/composant-filtres-tableau.md (checklist G1-G9).
   Viewer-only : le JS ne s'exécute pas à l'export WeasyPrint, la regle @media print
   du livrable doit reafficher tr[data-tf-hidden].
   Lot Produit-05 20260820b (TF-0429/0430/0431, 21/08) : rappel apresFiltrage et instance
   enveloppable, etat vide avec « tout reafficher », panneau qui choisit son cote et
   neutralise le rognage de son conteneur defilant tant qu'il est ouvert.

   Lot Produit-02 20260902b/d (TF-0768/0769/0781/0782, 02/09) — L'ORDRE ET L'EXISTENCE.
   Quatre defauts d'une meme famille : le composant lisait le TEXTE RENDU la ou il fallait lire
   une VALEUR, et decidait de l'existence d'une facette la ou il ne devait decider que de sa
   forme. Une console de donnees livree a du rearmer son propre tri et relire ses cases dans le
   DOM pour compenser :
     · TF-0768 — `parseFloat` sur « 1 000 » vaut 1 : les separateurs de milliers fr-FR (espace,
       insecable, insecable etroite) arretent l'analyse au premier caractere non chiffre, et
       TOUTE page en francais triait faux, en silence. Le tri et l'ordre des facettes lisent
       desormais `data-v` / `data-sort` quand la cellule en porte, sinon le nombre se lit APRES
       retrait des espaces et des signes.
     · TF-0781 — `Object.keys(valeurs).sort()` rangeait les mois par ordre alphabetique
       (« aout 2025, avr. 2026, dec. 2025 »). Une facette s'ordonne sur sa CLE, donc
       chronologiquement des que la cellule porte un `data-v` ISO.
     · TF-0782 — l'heuristique `1 < n < lignes` privait de facette la colonne CLE (huit marches
       distincts sur huit lignes : aucun filtre la ou le lecteur en attendait un). La
       cardinalite decide desormais de la FORME du panneau, jamais de son EXISTENCE ; la seule
       sortie est une exemption DECLAREE (`data-filter-col="off"` + `data-filter-reason`).
     · TF-0769 — `data-tf-ready` bloquait tout second `init` en rendant `null`, et la selection
       vivait dans une fermeture inaccessible : une page qui re-rend ses tableaux perdait ses
       filtres et devait les relire dans le DOM. L'etat est desormais LISIBLE et REJOUABLE —
       `api.etat()`, `init(table, { etat })`, `api.rafraichir()`. */
(function (root) {
  'use strict';

  var SEUIL_LIGNES = 8;
  /* Au-dela de ce nombre de valeurs distinctes, la liste de cases n'est plus parcourable a
     l'oeil : le panneau s'ouvre SUR SA RECHERCHE et le dit. C'est la FORME qui change — la
     facette, elle, existe toujours (TF-0782). */
  var SEUIL_RECHERCHE = 15;
  var LIBELLE_VIDE = 'Aucune ligne ne correspond aux filtres.';
  var LIBELLE_TOUT = 'Tout réafficher';

  /* Les espaces qui separent les milliers en fr-FR : espace, insecable (U+00A0), insecable
     etroite (U+202F), fine (U+2009), figure (U+2007). parseFloat s'arrete au premier. */
  var RE_ESPACES = /\s/g;   /* \s couvre l'insecable U+00A0 et l'insecable etroite U+202F */
  var RE_SIGNES = /[%€$£]/g;
  var RE_NOMBRE = /^[+-]?\d+(?:[.,]\d+)?$/;

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /* TF-0768 : un nombre affiche a un habillage (milliers, unite, pourcentage). On le retire
     AVANT l'analyse, et on n'accepte que ce qui est ENTIEREMENT numerique — « 12 mars » n'est
     pas 12, et le laisser passer trierait une colonne de dates comme une colonne de nombres. */
  function nombre(v) {
    var s = String(v == null ? '' : v).replace(RE_ESPACES, '').replace(RE_SIGNES, '');
    if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
    return RE_NOMBRE.test(s) ? parseFloat(s) : NaN;
  }

  function corps(table) {
    var tb = table.tBodies && table.tBodies[0];
    /* TF-0175 : une ligne [data-detail] est le DÉPLIANT pleine largeur de la ligne qui la
       précède — elle ne porte pas de données de colonnes et ne compte ni ne se filtre.
       TF-0430 : la ligne d'état vide [data-tf-empty] est un message du composant, pas une donnée. */
    return tb ? Array.prototype.slice.call(tb.rows).filter(function (tr) {
      return !tr.hasAttribute('data-detail') && !tr.hasAttribute('data-tf-empty');
    }) : [];
  }

  /* Le LIBELLE d'une cellule : ce que le lecteur voit, et ce qu'il coche. */
  function valeur(tr, i) {
    var td = tr.cells[i];
    return td ? td.textContent.trim() : '';
  }

  /* La CLE D'ORDRE d'une cellule (TF-0768/0781) : `data-v`, sinon `data-sort`, sinon le texte
     rendu. C'est la seule facon de dire « aout 2025 se range avant avr. 2026 » — un libelle de
     mois n'a aucun ordre lisible, et une valeur formatee n'a pas d'ordre numerique. */
  function cle(tr, i) {
    var td = tr.cells[i];
    if (!td) return '';
    var d = td.getAttribute('data-v');
    if (d === null) d = td.getAttribute('data-sort');
    return d === null ? td.textContent.trim() : String(d).trim();
  }

  /* Comparateur unique du composant — tri de lignes ET ordre des valeurs de facette.
     Deux nombres se comparent en nombres ; une date ISO (`2025-08`, `2025-08-14`) se compare en
     texte, ce qui EST son ordre chronologique ; le vide passe en fin de liste. */
  function comparer(a, b) {
    var na = nombre(a), nb = nombre(b);
    if (!isNaN(na) && !isNaN(nb)) return na < nb ? -1 : (na > nb ? 1 : 0);
    if (a === '') return b === '' ? 0 : 1;
    if (b === '') return -1;
    var xa = norm(a), xb = norm(b);
    return xa < xb ? -1 : (xa > xb ? 1 : 0);
  }

  function nbColonnes(table) {
    var ths = table.tHead ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
    var n = 0;
    ths.forEach(function (th) { n += th.colSpan || 1; });
    if (!n) { var l = corps(table)[0]; n = l ? l.cells.length : 1; }
    return n;
  }

  /* TF-0782 — CHAQUE en-tete recoit sa facette. L'heuristique de cardinalite ne decide plus que
     de la FORME du panneau (`liste`, `recherche` quand les valeurs sont trop nombreuses pour
     etre parcourues, `unique` quand la colonne n'en porte qu'une). La seule sortie est une
     exemption DECLAREE sur le `<th>` : `data-filter-col="off"` + `data-filter-reason="…"`.
     Sans motif, l'exemption est rendue au journal (`api.exemptions`) et l'oracle la refuse. */
  function colonnes(table, lignes) {
    var ths = table.tHead ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
    var cols = [], exemptions = [];
    ths.forEach(function (th, i) {
      /* L'INTITULE SE FIGE AU PREMIER PASSAGE (TF-0769). Apres `init`, le `<th>` contient le
         declencheur ET le panneau : son `textContent` vaut alors « Statut›TousAucun livre en
         cours… ». Relire l'intitule apres coup donnait une AUTRE cle de colonne, et la
         selection conservee se retrouvait rangee sous un nom que plus personne ne demandait —
         le rafraichissement perdait les filtres qu'il devait sauver. `data-col` rend
         l'identite de la colonne stable, et lisible par un oracle. */
      var libelle = (th.getAttribute('data-col') || th.textContent || '').trim();
      if (!th.hasAttribute('data-col')) th.setAttribute('data-col', libelle);
      if (th.getAttribute('data-filter-col') === 'off') {
        exemptions.push({ colonne: libelle, index: i,
                          motif: (th.getAttribute('data-filter-reason') || '').trim() });
        return;
      }
      var ordres = {}, n = 0;
      lignes.forEach(function (tr) {
        var v = valeur(tr, i);
        if (!(v in ordres)) { ordres[v] = cle(tr, i); n++; }
      });
      var valeurs = Object.keys(ordres).sort(function (x, y) {
        return comparer(ordres[x], ordres[y]);
      });
      var forme = n <= 1 ? 'unique' : (n > SEUIL_RECHERCHE ? 'recherche' : 'liste');
      cols.push({ th: th, index: i, libelle: libelle, valeurs: valeurs,
                  ordres: ordres, forme: forme });
    });
    return { cols: cols, exemptions: exemptions };
  }

  function bouton(col, id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tf-btn';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', id);
    b.setAttribute('aria-label', 'Filtrer ' + col.libelle);
    b.textContent = '›';               /* chevron simple (TF-0435) : present dans toute pile de repli */
    return b;
  }

  function panneau(col, id) {
    var p = document.createElement('div');
    p.className = 'tf-panel';
    p.id = id;
    p.hidden = true;
    p.setAttribute('role', 'group');
    p.setAttribute('aria-label', 'Filtrer ' + col.libelle);
    /* La forme est LISIBLE dans le marquage : un oracle de rendu et un test d'interactions
       peuvent dire laquelle a ete choisie, et pourquoi (TF-0782). */
    p.setAttribute('data-tf-forme', col.forme);

    var rech = document.createElement('input');
    rech.type = 'search';
    rech.className = 'tf-search';
    rech.placeholder = 'Rechercher…';
    rech.setAttribute('aria-label', 'Rechercher une valeur');

    var actions = document.createElement('div');
    actions.className = 'tf-actions';
    var tous = document.createElement('button');
    tous.type = 'button'; tous.className = 'tf-all'; tous.textContent = 'Tous';
    var aucun = document.createElement('button');
    aucun.type = 'button'; aucun.className = 'tf-none'; aucun.textContent = 'Aucun';
    actions.appendChild(tous); actions.appendChild(aucun);

    var opts = document.createElement('div');
    opts.className = 'tf-opts';
    col.valeurs.forEach(function (v) {
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'tf-opt';
      cb.value = v;
      cb.checked = true;                    /* etat initial : tout coche, aucun filtre actif */
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + (v === '' ? '(vide)' : v)));
      opts.appendChild(lab);
    });

    p.appendChild(rech); p.appendChild(actions); p.appendChild(opts);
    /* Une forme qui change sans le dire est une affordance muette (loi n° 3) : le panneau
       ANNONCE pourquoi il s'ouvre sur sa recherche, ou pourquoi il n'offre qu'une valeur. */
    if (col.forme !== 'liste') {
      var note = document.createElement('p');
      note.className = 'tf-forme-note';
      note.textContent = col.forme === 'recherche'
        ? col.valeurs.length + ' valeurs distinctes — chercher puis « Tous ».'
        : 'Une seule valeur dans cette colonne.';
      p.insertBefore(note, opts);
    }
    return { panneau: p, recherche: rech, tous: tous, aucun: aucun, options: opts };
  }

  /* TF-0431 : le conteneur defilant le plus proche (overflow-x auto|scroll) rogne un panneau
     absolu et gagne un ascenseur horizontal des qu'il s'ouvre. Tant qu'un panneau est ouvert,
     son rognage est neutralise ; a la fermeture, l'etat inline d'origine est retabli. */
  function conteneurDefilant(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      var o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return p;
      p = p.parentElement;
    }
    return null;
  }

  /* RA-5 (14/08, revu TF-0768/0782 le 02/09) : le tri est ARME PAR DEFAUT — la règle L4 exige
     « filtre, tri et recherche », et une page qui arme le sien le declare (`{ tri: false }` ou
     `data-tf-tri="off"` sur la table). La cle de tri est celle de `cle()` : `data-v`/`data-sort`
     d'abord, sinon le texte, lu comme un nombre APRES retrait des espaces de milliers. Les clics
     sur .tf-btn/.tf-panel sont ignores, les lignes [data-detail] voyagent avec leur ligne mere.
     Rend une fonction de DESARMEMENT : sans elle, un second init empilerait ses ecouteurs. */
  function armerTri(table) {
    var ths = table.tHead ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
    corps(table).forEach(function (tr) {
      var d = tr.nextElementSibling;
      tr.__tfDetail = (d && d.hasAttribute('data-detail')) ? d : null;
    });
    var poses = [];
    ths.forEach(function (th, i) {
      if (th.getAttribute('data-sort-col') === 'off') return;
      if (!th.style.cursor) th.style.cursor = 'pointer';
      var handler = function (ev) {
        if (ev.target.closest && ev.target.closest('.tf-btn, .tf-panel')) return;
        var sens = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
        ths.forEach(function (t) {
          t.removeAttribute('aria-sort');
          var m = t.querySelector('.tf-tri'); if (m) m.remove();
        });
        th.setAttribute('aria-sort', sens === 1 ? 'ascending' : 'descending');
        var marque = document.createElement('span');
        marque.className = 'tf-tri';
        marque.textContent = sens === 1 ? ' ↑' : ' ↓';
        th.appendChild(marque);
        var tb = table.tBodies[0];
        var tris = corps(table).slice();
        tris.forEach(function (tr) {
          var d = tr.nextElementSibling;
          tr.__tfDetail = (d && d.hasAttribute('data-detail')) ? d : tr.__tfDetail;
        });
        tris.sort(function (a, b) { return comparer(cle(a, i), cle(b, i)) * sens; });
        tris.forEach(function (tr) {
          tb.appendChild(tr);
          if (tr.__tfDetail) tb.appendChild(tr.__tfDetail);
        });
      };
      th.addEventListener('click', handler);
      poses.push({ th: th, handler: handler });
    });
    return function desarmer() {
      poses.forEach(function (p) {
        p.th.removeEventListener('click', p.handler);
        var m = p.th.querySelector('.tf-tri'); if (m) m.remove();
        p.th.removeAttribute('aria-sort');
      });
    };
  }

  /* init(table, opts) — opts.tri (bool, defaut VRAI) · opts.etat (etat rendu par api.etat())
     · opts.reinit (bool) · opts.apresFiltrage(table, visibles, total) : rappel appele a la fin
     de CHAQUE filtrage, y compris ceux declenches par les cases, Tous/Aucun et la recherche
     (TF-0429 : avant, seul l'appel manuel a instance.appliquer etait observable, envelopper
     l'instance etait silencieusement sans effet). Les gestionnaires internes passent par
     api.appliquer : remplacer instance.appliquer est desormais honore.

     TF-0769 — un second appel n'est plus un NON-EVENEMENT : sans `etat` ni `reinit`, il rend
     l'instance deja construite (l'appelant peut donc la piloter sans l'avoir gardee) ; avec, il
     detruit l'ancienne et reconstruit. */
  function init(table, opts) {
    opts = opts || {};
    if (!table) return null;
    if (table.getAttribute('data-filterable') === 'off') return null;
    if (table.getAttribute('data-tf-ready') === '1') {
      var deja = table.__tfApi || null;
      if (!opts.etat && !opts.reinit) return deja;
      if (deja && deja.detruire) deja.detruire();
    }

    var lignes = corps(table);
    var scan = colonnes(table, lignes);
    var cols = scan.cols;
    if (!cols.length) return null;

    var id = table.id || ('tf-' + Math.random().toString(36).slice(2, 8));
    table.id = id;
    var compteur = document.querySelector('[data-tf-count-for="' + id + '"]');
    var etats = [];
    var api = {};
    var defilant = conteneurDefilant(table);
    var overflowOrigine = null;
    /* La selection vit HORS des fermetures de colonne (TF-0769) : elle survit a un
       rafraichissement, se lit par api.etat() et se rejoue par init(table, { etat }). */
    var selections = {};
    var desarmerTri = null;
    var surDocument = function (ev) { if (!table.contains(ev.target)) fermerTout(); };

    /* TF-0430 : etat vide — une ligne de message pleine largeur et la seule action utile a ce
       moment, « tout reafficher ». Libelle surchargeable par data-tf-vide sur la table. */
    function ligneVide() {
      var tb = table.tBodies[0];
      var tr = tb.querySelector('tr[data-tf-empty]');
      if (tr) return tr;
      tr = document.createElement('tr');
      tr.setAttribute('data-tf-empty', '');
      tr.className = 'tf-vide';
      var td = document.createElement('td');
      td.colSpan = nbColonnes(table);
      var msg = document.createElement('span');
      msg.className = 'tf-vide-msg';
      msg.textContent = table.getAttribute('data-tf-vide') || LIBELLE_VIDE;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tf-reset';
      b.textContent = LIBELLE_TOUT;
      b.addEventListener('click', function () { toutReafficher(); });
      td.appendChild(msg); td.appendChild(document.createTextNode(' ')); td.appendChild(b);
      tr.appendChild(td);
      tb.appendChild(tr);
      return tr;
    }

    function toutReafficher() {
      etats.forEach(function (e) {
        Object.keys(e.selection).forEach(function (k) { e.selection[k] = true; });
        var p = document.getElementById(e.bouton.getAttribute('aria-controls'));
        if (p) Array.prototype.forEach.call(p.querySelectorAll('.tf-opt'), function (cb) { cb.checked = true; });
      });
      api.appliquer();
    }

    function appliquer() {
      var visibles = 0;
      lignes.forEach(function (tr) {
        var ok = etats.every(function (e) {
          return e.selection[valeur(tr, e.col.index)] !== false;
        });
        if (ok) { tr.removeAttribute('data-tf-hidden'); tr.style.display = ''; visibles++; }
        else {
          tr.setAttribute('data-tf-hidden', ''); tr.style.display = 'none';
          /* la ligne de détail suit le sort de sa ligne mère : masquée ET repliée */
          var det = tr.nextElementSibling;
          if (det && det.hasAttribute('data-detail')) { det.hidden = true; }
        }
      });
      etats.forEach(function (e) {
        var actif = Object.keys(e.selection).some(function (k) { return !e.selection[k]; });
        e.bouton.classList.toggle('tf-on', actif);
      });
      if (compteur) {
        compteur.textContent = visibles + ' ligne' + (visibles > 1 ? 's' : '') +
          ' sur ' + lignes.length;
        compteur.classList.toggle('zero', visibles === 0);
      }
      var vide = table.tBodies[0].querySelector('tr[data-tf-empty]');
      if (visibles === 0 && lignes.length) { ligneVide().hidden = false; }
      else if (vide) { vide.hidden = true; }
      if (typeof opts.apresFiltrage === 'function') opts.apresFiltrage(table, visibles, lignes.length);
    }

    function placer(b, p) {
      /* TF-0431 : cote d'ouverture selon la place mesuree — a droite du bouton par defaut,
         aligne sur le bord droit quand le panneau sortirait de la fenetre ou du conteneur. */
      p.classList.remove('tf-droite');
      var limite = defilant ? defilant.getBoundingClientRect().right : (window.innerWidth || document.documentElement.clientWidth);
      var r = b.getBoundingClientRect();
      var largeur = p.offsetWidth || 240;
      if (r.left + largeur > limite - 8) p.classList.add('tf-droite');
      if (defilant && overflowOrigine === null) {
        overflowOrigine = defilant.style.overflow || '';
        defilant.setAttribute('data-tf-ouvert', '');
        defilant.style.overflow = 'visible';
      }
    }

    function retirerUI() {
      etats.forEach(function (e) {
        if (e.bouton && e.bouton.parentNode) e.bouton.parentNode.removeChild(e.bouton);
        var p = document.getElementById(e.bouton.getAttribute('aria-controls'));
        if (p && p.parentNode) p.parentNode.removeChild(p);
      });
      etats.length = 0;
    }

    function construireColonnes() {
      cols.forEach(function (col, k) {
        var pid = id + '-tf-' + k;
        var b = bouton(col, pid);
        var ui = panneau(col, pid);
        var selection = selections[col.libelle] || (selections[col.libelle] = {});
        /* une valeur neuve entre COCHEE (aucun filtre implicite) ; une valeur disparue du
           tableau sort de la selection, sinon elle masquerait des lignes sans etre visible. */
        col.valeurs.forEach(function (v) { if (!(v in selection)) selection[v] = true; });
        Object.keys(selection).forEach(function (v) {
          if (col.valeurs.indexOf(v) === -1) delete selection[v];
        });
        var etat = { col: col, bouton: b, selection: selection };
        etats.push(etat);

        col.th.style.position = col.th.style.position || 'relative';
        col.th.appendChild(b);
        col.th.appendChild(ui.panneau);
        Array.prototype.forEach.call(ui.options.querySelectorAll('.tf-opt'), function (cb) {
          cb.checked = selection[cb.value] !== false;
        });

        b.addEventListener('click', function () {
          var ouvert = b.getAttribute('aria-expanded') === 'true';
          fermerTout();
          if (!ouvert) {
            b.setAttribute('aria-expanded', 'true'); ui.panneau.hidden = false;
            placer(b, ui.panneau);
            ui.recherche.focus();
          }
        });

        ui.recherche.addEventListener('input', function () {
          var q = norm(ui.recherche.value);
          Array.prototype.forEach.call(ui.options.children, function (lab) {
            lab.hidden = q !== '' && norm(lab.textContent).indexOf(q) === -1;
          });
        });

        /* Tous / Aucun portent sur les valeurs actuellement visibles dans la liste. */
        function masse(valeurCible) {
          Array.prototype.forEach.call(ui.options.children, function (lab) {
            if (lab.hidden) return;
            var cb = lab.querySelector('.tf-opt');
            cb.checked = valeurCible;
            selection[cb.value] = valeurCible;
          });
          api.appliquer();
        }
        ui.tous.addEventListener('click', function () { masse(true); });
        ui.aucun.addEventListener('click', function () { masse(false); });

        ui.options.addEventListener('change', function (ev) {
          var cb = ev.target;
          if (!cb.classList.contains('tf-opt')) return;
          selection[cb.value] = cb.checked;
          api.appliquer();
        });

        ui.panneau.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') { fermerTout(); b.focus(); }
        });
      });
    }

    function fermerTout() {
      etats.forEach(function (e) {
        e.bouton.setAttribute('aria-expanded', 'false');
        var p = document.getElementById(e.bouton.getAttribute('aria-controls'));
        if (p) { p.hidden = true; p.classList.remove('tf-droite'); }
      });
      if (defilant && overflowOrigine !== null) {
        defilant.style.overflow = overflowOrigine;
        defilant.removeAttribute('data-tf-ouvert');
        overflowOrigine = null;
      }
    }

    if (opts.tri !== false && table.getAttribute('data-tf-tri') !== 'off') {
      desarmerTri = armerTri(table);
    }
    construireColonnes();
    document.addEventListener('click', surDocument);

    table.setAttribute('data-tf-ready', '1');
    table.__tfApi = api;
    api.table = table;
    api.appliquer = appliquer;
    api.fermerTout = fermerTout;
    api.toutReafficher = toutReafficher;
    api.exemptions = scan.exemptions;

    /* TF-0769 — L'ETAT SE LIT ET SE REJOUE. Il est nomme par LIBELLE de colonne, pas par
       index : une colonne peut se deplacer entre deux rendus, son intitule reste le meme.
       Ne sont listees que les valeurs EXCLUES — un etat vide veut dire « aucun filtre », ce
       qui reste vrai si le tableau gagne des valeurs entre deux rendus. */
    api.etat = function () {
      var out = { version: 1, colonnes: {} };
      etats.forEach(function (e) {
        var exclues = Object.keys(e.selection).filter(function (v) { return e.selection[v] === false; });
        if (exclues.length) out.colonnes[e.col.libelle] = { exclues: exclues };
      });
      return out;
    };

    api.restaurer = function (etat) {
      if (!etat || !etat.colonnes) return api;
      etats.forEach(function (e) {
        var voulu = etat.colonnes[e.col.libelle];
        var exclues = (voulu && voulu.exclues) || [];
        Object.keys(e.selection).forEach(function (v) {
          e.selection[v] = exclues.indexOf(v) === -1;
        });
        var p = document.getElementById(e.bouton.getAttribute('aria-controls'));
        if (p) Array.prototype.forEach.call(p.querySelectorAll('.tf-opt'), function (cb) {
          cb.checked = e.selection[cb.value] !== false;
        });
      });
      api.appliquer();
      return api;
    };

    /* La page a re-rendu son tableau : on relit ses lignes et ses valeurs, on retire les
       panneaux devenus faux et on reconstruit SUR LA SELECTION CONSERVEE. Sans cette
       fonction, la seule voie etait de relire les cases dans le DOM et de les rejouer par
       des evenements `change` — ce qu'une console livree a effectivement du ecrire. */
    api.rafraichir = function () {
      /* Les panneaux partent AVANT le re-balayage : sans cela, le scan relirait ses propres
         injections comme du contenu de colonne. */
      retirerUI();
      lignes = corps(table);
      var neuf = colonnes(table, lignes);
      cols = neuf.cols;
      api.exemptions = neuf.exemptions;
      construireColonnes();
      api.appliquer();
      return api;
    };

    api.detruire = function () {
      retirerUI();
      document.removeEventListener('click', surDocument);
      if (desarmerTri) { desarmerTri(); desarmerTri = null; }
      var vide = table.tBodies[0] && table.tBodies[0].querySelector('tr[data-tf-empty]');
      if (vide && vide.parentNode) vide.parentNode.removeChild(vide);
      lignes.forEach(function (tr) { tr.removeAttribute('data-tf-hidden'); tr.style.display = ''; });
      table.removeAttribute('data-tf-ready');
      try { delete table.__tfApi; } catch (e) { table.__tfApi = null; }
    };

    if (opts.etat) api.restaurer(opts.etat);
    else api.appliquer();
    return api;
  }

  function initAll(racine, opts) {
    var scope = racine || document;
    return Array.prototype.map.call(
      scope.querySelectorAll('table[data-filterable]'),
      function (t) { return init(t, opts); }
    );
  }

  root.DigitAITableFilters = { init: init, initAll: initAll, SEUIL_LIGNES: SEUIL_LIGNES,
                               SEUIL_RECHERCHE: SEUIL_RECHERCHE, nombre: nombre,
                               comparer: comparer };
})(typeof window !== 'undefined' ? window : this);
