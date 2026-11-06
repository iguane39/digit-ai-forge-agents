Formats produits : page HTML (nominal), document Markdown (repli si le générateur échoue)

Contrat de sortie du prompt réécrit :

1. Le livrable porte le nom prescrit par R-4 et R-25.
2. Forme du HTML : `check_html.py` rend PASS.
3. Forme du Markdown de repli : `check_markdown.py` rend PASS (M7, M10, M14, M18).
4. Si le générateur échoue, le repli est daté et le format de repli est jugé par l'oracle de son format.
