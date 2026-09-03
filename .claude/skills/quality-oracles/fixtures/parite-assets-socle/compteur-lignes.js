/* Digit-AI (jeu d'essai) — Compteur de lignes visibles sous un tableau.
   Composant INVENTE, second temoin du jeu d'essai : la fixture verte le gele SOUS EXEMPTION
   datee et motivee, ce que l'oracle doit accepter en le DISANT au verdict. */
(function (root) {
  'use strict';
  function compter(table) {
    var n = 0, lignes = table.tBodies[0] ? table.tBodies[0].rows : [];
    for (var i = 0; i < lignes.length; i++) if (!lignes[i].hidden) n += 1;
    return n;
  }
  root.DigitAICompteurLignes = { compter: compter };
})(typeof window !== 'undefined' ? window : this);
