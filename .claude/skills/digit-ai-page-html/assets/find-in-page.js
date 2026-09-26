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

  // Surligne les correspondances dans root et renvoie le nombre d'occurrences. Enveloppe les
  // nœuds texte trouvés, sans remplacer aucun élément (TF-1340) ; dans un texte SVG, l'enveloppe
  // est un <tspan>, que SVG peint, et non un <mark>, qu'il ignore (TF-1353). Les noms d'éléments
  // se comparent sans casse : le <style> et le <script> d'un SVG s'écrivent en minuscules.
  function highlight(root, re) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n, count = 0;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var k = 0; k < nodes.length; k++) {
      var tn = nodes[k], parent = tn.parentNode;
      if (!parent || /^(MARK|SCRIPT|STYLE)$/i.test(parent.nodeName)
          || (parent.getAttribute && parent.getAttribute('class') === 'find-hit')) continue;
      var txt = tn.nodeValue; re.lastIndex = 0;
      if (!re.test(txt)) continue; re.lastIndex = 0;
      var svg = parent.namespaceURI === SVG_NS;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = re.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        var mk = svg ? document.createElementNS(SVG_NS, 'tspan') : document.createElement('mark');
        mk.setAttribute('class', 'find-hit');   // jamais 'find' : cf. avertissement en tête de fichier
        mk.textContent = m[0];
        frag.appendChild(mk);
        count++;
        last = m.index + m[0].length;
        if (m.index === re.lastIndex) re.lastIndex++; // évite les boucles sur match vide
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      parent.replaceChild(frag, tn);
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
