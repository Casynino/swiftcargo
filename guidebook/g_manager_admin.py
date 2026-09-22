"""Manager and Admin guides."""
from common import role_permissions


def build_manager(g, n0=1):
    n = n0
    g.chapter("Manager — your job", "The Manager runs the business day to day: every queue, every exception, every approval, and the numbers.", n)
    g.h2("Department purpose")
    g.p("The Manager is an operational role, not a viewer. The Manager holds almost every permission in the system — "
        "receiving, loading, arrival, clearance, release, pricing, payments, verification, expenses, payroll approval, cases, staff — "
        "so that nothing stops when a desk is short-handed. What the Manager does <b>not</b> hold is the owner's: company settings, "
        "warehouses, the exchange rate, and deleting cargo or containers.")
    g.h2("Main responsibilities")
    g.ul(["Watch every queue and move whatever is stuck (Control room, Approvals).",
          "Approve expenses and payroll; rule on claims and cases (approve, assign, close).",
          "Step in on any desk: receive, load, arrive, clear, release, record and verify payments.",
          "Manage staff: create accounts, move people between departments, switch access off, reset passwords (not for the owner's account).",
          "See deleted records (restoring deleted cargo is Admin's — and, as the system stands, the China Warehouse desk's).",
          "Read the management report, profit & loss, container margins, money audit and deleted records."])
    g.h2("Morning operations check")
    g.ol(["<b>Manager home</b>: the day's figures and anything flagged.",
          "<b>Control room</b>: every place the company can quietly go wrong and for how long — cash tins not counted, queues not moving, disputes.",
          "<b>Approvals</b>: credit requests, payments, prices, container statements and claims waiting on somebody — oldest first.",
          "Containers at the port: arrived but not cleared, cleared but not checked in.",
          "Cargo waiting in Guangzhou beyond the deadline."])
    g.h2("During the day")
    g.ul(["Issues & claims: assign new cases, chase ones waiting on a customer.",
          "Collections and Verify payments: nothing should wait overnight with Finance.",
          "Pickup list: customers waiting at the counter.",
          "Staff activity: the Audit log and Money audit show who did what."])
    g.h2("End-of-day review")
    g.ul(["Reconciliation progress; cash counted.", "Money audit for reversals, write-offs and credit releases.",
          "Deleted records for anything removed today.", "Management report."])
    g.h2("Escalations the Manager owns")
    g.table(["Situation", "What the Manager does"], [
        ["Missing cargo", "Case from Dar → assign, get China's photos and loading record, decide the claim; tell Support what to say."],
        ["Damaged cargo", "Review photos and notes; approve the outcome (discount, claim); close the case."],
        ["Financial issue (wrong bill, disputed payment)", "Finance corrects by discount/re-price/reversal; Manager approves where needed."],
        ["Customer complaint", "Ticket from Support → decide and reply, or assign."],
        ["Delayed operations", "Control room and dashboards show what is late; ring the desk."],
        ["A container sealed or departed by mistake", "Cannot be undone in the system — decide with Admin how to handle it and tell Support."],
    ], ["30%", "70%"])
    g.h2("Your permissions")
    role_permissions(g, "MANAGER")

    n += 1
    g.chapter("Manager — page by page", None, n)
    g.page("Manager home", "/app/manager", "The business at a glance and what needs a decision.", "Manager.", "Sidebar → <b>Home</b>.",
           shot="mgr-home", views=("d", "m", "t"))
    g.shots("mgr-drawer", "Phone: the Manager menu", ("m",))
    g.page("Control room", "/app/manager/control", "Every place the company can quietly go wrong, and how long it has been wrong.", "Manager, Admin.",
           "Sidebar → <b>Decisions → Control room</b>.", shot="mgr-control")
    g.page("Approvals", "/app/manager/approvals", "Every queue waiting on somebody, oldest first — and what was recently ruled on.", "Manager, Admin.",
           "Sidebar → <b>Decisions → Approvals</b>.", shot="mgr-approvals")
    g.page("Payroll (approve)", "/app/manager/payroll", "What Finance prepared, name by name. Accept it (which pays it) or send it back with a reason.",
           "Manager, Admin.", "Sidebar → <b>Decisions → Payroll</b>.",
           buttons=[dict(name="Accept / Send back", who="Manager, Admin", when="Finance has sent the month's payroll.",
                         does="Accept pays it from the account; Send back returns it to Finance with your reason.",
                         changes="The desk that writes the figures never agrees them — this split is the control.")],
           shot="mgr-payroll")
    g.page("Management report", "/app/manager/reports", "What moved, what it earned, and how much is still owed.", "Manager, Admin.",
           "Sidebar → <b>Oversight → Management report</b>.", shot="mgr-reports")
    g.page("Money audit", "/app/finance/audit", "Every money action on the system — append-only.", "Finance, Manager, Admin.",
           "Sidebar → <b>Oversight → Money audit</b>.", shot="mgr-money-audit")
    g.page("Deleted records", "/app/admin/deleted", "Nothing is destroyed: every deletion and cancelled payment with its reason and who did it.",
           "Manager and Admin see it; restoring deleted cargo needs cargo.delete (Admin, China Warehouse).", "Sidebar → <b>Oversight → Deleted records</b>.", shot="mgr-deleted")
    g.page("Staff", "/app/admin/users", "Create accounts, move people between departments, switch access off the moment someone leaves.",
           "Manager, Admin.", "Sidebar → <b>People → Staff</b>.",
           buttons=[dict(name="Create / Edit a staff account", who="Manager, Admin", when="Someone joins, moves desk or leaves.",
                         does="Sets name, email, role (department), warehouse and access.",
                         changes=["A new China Warehouse account starts in Chinese.", "Switching access off stops sign-in immediately; history stays."],
                         wrong="Change it back; every change is in the Audit log. The Manager cannot create or change an owner (Admin) account."),
                    dict(name="Reset password", who="Manager, Admin", when="A staff member forgot their password.",
                         does="Sets a new password to give them.", wrong="Not available on the owner's account unless you are the owner.")],
           shot="mgr-staff")
    g.page("Issues & claims (Manager)", "/app/exceptions", "Assign, approve and close cases.", "Manager, Admin.", "Sidebar → <b>People → Issues & Claims</b>.",
           shot="mgr-exceptions")
    g.note("The Manager also uses every Finance page (Overview, Collections, Profit & loss, Reconciliation, General ledger, Credit, Accounts, Expenses) and every container page — see the Finance and warehouse guides for those screens.")
    g.gaps(current=["Operational control of every desk, approvals, payroll approval, staff management, audits."],
           missing=["No undo for a mistaken seal or departure.", "Merging two customer records is not implemented (the permission exists; there is no screen).", "No scheduled summary sent to the Manager (e-mail/WhatsApp)."],
           recommended=["Manager-only undo for seal/departure.", "A customer-merge screen for duplicates.", "A daily summary message at 18:00."])


