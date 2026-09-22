# Swift Cargo user guidebook

Staff and customer manuals, generated from the running system.

    # 1. inventory from the code (menus, permissions, UI wording, Chinese dictionary)
    npx tsx guidebook/inventory.cts
    python3 guidebook/strings.py $(find app components -name "*.tsx") > guidebook/data/strings.txt
    npx tsx guidebook/zh-dump.cts
    # 2. a production copy of the app on :3178 against the local database
    NEXT_DIST_DIR=.next-guide NEXT_PUBLIC_SITE_URL=https://www.swiftcargotz.com npx next build
    NEXT_DIST_DIR=.next-guide NEXT_PUBLIC_SITE_URL=https://www.swiftcargotz.com npx next start -p 3178
    # 3. screenshots (sign in as each role, desktop/phone/tablet, personal data masked)
    python3 guidebook/make_shots.py && node guidebook/shoot.mjs guidebook/shots.json
    # 4. PDFs (two passes: the table of contents gets real page numbers)
    python3 guidebook/build.py            # all ten
    python3 guidebook/build.py china_zh   # one

`make_shots.py` names local demo records by id; after a data reset, pick new ones.
The guides are `g_*.py`; shared chapters are in `common.py`; layout in `kit.py`/`build.py`.
Output: `guidebook/pdf/` (not committed).
