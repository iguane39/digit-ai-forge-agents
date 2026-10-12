/* find-in-page.js — Recherche dans un conteneur + compteur d'occurrences · socle Digit-AI
 *
 * Surligne les correspondances (<mark class="find-hit">) dans un conteneur et affiche
 * un compteur d'occurrences mis à jour à chaque frappe. Insensible aux accents.
 *
 * ⚠️ La classe du surlignage est `find-hit`, JAMAIS `find`. `find` est le nom que prend
 * naturellement le conteneur du champ de recherche dans un livrable ; quand les deux
 * partagent la classe, une règle `.find { display: flex }` écrite pour le conteneur
 * s'applique aussi au <mark> et casse le mot surligné (défaut mesuré en production :
 * le « s » de « clics » rejeté à 606 px du mot). Les trois classes du composant sont
 * disjointes : `find-hit` (surlignage), `find-count` (compteur), et ce que le livrable
 * veut pour son conteneur.
 *
 * ⚠️ Viewer-only : le JS ne s'exécute pas à l'export PDF (WeasyPrint). Si le livrable
 * vise aussi le PDF, prévoir un équivalent statique de l'information.
 *
 * ⚠️ LE CONTENEUR N'EST JAMAIS RÉÉCRIT (TF-1340, 23/09/2026). La recherche réaffectait
 * `container.innerHTML` à chaque frappe : les attributs survivaient, les écouteurs posés par
 * les autres composants du socle (table-filters.js, table-detail.js, infobulle.js) non. Mesuré
 * au navigateur : après une recherche puis son effacement, un bouton de filtre n'ouvrait plus
 * son panneau (0 au lieu de 1). Le surlignage ENVELOPPE désormais les nœuds texte trouvés, et
 * la frappe suivante les DÉSENVELOPPE : aucun élément du conteneur n'est remplacé. `getHTML`
 * et `refresh()` ne sont plus nécessaires (la recherche lit le contenu vivant) ; ils restent
 * acceptés, sans effet, pour les pages déjà câblées.
 *
 * ⚠️ DANS UN SCHÉMA SVG, LE SURLIGNAGE EST UN <tspan> (TF-1353, 24/09/2026). SVG ne peint pas
 * un <mark> HTML : le mot trouvé DISPARAISSAIT du schéma pendant la recherche (mesuré le 24/09
 * dans Chromium : getNumberOfChars() de 93 à 87 ; rejoué sur la fixture du banc : de 74 à 67).
 * Un nœud texte dont le parent est dans l'espace de noms SVG reçoit un <tspan class="find-hit"> ;
 * le HTML d'un <foreignObject> garde son <mark>.
 *
 * Câblage minimal (RA-1, 13/08 : la balise FERMANTE de script est ÉCHAPPÉE en <\/script> dans
 * ce commentaire — cet asset s'inline (règle A1), et une fermante nue dans un commentaire
 * fermerait la balise hôte au milieu du fichier : composant tronqué, silencieusement).
 * TF-1062 (11/09) : ce commentaire l'écrivait lui-même EN CLAIR. Une copie inlinée à la main
 * était coupée ici, et le câblage ci-dessous devenait du vrai DOM — trois identifiants
 * dupliqués, que oracle-a11y a comptés à juste titre. Cette explication ne cite plus la
 * séquence ; self_test.py vérifie qu'aucun asset inlinable ne la porte :
 *   <input id="find" type="text" placeholder="Rechercher…">
 *   <div id="findCount" class="find-count" aria-live="polite"></div>
 *   <div id="content"> … contenu à fouiller … </div>
 *   <script src="find-in-page.js"><\/script>
 *   <script>
 *     DigitAIFindInPage.init(
 *       document.getElementById('find'),
 *       document.getElementById('content'),
 *       document.getElementById('findCount')
 *     );
 *   <\/script>
 *
 * CSS attendu (à adapter aux tokens du livrable) :
 *   mark.find-hit { background: #fde9c8; color: inherit; display: inline; padding: 0; margin: 0; }
 *   tspan.find-hit { fill: #9a3412; text-decoration: underline; }   (texte d'un schéma SVG)
 *   .find-count { margin-top: 4px; font-size: .72rem; color: var(--muted); min-height: 1em; }
 *   .find-count.zero { color: #c0392b; }
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Regex insensible aux accents et à la casse à partir d'une saisie libre.
  function buildRegex(q) {
    q = (q || '').trim();
    if (!q) return null;
    var map = { a: 'aàâäá', e: 'eéèêëế', i: 'iîïí', o: 'oôöó', u: 'uùûüú', c: 'cç', n: 'nñ', y: 'yÿ' };
    var pat = '';
    for (var i = 0; i < q.length; i++) {
      var ch = q[i], low = ch.toLowerCase();
      if (map[low]) pat += '[' + map[low] + map[low].toUpperCase() + ']';
      else if (/[a-z0-9]/i.test(ch)) pat += ch;
      else pat += '\\' + ch; // échappe les caractères spéciaux regex
    }
    try { return new RegExp(pat, 'gi'); } catch (e) { return null; }
  }

  // Le BLOC d'un nœud texte : l'ancêtre le plus proche qui n'est pas un élément EN LIGNE. Dans un
  // schéma SVG, le bloc est le <text> qui le porte (un <tspan> y est en ligne). Une phrase coupée
  // par une mise en gras, un code ou un lien reste ainsi UN texte à fouiller (TF-1342).
  function blocDe(el, root) {
    if (el.namespaceURI === SVG_NS) {
      var t = el.closest ? el.closest('text') : null;
      return t && root.contains(t) ? t : el;
    }
    var b = el;
    while (b !== root && b.parentNode && b.nodeType === 1) {
      var d = getComputedStyle(b).display;
      if (d !== 'inline' && d !== 'contents') break;
      b = b.parentNode;
    }
    return b;
  }

  // Surligne les correspondances dans root et renvoie le nombre d'occurrences. Enveloppe les
  // nœuds texte trouvés, sans remplacer aucun élément (TF-1340) ; dans un texte SVG, l'enveloppe
  // est un <tspan>, que SVG peint, et non un <mark>, qu'il ignore (TF-1353). Les noms d'éléments
  // se comparent sans casse : le <style> et le <script> d'un SVG s'écrivent en minuscules.
  //
  // TF-1342 (lot Produit-64 20260923b, RD-19) — LE MOTIF S'APPLIQUAIT NŒUD TEXTE PAR NŒUD TEXTE :
  // « application <strong>laissée arrêtée</strong> » figurait dans le texte de la page et restait
  // introuvable (3 occurrences dans le texte, 2 comptées, mesuré sur un livrable servi). Le motif
  // se cherche désormais dans le texte CONTINU d'un bloc (les nœuds texte consécutifs d'un même
  // paragraphe, cellule, bloc de code, titre…), puis chaque correspondance est posée par PLAGES sur
  // les nœuds qu'elle traverse : une occurrence à cheval sur trois nœuds donne trois enveloppes
  // et compte UNE fois.
  function highlight(root, re) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var groupes = [], courant = null, n;
    while ((n = walker.nextNode())) {
      var parent = n.parentNode;
      if (!parent || /^(MARK|SCRIPT|STYLE)$/i.test(parent.nodeName)
          || (parent.getAttribute && parent.getAttribute('class') === 'find-hit')) {
        courant = null;           // un nœud écarté coupe le texte continu
        continue;
      }
      var bloc = blocDe(parent, root);
      if (!courant || courant.bloc !== bloc) { courant = { bloc: bloc, noeuds: [] }; groupes.push(courant); }
      courant.noeuds.push(n);
    }
    var count = 0;
    for (var g = 0; g < groupes.length; g++) {
      var noeuds = groupes[g].noeuds, texte = '', debuts = [];
      for (var k = 0; k < noeuds.length; k++) { debuts.push(texte.length); texte += noeuds[k].nodeValue; }
      var plages = [], m;
      re.lastIndex = 0;
      while ((m = re.exec(texte))) {
        if (m[0].length) plages.push([m.index, m.index + m[0].length]);
        if (m.index === re.lastIndex) re.lastIndex++; // évite les boucles sur match vide
      }
      if (!plages.length) continue;
      count += plages.length;
      for (var j = 0; j < noeuds.length; j++) {
        var tn = noeuds[j], txt = tn.nodeValue, d0 = debuts[j], d1 = d0 + txt.length;
        var morceaux = [];
        for (var p = 0; p < plages.length; p++) {
          var a = Math.max(plages[p][0], d0), b = Math.min(plages[p][1], d1);
          if (a < b) morceaux.push([a - d0, b - d0]);
        }
        if (!morceaux.length) continue;
        var svg = tn.parentNode.namespaceURI === SVG_NS;
        var frag = document.createDocumentFragment(), last = 0;
        for (var q = 0; q < morceaux.length; q++) {
          if (morceaux[q][0] > last) frag.appendChild(document.createTextNode(txt.slice(last, morceaux[q][0])));
          var mk = svg ? document.createElementNS(SVG_NS, 'tspan') : document.createElement('mark');
          mk.setAttribute('class', 'find-hit');   // jamais 'find' : cf. avertissement en tête de fichier
          mk.textContent = txt.slice(morceaux[q][0], morceaux[q][1]);
          frag.appendChild(mk);
          last = morceaux[q][1];
        }
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      }
    }
    return count;
  }

  // Retire le surlignage : chaque enveloppe redevient son texte, et les textes voisins se
  // RECOLLENT (normalize) — sans quoi un terme à cheval sur une ancienne coupure ne serait plus
  // trouvé à la frappe suivante. Seuls les nœuds texte bougent : les éléments, et les écouteurs
  // que d'autres composants y ont posés, restent en place (TF-1340).
  function unhighlight(root) {
    var hits = root.querySelectorAll('mark.find-hit, tspan.find-hit');
    var parents = [];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i], p = h.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(h.textContent), h);
      if (parents.indexOf(p) === -1) parents.push(p);
    }
    for (var j = 0; j < parents.length; j++) parents[j].normalize();
  }

  /* Branche la recherche live sur un champ.
   * input, container, counter : éléments DOM (counter optionnel).
   * getHTML (optionnel) : n'est plus nécessaire depuis TF-1340 — la recherche lit le contenu
   *   VIVANT du conteneur, qui n'est jamais réécrit. Accepté, sans effet, pour les pages câblées.
   * Retourne { run, refresh } : run() relance la recherche ; refresh() est conservé, sans
   *   effet (il n'y a plus de HTML capturé à rafraîchir). */
  function init(input, container, counter, getHTML) {
    if (!input || !container) return null;
    function run() {
      unhighlight(container);
      var re = buildRegex(input.value);
      if (!re) {
        if (counter) { counter.textContent = ''; counter.classList.remove('zero'); }
        return;
      }
      var nb = highlight(container, re);
      if (counter) {
        counter.textContent = nb === 0 ? 'Aucune occurrence' : (nb + ' occurrence' + (nb > 1 ? 's' : ''));
        counter.classList.toggle('zero', nb === 0);
      }
    }
    input.addEventListener('input', run);
    return {
      run: run,
      refresh: function () {}
    };
  }

  global.DigitAIFindInPage = { init: init, buildRegex: buildRegex, highlight: highlight,
                               unhighlight: unhighlight };
})(window);