def build_admin(g, n0=1):
    n = n0
    g.chapter("Admin — your job", "The owner's account: everything the Manager does, plus the configuration the whole system runs on.", n)
    g.h2("Department purpose")
    g.p("Admin (the owner) holds every permission. Beyond the Manager's work, Admin alone can change <b>company settings</b> "
        "(VAT, whether prices include VAT, storage days and rate, collection accounts, contacts, invoice terms), <b>warehouses</b>, "
        "and delete containers. Admin and Finance set the <b>exchange rate</b>.")
    g.h2("What Admin controls")
    g.table(["Area", "Page", "Effect"], [
        ["Staff and roles", "Staff", "Who can sign in and which department's permissions they have."],
        ["Company settings", "Company settings", "Name, TIN/VRN, addresses, contact numbers, WhatsApp; VAT %, prices include VAT, free storage days, storage per day; collection accounts; invoice terms."],
        ["Warehouses", "Warehouses", "The Guangzhou and Dar addresses (the Guangzhou address is what customers send their supplier)."],
        ["Website content", "Website content", "Sailing weeks that differ from the weekly rule (Friday deadline, Monday sailing, ~30 days at sea)."],
        ["China markets", "China markets", "What Support recommends when a customer asks where to buy."],
        ["Rates & exchange rate", "Rate book", "Prices and the exchange rate (with Finance)."],
        ["Records", "Audit log, Money audit, Deleted records", "Everything that happened; restore deleted cargo."],
    ], ["20%", "22%", "58%"])
    g.warn("Change these with care — they affect everyone at once:<ul>"
           "<li><b>VAT and “prices include VAT”</b> — new bills only; issued bills keep what they were priced at.</li>"
           "<li><b>Storage per day / free days</b> — what customers are told and charged.</li>"
           "<li><b>Collection accounts</b> — printed on every new invoice; an account money has moved through cannot be edited, only retired and replaced.</li>"
           "<li><b>Exchange rate</b> — every new bill and payment.</li>"
           "<li><b>Staff roles</b> — a wrong role gives or removes access immediately.</li></ul>", "Settings that affect the whole system")
    g.h2("Your permissions")
    g.p("Admin holds every permission in the table in the Departments chapter.")

    n += 1
    g.chapter("Admin — page by page", None, n)
    g.page("Home (dashboard)", "/app/dashboard", "The owner's overview.", "Admin.", "Sidebar → <b>Home</b>.", shot="adm-home", views=("d", "m", "t"))
    g.shots("adm-drawer", "Phone: the Admin menu", ("m",))
    g.page("Administration", "/app/admin", "System configuration. Every change here is audited, including yours.", "Admin.", "Sidebar → <b>Administration</b>.",
           shot="adm-admin")
    g.page("Staff", "/app/admin/users", "Staff accounts, roles, access.", "Admin, Manager.", "Sidebar → <b>Administration → Staff</b>.", shot="adm-users")
    g.shots("adm-user", "One staff account")
    g.page("Company settings", "/app/admin/settings",
           "The accounts customers pay into, the offices they collect from, how they reach you, and the figures every bill is worked out with.",
           "Admin only.", "Sidebar → <b>Administration → Company settings</b>.",
           fields=[["Trading name, tagline", "Yes", "As on every document", "Printed on invoices, receipts, notes, packing lists."],
                   ["Tanzania / Guangzhou company", "Yes", "Legal companies at each end", "—"],
                   ["TIN, VRN", "Yes (TIN)", "Tax numbers", "Printed under the name on every invoice."],
                   ["Tanzania office, postal address", "Yes", "Where customers collect", "Printed on the invoice."],
                   ["China office", "Yes", "In Chinese script", "Customers forward it to their supplier."],
                   ["Phone, second phone, WhatsApp, email", "Yes", "Company contacts", "Invoice, public site, page footers."],
                   ["VAT (%)", "Yes", "e.g. 18", "New bills only."],
                   ["Our prices already include VAT", "Tick", "On = rates contain VAT; nothing is added", "Off = VAT added on top of new bills."],
                   ["Free storage days", "Yes", "e.g. 7", "Counted from clearance into our warehouse."],
                   ["Storage per day (USD)", "Optional", "0 = storage not charged", "Offered on a bill; never added by itself."],
                   ["Collection accounts", "Yes", "Banks, mobile money, cash office", "Printed on new invoices; retire, don't edit, an account money has moved through."],
                   ["Invoice terms", "Optional", "One term per line", "Printed on every invoice."]],
           shot="adm-settings", views=("d", "m", "t"))
    g.page("Warehouses", "/app/admin/warehouses", "Where cargo is received at each end.", "Admin.", "Sidebar → <b>Administration → Warehouses</b>.", shot="adm-warehouses")
    g.page("Website content", "/app/admin/content",
           "The public sailing schedule runs itself (cargo in by Friday, packed that Friday, sails Monday, ~30 days at sea). Publish a row only for a week that is different.",
           "Admin (and Manager).", "Sidebar → <b>Business → Website content</b>.",
           fields=[["Week / vessel", "Yes", "The sailing and vessel name", "—"], ["Cargo deadline, departs, arrives", "Yes", "Dates", "New containers take their last day for cargo from the next open sailing."],
                   ["Status / public", "Yes", "Open, full, cancelled…; published or not", "An unpublished row removes that week from the site."]],
           shot="adm-content")
    g.page("China markets", "/app/admin/markets", "The market guide Support uses.", "Admin.", "Sidebar → <b>Business → China markets</b>.", shot="adm-markets")
    g.page("Audit log", "/app/admin/audit", "Every privileged action. Nothing can be edited or removed, including by the owner.", "Admin, Manager, Finance.",
           "Sidebar → <b>Audit log</b>.", shot="adm-audit")
    g.page("Deleted records", "/app/admin/deleted", "Deletions and cancelled payments, with reasons; restore deleted cargo.", "Admin, Manager.",
           "Sidebar → <b>Administration → Deleted records</b>.", shot="adm-deleted")
    g.page("Scan & release", "/app/scan", "Admin can use the Dar Scan page too.", "Admin, Dar, Manager.", "Sidebar → <b>Containers → Scan & release</b>.", shot="adm-scan")
    g.gaps(current=["Full configuration from the screens; every change audited; nothing destroyed."],
           missing=["No per-person custom permissions — access follows the department (role).", "Rate book changes have no approval step."],
           recommended=["Optional second approval for VAT/exchange-rate changes.", "Per-person permission overrides for exceptions."])
