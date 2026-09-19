"""Second pass for i18n-wrap: string literals inside a prop's {expression},
e.g. label={inChina ? "On the floor" : "In Dar"}. FN is T (server) or tx (client)."""
import re, sys
FN = sys.argv[1]
PROPS = r"(label|title|description|placeholder|hint|caption|subtitle|deltaLabel|secondaryLabel|explanation)"
ATTR = re.compile(PROPS + r"=\{((?:[^{}]|\{[^{}]*\})*)\}")
LIT = re.compile(r'(?<![\w.(])"([A-Z][^"\\]*[a-z][^"\\]*)"')
for path in sys.argv[2:]:
    s = open(path).read(); n = 0
    def attr(m):
        global n
        body = m.group(2)
        if body.startswith(FN + "(") and body.endswith(")") and body.count('"') == 2:
            return m.group(0)
        def lit(l):
            global n
            before = body[:l.start()]
            if before.rstrip().endswith(FN + "("):
                return l.group(0)
            n += 1
            return f'{FN}("{l.group(1)}")'
        return f"{m.group(1)}={{{LIT.sub(lit, body)}}}"
    out = ATTR.sub(attr, s)
    if n: open(path, "w").write(out)
    print(n, path)
