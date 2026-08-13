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
 * Câblage minimal (RA-1, 13/08 : la séquence « </script » est ÉCHAPPÉE en <\/script> dans
 * ce commentaire — cet asset s'inline (règle A1), et un </script> nu dans un commentaire
 * fermerait la balise hôte au milieu du fichier : composant tronqué, silencieusement) :
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
 *   .find-count { margin-top: 4px; font-size: .72rem; color: var(--muted); min-height: 1em; }
 *   .find-count.zero { color: #c0392b; }
 */
(function (global) {
  'use strict';

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

  // Surligne les correspondances dans root et renvoie le nombre d'occurrences.
  function highlight(root, re) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n, count = 0;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var k = 0; k < nodes.length; k++) {
      var tn = nodes[k];
      if (tn.parentNode && /^(MARK|SCRIPT|STYLE)$/.test(tn.parentNode.nodeName)) continue;
      var txt = tn.nodeValue; re.lastIndex = 0;
      if (!re.test(txt)) continue; re.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = re.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        var mk = document.createElement('mark');
        mk.className = 'find-hit';   // jamais 'find' : cf. avertissement en tête de fichier
        mk.textContent = m[0];
        frag.appendChild(mk);
        count++;
        last = m.index + m[0].length;
        if (m.index === re.lastIndex) re.lastIndex++; // évite les boucles sur match vide
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    }
    return count;
  }

  /* Branche la recherche live sur un champ.
   * input, container, counter : éléments DOM (counter optionnel).
   * getHTML (optionnel) : fonction renvoyant le HTML pristine courant — à fournir
   *   quand le conteneur change de contenu (ex. panneau qui charge un autre document).
   *   Sinon, le HTML initial est capturé une fois à l'init.
   * Retourne { run, refresh } : run() relance la recherche, refresh() re-capture
   *   le HTML pristine (mode sans getHTML). */
  function init(input, container, counter, getHTML) {
    if (!input || !container) return null;
    var pristine = getHTML ? null : container.innerHTML;
    function run() {
      container.innerHTML = getHTML ? getHTML() : pristine;
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
      refresh: function () { if (!getHTML) pristine = container.innerHTML; }
    };
  }

  global.DigitAIFindInPage = { init: init, buildRegex: buildRegex, highlight: highlight };
})(window);
