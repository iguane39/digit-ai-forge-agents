/* source-reader — le LECTEUR DE SOURCE d'une page autoportante (TF-0489, 23/08/2026).
 *
 * NOTE D'ECRITURE, et elle a ete payee : ce fichier est destine a etre COLLE dans une page
 * autoportante (regle A1 : aucun fichier voisin). Toute sequence de fermeture de script, MEME EN
 * COMMENTAIRE, fermerait le bloc de la page hote et casserait tout ce qui suit. Elles sont donc
 * ecrites echappees dans ce fichier.
 *
 * POURQUOI CE COMPOSANT EXISTE, et c'est le socle lui-meme qui cree le besoin. La regle A1 exige
 * un fichier AUTOPORTANT : un rapport qui renvoie a des fichiers du depot perd ses sources des
 * qu'il part par courriel. La consequence logique est donc d'EMBARQUER les documents cites — et
 * rien n'etait prevu pour les lire. Un <pre> de 67 Ko de Markdown est illisible.
 *
 * CE QUE LE LIVRABLE DU 22/08 A DU ECRIRE A LA MAIN, faute de composant : environ 130 lignes de
 * convertisseur Markdown, une bascule a deux vues, et — le point qu'on ne devine pas — un RENDU
 * DIFFERE au premier depliage. Sans ce dernier, les douze documents rendus d'avance faisaient
 * passer le DOM de 7 000 a plus de 25 000 noeuds, AU-DELA du seuil d'echec de l'oracle de
 * performance. Le seuil a ete decouvert par essai ; il est ecrit ici pour ne plus l'etre.
 *
 * DOCTRINE DES LIENS, et elle est contre-intuitive : les liens d'un document cite ne deviennent
 * PAS cliquables. Ils visent le depot, donc rien depuis la page — UN LIEN MORT MENT DAVANTAGE
 * QU'UNE ABSENCE DE LIEN. La cible passe en infobulle : le lecteur sait ou regarder sans croire
 * qu'un clic l'y menera.
 *
 * Usage (aucune dependance, aucun reseau) :
 *   <details class="src" data-src-format="markdown">
 *     <summary>Nom du document cite — 12 Ko</summary>
 *     <script type="text/plain" class="src-brut">…le document, tel quel…<\/script>
 *   </details>
 *   <script src="source-reader.js"><\/script>
 *   <script>DigitAISourceReader.init();<\/script>
 *
 * Le document vit dans un <script type="text/plain"> : c'est le SEUL emplacement ou du Markdown
 * brut ne sera ni interprete comme du HTML, ni reflowe, ni echappe deux fois. Un <pre> cache
 * fonctionnerait aussi, mais son contenu compte dans le DOM des le chargement — ce que le rendu
 * differe cherche precisement a eviter.
 */
