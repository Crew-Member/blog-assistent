"""Erzeugt den Nutzungsleitfaden als PDF.

Aufruf (im Ordner docs/tools):   /usr/bin/python3 make_leitfaden.py ../Nutzungsleitfaden-Blog-Assistent.pdf
Voraussetzungen: reportlab, pillow; Schriften Liberation Sans/Mono (/usr/share/fonts/truetype/liberation).
Inhalt: leitfaden_teil1.py (Kapitel 1-6), leitfaden_teil2.py (Kapitel 7-14, Anhänge), Bausteine: leitfaden_lib.py,
Abbildungen: screenshots/ (Platzhalterdaten).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import leitfaden_lib as lib  # noqa: E402
import leitfaden_teil1  # noqa: E402,F401  (fügt Inhalt zu lib.story hinzu)
import leitfaden_teil2  # noqa: E402,F401

out = sys.argv[1] if len(sys.argv) > 1 else "Nutzungsleitfaden-Blog-Assistent.pdf"
lib.build(out)
print("OK", out)
