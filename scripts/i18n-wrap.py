"""
Wrap the English a server screen prints in T(), so it reads in the viewer's
language. `python3 scripts/i18n-wrap.py FILE…`

Only plain JSX text and a short list of string props are touched; text mixed
with {expressions} is left for a person. Client components are skipped — they
translate with useT(). Run `npx tsc --noEmit` after: anything this gets wrong,
the compiler says.
"""
import re, sys

PROPS = r"(label|title|description|placeholder|hint|caption|subtitle|emptyText|deltaLabel|secondaryLabel|explanation|fallbackLabel)"
TEXT = re.compile(r'(?<![=\-])>(\s*)([A-Z][^<>{}"`;=|&]*?[A-Za-z0-9.?!:)%])(\s*)<(?![=])')
PROP = re.compile(PROPS + r'="([A-Za-z][^"{}]*)"')

def js(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

for path in sys.argv[1:]:
    src = open(path).read()
    if src.lstrip().startswith('"use client"') or src.lstrip().startswith("'use client'"):
        print("skip client", path); continue
    n = 0
    def text(m):
        global n
        body = re.sub(r"\s+", " ", m.group(2)).strip()
        if not re.search(r"[a-z]{2}", body) or body.startswith("http"):
            return m.group(0)
        n += 1
        return f">{m.group(1)}{{T({js(body)})}}{m.group(3)}<"
    out = TEXT.sub(text, src)
    def prop(m):
        global n
        if m.group(2).startswith("/") or not re.search(r"[a-z]{2}", m.group(2)):
            return m.group(0)
        n += 1
        return f'{m.group(1)}={{T({js(m.group(2))})}}'
    out = PROP.sub(prop, out)
    if n == 0:
        print("nothing", path); continue
    if 'from "@/lib/server-t"' not in out:
        # after the last import line
        imports = list(re.finditer(r'^import[^;]*;\s*$', out, re.M))
        at = imports[-1].end() if imports else 0
        out = out[:at] + '\nimport { primeLocale, T } from "@/lib/server-t";' + out[at:]
    m = re.search(r'export default async function \w*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{', out, re.S)
    if m and "await primeLocale()" not in out:
        out = out[:m.end()] + "\n  await primeLocale();" + out[m.end():]
    open(path, "w").write(out)
    print(n, path)
