"""Building blocks for the guidebook: HTML fragments that the guides compose.

Every guide module calls these; build.py turns the result into PDFs.
"""
import html, os, json

SHOTS = "guidebook/out/shots"
LOG = {}
for f in os.listdir("guidebook/out") if os.path.isdir("guidebook/out") else []:
    if f.startswith("shots-log") and f.endswith(".json"):
        for row in json.load(open(os.path.join("guidebook/out", f))):
            LOG[f"{row['id']}-{row['v']}"] = row

LANG = {"en": {
    "purpose": "Purpose", "who": "Who uses it", "open": "How to open it", "see": "What you see",
    "fields": "Fields", "field": "Field", "required": "Required", "enter": "What to enter", "rules": "Important rules",
    "buttons": "Buttons & actions", "perm": "Permissions", "workflow": "Workflow", "example": "Example",
    "mistakes": "Common mistakes", "trouble": "Troubleshooting", "desktop": "Desktop", "mobile": "Phone",
    "tablet": "Tablet", "button": "Button", "whouse": "Who can use it", "when": "When to use it",
    "does": "What it does", "changes": "What changes", "next": "What happens next", "wrong": "If pressed by mistake",
    "yes": "Yes", "no": "No", "cur": "Current system", "miss": "Missing / incomplete", "rec": "Recommended improvement",
    "gaps": "System gaps", "callouts": "On the screen", "problem": "Problem", "cause": "Likely cause", "fix": "What to do",
    "fig": "Figure", "page": "Page", "contents": "Contents", "version": "Version",
}, "zh": {
    "purpose": "用途", "who": "使用人员", "open": "进入方式", "see": "页面内容",
    "fields": "字段说明", "field": "字段", "required": "是否必填", "enter": "填写内容", "rules": "注意事项",
    "buttons": "按钮与操作", "perm": "权限", "workflow": "工作流程", "example": "示例",
    "mistakes": "常见错误", "trouble": "问题处理", "desktop": "电脑端", "mobile": "手机端",
    "tablet": "平板端", "button": "按钮", "whouse": "可操作人员", "when": "何时使用",
    "does": "作用", "changes": "系统变化", "next": "后续流程", "wrong": "误操作时",
    "yes": "是", "no": "否", "cur": "当前功能", "miss": "尚未实现 / 不完善", "rec": "改进建议",
    "gaps": "系统待完善事项", "callouts": "图中标注", "problem": "问题", "cause": "可能原因", "fix": "处理方法",
    "fig": "图", "page": "页", "contents": "目录", "version": "版本",
}}


