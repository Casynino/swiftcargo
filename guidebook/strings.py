import re,sys,io
for p in sys.argv[1:]:
    s=io.open(p,encoding="utf-8").read()
    found=[]
    for m in re.finditer(r'(?:\btx|\bt|\bT|tr)\(\s*(?:locale\s*,\s*|null\s*,\s*)?"((?:[^"\\]|\\.){2,200})"',s):
        found.append(m.group(1))
    for m in re.finditer(r'<Label[^>]*>\s*([^<{][^<]{1,80})</Label>',s): found.append("LABEL: "+m.group(1).strip())
    seen=[];[seen.append(x) for x in found if x not in seen]
    print(f"### {p} ({len(seen)})"); print(" | ".join(seen)[:6000]); print()
