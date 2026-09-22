"""The guidebook's screenshot list. Writes guidebook/shots.json for shoot.mjs.

Every path is a real route; the ids are local demo records (see README).
"""
import json

CARGO_CN = "cmtvjqx27004qy834hz8frn4t"      # SC0029, in Guangzhou
CARGO_FULL = "cmtu7sz700005sb7litl1nx7o"    # SC0007, cleared, invoiced, photos
CARGO_CLR = "cmtvmdtgb000zy8hbsmbu2rmv"     # SC0047, in clearance
CARGO_READY = "cmtvmdthw005ly8hba6a5umue"   # SC0057, ready for pickup
C_LOAD = "cmtvjfe99002oy82nqaolb7hz"        # loading
C_SEAL = "cmucp834w0000sbncho53t6kq"        # sealed
C_SEA = "cmtud7chd0003sbbsonwljo5k"         # in transit
C_ARR = "cmtu861za000wsb7lusshqw51"         # arrived
INV = "cmu44y5ah0003sbvf0qqzu6k0"           # INV-2026-000018, Amina, issued
RCT = "cmtu9980x004xsb7l61lqae0x"
PN = "cmtzxst9j0016sb3bgxmf7swf"
EXC = "cmtu8jirz0034sb7lxbp0qafh"
CUST = "cmtu7ri130000sb7luu3u5kci"          # Amina Hassan
ACCT = "cmtvp4dic0000sbtvsbzkxuqw"
TICKET = "cmtud7cm8003isbbs7zayzefp"
DAR_USER = "cmtu6yxml000bsby88dvwleqa"
LEDGER = "cmu46xk7v000dsb9ftqimiwsa"
BOX_TOKEN = "SWQe1305d5c8e4e4f688eb283985e30da4da450521d2a9545c1b624af3780439c38"
TRACK_KEY = "8EI8csdxlAqD5mgV"

OPEN_DRAWER = "(() => { const b = document.querySelector('nav.fixed.bottom-0 button'); if (b) b.click(); return !!b; })()"
OPEN_RECORD_PAYMENT = "(() => { const a = document.querySelector('a[href=\"#record-payment\"]'); if (a) a.click(); return !!a; })()"

shots = []
def add(id, path, role=None, vw=("d", "m"), **kw):
    shots.append({"id": id, "role": role, "path": path, "vw": list(vw), **kw})

# ---------------------------------------------------------------- common / public
add("common-login", "/login", vw=("d", "m", "t"))
add("pub-home", "/", vw=("d", "m", "t"))
for p in ["services", "rates", "calculator", "schedule", "china", "about", "contact", "book", "quote", "pickup", "track", "register"]:
    add(f"pub-{p}", f"/{p}")
add("pub-track-result", f"/track/SC0007?s=2&k={TRACK_KEY}", vw=("d", "m", "t"), anchor="Cargo")
add("pub-track-timeline", f"/track/SC0007?s=2&k={TRACK_KEY}", vw=("m",), anchor="Cargo timeline")

# ---------------------------------------------------------------- China warehouse, twice
RECEIVE_CALLOUTS = [
    {"text": "Who is it for?", "n": 1}, {"text": "What did they bring?", "n": 2},
    {"text": "Receipt number", "n": 3, "tag": "label"}, {"text": "Cargo type", "n": 4, "tag": "label"},
    {"text": "CBM", "n": 5, "tag": "label"}, {"text": "Add package", "n": 6, "tag": "button"},
    {"text": "Confirm receiving", "n": 7, "tag": "button"},
]
SEAL_CALLOUTS = [{"sel": "ol li span", "n": 1}, {"text": "The container has left China", "n": 2, "tag": "button"}]
for L in ("en", "zh"):
    c = dict(role="CHINA_WAREHOUSE", locale=L)
    add(f"cn-{L}-dashboard", "/app/dashboard", vw=("d", "m", "t"), **c)
    add(f"cn-{L}-drawer", "/app/dashboard", vw=("m",), before=OPEN_DRAWER, **c)
    add(f"cn-{L}-receive", "/app/receive/new", callouts=RECEIVE_CALLOUTS, **c)
    add(f"cn-{L}-receive-newcust", "/app/receive/new", vw=("m",),
        before="(() => { const b=[...document.querySelectorAll('button')].find(x=>/New customer|新客户|新建客户/.test(x.innerText)); if(b) b.click(); return !!b; })()", **c)
    add(f"cn-{L}-floor", "/app/inventory", **c)
    add(f"cn-{L}-shipments", "/app/containers", **c)
    add(f"cn-{L}-container-new", "/app/containers/new", **c)
    add(f"cn-{L}-loading-list", "/app/containers/loading", **c)
    add(f"cn-{L}-container-loading", f"/app/containers/{C_LOAD}", vw=("d", "m", "t"), **c)
    add(f"cn-{L}-container-sealed", f"/app/containers/{C_SEAL}", callouts=SEAL_CALLOUTS, **c)
    add(f"cn-{L}-packing-list", f"/app/containers/{C_SEAL}/packing-list", **c)
    add(f"cn-{L}-container-labels", f"/app/containers/{C_SEAL}/labels", vw=("d",), **c)
    add(f"cn-{L}-cargo", f"/app/cargo/{CARGO_CN}", **c)
    add(f"cn-{L}-cargo-boxes", f"/app/cargo/{CARGO_CN}", vw=("d",), anchor="Boxes", **c)
    add(f"cn-{L}-cargo-label", f"/app/cargo/{CARGO_CN}/label", vw=("d",), **c)
    add(f"cn-{L}-delivery-note", f"/app/cargo/{CARGO_CN}/delivery-note", vw=("d", "m"), **c)
    add(f"cn-{L}-search", "/app/search?q=SC0029", **c)
    add(f"cn-{L}-customers", "/app/customers", **c)
    add(f"cn-{L}-customer", f"/app/customers/{CUST}", **c)
    add(f"cn-{L}-customer-new", "/app/customers/new", **c)
    add(f"cn-{L}-requests", "/app/support/requests", **c)
    add(f"cn-{L}-exceptions", "/app/exceptions", **c)
    add(f"cn-{L}-reports", "/app/reports", **c)
    add(f"cn-{L}-notifications", "/app/notifications", **c)
    add(f"cn-{L}-profile", "/app/profile", **c)
    add(f"cn-{L}-scan-result", f"/t/{BOX_TOKEN}", vw=("m",), **c)

