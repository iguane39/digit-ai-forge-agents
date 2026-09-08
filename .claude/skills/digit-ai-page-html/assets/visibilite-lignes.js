/* Digit-AI — ARBITRAGE PARTAGE de la visibilite d'une ligne de tableau (TF-0953, 08/09/2026).

   LE FAIT PAYE. Deux composants du socle calculaient chacun, pour leur compte, si une ligne
   devait etre vue : `kpi-filter.js` posait `tr.hidden` depuis SA liste d'attributs, en dur ;
   `table-filters.js` forcait `style.display` sur toutes les lignes qui passent son filtre.
   Aucun des deux ne laissait de place a un TROISIEME mecanisme. Un produit qui avait besoin d'un
   pliage d'arbre n'a eu d'autre issue qu'un MutationObserver sur `hidden`, pour reappliquer son
   pliage apres chaque passage des filtres — et deplier tout l'arbre a chaque changement de
   filtre, pour ne jamais cacher un resultat. Deux contournements qui ne devraient pas exister.

   LA LOI, ET ELLE TIENT EN UNE PHRASE : la visibilite d'une ligne est une DISJONCTION, et elle
   se calcule A UN SEUL ENDROIT. Chaque mecanisme DECLARE l'attribut par lequel il masque ; il ne
   connait plus ceux des autres, et il n'a plus a les connaitre. Ajouter un mecanisme cesse
   d'etre une modification des composants existants.

   CONTRAT :
     DigitAIRowVisibility.register('data-arbre-cache')  — declare un attribut de masquage
     DigitAIRowVisibility.attributs()                   — la liste, dans l'ordre d'inscription
     DigitAIRowVisibility.masquee(tr, sauf)             — un attribut declare masque-t-il ?
                                                          `sauf` exclut le sien de la question
     DigitAIRowVisibility.apply(tr)                     — `tr.hidden` = disjonction de TOUS
     DigitAIRowVisibility.masquer(tr, attr)             — pose l'attribut PUIS arbitre
     DigitAIRowVisibility.demasquer(tr, attr)           — retire l'attribut PUIS arbitre

   AUCUN ATTRIBUT N'EST INSCRIT D'AVANCE, et c'est deliberé : une liste par defaut ferait
   exactement ce que ce module existe pour supprimer — un composant qui decide pour les autres.
   Un mecanisme absent de la page n'inscrit rien, donc ne masque rien.

   `apply` ne POSE jamais `display: none` : masquer par le style reste l'affaire du composant qui
   le fait. Il RETIRE en revanche celui que plus aucun attribut declare ne justifie — sans quoi
   la disjonction pourrait etre fausse (« cette ligne n'est masquee par personne ») et la ligne
   rester invisible, tenue par un `display` en ligne que personne ne rejoue. Voir TF-0952.

   La ligne de DETAIL (`tr[data-detail]`) suit sa ligne mere : masquee avec elle, jamais seule.
   C'est la regle que les deux composants tenaient deja chacun de son cote.

   Viewer-only : au print, la regle du livrable reaffiche `tr[hidden]` — inchange. */
(function (root) {
  'use strict';

  var attributs = [];

  function register(attr) {
    if (typeof attr !== 'string' || !attr) { return attributs.slice(); }
    if (attributs.indexOf(attr) === -1) { attributs.push(attr); }
    return attributs.slice();
  }

  function masquee(tr, sauf) {
    if (!tr || !tr.hasAttribute) { return false; }
    for (var i = 0; i < attributs.length; i++) {
      if (attributs[i] === sauf) { continue; }
      if (tr.hasAttribute(attributs[i])) { return true; }
    }
    return false;
  }

  function apply(tr) {
    if (!tr || !tr.hasAttribute) { return false; }
    var cache = masquee(tr);
    tr.hidden = cache;
    /* L'ARBITRAGE NE POSE JAMAIS `display: none` — mais il RETIRE celui que plus aucun attribut
       declare ne justifie (TF-0952, 08/09/2026). Le cas s'est presente des le premier composant
       branche : le composant de filtres pose `display: none` sur les lignes qu'il masque ; quand
       un AUTRE mecanisme les demasque plus tard (un arbre qu'on deplie), `hidden` repasse a faux
       et la ligne reste invisible, tenue par un `display` en ligne que personne ne rejoue.
       Mesure : 3 lignes visibles sur 48 apres « tout deplier », au lieu de 48. Poser `none` reste
       l'affaire du composant qui masque ; le RETIRER quand plus rien ne le justifie est
       exactement le role d'un arbitrage — sans quoi la disjonction serait vraie et invisible. */
    if (cache) {
      var d = tr.nextElementSibling;
      if (d && d.hasAttribute('data-detail')) { d.hidden = true; }
    } else if (tr.style && tr.style.display === 'none') {
      tr.style.display = '';
    }
    return cache;
  }

  function masquer(tr, attr) {
    if (tr && tr.setAttribute) { register(attr); tr.setAttribute(attr, ''); }
    return apply(tr);
  }

  function demasquer(tr, attr) {
    if (tr && tr.removeAttribute) { register(attr); tr.removeAttribute(attr); }
    return apply(tr);
  }

  root.DigitAIRowVisibility = {
    register: register,
    attributs: function () { return attributs.slice(); },
    masquee: masquee,
    apply: apply,
    masquer: masquer,
    demasquer: demasquer,
  };
}(typeof window !== 'undefined' ? window : this));
