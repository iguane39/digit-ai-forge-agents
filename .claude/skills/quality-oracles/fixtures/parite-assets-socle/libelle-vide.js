/* Digit-AI (jeu d'essai) — Libelle d'etat vide d'une liste filtree.
   Composant INVENTE, troisieme temoin du jeu d'essai : il ne sert qu'a exercer la regle
   d'EXEMPTION (P4), datee et motivee du cote vert, muette du cote rouge. */
(function (root) {
  'use strict';
  var TEXTE = 'Aucune ligne ne correspond aux filtres.';
  function poser(hote) { hote.textContent = TEXTE; return hote; }
  root.DigitAILibelleVide = { poser: poser, TEXTE: TEXTE };
})(typeof window !== 'undefined' ? window : this);
