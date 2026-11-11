"""Bausteine für den Nutzungsleitfaden (reportlab): Schriften, Farben, Absatz-Helfer, Inhaltsverzeichnis, Seitenvorlagen."""
import os

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus.tableofcontents import TableOfContents

FONT_DIR = "/usr/share/fonts/truetype/liberation/"
for name, file in [("LS", "LiberationSans-Regular"), ("LS-B", "LiberationSans-Bold"), ("LS-I", "LiberationSans-Italic"), ("LS-BI", "LiberationSans-BoldItalic"), ("LM", "LiberationMono-Regular")]:
    pdfmetrics.registerFont(TTFont(name, FONT_DIR + file + ".ttf"))
pdfmetrics.registerFontFamily("LS", normal="LS", bold="LS-B", italic="LS-I", boldItalic="LS-BI")

BRAND = colors.HexColor("#2b4fd8")
INK = colors.HexColor("#1b2233")
MUTED = colors.HexColor("#5b6478")
LINE = colors.HexColor("#d9deea")
INFO_BG = colors.HexColor("#eaf0ff")
WARN_BG = colors.HexColor("#fff3d6")
WARN_BAR = colors.HexColor("#e0a400")
OK_BG = colors.HexColor("#e6f6ec")
OK_BAR = colors.HexColor("#2e9e5b")
CODE_BG = colors.HexColor("#f3f5fa")

W, H = A4
MARGIN = 2.3 * cm
TEXT_W = W - 2 * MARGIN  # 16.4 cm

base = ParagraphStyle("base", fontName="LS", fontSize=10, leading=14.5, textColor=INK, spaceAfter=6)
H1 = ParagraphStyle("H1", parent=base, fontName="LS-B", fontSize=20, leading=25, textColor=BRAND, spaceBefore=4, spaceAfter=10, keepWithNext=1)
H2 = ParagraphStyle("H2", parent=base, fontName="LS-B", fontSize=13.5, leading=18, spaceBefore=12, spaceAfter=5, keepWithNext=1)
H3 = ParagraphStyle("H3", parent=base, fontName="LS-B", fontSize=11, leading=15, textColor=BRAND, spaceBefore=8, spaceAfter=3, keepWithNext=1)
cell = ParagraphStyle("cell", parent=base, fontSize=8.8, leading=12, spaceAfter=0)
cellb = ParagraphStyle("cellb", parent=cell, fontName="LS-B")
cellh = ParagraphStyle("cellh", parent=cell, fontName="LS-B", textColor=colors.white)
caption = ParagraphStyle("caption", parent=base, fontSize=8.8, leading=12, textColor=MUTED, alignment=1, spaceAfter=10)
code = ParagraphStyle("code", parent=base, fontName="LM", fontSize=8.6, leading=11.5, spaceAfter=0)

story: list = []
P = Paragraph


def mono(text: str) -> str:
    """Inline-Schreibweise für Dateinamen und Einträge (Text muss HTML-sicher sein)."""
    return f"<font name='LM'>{text}</font>"


def h1(text):
    story.append(P(text, H1))


def h2(text):
    story.append(P(text, H2))


def h3(text):
    story.append(P(text, H3))


def para(text):
    story.append(P(text, base))


def bullets(items):
    for text in items:
        story.append(P(text, ParagraphStyle("bl", parent=base, leftIndent=14, bulletIndent=3, spaceAfter=3.5), bulletText="•"))
    story.append(Spacer(1, 3))


def steps(items):
    for i, text in enumerate(items, 1):
        story.append(
            Table(
                [[P(f"<font color='#2b4fd8'><b>{i}</b></font>", ParagraphStyle("sn", parent=base, spaceAfter=0, fontSize=11)), P(text, ParagraphStyle("st", parent=base, spaceAfter=0))]],
                colWidths=[0.7 * cm, TEXT_W - 0.7 * cm],
                style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5), ("LEFTPADDING", (0, 0), (-1, -1), 0)],
            )
        )
    story.append(Spacer(1, 3))


