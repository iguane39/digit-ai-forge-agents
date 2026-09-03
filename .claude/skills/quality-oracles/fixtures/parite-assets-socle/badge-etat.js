/* Digit-AI (jeu d'essai) — Badge d'etat pose sur une ligne de tableau.
   Composant INVENTE, qui n'existe que pour prouver l'oracle de parite : aucune page reelle
   ne le charge. Deux fixtures l'embarquent, l'une a la parite et l'autre derivee. */
(function (root) {
  'use strict';
  var LIBELLES = { ok: 'conforme', ko: 'a reprendre', na: 'non juge' };
  function poser(tr, etat) {
    var span = document.createElement('span');
    span.className = 'badge-etat badge-' + etat;
    span.textContent = LIBELLES[etat] || LIBELLES.na;
    tr.appendChild(span);
    return span;
  }
  root.DigitAIBadgeEtat = { poser: poser, LIBELLES: LIBELLES };
})(typeof window !== 'undefined' ? window : this);
