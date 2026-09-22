"""Customer Portal and Public Website guides."""


def build_portal(g, n0=1):
    n = n0
    g.chapter("Customer Portal — getting started", "Your own Swift Cargo account: every consignment, bill and payment in one place, on your phone or computer.", n)
    g.page("Create an account", "/register",
           "Open a customer account to track all your cargo and bills.", "Customers.", "www.swiftcargotz.com → <b>Sign in</b> → <b>Create an account</b>.",
           fields=[["Full name", "Yes", "Your name", "—"],
                   ["Business name", "Optional", "Your business name, if any", "—"],
                   ["Phone number", "Yes", "Your Tanzanian mobile number, e.g. 0712 345 678", "Saved as +255 712 345 678. This number is how Swift Cargo recognises you."],
                   ["Email", "Yes", "Your email address", "—"],
                   ["Password, Confirm password", "Yes", "A password you will remember", "Both must match."]],
           buttons=[dict(name="Create my account", who="Customers", when="After filling the form.",
                         does="Opens your account and signs you in.",
                         changes=["If you have shipped with us before and our office already has your number <i>and</i> the same email, your account is joined to your existing record — you see your old cargo.",
                                  "If your number is on our books with a different or no email, you are asked to contact the office — this protects your cargo from someone who only knows your number.",
                                  "If the number or email already has an account: “Try signing in”."])],
           trouble=[["“That phone number already has an account”", "Sign in instead. If you forgot the password, contact Swift Cargo (there is no self-service reset yet)."],
                    ["“That phone number is already on our books. Contact our office…”", "Call or WhatsApp Swift Cargo; they open the account for you after speaking to you."]],
           shot="pub-register")
    g.p("To sign in afterwards use <b>Sign in</b> with your phone number and password (see <i>Sign in</i> in the first chapter of the staff guide; the page is the same).")
    g.shots("common-login", "Sign in", ("m",))

    n += 1
    g.chapter("Customer Portal — page by page", None, n)
    g.page("Dashboard", "/portal", "Everything happening with your cargo.", "Customers.", "Sign in; or the <b>Home</b> tab.",
           see=["Greeting with your customer code (CUS-…), phone, account status and <b>WhatsApp us</b>.",
                "<b>Active cargo</b> — everything not yet collected. <b>In China</b> — received in Guangzhou, not sailed. <b>At sea</b>. <b>Arrived in Dar</b>. <b>Ready for pickup</b>.",
                "<b>Outstanding</b> — what you owe in TZS (and USD) on bills issued to you.",
                "<b>Quick actions</b>: Track cargo, Calculate shipping, Book pickup, Book shipment, View invoices, Request support.",
                "<b>My cargo</b> (latest), <b>Current shipment</b>, recent activity."],
           shot="por-home", views=("d", "m", "t"))
    g.shots("por-more", "Phone: the bottom bar (Home, My cargo, Book, Invoices, More) and the More menu", ("m",))
    g.page("My cargo", "/portal/cargo", "Every consignment you sent or are receiving, a page at a time.", "Customers.", "Bottom bar → <b>My cargo</b>.",
           see=["Search by reference, shipping mark or description.", "Filter chips: All, In China, At sea, Arrived, Ready, Collected (with counts).",
                "Each card: reference, mark and description, status, cargo type, volume, packages, container, expected date or last update, and any amount to pay."],
           shot="por-cargo")
    g.page("Cargo details", "/portal/cargo/[reference]",
           "One consignment: where it is, its measurements, container, bill and the timeline.", "Customers.", "My cargo → open a card.",
           see=["Reference, product, category, shipping mark, CBM, weight, packages, pieces, container, status.",
                "Bill and payment status; download the invoice.", "Photos taken at the counter.",
                "<b>Timeline</b>: Received in Guangzhou → In transit (expected date) → Arrived in Dar — clearance in progress → Cleared — ready for pickup → Collected. Each date says what it is (Received, Left China, Arrived, Cleared, Collected).",
                "Storage: free days and what is building up after them."],
           shot="por-cargo-ready")
    g.shots("por-cargo-clearance", "A consignment arrived in Dar and still in customs clearance")
    g.warn("<b>Arrived in Dar does not mean ready for pickup.</b> When the container lands, customs has the goods. You can collect when they are <b>cleared</b> and your bill is <b>paid</b>. The step says what is left: <i>Pay first, then collect</i> or <i>Bring your ID to collect</i>.")
    g.page("Shipments", "/portal/shipments", "The containers carrying your cargo and your share of each.", "Customers.", "More → <b>Shipments</b>.",
           see="Container reference, state (Loading in Guangzhou, At sea, Arrived in Dar), left China, expected/arrived date, your cargo in it and your volume.",
           shot="por-shipments")
    g.page("Book / request", "/portal/book", "Ask Swift Cargo for a service.", "Customers.", "Bottom bar → <b>Book</b>.",
           see=["<b>Loose cargo</b> — share a container, pay by the CBM.", "<b>Full container</b> — a whole 20ft or 40ft box.",
                "<b>China pickup</b> — we collect from your supplier.", "<b>Special cargo</b> — machines, heavy or odd shapes.",
                "<b>Customs clearance</b> — clearing at Dar port.", "Your requests with their state."],
           fields=[["Service", "Yes", "One of the five above", "—"], ["Details", "Yes", "What you are moving, where, quantities, dates, supplier contact (pickup)", "The more exact, the better the quote."],
                   ["Sailing", "For shipping", "The sailing you want (cargo in by … date)", "From the schedule."]],
           buttons=[dict(name="Submit", who="Customers", when="Form complete.", does="Sends the request to Swift Cargo with a reference number.",
                         changes="The request shows <b>Request submitted</b> → <b>Under review</b> → <b>Quote ready</b> → <b>Confirmed</b> → <b>In progress</b> → <b>Completed</b> (or Declined / Cancelled).",
                         next="Customer Support answers, confirms and (for pickups) sets the collection day. Nothing is cargo until the Guangzhou counter receives the goods.")],
           shot="por-book")
    g.page("Shipping calculator", "/portal/calculator", "Estimate the cost before you ship.", "Customers (and everyone on the public site).",
           "Quick actions → <b>Calculate shipping</b>.",
           see=["Choose the cargo category and enter the CBM — or the length, width and height and let it work out the CBM.", "The price uses Swift Cargo's live rate book and the minimum charge; shown in USD and TZS at today's rate.",
                "Prices already include VAT — one price, nothing added."],
           shot="por-calculator")
    g.page("Invoices", "/portal/invoices", "Every bill issued to you.", "Customers.", "Bottom bar → <b>Invoices</b>.",
           see="Invoice number, cargo, total, paid, balance, status (Issued, Partly paid, Paid, Overdue, Cancelled).", shot="por-invoices")
    g.page("Invoice details", "/portal/invoices/[id]", "One bill in full.", "Customers.", "Invoices → open.",
           see=["Lines (goods at the rate per CBM × CBM, extras, discounts), one total, the total in TZS at the rate on your bill.",
                "What you have paid and what is left; payments (waiting / verified); receipt.",
                "Payment information: the bank accounts and mobile-money numbers printed on your bill.",
                "<b>Download</b> the PDF, <b>Print</b>, or <b>Share</b> the bill's link.",
                "<b>Tell us you paid</b>: send your payment with proof — Swift Cargo's Finance checks it against the account and issues your receipt."],
           shot="por-invoice", views=("d", "m", "t"))
    g.page("Payments", "/portal/payments", "Every payment you made and its state.", "Customers.", "More → <b>Payments</b>.",
           see="Waiting for Finance to check, verified (receipt), or sent back with the reason.", shot="por-payments")
    g.page("Pickups", "/portal/pickups", "Your China pickup requests.", "Customers.", "More → <b>Pickups</b>.", shot="por-pickups")
    g.page("Documents", "/portal/documents", "Your invoices, payment receipts and pickup notes, ready to open or download.", "Customers.", "More → <b>Documents</b>.",
           shot="por-documents")
    g.page("Notifications", "/portal/notifications", "What happened to your cargo and bills.", "Customers.", "The bell.", shot="por-notifications")
    g.h2("The messages you receive")
    g.table(["Message", "When", "What it means"], [
        ["Cargo received", "The Guangzhou counter confirms receiving", "Your goods are in our Guangzhou warehouse with a tracking number."],
        ["Left China / in transit", "China records the departure", "Your cargo is at sea; the expected arrival date is on your tracking page."],
        ["Arrived in Dar — clearance in progress", "The container reaches Dar port", "Customs has the goods. <b>Not yet ready.</b> Your bill may be included."],
        ["Bill issued", "Finance confirms prices", "Your invoice, the amount and how to pay."],
        ["Cleared — ready for pickup / payment required", "Customs is done", "If paid: come and collect with your ID. If not: pay first."],
        ["Payment verified / sent back", "Finance checks your payment", "Receipt issued, or the reason it could not be verified."],
        ["Storage", "After the free days", "Storage is building up; collect sooner to pay less."],
        ["Being located / damaged", "A problem is recorded in Dar", "Swift Cargo is investigating and will contact you."],
    ], ["26%", "30%", "44%"])
    g.page("Messages", "/portal/messages", "Your conversations with Swift Cargo.", "Customers.", "Quick actions → <b>Request support</b>.", shot="por-messages")
    g.page("Profile", "/portal/profile", "Your details and password.", "Customers.", "More → <b>Profile</b>.",
           see="Name, phone, email, address; change your password.", shot="por-profile")
    g.gaps(current=["Tracking, bills, payments with proof, bookings, pickups, documents, notifications, messages, profile, on phone and computer."],
           missing=["No “forgot password” — contact the office.", "No online card/mobile-money payment inside the portal — pay to the accounts on the bill and tell us."],
           recommended=["Self-service password reset by SMS.", "Mobile-money payment from the invoice."])