# ---------------------------------------------------------------- Dar warehouse
d = dict(role="DAR_WAREHOUSE")
add("dar-dashboard", "/app/dashboard", vw=("d", "m", "t"), **d)
add("dar-drawer", "/app/dashboard", vw=("m",), before=OPEN_DRAWER, **d)
add("dar-scan", "/app/scan", **d)
add("dar-dock", "/app/receive/dar", **d)
add("dar-dock-container", f"/app/receive/dar/{C_ARR}", vw=("d", "m", "t"), **d)
add("dar-container-sea", f"/app/containers/{C_SEA}", anchor="At sea", **d)
add("dar-container-arrived", f"/app/containers/{C_ARR}", **d)
add("dar-cargo-clearance", f"/app/cargo/{CARGO_CLR}", **d)
add("dar-floor", "/app/inventory", **d)
add("dar-release", "/app/release", vw=("d", "m", "t"), **d)
add("dar-release-one", "/app/release?q=SC0057", **d)
add("dar-collected", "/app/release/collected", **d)
add("dar-arrived-list", "/app/containers/arrived", **d)
add("dar-exceptions", "/app/exceptions", **d)
add("dar-exception", f"/app/exceptions/{EXC}", **d)
add("dar-reports", "/app/reports", **d)
add("dar-search", "/app/search?q=SC0057", **d)
add("dar-scan-result", f"/t/{BOX_TOKEN}", vw=("m",), **d)

# ---------------------------------------------------------------- Customer support
s = dict(role="CUSTOMER_SUPPORT")
add("sup-home", "/app/support", vw=("d", "m", "t"), **s)
add("sup-drawer", "/app/support", vw=("m",), before=OPEN_DRAWER, **s)
add("sup-search", "/app/search?q=Amina", **s)
add("sup-customers", "/app/customers", **s)
add("sup-customer", f"/app/customers/{CUST}", **s)
add("sup-customer-edit", f"/app/customers/{CUST}/edit", **s)
add("sup-cargo", f"/app/cargo/{CARGO_FULL}", **s)
add("sup-cargo-actions", f"/app/cargo/{CARGO_CLR}", vw=("d",), anchor="Actions", **s)
add("sup-collections", "/app/finance/collections", **s)
add("sup-record-payment", "/app/finance/collections", before=OPEN_RECORD_PAYMENT, **s)
add("sup-rates", "/app/finance/rates", **s)
add("sup-credit", "/app/finance/credit", **s)
add("sup-pickup-notes", "/app/finance/pickup-notes", **s)
add("sup-merge", f"/app/finance/payments/new/{CUST}", **s)
add("sup-tickets", "/app/support/tickets", **s)
add("sup-ticket", f"/app/support/{TICKET}", **s)
add("sup-requests", "/app/support/requests", **s)
add("sup-exceptions", "/app/exceptions", **s)
add("sup-markets", "/app/support/markets", **s)
add("sup-sourcing", "/app/support/sourcing", **s)
add("sup-arrived", "/app/containers/arrived", **s)

