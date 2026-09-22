"""Build the Swift Cargo guidebooks.

    python3 guidebook/build.py            # every PDF
    python3 guidebook/build.py china_zh   # one guide

Two passes per PDF: print, read which page each heading landed on, write
those numbers into the table of contents, print again.
"""
import html, os, re, subprocess, sys, base64, datetime

sys.path.insert(0, "guidebook")
from kit import Guide  # noqa: E402

VERSION = "1.0"
DATE = "September 2026"
OUT_HTML = "guidebook/out/html"
OUT_PDF = "guidebook/pdf"
os.makedirs(OUT_HTML, exist_ok=True)
os.makedirs(OUT_PDF, exist_ok=True)

LOGO = "data:image/png;base64," + base64.b64encode(open("public/brand/swift-cargo.png", "rb").read()).decode()

CSS = r"""
@page { size: A4; margin: 17mm 15mm 16mm 15mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Inter", "Helvetica Neue", Arial, sans-serif; font-size: 9.6pt; line-height: 1.5; color: #1e293b; margin: 0; }
body.zh { font-family: "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", sans-serif; font-size: 10pt; line-height: 1.7; }
.mk { color: #fff; font-size: 1px; }
h1, h2, h3, h4, h5 { color: #0b2742; line-height: 1.25; }
.chapter { page-break-before: always; margin: 0 0 6mm; padding: 9mm 0 6mm; border-bottom: 3px solid #0e4c87; }
.chapter h1 { font-size: 24pt; margin: 0; letter-spacing: -.01em; }
.chnum { display: inline-block; min-width: 13mm; color: #f97316; }
.lead { font-size: 11pt; color: #475569; margin: 3mm 0 0; }
h2 { font-size: 15pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid #cbd5e1; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 10.2pt; margin: 4.5mm 0 1.6mm; color: #0e4c87; text-transform: uppercase; letter-spacing: .05em; page-break-after: avoid; }
h5 { font-size: 9.6pt; margin: 3mm 0 1mm; }
p { margin: 0 0 2.2mm; }
ul, ol { margin: 0 0 2.5mm; padding-left: 5.5mm; }
li { margin: 0 0 1mm; }
b, strong { color: #0b2742; }
code, .route { font-family: "SF Mono", Menlo, monospace; font-size: 8.4pt; }
.pill { display: inline-block; background: #0e4c87; color: #fff; border-radius: 999px; padding: .6mm 3.2mm; font-weight: 600; font-size: 9pt; }
.pb { page-break-after: always; }

/* page template */
.pg { margin: 7mm 0 4mm; }
.pghead { display: flex; align-items: center; justify-content: space-between; gap: 4mm; background: #0b2742; color: #fff; padding: 2.8mm 4mm; border-radius: 2.5mm 2.5mm 0 0; page-break-after: avoid; }
.pgname { font-size: 13pt; font-weight: 700; }
.route { background: rgba(255,255,255,.14); color: #dbeafe; padding: .6mm 2mm; border-radius: 1.5mm; }
table { border-collapse: collapse; width: 100%; margin: 0 0 3mm; page-break-inside: auto; }
tr { page-break-inside: avoid; }
table.kv th { text-align: left; vertical-align: top; width: 27%; background: #eef4fb; color: #0b2742; font-weight: 600; padding: 1.8mm 2.5mm; border: 1px solid #d6e2ef; }
table.kv td { vertical-align: top; padding: 1.8mm 2.5mm; border: 1px solid #d6e2ef; }
table.kv.small th, table.kv.small td { font-size: 8.8pt; padding: 1.3mm 2.2mm; }
table.kv td ul { margin: 0; }
table.t th { background: #0e4c87; color: #fff; text-align: left; padding: 1.8mm 2.2mm; font-size: 8.8pt; }
table.t td { border-bottom: 1px solid #e2e8f0; padding: 1.6mm 2.2mm; vertical-align: top; font-size: 8.9pt; }
table.t tbody tr:nth-child(even) td { background: #f8fafc; }
.btn { border: 1px solid #d6e2ef; border-left: 3px solid #f97316; border-radius: 2mm; padding: 2.2mm 2.5mm 0; margin: 0 0 3mm; page-break-inside: avoid; }
.btnname { margin-bottom: 1.8mm; }
.box { border-radius: 2mm; padding: 2.6mm 3.2mm; margin: 0 0 3mm; page-break-inside: avoid; }
.box.note { background: #eff6ff; border: 1px solid #bfdbfe; }
.box.warn { background: #fff7ed; border: 1px solid #fdba74; }
.box.rule { background: #0b2742; color: #fff; font-weight: 600; font-size: 11pt; text-align: center; padding: 4mm; }
.box.rule b { color: #fdba74; }
.box.example { background: #f8fafc; border: 1px dashed #94a3b8; }
.ico { display: inline-block; width: 4.6mm; height: 4.6mm; border-radius: 999px; background: #f97316; color: #fff; text-align: center; font-weight: 800; line-height: 4.6mm; margin-right: 2mm; font-size: 8pt; }
ul.mist li::marker { color: #dc2626; }
ul.cols { columns: 2; column-gap: 7mm; font-size: 8.6pt; }
ul.cols li { break-inside: avoid; margin-bottom: .6mm; }
ul.muted { color: #64748b; }

/* screenshots */
.shots { margin: 1mm 0 4mm; page-break-inside: auto; }
figure.shot { margin: 0 0 3mm; page-break-inside: avoid; text-align: center; }
figure.shot img { border: 1px solid #cbd5e1; border-radius: 2mm; box-shadow: 0 1mm 3mm rgba(15,23,42,.08); display: block; margin: 0 auto; }
figure.shot.d img { width: 100%; max-height: 205mm; object-fit: contain; object-position: top; }
.shots .row { display: flex; gap: 5mm; justify-content: center; align-items: flex-start; page-break-inside: avoid; }
figure.shot.m img { width: 62mm; max-height: 200mm; object-fit: contain; object-position: top; border-radius: 4mm; }
figure.shot.t img { width: 96mm; max-height: 200mm; object-fit: contain; object-position: top; }
figcaption { font-size: 8pt; color: #64748b; margin-top: 1.4mm; }
.legend { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 2mm; padding: 2mm 3mm; margin: 0 0 3mm; font-size: 8.9pt; columns: 2; page-break-inside: avoid; }
.legend b { display: block; column-span: all; margin-bottom: 1mm; }
.legend div { break-inside: avoid; margin-bottom: .8mm; }
.dot { display: inline-block; width: 4.8mm; height: 4.8mm; border-radius: 999px; background: #f97316; color: #fff; text-align: center; font-weight: 700; line-height: 4.8mm; margin-right: 1.6mm; font-size: 8pt; }
.missing { border: 1px dashed #f87171; color: #b91c1c; padding: 3mm; font-size: 8pt; }

/* flows */
.flow { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1.5mm 0; margin: 2mm 0 4mm; page-break-inside: avoid; }
.fstep { display: flex; flex-direction: column; align-items: center; max-width: 30mm; }
.fbox { background: #0e4c87; color: #fff; border-radius: 2mm; padding: 2mm 2.4mm; font-weight: 600; font-size: 8.6pt; text-align: center; min-height: 9mm; display: flex; align-items: center; }
.flow.compact .fbox { font-size: 8pt; padding: 1.4mm 2mm; }
.fown { font-size: 7.4pt; color: #f97316; font-weight: 700; margin-top: .8mm; text-align: center; text-transform: uppercase; letter-spacing: .03em; }
.farrow { color: #f97316; font-weight: 800; font-size: 13pt; padding: 1.8mm 1.2mm 0; }
.vflow { margin: 2mm 0 4mm; }
.vrow { display: flex; border: 1px solid #d6e2ef; border-radius: 2mm; overflow: hidden; page-break-inside: avoid; }
.vown { width: 34mm; background: #0e4c87; color: #fff; font-weight: 700; font-size: 8.4pt; padding: 2mm; display: flex; align-items: center; }
.vstep { flex: 1; padding: 1.8mm 2.5mm; }
.vstep b { display: block; }
.vstep span { font-size: 8.8pt; color: #475569; }
.vdown { text-align: center; color: #f97316; font-weight: 800; line-height: 1.1; }

/* gaps and quick references */
.gaps { border: 2px dashed #94a3b8; border-radius: 3mm; padding: 3mm 4mm; margin: 6mm 0 4mm; background: #f8fafc; page-break-inside: avoid; }
.gt { display: inline-block; background: #475569; color: #fff; font-weight: 700; padding: .6mm 3mm; border-radius: 999px; font-size: 8.4pt; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 1.5mm; }
.qref { border: 2px solid #0e4c87; border-radius: 3mm; padding: 4mm 5mm; margin: 0 0 5mm; page-break-inside: avoid; }
.qt { font-size: 14pt; font-weight: 800; color: #0b2742; }
.qchain { margin: 2mm 0 3mm; font-weight: 700; color: #f97316; font-size: 11pt; }

/* cover and contents */
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(160deg, #0b2742 0%, #0e4c87 62%, #1d6fb8 100%); color: #fff; border-radius: 4mm; padding: 18mm 16mm; page-break-after: always; }
.cover img { width: 30mm; background: #fff; border-radius: 4mm; padding: 2mm; }
.cover .brand { font-size: 13pt; font-weight: 800; letter-spacing: .3em; margin-top: 4mm; }
.cover .tag { color: #fdba74; font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; }
.cover h1 { color: #fff; font-size: 30pt; margin: 0 0 4mm; line-height: 1.12; }
.cover .sub { font-size: 13pt; color: #dbeafe; max-width: 150mm; }
.cover .meta { font-size: 9.5pt; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,.25); padding-top: 4mm; display: flex; justify-content: space-between; }
.toc { page-break-after: always; }
.toc h1 { font-size: 20pt; margin: 4mm 0 5mm; border-bottom: 3px solid #0e4c87; padding-bottom: 3mm; }
.toc a { color: inherit; text-decoration: none; display: flex; align-items: baseline; }
.toc a .t { flex: 0 1 auto; }
.toc a .dots { flex: 1; border-bottom: 1px dotted #94a3b8; margin: 0 2mm; transform: translateY(-1mm); }
.toc a .n { font-variant-numeric: tabular-nums; }
.toc .l1 { font-weight: 700; font-size: 10.5pt; margin: 3mm 0 1mm; color: #0b2742; }
.toc .l2 { padding-left: 5mm; font-size: 9.3pt; margin: .6mm 0; }
.toc .l3 { padding-left: 10mm; font-size: 8.6pt; color: #475569; margin: .3mm 0; }
"""


