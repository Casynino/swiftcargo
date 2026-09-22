"""Chapters every English guide shares: the system, roles, the journey, QR, workflows."""
import json

INV = json.load(open("guidebook/data/inventory.json"))
PERMS = INV["permissions"]
ROLES = ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE", "MANAGER", "ADMIN"]
ROLE_NAME = {"CHINA_WAREHOUSE": "China Warehouse", "DAR_WAREHOUSE": "Dar Warehouse", "CUSTOMER_SUPPORT": "Customer Support",
             "FINANCE": "Finance", "MANAGER": "Manager", "ADMIN": "Admin"}

# What each permission lets a person do, in plain words. Grouped for the tables.
PERM_TEXT = [
    ("Cargo", [
        ("cargo.view", "Open consignment records"),
        ("cargo.viewAll", "See every customer's consignments in lists"),
        ("cargo.viewInternal", "See internal notes and warehouse detail on a consignment"),
        ("receiving.china", "Receive cargo at the Guangzhou counter (creates the consignment)"),
        ("cargo.create", "Create a consignment record"),
        ("cargo.edit", "Edit consignment details"),
        ("cargo.amendChina", "Correct Guangzhou's measurements (until Dar checks it in)"),
        ("cargo.amendDar", "Correct Dar's measurements after check-in"),
        ("cbm.override", "Override a measured CBM after the desk can no longer amend it"),
        ("cargo.photo", "Add photographs"),
        ("cargo.hold", "Put a non-money hold on release"),
        ("cargo.delete", "Delete a consignment (kept in Deleted records)"),
        ("cargo.scan", "Use the Scan page to scan labels and pickup notes"),
        ("cargo.clear", "Mark cargo / a container as cleared by customs"),
    ]),
    ("Containers", [
        ("container.view", "Open containers and their contents"),
        ("container.create", "Open a new container"),
        ("container.load", "Load cargo onto a container / take it off"),
        ("container.seal", "Seal a container (freezes the packing list)"),
        ("container.depart", "Record that the container has left China"),
        ("container.arrive", "Record that the container has arrived in Dar (and undo it while nothing depends on it)"),
        ("container.close", "Close a container once everything on it is checked in"),
        ("container.amendArrived", "Correct the contents of an arrived container"),
        ("container.confirmUnchecked", "Confirm a container with consignments nobody checked"),
        ("container.delete", "Delete a container"),
        ("packingList.issue", "Issue a packing list by hand before sealing"),
    ]),
    ("Dar warehouse", [
        ("receiving.dar", "Check cargo in at the Dar receiving dock"),
        ("receiving.verify", "Sign off a container's check-in"),
        ("inventory.view", "See the warehouse floor"),
        ("release.view", "See whether cargo may be released and why not"),
        ("release.execute", "Hand cargo over to the collector (release)"),
        ("warehouse.reports", "Warehouse reports"),
    ]),
    ("Customers", [
        ("customer.view", "Open customer records"),
        ("customer.create", "Add a new customer"),
        ("customer.manage", "Edit customer details (phone, email, address…)"),
        ("customer.delete", "Delete a customer with no cargo or bills"),
        ("customer.merge", "Merge two customer records (permission only — no screen yet)"),
        ("request.view", "See website requests (bookings, quotes, pickups)"),
        ("request.manage", "Handle website requests"),
        ("conversation.view", "Read support tickets"),
        ("conversation.reply", "Reply to tickets"),
        ("notification.send", "Send notifications to customers"),
        ("delivery.manage", "Arrange deliveries to a customer's address"),
    ]),
    ("Money", [
        ("finance.view", "See bills and amounts owed"),
        ("rate.view", "Read the rate book"),
        ("rate.manage", "Change the rate book"),
        ("customerRate.manage", "Agree a special rate for a customer"),
        ("fx.manage", "Set the exchange rate"),
        ("invoice.priceConfirm", "Confirm prices on the price list (issues the bills)"),
        ("invoice.create", "Raise a bill by hand"),
        ("invoice.edit", "Edit a bill"),
        ("invoice.issue", "Issue a bill"),
        ("invoice.discount", "Give a discount"),
        ("invoice.cancel", "Cancel a bill"),
        ("payment.submit", "Record a payment and send it to Finance"),
        ("payment.record", "Record a payment as received"),
        ("payment.verify", "Verify payments (turns a claim into money; issues receipt)"),
        ("receipt.issue", "Issue receipts"),
        ("accounting.view", "See accounts, ledger and balances"),
        ("accounting.manage", "Move money between accounts, count cash"),
        ("expense.view", "See expenses"),
        ("expense.record", "Record expenses"),
        ("expense.approve", "Approve expenses"),
        ("payroll.prepare", "Prepare the monthly payroll"),
        ("payroll.approve", "Approve payroll"),
        ("profit.view", "Profit & loss and container margins"),
        ("record.reconcile", "Reconcile records against the bank"),
    ]),
    ("Oversight & system", [
        ("search.global", "Search everything"),
        ("exception.view", "See issues & claims"),
        ("exception.raise", "Open an issue"),
        ("exception.resolve", "Resolve an issue"),
        ("exception.assign", "Assign an issue to somebody"),
        ("exception.approve", "Approve a claim outcome"),
        ("exception.close", "Close an issue"),
        ("report.view", "Reports"),
        ("audit.view", "Audit log"),
        ("record.review", "Manager area: approvals, control room, management report"),
        ("records.viewDeleted", "Deleted records"),
        ("user.manage", "Staff accounts"),
        ("content.manage", "Website content and China markets"),
        ("warehouse.manage", "Warehouses"),
        ("settings.manage", "Company settings (VAT, storage, accounts, contact details)"),
    ]),
]
LABEL = {k: v for _, items in PERM_TEXT for k, v in items}


