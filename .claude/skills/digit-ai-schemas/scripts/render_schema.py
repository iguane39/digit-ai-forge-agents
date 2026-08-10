"""Rendu d'un schéma HTML Digit-AI en PNG via Playwright + Chromium headless.

À placer dans scripts/ du skill digit-ai-schemas.

Usage :
    cd .claude/skills/digit-ai-schemas/scripts
    uv run python render_schema.py <chemin-vers-schema.html> [--output sortie.png] [--scale 2]

Conçu pour fonctionner dans DEUX environnements sans réglage manuel :
  - Claude Code (machine locale, réseau ouvert) : Chromium installé via
    `playwright install chromium`, polices Google chargées par le réseau.
  - Sandbox Claude.ai web (réseau sur liste blanche) : Chromium pré-installé
    dans l'image (auto-détecté), polices Google bloquées -> on installe les
    WOFF2 bundlés dans fonts/ au cache fontconfig local pour un rendu fidèle.

Première installation côté Claude Code uniquement (le sandbox web n'en a pas
besoin, le navigateur y est déjà présent) :
    uv sync
    uv run playwright install chromium
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
FONTS_DIR = SCRIPT_DIR / "fonts"

DIAGRAM_SELECTOR = ".diagram-wrap"
FALLBACK_SELECTOR = "svg"

# Emplacements possibles d'un Chromium déjà présent (sandbox Claude.ai web).
PREINSTALLED_BROWSER_ROOTS = ["/opt/pw-browsers"]


def ensure_browser_path() -> None:
    """Pointe Playwright vers un Chromium pré-installé si présent.

    Dans le sandbox web, le navigateur est dans /opt/pw-browsers mais Playwright
    regarde ~/.cache/ms-playwright par défaut. On règle PLAYWRIGHT_BROWSERS_PATH
    seulement si l'utilisateur ne l'a pas déjà défini et qu'un dossier connu existe.
    """
    if os.environ.get("PLAYWRIGHT_BROWSERS_PATH"):
        return
    for root in PREINSTALLED_BROWSER_ROOTS:
        if Path(root).is_dir() and any(Path(root).glob("chromium*")):
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = root
            return


def ensure_local_fonts() -> None:
    """Installe les WOFF2 bundlés dans le cache fontconfig local (best-effort).

    Permet à Chromium headless de rendre Roboto / DM Sans / JetBrains Mono même
    quand fonts.googleapis.com est bloqué (sandbox web). Idempotent et silencieux :
    si fc-cache est absent ou si fonts/ n'existe pas, on ne fait rien -- sur une
    machine Claude Code avec réseau, les polices Google chargent de toute façon.
    """
    if not FONTS_DIR.is_dir():
        return
    if shutil.which("fc-cache") is None:
        return
    user_fonts = Path.home() / ".fonts" / "digit-ai-schemas"
    user_fonts.mkdir(parents=True, exist_ok=True)
    for woff2 in FONTS_DIR.glob("*.woff2"):
        target = user_fonts / woff2.name
        if not target.exists():
            shutil.copy2(woff2, target)
    subprocess.run(["fc-cache", "-f", str(user_fonts)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def render(html_path: Path, output_path: Path | None, scale: int) -> Path:
    ensure_browser_path()
    ensure_local_fonts()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("ERREUR : playwright non installé.\n  uv sync && uv run playwright install chromium")

    if output_path is None:
        output_path = html_path.with_suffix(".png")

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            if "Executable doesn't exist" in str(e):
                sys.exit(
                    "ERREUR : Chromium introuvable.\n"
                    "  - Claude Code : uv run playwright install chromium\n"
                    "  - Sandbox web : aucun Chromium pré-installé détecté dans "
                    f"{PREINSTALLED_BROWSER_ROOTS} ; vérifier l'image."
                )
            raise

        page = browser.new_page(viewport={"width": 1600, "height": 1200}, device_scale_factor=scale)
        page.goto(html_path.resolve().as_uri())

        # Attendre les polices appliquées avant le screenshot (sinon les
        # débordements de texte sont invisibles au rendu).
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")

        target = page.query_selector(DIAGRAM_SELECTOR) or page.query_selector(FALLBACK_SELECTOR)
        if target is None:
            browser.close()
            sys.exit(f"ERREUR : ni '{DIAGRAM_SELECTOR}' ni '{FALLBACK_SELECTOR}' trouvés dans {html_path.name}")

        target.screenshot(path=str(output_path))
        browser.close()

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Rendu PNG d'un schéma HTML Digit-AI")
    parser.add_argument("input", type=Path, help="Chemin du fichier .html")
    parser.add_argument("--output", "-o", type=Path, default=None, help="PNG de sortie (défaut : même nom en .png)")
    parser.add_argument("--scale", "-s", type=int, default=2, help="Facteur d'échelle (défaut : 2)")
    args = parser.parse_args()

    if not args.input.exists():
        sys.exit(f"ERREUR : fichier introuvable : {args.input}")

    print(render(args.input, args.output, args.scale))


if __name__ == "__main__":
    main()