def document(guide, title, subtitle, audience, toc_pages=None, toc_levels=3):
    g = guide
    toc = ['<div class="toc"><h1>' + g.L["contents"] + "</h1>"]
    for level, hid, text in g.toc:
        if level > toc_levels:
            continue
        n = (toc_pages or {}).get(hid, "")
        toc.append(f'<div class="l{level}"><a href="#{hid}"><span class="t">{html.escape(text)}</span><span class="dots"></span><span class="n">{n}</span></a></div>')
    toc.append("</div>")
    cover = f"""<div class="cover">
      <div><img src="{LOGO}"><div class="brand">SWIFT CARGO</div><div class="tag">{'准时送达 · 广州 → 达累斯萨拉姆' if g.lang == 'zh' else 'On time, every time · Guangzhou → Dar es Salaam'}</div></div>
      <div><div class="tag">{html.escape(audience)}</div><h1>{html.escape(title)}</h1><div class="sub">{html.escape(subtitle)}</div></div>
      <div class="meta"><span>{g.L['version']} {VERSION} · {'2026年9月' if g.lang == 'zh' else DATE}</span><span>www.swiftcargotz.com</span></div></div>"""
    return f"""<!doctype html><html lang="{'zh-CN' if g.lang == 'zh' else 'en'}"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
      <style>{CSS}</style></head><body class="{g.lang}">{cover}{''.join(toc)}{g.html()}</body></html>"""