def can(role, perm):
    return perm in PERMS[role]


def permission_matrix(g):
    g.h2("Who can do what — the full permission table")
    g.p("This table is generated from the system's own role definitions (<code>lib/rbac.ts</code>). "
        "A tick means the role holds the permission. Every action is checked on the server, so a button "
        "that is hidden is also refused if somebody tries to reach it another way.")
    head = ["Permission"] + [ROLE_NAME[r] for r in ROLES]
    for group, items in PERM_TEXT:
        g.h3(group)
        rows = [[text] + ["✓" if can(r, key) else "—" for r in ROLES] for key, text in items]
        g.table(head, rows, ["34%"] + ["11%"] * 6, cls="matrix")


def role_permissions(g, role):
    """What one role can and cannot do, from the real permission list."""
    has, lacks = [], []
    for group, items in PERM_TEXT:
        for key, text in items:
            (has if can(role, key) else lacks).append(f"<b>{group}:</b> {text}")
    g.h4("You can")
    g.ul(has, "cols")
    g.h4("You cannot")
    g.ul(lacks, "cols muted")


# --------------------------------------------------------------------- chapters
def using_the_system(g, n):
    g.chapter("Using Swift Cargo", "Signing in, finding your way around, and the parts of the screen every department shares — on a computer and on a phone.", n)
    g.page("Sign in", "/login",
           "The single door for staff and customers. Swift Cargo decides where you land from your account.",
           "Everybody — staff and customers.",
           "Open <b>www.swiftcargotz.com</b> and press <b>Sign in</b>, or go straight to <code>/login</code>.",
           see=["<b>Phone number or email</b> — customers sign in with their Tanzanian phone number (e.g. 0712 345 678); staff sign in with their work email.",
                "<b>Password</b> — the eye button shows or hides what you typed.",
                "<b>New customer? Create an account</b> — opens registration (customers only)."],
           fields=[["Phone number or email", "Yes", "Your phone (customers) or work email (staff)", "A phone number may be typed with or without spaces and with 0 or +255 in front."],
                   ["Password", "Yes", "Your password", "Staff passwords are set by the Manager or Admin. There is no self-service “forgot password” (see System gaps)."]],
           buttons=[dict(name="Sign in", who="Everybody", when="After typing your details.",
                         does="Checks the password and opens your home page.",
                         changes=["Your last sign-in time is recorded and the sign-in is written to the audit log.",
                                  "China Warehouse accounts always open in <b>Chinese</b>; English is one press away for that session."],
                         next="Staff land on their department home (China, Dar, Finance, Admin: <i>Home</i>; Support: <i>Support desk</i>; Manager: <i>Manager</i>). Customers land in the portal.",
                         wrong="Nothing to undo. Sign out from the sidebar if you signed in on the wrong account.")],
           trouble=[["“That did not work”", "Check the phone number or email and the password. After several failed tries wait a few minutes. Staff: ask the Manager/Admin to reset your password."],
                    ["I land on the wrong area", "Your account's department decides the home page. Ask Admin/Manager to check your role on the Staff page."]],
           shot="common-login", views=("d", "m", "t"))
    g.h2("The layout on a computer")
    g.ul(["<b>Left sidebar</b> — your department's menu, grouped (for example <i>Cargo</i>, <i>Containers</i>, <i>Customers</i>). Only pages your role may open appear.",
          "<b>Top bar</b> — your department name, <b>Main site</b> (opens the public website), the <b>bell</b> (notifications with a count) and your <b>avatar</b> (your profile).",
          "<b>Bottom of the sidebar</b> — your name and department, <b>Sign out</b>, the light/dark <b>theme</b> switch and the <b>English / 中文</b> language switch.",
          "<b>Update pill</b> — when a newer version of Swift Cargo is released, a blue <b>New update is up</b> pill appears. Press it (it reloads the page) before continuing work."])
    g.h2("The layout on a phone")
    g.ul(["The sidebar becomes a <b>menu drawer</b> behind the ☰ button (top left) and the <b>Navigation</b> tab.",
          "A <b>bottom bar</b> holds your four most-used pages plus <b>Navigation</b>, so every screen is one press from home.",
          "Tables become <b>cards</b>; forms become one column; the main button of a form stays in reach of the thumb.",
          "Swift Cargo can be installed like an app: in the phone browser choose <b>Add to Home Screen</b>. It then opens full-screen with its own icon."])
    g.warn("A button that keeps showing <b>Saving…</b> for more than 12 seconds shows a note beside it. If it says <i>The app was updated while this page was open</i>, press <b>Reload</b> and do the action again — the first press did not reach the new version.", "Stuck on “Saving…”?")
    g.h2("Search, notifications, profile")
    g.page("Search", "/app/search",
           "Find a consignment by its QR label, tracking number (SC0001…), customer name or phone number.",
           "Every staff department.", "Sidebar → <b>Search</b>, or the search box on your home page.",
           see="Results list each consignment with customer, status and where it is. A scanned label (QR) opens the consignment directly.",
           trouble=[["Nothing found", "Try the tracking number without spaces (SC0029), the customer's phone, or part of the name. Deleted cargo does not appear; ask a Manager to check Deleted records."]],
           shot="cn-en-search")
    g.page("Notifications", "/app/notifications",
           "What happened that concerns your desk — cargo received, containers arriving, payments sent to Finance, cases opened.",
           "Every staff department.", "The <b>bell</b> in the top bar.",
           see="Newest first; unread ones are highlighted. Opening one takes you to the record it is about.",
           shot="cn-en-notifications")
    g.page("My profile", "/app/profile",
           "Your own details and password.", "Every staff member.", "Your <b>avatar</b> (top right) or your name at the bottom of the sidebar.",
           see="Name, email, phone, department. You can change your password here. Your department and permissions are set by the office (Admin/Manager).",
           shot="cn-en-profile")