(function (global) {
  'use strict';

  var ECHAPPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  /* Jeton de garde du code en ligne. Il doit etre INTROUVABLE dans un document reel : un premier
   * jet employait « espace chiffre espace », et la phrase « il y a 3 cas » devenait alors un
   * <code> vide en allant chercher une garde inexistante. Un caractere d'usage prive ne peut pas
   * venir d'un Markdown ecrit a la main. */
  // Construit par CODE, jamais ecrit en litteral : un caractere d'usage prive dans un fichier
  // source se fait prendre pour du binaire par les outils, et le controle de glyphes du socle
  // le refuse a juste titre — il ne peut pas savoir que celui-ci est un jeton et pas un signe.
  var JETON = String.fromCharCode(0xE000);
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return ECHAPPES[c]; });
  }

  /* Enrichissements de LIGNE. L'ordre compte : le code inline se protege AVANT le reste, sinon
   * une etoile dans un extrait de code deviendrait de l'italique. */
  function enrichir(ligne) {
    var garde = [];
    var t = esc(ligne).replace(/`([^`]+)`/g, function (_m, code) {
      garde.push(code);
      return JETON + (garde.length - 1) + JETON;
    });
    // LES LIENS NE DEVIENNENT PAS CLIQUABLES : la cible passe en infobulle. Un lien mort ment
    // davantage qu'une absence de lien, et depuis une page autoportante toute cible du depot
    // est morte par construction.
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      function (_m, texte, cible) {
        return '<span class="src-lien" title="cible dans le dépôt : ' + esc(cible) +
          ' — non cliquable depuis un document embarqué">' + texte + '</span>';
      });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return t.replace(new RegExp(JETON + '(\\d+)' + JETON, 'g'), function (_m, i) {
      return '<code>' + esc(garde[+i]) + '</code>';
    });
  }

  function tableau(lignes) {
    var cellules = function (l) {
      return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/)
        .map(function (c) { return enrichir(c.trim()); });
    };
    var entete = cellules(lignes[0]);
    var corps = lignes.slice(2).map(cellules);
    // Le tableau vit dans une zone qui defile HORIZONTALEMENT : un tableau large dans un document
    // cite ne doit pas faire deborder la page hote (V1 est bloquant).
    return '<div class="src-zone-tableau"><table><thead><tr>'
      + entete.map(function (c) { return '<th>' + c + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + corps.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  /* Sous-ensemble de Markdown volontairement BORNE : titres, tableaux, listes, code, citations,
   * separateurs, enrichissements de ligne. Ce qui n'est pas reconnu sort en paragraphe, JAMAIS en
   * HTML brut — un document cite est une DONNEE, et une donnee ne s'execute pas (meme doctrine
   * que les entrants du pilot). */
  function convertir(source) {
    var lignes = String(source).replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var i = 0;
    while (i < lignes.length) {
      var l = lignes[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      var titre = /^(#{1,6})\s+(.*)$/.exec(l);
      if (titre) {
        var n = Math.min(titre[1].length + 1, 6);   // un h1 embarque devient h2 : la page hote garde son h1
        out.push('<h' + n + '>' + enrichir(titre[2]) + '</h' + n + '>');
        i++; continue;
      }
      if (/^\s*(```|~~~)/.test(l)) {
        var cloture = l.trim().slice(0, 3);
        var bloc = [];
        i++;
        while (i < lignes.length && lignes[i].trim().indexOf(cloture) !== 0) { bloc.push(lignes[i]); i++; }
        i++;
        out.push('<pre><code>' + esc(bloc.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^\s*\|/.test(l) && i + 1 < lignes.length && /^\s*\|[\s:|-]+\|\s*$/.test(lignes[i + 1])) {
        var t = [];
        while (i < lignes.length && /^\s*\|/.test(lignes[i])) { t.push(lignes[i]); i++; }
        out.push(tableau(t));
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) {
        var cit = [];
        while (i < lignes.length && /^\s*>/.test(lignes[i])) {
          cit.push(enrichir(lignes[i].replace(/^\s*>\s?/, ''))); i++;
        }
        out.push('<blockquote><p>' + cit.join('<br>') + '</p></blockquote>');
        continue;
      }
      var puce = /^\s*([-*+]|\d+[.)])\s+/;
      if (puce.test(l)) {
        var ordonnee = /^\s*\d/.test(l);
        var items = [];
        while (i < lignes.length && puce.test(lignes[i])) {
          items.push('<li>' + enrichir(lignes[i].replace(puce, '')) + '</li>'); i++;
        }
        out.push((ordonnee ? '<ol>' : '<ul>') + items.join('') + (ordonnee ? '</ol>' : '</ul>'));
        continue;
      }
      var para = [];
      while (i < lignes.length && !/^\s*$/.test(lignes[i]) && !puce.test(lignes[i])
        && !/^\s*(#|>|\||```|~~~|-{3,})/.test(lignes[i])) { para.push(enrichir(lignes[i])); i++; }
      out.push('<p>' + para.join(' ') + '</p>');
    }
    return out.join('\n');
  }

  function poser(bloc) {
    var brut = bloc.querySelector('.src-brut');
    if (!brut || bloc.querySelector('.src-vue')) return;
    var source = brut.textContent || '';
    var vue = document.createElement('div');
    vue.className = 'src-vue';
    var barre = document.createElement('div');
    barre.className = 'src-barre';
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'src-bascule';
    bouton.setAttribute('aria-pressed', 'false');
    bouton.textContent = 'texte brut';
    var corps = document.createElement('div');
    corps.className = 'src-corps';
    corps.innerHTML = convertir(source);
    var pre = document.createElement('pre');
    pre.className = 'src-texte';
    pre.hidden = true;
    pre.textContent = source;
    bouton.addEventListener('click', function () {
      var brutVisible = pre.hidden;
      pre.hidden = !brutVisible;
      corps.hidden = brutVisible;
      bouton.setAttribute('aria-pressed', brutVisible ? 'true' : 'false');
      bouton.textContent = brutVisible ? 'mis en forme' : 'texte brut';
    });
    barre.appendChild(bouton);
    vue.appendChild(barre);
    vue.appendChild(corps);
    vue.appendChild(pre);
    bloc.appendChild(vue);
    bloc.setAttribute('data-src-rendu', 'oui');
  }

  function init(racine) {
    var hote = racine || document;
    var blocs = hote.querySelectorAll('details.src');
    for (var i = 0; i < blocs.length; i++) {
      (function (bloc) {
        // RENDU DIFFERE : au PREMIER depliage, jamais au chargement. Mesure du 22/08 : douze
        // documents rendus d'avance faisaient passer le DOM de 7 000 a plus de 25 000 noeuds,
        // au-dela du seuil d'echec de l'oracle de performance.
        if (bloc.open) poser(bloc);
        bloc.addEventListener('toggle', function () { if (bloc.open) poser(bloc); });
      })(blocs[i]);
    }
    return blocs.length;
  }

  global.DigitAISourceReader = { init: init, convertir: convertir };
})(typeof window !== 'undefined' ? window : this);