class Guide:
    """Collects one guide's HTML and its headings (for the table of contents)."""

    def __init__(self, lang="en"):
        self.lang = lang
        self.L = LANG[lang]
        self.parts = []
        self.toc = []  # (level, id, text)
        self.fig = 0
        self._n = 0

    # ------------------------------------------------------------- structure
    def _id(self):
        self._n += 1
        return f"h{self._n}"

    def chapter(self, title, lead=None, number=None):
        hid = self._id()
        self.toc.append((1, hid, title))
        num = f'<span class="chnum">{html.escape(str(number))}</span>' if number is not None else ""
        self.parts.append(
            f'<section class="chapter"><h1 id="{hid}">{num}{html.escape(title)}<span class="mk">@@{hid}@@</span></h1>'
            + (f'<p class="lead">{lead}</p>' if lead else "")
            + "</section>"
        )

    def h2(self, title):
        hid = self._id()
        self.toc.append((2, hid, title))
        self.parts.append(f'<h2 id="{hid}">{html.escape(title)}<span class="mk">@@{hid}@@</span></h2>')

    def h3(self, title):
        self.parts.append(f"<h3>{html.escape(title)}</h3>")

    def raw(self, s):
        self.parts.append(s)

    def p(self, *texts):
        for t in texts:
            self.parts.append(f"<p>{t}</p>")

    def ul(self, items, cls=""):
        self.parts.append(f'<ul class="{cls}">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>")

    def ol(self, items):
        self.parts.append("<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>")

    def note(self, text, title=None):
        self.parts.append(f'<div class="box note">{f"<b>{title}</b> " if title else ""}{text}</div>')

    def warn(self, text, title=None):
        self.parts.append(f'<div class="box warn"><span class="ico">!</span>{f"<b>{title}</b> " if title else ""}{text}</div>')

    def rule(self, text):
        self.parts.append(f'<div class="box rule">{text}</div>')

    def table(self, head, rows, widths=None, cls=""):
        cols = "".join(f'<col style="width:{w}">' for w in widths) if widths else ""
        th = "".join(f"<th>{h}</th>" for h in head)
        body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
        self.parts.append(f'<table class="t {cls}"><colgroup>{cols}</colgroup><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>')

    def kv(self, rows):
        self.parts.append('<table class="kv">' + "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in rows) + "</table>")

    def flow(self, steps, owners=None, compact=False):
        """A horizontal (wrapping) flow of boxes with arrows. owners: parallel list of small labels."""
        cells = []
        for i, s in enumerate(steps):
            o = owners[i] if owners else ""
            cells.append(f'<div class="fstep"><div class="fbox">{s}</div>{f"<div class=fown>{o}</div>" if o else ""}</div>')
            if i < len(steps) - 1:
                cells.append('<div class="farrow">→</div>')
        self.parts.append(f'<div class="flow{" compact" if compact else ""}">{"".join(cells)}</div>')

    def vflow(self, rows):
        """A vertical swim-lane: rows of (owner, step, detail)."""
        out = ['<div class="vflow">']
        for i, (owner, step, detail) in enumerate(rows):
            out.append(f'<div class="vrow"><div class="vown">{owner}</div><div class="vstep"><b>{step}</b><span>{detail}</span></div></div>')
            if i < len(rows) - 1:
                out.append('<div class="vdown">↓</div>')
        out.append("</div>")
        self.parts.append("".join(out))

    # ------------------------------------------------------------- screenshots
    def _img(self, sid, v, cap):
        f = f"{SHOTS}/{sid}-{v}.jpg"
        if not os.path.exists(f):
            return f'<div class="missing">[{sid}-{v}]</div>'
        return f'<figure class="shot {v}"><img src="../print/{sid}-{v}.jpg"><figcaption>{cap}</figcaption></figure>'

    def shots(self, sid, caption, views=("d", "m"), callouts=None):
        """Desktop full width, then phone (and tablet) beside each other."""
        self.fig += 1
        L = self.L
        n = self.fig
        out = ['<div class="shots">']
        if "d" in views:
            out.append(self._img(sid, "d", f'{L["fig"]} {n}a — {caption} · <i>{L["desktop"]}</i>'))
        rest = [v for v in views if v != "d"]
        if rest:
            out.append('<div class="row">')
            for v in rest:
                lab = L["mobile"] if v == "m" else L["tablet"]
                out.append(self._img(sid, v, f'{L["fig"]} {n}{"b" if v == "m" else "c"} — {lab}'))
            out.append("</div>")
        if callouts:
            out.append(f'<div class="legend"><b>{L["callouts"]}</b>' + "".join(
                f'<div><span class="dot">{k}</span>{t}</div>' for k, t in callouts) + "</div>")
        out.append("</div>")
        self.parts.append("".join(out))

    # ------------------------------------------------------------- the page template
    def page(self, name, route, purpose, who, how, see=None, fields=None, buttons=None, perms=None,
             workflow=None, example=None, mistakes=None, trouble=None, shot=None, views=("d", "m"),
             callouts=None, caption=None):
        L = self.L
        hid = self._id()
        self.toc.append((3, hid, name))
        self.parts.append(
            f'<div class="pg"><div class="pghead" id="{hid}"><span class="pgname">{html.escape(name)}<span class="mk">@@{hid}@@</span></span>'
            + (f'<code class="route">{html.escape(route)}</code>' if route else "") + "</div>")
        self.kv([(L["purpose"], purpose), (L["who"], who), (L["open"], how)])
        if see:
            self.h4(L["see"])
            if isinstance(see, (list, tuple)):
                self.ul(see)
            else:
                self.p(see)
        if shot:
            self.shots(shot, caption or name, views, callouts)
        if fields:
            self.h4(L["fields"])
            self.table([L["field"], L["required"], L["enter"], L["rules"]], fields, ["18%", "10%", "32%", "40%"])
        if buttons:
            self.h4(L["buttons"])
            for b in buttons:
                self.button(**b)
        if perms:
            self.h4(L["perm"])
            self.ul(perms) if isinstance(perms, (list, tuple)) else self.p(perms)
        if workflow:
            self.h4(L["workflow"])
            self.p(workflow) if isinstance(workflow, str) else self.ol(workflow)
        if example:
            self.h4(L["example"])
            self.raw(f'<div class="box example">{example}</div>')
        if mistakes:
            self.h4(L["mistakes"])
            self.ul(mistakes, "mist")
        if trouble:
            self.h4(L["trouble"])
            self.table([L["problem"], L["fix"]], trouble, ["38%", "62%"])
        self.parts.append("</div>")

    def h4(self, t):
        self.parts.append(f"<h4>{html.escape(t)}</h4>")

    def button(self, name, who, when, does, changes=None, next=None, wrong=None):
        L = self.L
        rows = [(L["whouse"], who), (L["when"], when), (L["does"], does)]
        if changes:
            rows.append((L["changes"], changes if isinstance(changes, str) else "<ul>" + "".join(f"<li>{c}</li>" for c in changes) + "</ul>"))
        if next:
            rows.append((L["next"], next))
        if wrong:
            rows.append((L["wrong"], wrong))
        self.parts.append(f'<div class="btn"><div class="btnname"><span class="pill">{html.escape(name)}</span></div>'
                          + '<table class="kv small">' + "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in rows) + "</table></div>")

    def gaps(self, current, missing, recommended):
        L = self.L
        self.parts.append(
            f'<div class="gaps"><div class="gt">{L["gaps"]}</div>'
            f'<h5>{L["cur"]}</h5><ul>{"".join(f"<li>{x}</li>" for x in current)}</ul>'
            f'<h5>{L["miss"]}</h5><ul>{"".join(f"<li>{x}</li>" for x in missing)}</ul>'
            f'<h5>{L["rec"]}</h5><ul>{"".join(f"<li>{x}</li>" for x in recommended)}</ul></div>')

    def quickref(self, title, chain, lines):
        self.parts.append(
            f'<div class="qref"><div class="qt">{title}</div><div class="qchain">{chain}</div>'
            f'<ul>{"".join(f"<li>{l}</li>" for l in lines)}</ul></div>')

    def pagebreak(self):
        self.parts.append('<div class="pb"></div>')

    def html(self):
        return "\n".join(self.parts)