def roles_chapter(g, n):
    g.chapter("Departments and responsibilities", "Who does what, where one department hands over to the next, and the permission table behind it.", n)
    g.table(["Department", "Exists to", "Home page"], [
        ["China Warehouse (Guangzhou)", "Receive and measure cargo, label every box, load and seal containers, record departure.", "Home (/app/dashboard)"],
        ["Dar Warehouse", "Record arrival, check every consignment in against the packing list, report missing/damaged, clear, store and hand cargo over.", "Home (/app/dashboard)"],
        ["Customer Support", "Answer customers from the system, handle website requests and tickets, record payments customers make and send them to Finance.", "Support desk (/app/support)"],
        ["Finance", "Confirm prices, issue bills, verify payments, issue receipts and pickup notes, keep the accounts, expenses, payroll and reconciliation.", "Home (/app/dashboard)"],
        ["Manager", "Run the business day to day: watch every queue, approve expenses and payroll, resolve cases, manage staff, read the numbers.", "Manager (/app/manager)"],
        ["Admin (owner)", "Everything the Manager does plus the system's configuration: company settings, VAT, warehouses, website content, and anything that deletes.", "Home (/app/dashboard)"],
    ], ["22%", "58%", "20%"])
    permission_matrix(g)


STATUS_ROWS = [
    ["Received in China", "Received and measured at the Guangzhou counter; boxes labelled.", "China Warehouse"],
    ["Loaded to container", "Picked off the Guangzhou floor onto an open container.", "China Warehouse"],
    ["Container sealed", "The container is sealed; the packing list is frozen.", "China Warehouse"],
    ["In transit", "China pressed <i>The container has left China</i>. One press — there is no separate “in transit” step.", "China Warehouse → automatic"],
    ["Ship at Dar port", "Somebody recorded <i>The container has arrived in Dar</i>. Customs clearance is in progress. <b>Not ready for pickup.</b>", "Dar / Finance / Support / Manager / Admin"],
    ["Arrived in Dar", "Checked in at the Dar receiving dock (counted against the packing list).", "Dar Warehouse"],
    ["Cleared", "Customs is finished (shown as a badge “Cleared” with its date). Storage clock starts.", "Dar / Finance / Support / Manager / Admin"],
    ["Ready for pickup", "Computed by the system: cleared, billed, paid (or released on credit), nothing on hold.", "System (release check)"],
    ["Collected / Delivered", "Handed over at the Dar counter, with who collected it.", "Dar Warehouse"],
    ["Missing at Dar", "Expected on the container but not found. A case is opened. Customer sees “Being located”.", "Dar Warehouse"],
    ["Cancelled", "Consignment cancelled.", "Manager / Admin"],
]


