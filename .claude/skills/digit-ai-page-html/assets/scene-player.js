/* Digit-AI — Lecteur d'animation a scenes (TF-2300, RA-05 du lot digit-ai-marketing 20261109a, D-181).
   Extrait du lecteur ecrit pour la serie d'animations du 09/11/2026 (deux passes de juges pour atteindre PASS,
   31 espacements hors echelle corriges) : manifeste de scenes, lecture, pause, clavier, segments de progression,
   mouvement reduit, impression.

   Contrat de marquage :
     <div class="sp" data-scene-player role="region" aria-label="Animation en 3 scenes">
       <div class="sp-scenes">
         <section class="sp-scene" data-scene="0">…</section>
         <section class="sp-scene" data-scene="1" hidden>…</section>
         <section class="sp-scene" data-scene="2" hidden>…</section>
       </div>
       <div class="sp-commandes">
         <button type="button" class="sp-commande" data-commande="precedente">← Précédente</button>
         <button type="button" class="sp-commande sp-lecture" data-commande="lecture"><span class="sp-icone" aria-hidden="true"></span><span class="sp-libelle">Lecture</span></button>
         <button type="button" class="sp-commande" data-commande="suivante">Suivante →</button>
         <div class="sp-segments" aria-hidden="true"></div>   <!-- un segment par scene, ajoute par le lecteur -->
         <span class="sp-compteur" aria-hidden="true"></span>
       </div>
       <p class="sp-annonce sr-only" aria-live="polite"></p>
       <script type="application/json" data-scenes>[{"titre":"Lire","duree_ms":6000}, …]   (bloc JSON a fermer comme tout script)
     </div>
     <nav><button type="button" data-aller="1">Scène 2</button>…</nav>      (sommaire facultatif)

   Le manifeste (une entree par scene : `titre`, `duree_ms`) est un bloc JSON de la page, ou `opts.scenes`. Les scenes sont
   les `[data-scene]` du lecteur ; seule la courante est visible (les autres portent `hidden`).
   Comportement : Espace lance/met en pause, fleches gauche et droite changent de scene, `[data-aller="k"]` y va ; la fin de la
   derniere scene arrete la lecture (« Rejouer »). L'etat se lit sur le lecteur : `data-etat` = pret | lecture | pause | fin,
   `data-scene-courante` = index (jamais `data-scene` sur le lecteur : render_page TF-2299 joue chaque `[data-scene]` comme une
   scene). Mouvement reduit (prefers-reduced-motion) : aucune lecture automatique, les scenes se parcourent a la main.
   Impression : TOUTES les scenes s'impriment (regle @media print de scene-player.css). Sans JS : la premiere scene est visible,
   les autres portent `hidden` ; le sommaire et les commandes sont inertes — a l'impression tout est lisible. */