# ---------------------------------------------------------------- Finance
f = dict(role="FINANCE")
add("fin-home", "/app/dashboard", vw=("d", "m", "t"), **f)
add("fin-drawer", "/app/dashboard", vw=("m",), before=OPEN_DRAWER, **f)
add("fin-overview", "/app/finance", **f)
add("fin-collections", "/app/finance/collections", **f)
add("fin-verify", "/app/finance/collections/verify", **f)
add("fin-with-finance", "/app/finance/collections/with-finance", **f)
add("fin-sent-back", "/app/finance/collections/sent-back", **f)
add("fin-record-payment", "/app/finance/collections", before=OPEN_RECORD_PAYMENT, **f)
add("fin-merge", f"/app/finance/payments/new/{CUST}", **f)
add("fin-invoice", f"/app/finance/invoices/{INV}", vw=("d", "m", "t"), **f)
add("fin-invoice-doc", f"/app/finance/invoices/{INV}/document", **f)
add("fin-price-list", f"/app/containers/{C_ARR}", vw=("d",), anchor="Confirm all", **f)
add("fin-container-money", f"/app/containers/{C_ARR}", **f)
add("fin-container-finances", "/app/finance/containers", **f)
add("fin-container-finance", f"/app/finance/containers/{C_ARR}", **f)
add("fin-rates", "/app/finance/rates", **f)
add("fin-fx", "/app/finance/exchange-rate", **f)
add("fin-accounts", "/app/finance/accounts", **f)
add("fin-account", f"/app/finance/accounts/{ACCT}", **f)
add("fin-expenses", "/app/finance/expenses", **f)
add("fin-credit", "/app/finance/credit", **f)
add("fin-payroll", "/app/finance/payroll", **f)
add("fin-pl", "/app/finance/reports", **f)
add("fin-pickup-notes", "/app/finance/pickup-notes", **f)
add("fin-pickup-note", f"/app/finance/pickup-notes/{PN}", **f)
add("fin-receipts", "/app/finance/receipts", **f)
add("fin-receipt", f"/app/finance/receipts/{RCT}", **f)
add("fin-ledger", "/app/finance/ledger", **f)
add("fin-ledger-row", f"/app/finance/ledger/{LEDGER}", **f)
add("fin-reconciliation", "/app/manager/reconciliation", **f)
add("fin-closed", "/app/containers/closed", **f)
add("fin-audit", "/app/admin/audit", **f)
add("fin-customer", f"/app/customers/{CUST}", **f)
add("fin-cargo", f"/app/cargo/{CARGO_CLR}", **f)

# ---------------------------------------------------------------- Manager
g = dict(role="MANAGER")
add("mgr-home", "/app/manager", vw=("d", "m", "t"), **g)
add("mgr-drawer", "/app/manager", vw=("m",), before=OPEN_DRAWER, **g)
add("mgr-control", "/app/manager/control", **g)
add("mgr-approvals", "/app/manager/approvals", **g)
add("mgr-payroll", "/app/manager/payroll", **g)
add("mgr-reports", "/app/manager/reports", **g)
add("mgr-money-audit", "/app/finance/audit", **g)
add("mgr-deleted", "/app/admin/deleted", **g)
add("mgr-staff", "/app/admin/users", **g)
add("mgr-exceptions", "/app/exceptions", **g)

# ---------------------------------------------------------------- Admin
a = dict(role="ADMIN")
add("adm-home", "/app/dashboard", vw=("d", "m", "t"), **a)
add("adm-drawer", "/app/dashboard", vw=("m",), before=OPEN_DRAWER, **a)
add("adm-admin", "/app/admin", **a)
add("adm-users", "/app/admin/users", **a)
add("adm-user", f"/app/admin/users/{DAR_USER}", **a)
add("adm-settings", "/app/admin/settings", vw=("d", "m", "t"), **a)
add("adm-warehouses", "/app/admin/warehouses", **a)
add("adm-content", "/app/admin/content", **a)
add("adm-markets", "/app/admin/markets", **a)
add("adm-audit", "/app/admin/audit", **a)
add("adm-deleted", "/app/admin/deleted", **a)
add("adm-rates", "/app/admin/rates", **a)
add("adm-scan", "/app/scan", **a)

# ---------------------------------------------------------------- Customer portal
p = dict(role="CUSTOMER")
add("por-home", "/portal", vw=("d", "m", "t"), **p)
add("por-more", "/portal", vw=("m",), before="(() => { const b=[...document.querySelectorAll('nav button, nav a')].find(x=>/More/.test(x.innerText)); if(b) b.click(); return !!b; })()", **p)
add("por-cargo", "/portal/cargo", **p)
add("por-cargo-ready", "/portal/cargo/SC0057", **p)
add("por-cargo-clearance", "/portal/cargo/SC0047", **p)
add("por-shipments", "/portal/shipments", **p)
add("por-book", "/portal/book", **p)
add("por-calculator", "/portal/calculator", **p)
add("por-invoices", "/portal/invoices", **p)
add("por-invoice", f"/portal/invoices/{INV}", vw=("d", "m", "t"), **p)
add("por-payments", "/portal/payments", **p)
add("por-pickups", "/portal/pickups", **p)
add("por-documents", "/portal/documents", **p)
add("por-notifications", "/portal/notifications", **p)
add("por-messages", "/portal/messages", **p)
add("por-profile", "/portal/profile", **p)

json.dump(shots, open("guidebook/shots.json", "w"), indent=1)
print(len(shots), "shots,", sum(len(x["vw"]) for x in shots), "images")