def journey_chapter(g, n):
    g.chapter("The cargo journey", "From a supplier's door in Guangzhou to the customer's hands in Dar es Salaam — every stage, who owns it, and what the customer sees.", n)
    g.flow(["Supplier delivers", "China receiving", "Consignment + box QR labels", "Stored in Guangzhou", "Loaded to container",
            "Sealed", "In transit", "Arrived in Dar", "Checked in", "Cleared", "Ready for pickup", "Collected"],
           ["Customer", "China", "System", "China", "China", "China", "China", "Dar · Fin · Sup", "Dar", "Dar · Fin · Sup", "System", "Dar"])
    g.h2("Stages and statuses")
    g.table(["Status (staff screen)", "What it means", "Who moves it"], STATUS_ROWS, ["22%", "53%", "25%"])
    g.h2("What the customer sees")
    g.p("The customer's tracking page and portal show five steps only — our internal steps (loading, sealing, booking into the warehouse) are not the customer's:")
    g.flow(["Received in Guangzhou", "In transit", "Arrived in Dar — clearance in progress", "Cleared — ready for pickup", "Collected"])
    g.p("Every date on the customer timeline says what it is the date of: <b>Received</b>, <b>Left China</b>, <b>Arrived</b>, <b>Cleared</b>, <b>Collected</b>. While at sea the expected arrival date is shown under <i>In transit</i>. "
        "Under <i>Cleared — ready for pickup</i> the customer reads what is left to do: <b>Pay first, then collect</b>, <b>Being checked in</b>, or <b>Bring your ID to collect</b>.")
    g.warn("<b>Arrived in Dar does not mean ready for pickup.</b> When the container lands the goods are with customs. They become collectable only when they are cleared <i>and</i> the bill is settled (or Finance releases on credit). The system works this out itself; nobody can mark cargo “ready” by hand.")
    g.h2("Exceptions")
    g.table(["Situation", "Where it is recorded", "Effect"], [
        ["Missing — a consignment was on the packing list but did not come off the container", "Dar receiving dock → <i>Missing</i>", "Status <b>Missing at Dar</b>; a case opens in Issues & claims; the customer sees <i>Being located</i>; release is blocked."],
        ["Damaged / repacked / count different", "Dar check-in → <i>Something is wrong</i>", "Recorded with photos and notes; a case opens and holds release until someone resolves it."],
        ["Any other problem (complaint, wrong customer, claim)", "Issues & claims → raise an issue", "Assigned, worked and closed by the responsible desk; approvals by Manager/Admin."],
    ], ["30%", "30%", "40%"])


