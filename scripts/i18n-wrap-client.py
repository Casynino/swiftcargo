"""
The client-component half of i18n-wrap.py: wraps JSX text and string props in
tx(), and gives every component function that now uses it `const tx = useT();`.
`python3 scripts/i18n-wrap-client.py FILE…` — then `npx tsc --noEmit`.
"""
import re, sys

PROPS = r"(label|title|description|placeholder|hint|caption|subtitle|emptyText|confirmLabel|cancelLabel|submitLabel|aria-label)"
TEXT = re.compile(r'(?<![=\-])>(\s*)([A-Z][^<>{}"`;=|&]*?[A-Za-z0-9.?!:)%…])(\s*)<(?![=])')
PROP = re.compile(PROPS + r'="([A-Za-z][^"{}]*)"')

def js(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def functions(src):
    """(start_of_body, end_of_body) for every Capitalised function component."""
    out = []
    for m in re.finditer(r'(?:^|\n)\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(', src):
        i = m.end() - 1
        depth = 0
        while i < len(src):
            if src[i] == '(': depth += 1
            elif src[i] == ')':
                depth -= 1
                if depth == 0: break
            i += 1
        j = src.find('{', i)
        # skip a return type annotation like ): JSX.Element {
        k, depth = j, 0
        while k < len(src):
            if src[k] == '{': depth += 1
            elif src[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        out.append((j + 1, k))
    return out

for path in sys.argv[1:]:
    src = open(path).read()
    if '"use client"' not in src[:40]:
        print("not client", path); continue
    marks = []
    def text(m):
        body = re.sub(r"\s+", " ", m.group(2)).strip()
        if not re.search(r"[a-z]{2}", body):
            return m.group(0)
        return f">{m.group(1)}{{tx({js(body)})}}{m.group(3)}<"
    out = TEXT.sub(text, src)
    def prop(m):
        if m.group(2).startswith("/") or not re.search(r"[a-z]{2}", m.group(2)):
            return m.group(0)
        return f'{m.group(1)}={{tx({js(m.group(2))})}}'
    out = PROP.sub(prop, out)
    if out == src:
        print("nothing", path); continue
    # give each component that now calls tx() the hook, innermost insertions last
    inserts = []
    for a, b in functions(out):
        body = out[a:b]
        if "tx(" in body and "const tx = useT()" not in body:
            inserts.append(a)
    for a in sorted(inserts, reverse=True):
        out = out[:a] + "\n  const tx = useT();" + out[a:]
    if 'useT' not in re.findall(r'import[^;]*locale-provider[^;]*;', out).__str__():
        imports = list(re.finditer(r'^import[^;]*;\s*$', out, re.M))
        at = imports[-1].end() if imports else 0
        out = out[:at] + '\nimport { useT } from "@/components/app/locale-provider";' + out[at:]
    open(path, "w").write(out)
    print(len(inserts), "components", path)
