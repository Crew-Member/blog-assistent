"""Erzeugt den Anhang B "API-Schluessel erzeugen und hinterlegen" des Nutzungsleitfadens und haengt ihn an das PDF an.
Aufruf:  python3 make_anhang_schluessel.py <Leitfaden.pdf>     (Leitfaden ohne Anhang B; das Ergebnis ersetzt die Datei)
"""
import io, sys
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle

F = "/usr/share/fonts/truetype/liberation/"
for n, f in [("LS", "LiberationSans-Regular"), ("LS-B", "LiberationSans-Bold"), ("LM", "LiberationMono-Regular")]:
    pdfmetrics.registerFont(TTFont(n, F + f + ".ttf"))
pdfmetrics.registerFontFamily("LS", normal="LS", bold="LS-B", italic="LS", boldItalic="LS-B")

BRAND = colors.HexColor("#2b4fd8"); INK = colors.HexColor("#1b2233"); MUTED = colors.HexColor("#5b6478")
INFO_BG = colors.HexColor("#eaf0ff"); WARN_BG = colors.HexColor("#fff3d6"); WARN_BAR = colors.HexColor("#e0a400"); LINE = colors.HexColor("#d9deea")
base = ParagraphStyle("b", fontName="LS", fontSize=10, leading=14.5, textColor=INK, spaceAfter=6)
H1 = ParagraphStyle("H1", parent=base, fontName="LS-B", fontSize=20, leading=25, textColor=BRAND, spaceAfter=10, keepWithNext=1)
H2 = ParagraphStyle("H2", parent=base, fontName="LS-B", fontSize=13.5, leading=18, spaceBefore=12, spaceAfter=5, keepWithNext=1)
H3 = ParagraphStyle("H3", parent=base, fontName="LS-B", fontSize=11, leading=15, textColor=BRAND, spaceBefore=8, spaceAfter=3, keepWithNext=1)
cell = ParagraphStyle("c", parent=base, fontSize=8.8, leading=12, spaceAfter=0)
cellb = ParagraphStyle("cb", parent=cell, fontName="LS-B")
cellh = ParagraphStyle("ch", parent=cell, fontName="LS-B", textColor=colors.white)
story = []
P = Paragraph
def para(t): story.append(P(t, base))
def h2(t): story.append(P(t, H2))
def h3(t): story.append(P(t, H3))
def steps(items):
    for i, t in enumerate(items, 1):
        story.append(Table([[P(f"<font color='#2b4fd8'><b>{i}</b></font>", base), P(t, ParagraphStyle("s", parent=base, spaceAfter=0))]], colWidths=[0.7 * cm, 15.7 * cm], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
def bullets(items):
    for t in items:
        story.append(P(t, ParagraphStyle("bl", parent=base, leftIndent=12, bulletIndent=2, spaceAfter=3), bulletText="•"))
def box(title, text, kind="info"):
    bg, bar = (INFO_BG, BRAND) if kind == "info" else (WARN_BG, WARN_BAR)
    inner = [P(f"<b>{title}</b>", ParagraphStyle("bt", parent=base, spaceAfter=2)), P(text, ParagraphStyle("bb", parent=base, fontSize=9.4, leading=13.4, spaceAfter=0))]
    t = Table([[inner]], colWidths=[16.4 * cm], style=[("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 3, bar), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)])
    story.append(Spacer(1, 4)); story.append(KeepTogether([t])); story.append(Spacer(1, 6))
def table(header, rows, widths):
    data = [[P(h, cellh) for h in header]] + [[P(c, cellb if i == 0 else cell) for i, c in enumerate(r)] for r in rows]
    t = Table(data, colWidths=[w * cm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), BRAND), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("GRID", (0, 0), (-1, -1), 0.4, LINE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fd")]), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(t); story.append(Spacer(1, 8))
M = lambda s: f"<font name='LM'>{s}</font>"

story.append(P("Anhang B: API-Schlüssel erzeugen und hinterlegen", H1))
para("Der Blog-Assistent nutzt drei externe Dienste, die jeweils einen eigenen <b>API-Schlüssel</b> brauchen: <b>Anthropic</b> (Claude: Recherche, Entwürfe, Faktencheck), <b>OpenAI</b> (KI-Bilder und Bildstudio) und optional <b>Supermachine</b> (Bilder zu Beiträgen). Ein API-Schlüssel ist ein langer Text, der dein Konto beim Dienst ausweist. Er wird in der Datei <b>.env</b> im Programmordner eingetragen (siehe Abschnitt 2.3). Die Oberflächen der Anbieter ändern sich gelegentlich; Menünamen können daher leicht abweichen.")
box("Wichtig: API ist nicht Abo", "Ein Abonnement für den Chatbot (Claude Pro/Max oder ChatGPT Plus) enthält <b>keinen</b> API-Zugang. Die API wird getrennt abgerechnet, nach Verbrauch, mit eigenem Guthaben bzw. eigener Zahlungsmethode. Die Kosten je Beitrag zeigt dir die Seite „Kosten“ im Tool.", "warn")
table(["Dienst", "wofür", ".env-Eintrag", "Pflicht?"], [
    ["Anthropic (Claude)", "Themen, Recherche, Entwurf, Faktencheck, Nachschärfen", M("ANTHROPIC_API_KEY"), "ja"],
    ["OpenAI", "KI-Bilder zu Beiträgen, Bildstudio", M("IMAGE_PROVIDER=openai") + "<br/>" + M("IMAGE_API_KEY"), "nur für KI-Bilder"],
    ["Supermachine", "KI-Bilder zu Beiträgen (kein Bildstudio)", M("IMAGE_PROVIDER=supermachine") + "<br/>" + M("IMAGE_API_KEY"), "Alternative zu OpenAI"],
], [3.4, 6.2, 4.8, 2.0])

h2("B.1 Anthropic: Schlüssel für Claude (Pflicht)")
steps([
    f"<b>console.anthropic.com</b> öffnen und mit dem Konto anmelden bzw. ein Konto anlegen (die Anthropic <b>Console</b>, nicht claude.ai).",
    "<b>Guthaben bzw. Zahlungsmethode hinterlegen:</b> in der Console unter „Billing“ (Plans &amp; Billing) eine Zahlungsmethode eintragen und Guthaben kaufen. Ohne Guthaben antwortet die API mit einer Fehlermeldung. Optional dort ein <b>monatliches Ausgabenlimit</b> setzen.",
    "<b>Schlüssel erstellen:</b> in der Console „API keys“ (Settings) öffnen, <b>Create Key</b> wählen, einen Namen vergeben (z. B. „Blog-Assistent“) und, falls gefragt, den Workspace wählen (meist „Default“).",
    "Den angezeigten Schlüssel <b>sofort kopieren</b>: Er beginnt mit " + M("sk-ant-") + " und wird nur dieses eine Mal vollständig angezeigt. Geht er verloren, erstellst du einfach einen neuen.",
    f"In der <b>.env</b> eintragen (Zeile ohne Leerzeichen und ohne Anführungszeichen): " + M("ANTHROPIC_API_KEY=sk-ant-…") + " und <font name='LM'>AI_PROVIDER=claude</font> prüfen. Datei speichern.",
    "<b>start.cmd</b> neu ausführen. Beim Start prüft das Tool, ob ein Schlüssel eingetragen ist; im API-Fenster steht, welcher Schlüssel (nur Anfang und Ende) verwendet wird.",
    "<b>Prüfen:</b> Doppelklick auf <b>key-test.cmd</b> im Programmordner. Es testet Schlüssel, Workspace, Modell und Guthaben, kostet praktisch nichts und zeigt den Schlüssel nie an.",
])
box("Typische Meldungen", "„API key is not scoped to a workspace“: in der .env zusätzlich " + M("ANTHROPIC_WORKSPACE_ID=wrkspc_…") + " eintragen (ID des Workspaces aus der Console) oder in der Console einen Schlüssel innerhalb eines Workspaces erstellen. · 401: Schlüssel falsch kopiert oder gelöscht. · Fehler zu Guthaben/Billing: Guthaben in der Console aufladen. · Ist auf dem Rechner die Systemvariable " + M("ANTHROPIC_API_KEY") + " gesetzt, überstimmt sie die .env; dann diese Variable entfernen.", "info")

h2("B.2 OpenAI: Schlüssel für KI-Bilder und Bildstudio")
steps([
    "<b>platform.openai.com</b> öffnen und anmelden (die API-Plattform, nicht chatgpt.com). Ein ChatGPT-Abo genügt nicht.",
    "<b>Abrechnung einrichten:</b> unter Settings → Billing eine Zahlungsmethode hinterlegen und Guthaben aufladen. Optional ein Ausgabenlimit festlegen.",
    "<b>Organisation verifizieren, falls verlangt:</b> Für Bildmodelle verlangt OpenAI häufig eine verifizierte Organisation (Settings → Organization → Verification, mit Ausweisprüfung). Fehlt sie, meldet das Tool das ausdrücklich („Organisation muss verifiziert sein“).",
    "<b>Schlüssel erstellen:</b> unter „API keys“ <b>Create new secret key</b>, Namen vergeben (z. B. „Blog-Assistent“). Bei eingeschränkten Rechten muss der Zugriff auf die <b>Images</b>-API erlaubt sein; am einfachsten „All“.",
    "Den Schlüssel (beginnt mit " + M("sk-") + ") <b>sofort kopieren</b>; er wird nur einmal angezeigt.",
    "In der <b>.env</b> eintragen: " + M("IMAGE_PROVIDER=openai") + " und " + M("IMAGE_API_KEY=sk-…") + ". Das Bildmodell wählt das Tool selbst (Standard gpt-image-2); bei Bedarf " + M("IMAGE_MODEL") + " setzen. Optional " + M("IMAGE_QUALITY=medium") + " (low/medium/high; höher kostet mehr) und " + M("IMAGE_COST_USD") + " (Kosten je Bild in US-Dollar für die Kostenübersicht).",
    "Datei speichern, <b>start.cmd</b> neu ausführen, im Beitrag unter Reiter „Bild“ ein Bild erzeugen oder im Bildstudio ein Foto umgestalten.",
])
h2("B.3 Supermachine: Schlüssel (optional)")
steps([
    "Auf <b>supermachine.art</b> anmelden und im <b>Profil</b> den API-Schlüssel erzeugen bzw. kopieren (er beginnt mit " + M("sk-") + ").",
    "In der <b>.env</b>: " + M("IMAGE_PROVIDER=supermachine") + " und " + M("IMAGE_API_KEY=sk-…") + ". Optional " + M("IMAGE_MODEL") + ", " + M("IMAGE_WIDTH") + " und " + M("IMAGE_HEIGHT") + " (Standard 1024x768). Liefert das Modell mit deutschen Prompts schwache Ergebnisse, " + M("IMAGE_PROMPT_LANGUAGE=en") + " setzen.",
    "Speichern und <b>start.cmd</b> neu ausführen. Das <b>Bildstudio</b> funktioniert mit Supermachine nicht; dafür braucht es OpenAI.",
])

h2("B.4 So bearbeitest du die .env")
steps([
    "Im Programmordner die Datei <b>.env</b> mit dem Editor (Notepad) öffnen: Rechtsklick → „Öffnen mit“ → Editor. Ist sie nicht sichtbar, im Explorer unter Ansicht „Ausgeblendete Elemente“ einblenden.",
    "Pro Zeile ein Eintrag in der Form " + M("NAME=Wert") + ": kein Leerzeichen um das Gleichheitszeichen, keine Anführungszeichen. Zeilen mit " + M("#") + " am Anfang sind Kommentare.",
    "Speichern, <b>start.cmd</b> (neu) ausführen. Änderungen an der .env wirken erst nach dem Neustart.",
])
box("Sicherheit", "Schlüssel sind wie Passwörter: nicht per Mail oder Chat weitergeben, nicht in Screenshots zeigen und nicht in einen geteilten Cloud-Ordner legen. Die .env bleibt auf deinem PC (sie ist nicht Teil der Sicherung und nicht im Git); bewahre eine Kopie getrennt auf (siehe Umzug, Kapitel 13). Bei Verdacht auf Missbrauch den Schlüssel beim Anbieter löschen und einen neuen erstellen. Setze bei beiden Anbietern ein <b>Ausgabenlimit</b>, damit ein Fehler nie unbemerkt hohe Kosten verursacht.", "warn")
box("Wenn etwas nicht klappt", "Anthropic: key-test.cmd ausführen und die Meldung lesen. OpenAI/Supermachine: Bild erzeugen; das Tool nennt Ursache und Abhilfe (Schlüssel, Guthaben, Verifizierung, Modell). Weitere Hinweise: Kapitel 12 „Fehlerbehebung“.", "info")

# ------------------------------------------------------------------ Seiten bauen und anhaengen
src, = sys.argv[1:2] or ["Nutzungsleitfaden-Blog-Assistent.pdf"]
reader = PdfReader(src)
first_no = len(reader.pages) + 1

def on_page(canv, doc):
    canv.saveState()
    canv.setStrokeColor(LINE); canv.line(2.3 * cm, 1.55 * cm, A4[0] - 2.3 * cm, 1.55 * cm)
    canv.setFont("LS", 8); canv.setFillColor(MUTED)
    canv.drawString(2.3 * cm, 1.05 * cm, "Blog-Assistent – Nutzungsleitfaden")
    canv.drawRightString(A4[0] - 2.3 * cm, 1.05 * cm, f"Seite {first_no + doc.page - 1}")
    canv.restoreState()

buf = io.BytesIO()
doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=2.3 * cm, rightMargin=2.3 * cm, topMargin=2.2 * cm, bottomMargin=2.2 * cm)
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(2.3 * cm, 2.2 * cm, A4[0] - 4.6 * cm, A4[1] - 4.4 * cm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
doc.build(story)
buf.seek(0)
extra = PdfReader(buf)
w = PdfWriter(clone_from=reader)
w.add_outline_item("Anhang B: API-Schlüssel erzeugen und hinterlegen", first_no - 1)
for p in extra.pages:
    w.add_page(p)
with open(src, "wb") as fh:
    w.write(fh)
print("OK", src, len(w.pages), "Seiten")