def qr_chapter(g, n):
    g.chapter("Labels and QR codes", "Every carton carries its own code. How codes are made, printed, stuck on, scanned — and what happens at every scan.", n)
    g.rule("ONE DELIVERY = ONE CONSIGNMENT (SC0001) · ONE CARTON = ONE QR LABEL")
    g.p("When China receives a delivery, the system creates <b>one consignment</b> with a tracking number such as <b>SC0029</b>. "
        "The number of packages entered decides how many <b>box labels</b> are made — a delivery of 12 cartons gets 12 labels, "
        "each printed with its own QR code and “Box 7 of 12”. Scanning any of them opens the consignment with that box picked out.")
    g.table(["Question", "Answer (as the system works today)"], [
        ["Why a code per carton?", "So each carton can be counted off the container in Dar, marked missing or damaged on its own, and handed over one by one. A pallet of 12 cartons is 12 facts, not one."],
        ["When is it made?", "The moment <b>Confirm receiving</b> is pressed in Guangzhou. Codes are random (they start <code>SWQ…</code>) — never the tracking number — so a label cannot be guessed or forged."],
        ["How do I print it?", "On the consignment page: <b>Labels</b> (one sticker per carton). For a whole container: container page → <b>Box labels</b>. Print on the label printer or A4."],
        ["Reprinting a lost or damaged label", "Open the consignment and print its labels again. The same codes print again — reprinting <b>never</b> creates a new consignment or new codes, so there can be no duplicate cargo."],
        ["Where does it go?", "On the outside of each carton, next to the shipping mark, where it can be scanned without moving other boxes."],
        ["Who scans it?", "China (receiving, loading checks), Dar (checking cargo off the container, finding it on the floor, handing it over), and customers (their phone camera opens their tracking page)."],
        ["What does a scan open?", "Staff: the consignment with that box highlighted. A customer's phone: the public tracking page. A live <b>pickup note</b> scanned at the Dar counter opens the pickup list for that consignment."],
        ["Wrong or unknown code", "“Not found” — the code is not one of ours or was typed wrong. A carton taken off its line in Guangzhou still scans, and the record says so."],
        ["Is the scan recorded?", "Yes. Every staff scan is written to the box's history (who, when, what happened)."],
    ], ["26%", "74%"])
    g.h2("The QR journey")
    g.flow(["Receive", "Labels printed & stuck", "Stored", "Loaded to container", "Scanned off in Dar", "Stored in Dar", "Pickup note scanned", "Handed over"],
           ["China", "China", "China", "China", "Dar", "Dar", "Dar", "Dar"])
    g.h2("What happens after scanning")
    g.shots("cn-en-scan-result", "A box label scanned by staff opens its consignment", ("m",))
    g.h2("Other codes the system prints")
    g.table(["Code", "Where", "What it does"], [
        ["Pickup note QR", "Pickup note (PN-2026-…)", "Scanned at the Dar counter: opens the pickup list for that consignment so it can be handed over. A used or withdrawn note opens the record instead."],
        ["Invoice QR", "Every invoice and its PDF", "Opens a verification page showing the bill is genuine, its amount and whether it is paid. It never releases cargo."],
        ["Tracking link", "WhatsApp messages", "Opens the customer's tracking page; the link in the customer's own message also lets them download the invoice PDF."],
    ], ["22%", "28%", "50%"])


def workflows_chapter(g, n):
    g.chapter("Workflow diagrams", "The five journeys every department takes part in.", n)
    g.h2("Cargo journey")
    g.flow(["China receives", "Container loaded", "Sealed", "In transit", "Arrived in Dar", "Checked in", "Cleared", "Ready", "Collected"], compact=True)
    g.h2("QR journey")
    g.flow(["Receive", "QR per box", "Storage", "Container", "Dar scan-off", "Pickup note", "Collected"], compact=True)
    g.h2("Finance journey")
    g.flow(["Cargo lands", "Draft price (rate book)", "Price list confirmed", "Invoice issued", "Payment recorded", "Verified → receipt", "Balance 0 → pickup note", "Release"], compact=True)
    g.h2("Pickup journey")
    g.flow(["Ready for pickup", "Pickup note", "Customer at counter", "Scan note / find cargo", "Hand it over form", "Collected"], compact=True)
    g.h2("Customer journey")
    g.flow(["Register", "Book / send goods", "Cargo received", "Track", "Invoice", "Pay", "Pickup"], compact=True)


