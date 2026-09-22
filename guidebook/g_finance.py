"""Finance guide."""
from common import role_permissions


def build(g, n0=1):
    n = n0
    g.chapter("Finance — your job", "Prices, bills, money in, money out, and the books that prove it.", n)
    g.h2("Department purpose")
    g.p("Finance turns measured cargo into correct bills, turns customers' payments into verified money with receipts, "
        "lets settled cargo go (pickup notes), keeps every account's history, records what the business spends, prepares payroll, "
        "and reconciles the books against the bank. Money is never typed as a balance: every balance is worked out from the records.")
    g.h2("Main responsibilities")
    g.ul(["Confirm prices on each container's <b>price list</b> — this issues the bills and tells the customers.",
          "Keep the <b>rate book</b> and the <b>exchange rate</b> right.",
          "<b>Verify payments</b> Support sends up (check the account statement first) — each verified payment issues a receipt.",
          "Record payments directly when Finance takes them (they are verified at once).",
          "Correct bills properly: discount, re-price, change the rate for a payment, cancel — never by deleting money.",
          "Release on credit when the business agrees; follow the credit book.",
          "Expenses, accounts and transfers, payroll preparation, reconciliation, profit & loss."])
    g.h2("How the money works")
    g.table(["Rule", "What it means for you"], [
        ["Priced in USD, collected in TZS", "A bill is raised in dollars from the rate book. When it is issued it pins the exchange rate of that day; the shilling amount is fixed at that rate forever."],
        ["Prices include VAT", "By company setting, the rate book's prices already contain VAT: a 380 rate gives a 380 bill and nothing is added. The VAT inside is stored for the reports but not printed. (Company settings → <i>Our prices already include VAT</i>.)"],
        ["Balance is derived", "Outstanding = bill total − verified payments (in shillings, each payment at its own rate). There is no balance field anybody can type."],
        ["Only verified money counts", "A payment Support recorded is <i>waiting for Finance</i> and does not reduce the balance until you verify it."],
        ["An issued bill never moves by itself", "Changing the rate book, the exchange rate or VAT affects new bills only. You move an issued bill on purpose: discount, re-price, cancel."],
        ["Nothing is deleted", "A mistaken payment is reversed or sent back; a cancelled bill stays with its reason. Everything is in the Money audit."],
    ], ["30%", "70%"])
    g.h2("Your permissions")
    role_permissions(g, "FINANCE")

    n += 1
    g.chapter("Finance — page by page", None, n)
    g.page("Home (dashboard)", "/app/dashboard", "Money at a glance.", "Finance.", "Sidebar → <b>Home</b>.",
           see=["<b>Needs your attention</b> — payments to verify, prices to confirm, cargo waiting unpaid.",
                "<b>What each container is making</b> — billed against what it cost; only Collected is money in the bank.",
                "<b>The money · right now</b> — where the cash sits (TZS in hand, per account).",
                "<b>Money in and out</b> this year; <b>What we are owed, by age</b>; <b>Longest in the warehouse</b> (storage building); <b>Recent payments</b>."],
           shot="fin-home", views=("d", "m", "t"))
    g.shots("fin-drawer", "Phone: the full Finance menu", ("m",))
    g.page("Finance overview", "/app/finance", "The finance workspace: what the business holds, is owed and has spent.", "Finance, Manager, Admin.",
           "Sidebar → <b>Finance → Overview</b>.", shot="fin-overview")
    g.page("Price list (on each container)", "/app/containers/[id]",
           "Confirm the price of every consignment on a container in one press. Draft prices are raised from the rate book when the container arrives and whenever Dar corrects a measurement.",
           "Finance, Support, Manager, Admin (price confirmation).", "Arrived containers / Container finances → open a container.",
           see=["One row per consignment: date, tracking number, customer, cargo type (changeable), CBM, packages, price and state.",
                "<b>Edit</b> on a row: change cargo type, CBM or rate for that consignment (an agreed rate survives).",
                "<b>Move</b>: move a consignment to another arrived container.",
                "<b>Confirm all N prices</b> at the top."],
           buttons=[dict(name="Confirm all N prices", who="Finance, Support, Manager, Admin", when="Every row's type and CBM are right.",
                         does="Prices anything still without a draft and issues each bill.",
                         changes=["Each bill is issued (INV-…), with today's exchange rate pinned and the collection accounts copied onto it.",
                                  "Each customer is notified with their bill.", "A row the rate book cannot price is named and left waiting; the rest are confirmed."],
                         next="Customers pay; Support records; you verify.", wrong="Correct an issued bill with discount / re-price on the bill.")],
           shot="fin-price-list", views=("d",))
    g.shots("fin-container-money", "An arrived container as Finance sees it: the next step, then the container's money")
    g.page("Invoice (bill)", "/app/finance/invoices/[id]",
           "One bill: lines, total, what was paid, balance, and every correction.", "Finance (edit), Support/Manager/Admin (read, some actions).",
           "From a consignment, Collections, or a customer's page.",
           see=["The bill's lines (freight per CBM and anything added), total, paid, balance in TZS and USD, the pinned rate.",
                "Payments against it (waiting / verified / sent back), receipts, pickup note.",
                "Bill controls: Give a discount, Edit the rate per CBM (re-price), Storage fee, Change the rate for a payment."],
           buttons=[dict(name="Give a discount", who="Finance, Support, Manager, Admin", when="A reduction was agreed with the customer.",
                         does="Adds the discount as its own line with your name and reason. The original charge stays on the bill.",
                         changes="Total and balance fall; FieldChange and audit record it."),
                    dict(name="Edit the rate per CBM → Re-price", who="Finance, Support, Manager, Admin", when="The rate on an issued bill was wrong or a rate was agreed.",
                         does="Re-multiplies every per-CBM line at the new rate; flat and per-kg lines stay.",
                         changes=["Total recalculated — the old total is written to the history first.", "The bill is priced the way the company prices now (VAT inside the price)."]),
                    dict(name="Storage fee", who="Finance, Support, Manager, Admin", when="The customer stayed past the free days.",
                         does="Adds (or removes) the storage charge worked out from the storage clock.",
                         changes="Storage is only charged when an administrator has set a daily rate in Company settings."),
                    dict(name="Change the rate (for a payment)", who="Finance, Support", when="A payment was made at a different agreed exchange rate.",
                         does="Pins a rate to that payment only; the bill keeps the rate it was raised at."),
                    dict(name="Download / Open invoice", who="All with finance view", when="Sending or printing the bill.",
                         does="The PDF (with QR code to verify it) or the printable page.")],
           shot="fin-invoice", views=("d", "m", "t"))
    g.shots("fin-invoice-doc", "The printable invoice")
    g.h2("The invoice, section by section")
    g.table(["Section", "What it shows"], [
        ["Header", "Swift Cargo logo and address, TIN, invoice number (INV-2026-…), status (Draft, Issued, Partly paid, Paid, Overdue, Cancelled), and a QR code that verifies the bill."],
        ["Invoice to", "The customer (receiver), code, phone."],
        ["Shipment", "Tracking number, container, vessel, dates, measurements billed."],
        ["Lines", "Each kind of goods at its rate per CBM × CBM; extras (storage, transport); discounts as their own green lines."],
        ["Totals", "One total (prices include VAT — no VAT lines on such bills), the total in TZS at the rate pinned on the bill, what is paid."],
        ["Amount due", "In shillings first, dollars under it, with the rate."],
        ["Payment info", "The collection accounts copied on the day the bill was issued (banks, mobile money, cash office)."],
        ["Terms & storage policy", "The company's terms from Company settings, and the storage policy in Swahili and English."],
    ], ["22%", "78%"])
    g.page("Collections", "/app/finance/collections", "Who owes money; what has gone to Finance; what has come back.",
           "Finance, Support, Manager, Admin.", "Sidebar → <b>Finance → Collections</b>.", shot="fin-collections")
    g.page("Verify payments", "/app/finance/collections/verify",
           "Payments recorded by Support (and by customers) waiting for Finance to check against the account.", "Finance, Manager, Admin.",
           "Sidebar → <b>Finance → Verify payments</b>.",
           see=["Each claim: customer, cargo, amount and what it was paid in, owed, where the money landed, proof, who submitted it.",
                "A highlighted <b>Also clears … short</b> tag when Support asked for a small shortfall to be written off with it."],
           buttons=[dict(name="Verify", who="Finance, Manager, Admin", when="You have seen the money on the account statement.",
                         does="Turns the claim into money.",
                         changes=["Payment <b>Verified</b>; the balance falls.", "Receipt issued (RCT-…).",
                                  "If it settles the bill, the pickup note (PN-…) is issued and the cargo can go once cleared.",
                                  "Any shortfall Support asked to clear is written off now."],
                         wrong="Reverse the payment from the General ledger row (it stays on the register, struck through)."),
                    dict(name="Send it back", who="Finance", when="It does not check out (wrong reference, not on the statement…).",
                         does="Returns it with your reason; the customer and the person who recorded it are told.",
                         next="Support rings the customer; the claim can be corrected and sent again.")],
           shot="fin-verify")
    g.shots("fin-sent-back", "Sent back — claims Finance could not verify")
    g.page("Record payment / Merge payment", "Sidebar → Record payment · /app/finance/payments/new",
           "Record money Finance took directly (verified at once), or one payment across several bills.", "Finance (verified), Support (to Finance).",
           "Sidebar → <b>Record payment</b> (dialog) or <b>Merge Payment</b>.",
           fields=[["Find the bill", "Yes", "Customer name, tracking number, invoice or phone", "—"],
                   ["Cargo charge / amount", "Yes", "What arrived", "In TZS or USD (Paid in)."],
                   ["Transport they added", "Optional", "Transport money included", "Settled from cash or the Lipa number."],
                   ["Into which account (Landed in)", "Yes", "The account the money reached", "Must match the statement."],
                   ["Proof", "Recommended", "Bank slip / screenshot", "—"],
                   ["Accept overpayment", "Optional", "Tick and give the reason", "The extra stays on the bill as a credit."]],
           buttons=[dict(name="Clear it (shortfall)", who="Finance (done at verification); Support (asks Finance)",
                         when="A small difference nobody will chase (rounding, bank fee).",
                         does="Writes the difference off when the payment is verified. A large gap is flagged for checking.")],
           shot="fin-record-payment")
    g.shots("fin-merge", "Merge Payment for one customer")
    g.page("Rate book and exchange rate", "/app/finance/rates",
           "Every price comes from here: the rate per CBM (or flat, or per kg) for each kind of goods, customers' agreed rates, and today's exchange rate.",
           "Finance (change), Support (read), Manager/Admin.", "Sidebar → <b>Finance → Rate book</b>.",
           see=["Summary: exchange rate, cargo types priced, range per CBM, customer rates agreed, last price change.",
                "<b>Rates by kind of goods</b> — each with service (LCL/FCL), since when, price and the shilling figure at today's rate; Edit / Remove.",
                "<b>Exchange rate</b> — TZS per 1 USD with a reason and a confirmation tick; previous rates.",
                "<b>Publish a rate</b> — service, commodity band (blank = the general rate), charged by (cubic metre / kg / flat), rate, minimums."],
           buttons=[dict(name="Publish rate (exchange)", who="Finance, Admin (not Manager)", when="The bank rate the business uses changes.",
                         does="Sets the rate for every bill raised and payment recorded from now on.",
                         changes="Bills already issued keep their own rate. A rate already used cannot be withdrawn — publish the correct one instead."),
                    dict(name="Publish a rate", who="Finance, Manager, Admin", when="A price changes or a new kind of goods is priced.",
                         does="Supersedes the live rate for the same goods (history kept).", changes="New drafts use it; issued bills do not change.")],
           shot="fin-fx")
    g.page("Credit", "/app/finance/credit", "Cargo released before payment; the oldest debt is the one to ring about.", "Finance, Support, Manager, Admin.",
           "Sidebar → <b>Finance → Credit</b>.", shot="fin-credit")
    g.page("Pickup notes", "/app/finance/pickup-notes", "Notes issued when bills are settled; the warehouse's authority to hand over.",
           "Finance, Support, Manager, Admin.", "Sidebar → <b>Finance → Pickup notes</b>.", shot="fin-pickup-notes")
    g.shots("fin-pickup-note", "One pickup note with its QR code")
    g.page("Receipt", "/app/finance/receipts/[id]", "The receipt issued automatically when a payment is verified (RCT-…). There is no separate receipts list — open a receipt from its payment or bill.",
           "Finance, Manager, Admin.", "The bill → Payments → receipt.", shot="fin-receipt")
    g.page("Accounts", "/app/finance/accounts", "Where the company's money sits and everything that moved through it. Balances are each account's history added up.",
           "Finance, Manager, Admin.", "Sidebar → <b>Finance → Accounts</b>.",
           buttons=[dict(name="Move money between accounts", who="Finance, Manager, Admin", when="Money moves from one account to another (e.g. banking Friday's takings).",
                         does="Out of, into, what for, date → <b>Record the move</b>.", changes="Both accounts' histories show the movement."),
                    dict(name="Count the cash", who="Finance, Manager, Admin", when="The office cash tin is counted.",
                         does="Records what is physically in the tin against what the ledger says.", changes="A difference is recorded, never hidden; no figure is changed."),
                    dict(name="Reconcile an account (Check)", who="Finance, Manager, Admin", when="Comparing an account with the bank.",
                         does="Records what the account actually holds beside what the register says, with a note explaining any difference.", changes="Records the check; changes no figure.")],
           shot="fin-accounts")
    g.shots("fin-account", "One account's history")
    g.page("Expenses", "/app/finance/expenses", "What the business spends and what it has already paid.", "Finance (record), Manager/Admin (approve).",
           "Sidebar → <b>Finance → Expenses</b>.", shot="fin-expenses")
    g.page("Payroll", "/app/finance/payroll", "Build the month from the staff register, correct exceptions, send to the manager. Nothing leaves an account until it is agreed.",
           "Finance prepares; Manager/Admin approve.", "Sidebar → <b>Finance → Payroll</b>.", shot="fin-payroll")
    g.page("Profit & loss", "/app/finance/reports", "Revenue (net of VAT) against costs, for a period and for a sailing — derived from the operational record.",
           "Finance, Manager, Admin.", "Sidebar → <b>Finance → Profit & loss</b>.", shot="fin-pl")
    g.page("Container finances", "/app/finance/containers", "What every sailing earned and cost; open one for its whole book.",
           "Finance, Manager, Admin.", "Sidebar → <b>Containers → Container finances</b>.", shot="fin-container-finances")
    g.shots("fin-container-finance", "One container's book")
    g.page("General ledger", "/app/finance/ledger", "Every money movement on the register, with running balances. Rows are corrected by reversal, never deleted.",
           "Finance, Manager, Admin.", "Sidebar → <b>Finance → General ledger</b>.", shot="fin-ledger")
    g.shots("fin-ledger-row", "One ledger row with its correction options")
    g.page("Reconciliation", "/app/manager/reconciliation",
           "Agree what the system recorded against what the accounts actually hold, record by record.", "Finance, Manager, Admin.",
           "Sidebar → <b>Finance → Reconciliation</b>.",
           see="Progress bar and states: Pending, Queried, Mismatch, Sent back, Under review, Reconciled. Filters by account, type, person and date; pick a record to check it.",
           shot="fin-reconciliation")
    g.page("Closed containers", "/app/containers/closed", "Sailings where everything was handed over — the only point a margin is a result.", "Finance, Manager, Admin.",
           "Sidebar → <b>Containers → Closed containers</b>.", shot="fin-closed")
    g.page("Audit log", "/app/admin/audit", "Every privileged action, who did it and when. Append-only.", "Finance, Manager, Admin.", "Sidebar → <b>Admin → Audit log</b>.",
           shot="fin-audit")

    n += 1
    g.chapter("Finance — troubleshooting", None, n)
    g.table(["Problem", "What to do"], [
        ["The customer says they paid.", "Verify payments: is there a claim? Check the account statement for the amount and reference. Verify only what you can see on the statement."],
        ["A bill shows a wrong price.", "If Draft: fix the row on the price list. If issued: Edit the rate per CBM → Re-price, or Give a discount, with the reason."],
        ["An old bill was issued with VAT added on top.", "Re-price it (Edit the rate per CBM, same rate) — it is priced the new way (VAT inside). The old total is kept in the history."],
        ["A payment was verified by mistake.", "Reverse it from its General ledger row with the reason. The receipt and any write-off are reversed with it."],
        ["The exchange rate was published wrong.", "Publish the correct rate. Bills already issued with the wrong one need re-pricing or a rate change on the payment."],
        ["Cargo released but not paid.", "It was released on credit — it is on the Credit page. Follow up from there."],
    ], ["34%", "66%"])
    g.gaps(current=["Price list confirmation, pinned exchange rate, VAT-inclusive pricing, verification with receipts and pickup notes, reversal instead of deletion, reconciliation, P&L."],
           missing=["No bank-statement import — reconciliation is record by record.", "No automatic storage charging (Finance adds it to the bill)."],
           recommended=["Bank statement import with suggested matches.", "Optional automatic storage line when a customer passes the free days."])