(function (root) {
  'use strict';

  var ICONES = {
    lecture: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2.5" width="3.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1"/></svg>',
    rejouer: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5v2.5h2.5"/></svg>'
  };

  function lireManifeste(lecteur, opts) {
    if (opts && opts.scenes) return opts.scenes;
    var bloc = lecteur.querySelector('script[type="application/json"][data-scenes]');
    if (!bloc) return null;
    try { return JSON.parse(bloc.textContent); } catch (e) { return null; }
  }

  function init(lecteur, opts) {
    if (!lecteur || lecteur.getAttribute('data-scene-player-ready') === '1') return null;
    var sections = Array.prototype.slice.call(lecteur.querySelectorAll('[data-scene]'));
    var scenes = lireManifeste(lecteur, opts);
    if (!sections.length || !scenes || scenes.length !== sections.length) return null;
    lecteur.setAttribute('data-scene-player-ready', '1');

    var reduit = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var bLecture = lecteur.querySelector('[data-commande="lecture"]');
    var bPrec = lecteur.querySelector('[data-commande="precedente"]');
    var bSuiv = lecteur.querySelector('[data-commande="suivante"]');
    var compteur = lecteur.querySelector('.sp-compteur');
    var annonce = lecteur.querySelector('.sp-annonce');
    var zoneSegments = lecteur.querySelector('.sp-segments');
    var n = sections.length, i = 0, reste = scenes[0].duree_ms, debut = 0, minuteur = null;
    var segs = [];
    var allers = Array.prototype.slice.call(document.querySelectorAll('[data-aller]'));
    var ecouteurs = [];

    if (zoneSegments) {
      scenes.forEach(function () {
        var s = document.createElement('span');
        s.className = 'sp-seg';
        s.innerHTML = '<span class="sp-seg-plein"></span>';
        zoneSegments.appendChild(s);
        segs.push(s);
      });
    }

    function ecouter(cible, type, fn) { cible.addEventListener(type, fn); ecouteurs.push([cible, type, fn]); }
    function etat() { return lecteur.getAttribute('data-etat'); }
    function poser(e) { lecteur.setAttribute('data-etat', e); }

    function etiquette() {
      if (!bLecture) return;
      var e = etat();
      var libelle = bLecture.querySelector('.sp-libelle'), icone = bLecture.querySelector('.sp-icone');
      if (libelle) libelle.textContent = e === 'lecture' ? 'Pause' : e === 'fin' ? 'Rejouer' : e === 'pause' ? 'Reprendre' : 'Lecture';
      if (icone) icone.innerHTML = e === 'lecture' ? ICONES.pause : e === 'fin' ? ICONES.rejouer : ICONES.lecture;
      bLecture.setAttribute('aria-label', e === 'lecture' ? 'Mettre en pause' : e === 'fin' ? 'Rejouer depuis le début' : 'Lancer la lecture');
    }

    function afficher(k, animer) {
      sections.forEach(function (s, j) {
        s.hidden = j !== k;
        s.classList.remove('active');
        s.classList.toggle('statique', j === k && !animer);
      });
      void sections[k].offsetWidth;
      sections[k].classList.add('active');
      segs.forEach(function (g, j) {
        g.classList.remove('courant');
        g.classList.toggle('passe', j < k);
      });
      if (segs[k]) {
        segs[k].style.setProperty('--sp-seg-duree', scenes[k].duree_ms + 'ms');
        void segs[k].offsetWidth;
        segs[k].classList.add('courant');
      }
      allers.forEach(function (a, j) { if (j === k) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
      lecteur.setAttribute('data-scene-courante', String(k));
      if (compteur) compteur.textContent = 'scène ' + (k + 1) + ' sur ' + n;
      if (annonce) annonce.textContent = 'Scène ' + (k + 1) + ' sur ' + n + ' : ' + scenes[k].titre;
      if (bPrec) bPrec.disabled = k === 0;
      if (bSuiv) bSuiv.disabled = k === n - 1;
    }

    function planifier() {
      clearTimeout(minuteur);
      debut = performance.now();
      minuteur = setTimeout(sceneFinie, reste);
    }
    function sceneFinie() {
      if (i + 1 < n) {
        i += 1; reste = scenes[i].duree_ms;
        afficher(i, true); planifier();
      } else {
        clearTimeout(minuteur);
        poser('fin'); etiquette();
      }
    }
    function jouer() {
      if (reduit) return;                        // mouvement reduit : jamais de lecture automatique
      if (etat() === 'fin') { i = 0; reste = scenes[0].duree_ms; poser('lecture'); afficher(0, true); }
      else if (etat() === 'pret') { poser('lecture'); afficher(i, true); }
      else { poser('lecture'); }
      planifier(); etiquette();
    }
    function pause() {
      clearTimeout(minuteur);
      reste = Math.max(0, reste - (performance.now() - debut));
      poser('pause'); etiquette();
    }
    function basculer() { if (etat() === 'lecture') pause(); else jouer(); }
    function aller(k) {
      if (k < 0 || k >= n) return;
      clearTimeout(minuteur);
      i = k; reste = scenes[k].duree_ms;
      var enLecture = etat() === 'lecture';
      if (etat() === 'fin') poser('pause');
      afficher(k, enLecture);
      if (enLecture) planifier();
      etiquette();
    }

    if (bLecture) ecouter(bLecture, 'click', basculer);
    if (bPrec) ecouter(bPrec, 'click', function () { aller(i - 1); });
    if (bSuiv) ecouter(bSuiv, 'click', function () { aller(i + 1); });
    allers.forEach(function (a) { ecouter(a, 'click', function () { aller(Number(a.getAttribute('data-aller'))); }); });
    ecouter(document, 'keydown', function (e) {
      var cible = e.target && e.target.closest ? e.target.closest('button, a, input, select, textarea') : null;
      if ((e.key === ' ' || e.key === 'Spacebar') && !cible) { e.preventDefault(); basculer(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); aller(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); aller(i - 1); }
    });

    poser('pret');
    afficher(0, false);
    etiquette();

    // Desarmement : un second init ne doit pas empiler d'ecouteurs.
    return function detruire() {
      clearTimeout(minuteur);
      ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2]); });
      lecteur.removeAttribute('data-scene-player-ready');
    };
  }

  function initAll(portee) {
    var lecteurs = Array.prototype.slice.call((portee || document).querySelectorAll('[data-scene-player]'));
    return lecteurs.map(function (l) { return init(l); });
  }

  root.DigitAIScenePlayer = { init: init, initAll: initAll };
})(window);