def master_chapter(g, n):
    g.chapter("How every department connects", "One consignment from start to finish, and the moment each department becomes responsible.", n)
    g.vflow([
        ("Customer", "Books or sends goods to the Guangzhou warehouse", "Website/portal booking, or the supplier simply delivers with the customer's shipping mark."),
        ("Customer Support", "Answers, confirms bookings, arranges China pickups", "Website requests, tickets, customer questions."),
        ("China Warehouse", "Receives, measures, photographs, labels", "Confirm receiving → tracking number, delivery note, customer told."),
        ("China Warehouse", "Loads, seals, departs", "Container loaded from the floor, sealed (packing list frozen), “The container has left China” → In transit."),
        ("Dar · Finance · Support", "Record arrival", "“The container has arrived in Dar” → customers told clearance is in progress; draft prices raised."),
        ("Dar Warehouse", "Checks every consignment in", "Present and correct / something wrong / missing — against the packing list."),
        ("Dar · Finance · Support", "Mark cleared", "Customs done → goods in our warehouse, storage clock starts, customers told (ready or payment required)."),
        ("Finance", "Confirms prices, issues bills", "Price list → Confirm all prices → invoices out, customers notified."),
        ("Support → Finance", "Payment", "Support records what the customer paid → Finance verifies → receipt; settled bill → pickup note."),
        ("Dar Warehouse", "Hands over", "Pickup list → Hand it over (who collected, ID, signature) → Collected."),
    ])


def status_glossary(g, n):
    g.chapter("Glossary", "The words the system uses, in one place.", n)
    g.table(["Term", "Meaning"], [
        ["Consignment / cargo", "One delivery for one customer, with one tracking number (SC0001)."],
        ["Tracking number", "SC followed by a number. Printed on the delivery note and every label; the customer tracks with it."],
        ["Package / line", "One kind of goods in a consignment (as on the packing list): type, count, pieces, CBM, weight."],
        ["Box / carton", "One physical carton. Each has its own QR label."],
        ["Shipping mark", "The name or mark written on the boxes that says whose they are."],
        ["CBM", "Cubic metres — the volume the bill is priced from."],
        ["Container / sailing", "One box on one ship (e.g. SWC26M09C1 = 2026, month 09, container 1), carrying many customers' cargo."],
        ["Packing list", "The container's contents, frozen automatically when it is sealed (PL-2026-…)."],
        ["Delivery note", "The paper the Guangzhou counter gives the driver/supplier when cargo is received."],
        ["Price list", "Every consignment waiting for its price on a container; one press confirms them all."],
        ["Invoice / bill", "INV-2026-… Priced in USD, collected in TZS at the rate pinned on the bill."],
        ["Pickup note", "PN-2026-… The warehouse's authority to hand a settled consignment over."],
        ["Release on credit", "Finance lets cargo go before full payment; the debt stays on the credit book."],
        ["Case / issue", "EXC-2026-… A missing, damaged or disputed item, tracked until closed."],
        ["Rate book", "The price per CBM for each cargo type, plus agreed customer rates and the exchange rate."],
    ], ["26%", "74%"])


def quickrefs(g, n):
    g.chapter("Quick reference cards", "One card per department — pin it by the desk.", n)
    g.quickref("China Warehouse", "Receive → Label → Store → Load → Seal → Depart",
               ["Receive: customer, receipt number, cargo type, packages, CBM, photo → Confirm receiving.",
                "Stick one QR label on every carton.", "Load from the floor list onto an open container.",
                "Seal with container number + seal number.", "Press <b>The container has left China</b> when the ship leaves."])
    g.quickref("Dar Warehouse", "Arrive → Check in → Report problems → Clear → Hand over",
               ["Press <b>The container has arrived in Dar</b> when it is at the port.", "Receiving dock: check every consignment against the packing list.",
                "Missing or damaged? Record it — a case opens and blocks release.", "Customs done → <b>Mark cleared</b>.",
                "Pickup list: only what the system says is ready. Record who collected, ID and signature."])
    g.quickref("Finance", "Price → Invoice → Verify payment → Receipt → Pickup note",
               ["Confirm the container's price list (<b>Confirm all N prices</b>).", "Verify payments in <b>Verify payments</b> — check the account statement first.",
                "A settled bill issues its pickup note.", "Correct with discount / re-price / reverse — never delete money."])
    g.quickref("Customer Support", "Customer → Look it up → Explain → Record payment → Escalate",
               ["Answer from the system: Search, customer page, cargo timeline.", "Record what the customer paid → it goes to Finance.",
                "Website requests and tickets: reply, confirm, close.", "Escalate missing/damaged cargo and money disputes."])
    g.quickref("Manager", "Monitor → Resolve → Approve → Review",
               ["Morning: Manager home, Control room, Approvals.", "Day: cases, collections, containers at the port.",
                "Evening: reconciliation, money audit, management report."])
    g.quickref("Admin", "Users → Settings → Content → Audit",
               ["Staff accounts and roles.", "Company settings: VAT, storage, collection accounts, contacts.",
                "Website content, warehouses, markets.", "Audit log and deleted records."])