def box(title, text, kind="info"):
    bg, bar = {"info": (INFO_BG, BRAND), "warn": (WARN_BG, WARN_BAR), "ok": (OK_BG, OK_BAR)}[kind]
    inner = [P(f"<b>{title}</b>", ParagraphStyle("bt", parent=base, spaceAfter=2))] + [
        P(t, ParagraphStyle("bb", parent=base, fontSize=9.4, leading=13.4, spaceAfter=3)) for t in (text if isinstance(text, list) else [text])
    ]
    table = Table([[inner]], colWidths=[TEXT_W], style=[("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 3, bar), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)])
    story.append(Spacer(1, 4))
    story.append(KeepTogether([table]))
    story.append(Spacer(1, 8))


def table(header, rows, widths):
    data = [[P(h, cellh) for h in header]] + [[P(c, cellb if i == 0 else cell) for i, c in enumerate(r)] for r in rows]
    t = Table(data, colWidths=[w * cm for w in widths], repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fd")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 8))


def code_block(text):
    """Beispieltext in Festschrift; Sonderzeichen werden maskiert."""
    esc = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = Table([[P(esc.replace("\n", "<br/>").replace(" ", "&nbsp;"), code)]], colWidths=[TEXT_W - 0.4 * cm], style=[("BACKGROUND", (0, 0), (-1, -1), CODE_BG), ("BOX", (0, 0), (-1, -1), 0.4, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)])
    story.append(KeepTogether([t]))
    story.append(Spacer(1, 8))


SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")


def shot(file, width_cm, text):
    path = os.path.join(SHOT_DIR, file)
    iw, ih = PILImage.open(path).size
    img = Image(path, width=width_cm * cm, height=width_cm * cm * ih / iw)
    img.hAlign = "CENTER"
    story.append(KeepTogether([img, Spacer(1, 3), P(text, caption)]))


def page_break():
    story.append(PageBreak())


class Doc(BaseDocTemplate):
    """Dokument mit Inhaltsverzeichnis (Überschriften 1. und 2. Ebene) und PDF-Lesezeichen."""

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("H1", "H2"):
            text = flowable.getPlainText()
            if text == "Inhalt":
                return
            level = 0 if flowable.style.name == "H1" else 1
            key = f"h{self.seq.nextf('toc')}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=level == 1)
            self.notify("TOCEntry", (level, text, self.page, key))


def on_cover(canv, doc):
    canv.saveState()
    canv.setFillColor(BRAND)
    canv.rect(0, H - 9.4 * cm, W, 9.4 * cm, stroke=0, fill=1)
    canv.setFillColor(colors.white)
    canv.setFont("LS-B", 32)
    canv.drawString(MARGIN, H - 4.8 * cm, "Blog-Assistent")
    canv.setFont("LS", 17)
    canv.drawString(MARGIN, H - 6.4 * cm, "Nutzungsleitfaden")
    canv.setFont("LS", 11)
    canv.drawString(MARGIN, H - 8.1 * cm, "Beiträge erstellen, überarbeiten und in WordPress bringen")
    canv.setFillColor(INK)
    canv.setFont("LS", 12)
    canv.drawString(MARGIN + 0.2 * cm, H - 12.9 * cm, "Für Dr. Daniel Kirmse")
    canv.setFillColor(MUTED)
    canv.setFont("LS", 10.5)
    canv.drawString(MARGIN + 0.2 * cm, H - 13.7 * cm, "Websites: kirmse.eu und kdsb.gmbh")
    intro = P(
        "Dieser Leitfaden erklärt Schritt für Schritt, wie du mit dem Blog-Assistenten arbeitest: von der Einrichtung über das Erstellen und Überarbeiten von Beiträgen bis zur Übergabe an WordPress. Er enthält außerdem Hinweise zu Kosten, SEO, Qualitätssicherung und zur Fehlerbehebung, eine Checkliste für jede Veröffentlichung, eine Anleitung zum Rechnerumzug und die Beschreibung, wie die API-Schlüssel erzeugt und hinterlegt werden.",
        ParagraphStyle("ci", parent=base, leading=14.5),
    )
    w, h = intro.wrap(TEXT_W - 0.4 * cm, 300)
    intro.drawOn(canv, MARGIN + 0.2 * cm, H - 15.2 * cm - h)
    stand = P(STAND, ParagraphStyle("cs", parent=base, fontSize=8.8, textColor=MUTED))
    w2, h2_ = stand.wrap(TEXT_W - 0.4 * cm, 100)
    stand.drawOn(canv, MARGIN + 0.2 * cm, H - 19.2 * cm - h2_)
    canv.restoreState()


STAND = "Stand: November 2026. Die Abbildungen zeigen die Oberfläche mit Platzhalterdaten."


def on_page(canv, doc):
    canv.saveState()
    canv.setStrokeColor(LINE)
    canv.line(MARGIN, 1.55 * cm, W - MARGIN, 1.55 * cm)
    canv.setFont("LS", 8)
    canv.setFillColor(MUTED)
    canv.drawString(MARGIN, 1.05 * cm, "Blog-Assistent – Nutzungsleitfaden")
    canv.drawRightString(W - MARGIN, 1.05 * cm, f"Seite {doc.page}")
    canv.restoreState()


def make_toc():
    toc = TableOfContents(dotsMinLevel=0)
    toc.levelStyles = [
        ParagraphStyle("t0", parent=base, fontName="LS-B", fontSize=10.5, leading=14, spaceBefore=5, spaceAfter=0),
        ParagraphStyle("t1", parent=base, fontSize=9.2, leading=12, leftIndent=14, textColor=MUTED, spaceAfter=0),
    ]
    return toc


def build(path, title="Blog-Assistent – Nutzungsleitfaden"):
    doc = Doc(path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=2.2 * cm, bottomMargin=2.2 * cm, title=title, author="Blog-Assistent", subject="Nutzungsleitfaden")
    frame = Frame(MARGIN, 2.2 * cm, TEXT_W, H - 4.4 * cm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="cover", frames=[frame], onPage=on_cover), PageTemplate(id="main", frames=[frame], onPage=on_page)])
    doc.multiBuild(story)
