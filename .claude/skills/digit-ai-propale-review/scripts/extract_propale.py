#!/usr/bin/env python3
"""
extract_propale.py — Inventaire Markdown d'une propale PPTX pour audit commercial.

Usage :
    python extract_propale.py "Digit-AI - Client - Proposition commerciale - ....pptx" [sortie.md]

Sortie : un fichier Markdown (par défaut <nom>.extract.md à côté du PPTX) contenant,
slide par slide : titre, corps, tableaux, notes du présentateur — plus un bloc de
métriques utiles à la grille (ratio lexical client/Digit-AI sur les 5 premiers slides,
sommes des montants détectés pour le contrôle de cohérence du chiffrage).

Dépendance : python-pptx (pip install python-pptx --break-system-packages)
"""
import re
import sys
from pathlib import Path

try:
    from pptx import Presentation
except ImportError:
    sys.exit("python-pptx manquant : pip install python-pptx --break-system-packages")

AMOUNT_RE = re.compile(r"(\d{1,3}(?:[ \u00a0\u202f.,]\d{3})*(?:[.,]\d+)?)\s*(k€|K€|€)", re.U)
CLIENT_SIDE = ("vous", "votre", "vos")
US_SIDE = ("digit-ai", "nous", "notre", "nos")


def shape_text(shape):
    parts = []
    if shape.has_text_frame:
        for p in shape.text_frame.paragraphs:
            t = "".join(r.text for r in p.runs) or p.text
            if t.strip():
                parts.append(t.strip())
    return parts


def table_md(shape):
    rows = []
    for r in shape.table.rows:
        rows.append("| " + " | ".join(c.text.strip().replace("\n", " ") for c in r.cells) + " |")
    if len(rows) > 1:
        ncols = rows[0].count("|") - 1
        rows.insert(1, "|" + "---|" * ncols)
    return "\n".join(rows)


def parse_amount(raw, unit):
    v = float(raw.replace("\u00a0", "").replace("\u202f", "").replace(" ", "").replace(",", "."))
    # heuristique séparateur de milliers : "36.000" → 36000
    if "." in raw and raw.rsplit(".", 1)[-1] == "000":
        v = float(raw.replace(".", "").replace(",", "."))
    return v * 1000 if unit.lower() == "k€" else v


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".extract.md")
    prs = Presentation(src)

    md = [f"# Extraction — {src.name}", f"\n{len(prs.slides)} slides.\n"]
    first5_text, amounts = [], []

    for i, slide in enumerate(prs.slides, 1):
        title = ""
        if slide.shapes.title is not None and slide.shapes.title.text.strip():
            title = slide.shapes.title.text.strip()
        md.append(f"\n## Slide {i} — {title or '(sans titre)'}\n")
        body = []
        for shape in slide.shapes:
            if shape.has_table:
                body.append(table_md(shape))
            else:
                texts = shape_text(shape)
                if title and texts[:1] == [title]:
                    texts = texts[1:]
                body.extend(texts)
        for line in body:
            md.append(line if line.startswith("|") else f"- {line}")
        full = title + " " + " ".join(body)
        if i <= 5:
            first5_text.append(full.lower())
        for raw, unit in AMOUNT_RE.findall(full):
            amounts.append((i, f"{raw} {unit}", parse_amount(raw, unit)))
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            md.append(f"\n> Notes : {slide.notes_slide.notes_text_frame.text.strip()}")

    # ---- Métriques pour la grille ----
    blob5 = " ".join(first5_text)
    cli = sum(len(re.findall(rf"\b{w}\b", blob5)) for w in CLIENT_SIDE)
    us = sum(len(re.findall(rf"\b{re.escape(w)}\b", blob5)) for w in US_SIDE)
    ratio = f"{100 * cli / (cli + us):.0f} %" if (cli + us) else "n/a"
    md.append("\n---\n## Métriques d'audit (automatiques)\n")
    md.append(f"- **D2 — ratio lexical client (5 premiers slides)** : {ratio} "
              f"(client : {cli} · Digit-AI/nous : {us} · cible > 60 %)")
    md.append(f"- **D4/RF4 — montants détectés** ({len(amounts)}) :")
    for sl, raw, val in amounts:
        md.append(f"  - slide {sl} : {raw} (≈ {val:,.0f} €)".replace(",", " "))
    md.append("  - ⚠ Vérifier manuellement : somme des lots = total annoncé (red flag 4).")

    out.write_text("\n".join(md), encoding="utf-8")
    print(f"OK → {out}")


if __name__ == "__main__":
    main()
