"""Append Chinese entries to Swift's own block in lib/i18n.ts, skipping keys already present."""
import json, re, sys
entries = json.load(open(sys.argv[1]))
p = 'lib/i18n.ts'; s = open(p).read()
mark = "  // ----------------------------------------------------------- Swift's own\n"
head, tail = s.split(mark, 1)
existing = set(json.loads(m) for m in re.findall(r'^\s*("(?:[^"\\]|\\.)*")\s*:', s, re.M))
add = [f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}," for k, v in entries.items() if k not in existing]
s = head + mark + "\n".join(add) + ("\n" if add else "") + tail
open(p, 'w').write(s)
print(len(add), "added")