def pages_of(pdf, ids):
    """Which page each marker '@@hN@@' landed on."""
    found = {}
    count = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    for page in range(1, count + 1):
        text = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), pdf, "-"], capture_output=True, text=True).stdout
        for m in re.finditer(r"@@(h\d+)@@", text):
            found.setdefault(m.group(1), page)
    return found, count


def render(name, guide, title, subtitle, audience, header, toc_levels=3):
    stem = os.path.join(OUT_HTML, name)
    pdf = os.path.join(OUT_PDF, f"{name}.pdf")
    footer = f"{title} · v{VERSION}"
    for attempt in range(2):
        pages = None if attempt == 0 else toc
        open(stem + ".html", "w", encoding="utf-8").write(document(guide, title, subtitle, audience, pages, toc_levels))
        subprocess.run(["node", "guidebook/print.mjs", stem + ".html", pdf, header, footer], check=True)
        if attempt == 0:
            toc, total = pages_of(pdf, [h for _, h, _ in guide.toc])
    _, total = pages_of(pdf, [])
    size = os.path.getsize(pdf) / 1e6
    print(f"  {pdf}  {total} pages  {size:.1f} MB")
    return pdf


if __name__ == "__main__":
    import guides
    only = sys.argv[1:] or None
    guides.build_all(render, only)