def build_public(g, n0=1):
    n = n0
    g.chapter("Public website", "www.swiftcargotz.com — what visitors can do without an account.", n)
    pages = [
        ("Home", "/", "pub-home", "Who Swift Cargo is, the route Guangzhou → Dar es Salaam, the next sailing, tracking box, and links to every service.", ("d", "m", "t")),
        ("Services", "/services", "pub-services", "Loose cargo, full containers, China pickup, special cargo, customs clearance.", ("d", "m")),
        ("Rates", "/rates", "pub-rates", "Published prices per CBM by kind of goods (from the live rate book).", ("d", "m")),
        ("Price calculator", "/calculator", "pub-calculator", "Choose the category, enter CBM: the price at the live rate (including VAT), in USD and TZS.", ("d", "m")),
        ("Sailings", "/schedule", "pub-schedule", "The coming sailings: cargo-in-by date, departure, expected arrival. Customers use it to plan delivery to our Guangzhou warehouse.", ("d", "m")),
        ("Explore China", "/china", "pub-china", "A guide to buying in China: markets and what they sell.", ("d", "m")),
        ("About", "/about", "pub-about", "The company.", ("d", "m")),
        ("Contact", "/contact", "pub-contact", "Offices in Dar es Salaam and Guangzhou, phone, WhatsApp, email.", ("d", "m")),
        ("Book", "/book", "pub-book", "Book space on the next ship; Swift Cargo replies with space, a price and the sailing.", ("d", "m")),
        ("Get a quote", "/quote", "pub-quote", "Tell us what you ship; we come back with a price.", ("d", "m")),
        ("China pickup", "/pickup", "pub-pickup", "We collect from your supplier and bring it to our Guangzhou warehouse.", ("d", "m")),
        ("Track cargo", "/track", "pub-track", "Enter a tracking number (SC0125) or a box label (SC0125-P3).", ("d", "m")),
    ]
    for name, route, sid, purpose, views in pages:
        g.page(name, route, purpose, "Anyone.", f"Top menu → <b>{name}</b>.", shot=sid, views=views)
    g.page("Tracking result", "/track/[reference]",
           "Where one consignment is, without signing in.", "Anyone with the tracking number.", "Track cargo → enter the number, or the link in a WhatsApp message.",
           see=["The status and where it is now; cargo, shipper initials (never the full name), volume, route, container, photos.",
                "Amount due (for a bill that exists) — one price; from the link in the customer's own message a <b>Pakua invoice hapa · Download your invoice</b> row downloads the full PDF.",
                "Payment methods; the storage policy in Swahili and English.",
                "The five-step timeline with labelled dates."],
           shot="pub-track-result", views=("d", "m", "t"))
    g.shots("pub-track-timeline", "The customer timeline — every date says what it is", ("m",))
    g.note("Privacy: a tracking number is enough to see the journey, but the full invoice PDF is only offered from the link in the customer's own message, which carries a private key. Typing somebody else's number never downloads their bill.")
    g.gaps(current=["Every public page works on phone and computer; live rates and schedule; tracking with privacy."],
           missing=["No Swahili version of the public site (English with Swahili phrases)."],
           recommended=["Full Swahili site."])
