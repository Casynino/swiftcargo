"""China Warehouse guide — English."""
from common import role_permissions

P = "cn-en"


def build(g, n0=1):
    n = n0
    g.chapter("China Warehouse — your job", "The Guangzhou floor: where every consignment starts. What you are responsible for, and what you hand to the next department.", n)
    g.h2("Department purpose")
    g.p("The China Warehouse receives customers' goods in Guangzhou, measures them honestly, photographs them, labels every carton, "
        "stores them until the next sailing, loads them onto containers, seals the containers and records when they leave. "
        "Everything the rest of the company does — the bill, the tracking page, the Dar check-in — is built on what you record at the counter.")
    g.h2("Main responsibilities")
    g.ul(["Receive every delivery against the right customer (the <b>phone number</b> is the customer's identity).",
          "Record exactly what is physically there: packages, pieces, CBM, weight, cargo type, receipt number, at least one photograph.",
          "Stick one QR label on every carton; give the driver/supplier the delivery note.",
          "Keep the floor list honest: everything received waits on the floor until it is loaded.",
          "Open containers, load cargo off the floor, seal with the shipping line's container number and seal number.",
          "Press <b>The container has left China</b> when the ship sails."])
    g.h2("A normal day")
    g.ol(["Open <b>Home</b>: check <i>Needs your attention</i> (cargo waiting too long, containers still loading) and today's figures.",
          "Receive each delivery as it arrives (<b>Receive cargo</b>).",
          "Print and stick labels; hand over the delivery note.",
          "Before the cargo deadline: load the waiting cargo onto the open container (<b>Loading containers</b>).",
          "On loading day: seal the container (container number + seal number).",
          "When the ship leaves: press <b>The container has left China</b>.",
          "End of day: <b>Warehouse floor</b> — nothing received today should be missing from the list."])
    g.h2("Handover")
    g.table(["You receive", "From", "You hand over", "To"], [
        ["Goods and the customer's shipping mark", "Supplier / driver / customer", "A consignment (SC…) with photos and measurements; the customer is told automatically", "Customer, Finance (pricing later)"],
        ["China pickup / booking requests", "Customer Support (Requests)", "The goods received at the counter", "—"],
        ["—", "—", "A sealed container with a frozen packing list, departed", "Dar Warehouse, Finance, the customer"],
    ], ["26%", "20%", "34%", "20%"])
    g.h2("Escalation")
    g.table(["You solve", "You escalate"], [
        ["Wrong measurement before Dar checks the cargo in (correct it on the consignment).", "A customer disputes the measurement → Customer Support / Manager."],
        ["Customer not in the system (add them at the counter).", "Goods arrive with no mark and no phone → hold on the floor, tell Support."],
        ["Reprinting a damaged label.", "Damage found on receipt → photograph it, write it in the Note, raise an issue."],
        ["Loading and taking off cargo while the container is open.", "A sealed container needs changing → Manager (it cannot be reopened in the system)."],
    ], ["50%", "50%"])
    g.h2("Your permissions")
    role_permissions(g, "CHINA_WAREHOUSE")

    n += 1
    g.chapter("China Warehouse — page by page", "Every page on the China Warehouse menu, on a computer and on a phone.", n)
    g.page("Home (dashboard)", "/app/dashboard",
           "Your desk at a glance: what needs attention, what came in today, what is waiting and what is loading.",
           "China Warehouse (also Admin).", "Sidebar → <b>Home</b>, or the first tab of the phone bottom bar.",
           see=["<b>Needs your attention</b> — cards grouped by chips (<i>All</i>, <i>Registration</i>, <i>Loading</i>, <i>Waiting</i>): cargo waiting three days or more without a container, containers still loading, anything held.",
                "<b>Cargo today / Packages today / Pieces today / Weight today</b> — counted on Guangzhou's own calendar day.",
                "<b>The desk · right now</b> — in the China warehouse (waiting for a container), registered this month against last month, cargo in transit.",
                "<b>The desk, in shape</b> — what is in Guangzhou split into <i>On no container</i>, <i>Loading</i> and <i>Sealed, ready to sail</i>.",
                "<b>In and out</b> — registered against loaded over the last fortnight; <b>How long it has waited</b> — the oldest cargo on the floor."],
           mistakes=["Reading “Cargo today” as the number of cartons — it counts consignments; cartons are “Packages today”."],
           shot=f"{P}-dashboard", views=("d", "m", "t"))
    g.shots(f"{P}-drawer", "The phone menu (Navigation tab) opens the full China Warehouse menu", ("m",))

    g.page("Receive cargo", "/app/receive/new",
           "Record a delivery at the counter. One press creates the tracking number, the box labels, the delivery note, the floor entry and the customer's notification.",
           "China Warehouse (also Admin).", "Sidebar → <b>Cargo → Receive cargo</b>, or the <b>Receive cargo</b> tab on the phone.",
           see=["<b>1 · Who is it for?</b> — search the customer by name, phone, customer code or shipping mark, or press <b>New customer</b>.",
                "<b>2 · What did they bring?</b> — one <b>package</b> row per kind of goods, as on the packing list.",
                "<b>Photos</b> — at least one: the shipping mark, and anything damaged. The customer sees these.",
                "A bar at the bottom totals packages, pieces, CBM and kg as you type, with <b>Confirm receiving</b>."],
           fields=[["Customer", "Yes", "Search and pick the existing customer, or add a new one", "The phone number is the identity. If the number is already on file the form says so — use that customer."],
                   ["New customer: Phone", "Yes (new)", "Tanzanian mobile, e.g. 0712 345 678", "Stored as +255…; must be right — it is how everyone finds them again."],
                   ["New customer: Name / shipping mark", "Yes (new)", "As written on the boxes", "Becomes the customer's shipping mark."],
                   ["Receipt number", "Yes", "The number on the warehouse receipt", "Must match the paper — Dar and Support search by it."],
                   ["Package description", "Recommended", "What the goods are — e.g. Shoes, Phone cases", "Plain words; it appears on the bill and tracking page."],
                   ["Cargo type", "Yes", "Choose the category", "Decides the rate per CBM on the bill. Pick the real category."],
                   ["Packages", "Yes", "Number of cartons/pieces of packing", "Decides how many QR labels are printed."],
                   ["Pieces", "Optional", "Items inside, if counted", "—"],
                   ["CBM", "Yes", "Measured volume", "The bill is priced from this. Measure — never estimate."],
                   ["Weight kg", "Optional", "Weight from the scale", "Do not invent a weight; leave empty if not weighed."],
                   ["Photos", "Yes (≥1)", "Camera or gallery", "Shipping mark clearly readable; photograph damage."],
                   ["Note", "Optional", "A torn carton, a box that came wet…", "Visible to staff."]],
           buttons=[dict(name="New customer", who="China Warehouse", when="The customer is not found by name, phone or mark.",
                         does="Opens phone + name fields and <b>Save this customer</b>.",
                         changes="A customer record with a code (CUS-…) and shipping mark is created immediately.",
                         next="Carry on receiving their cargo on the same form.",
                         wrong="An existing number is detected and the form offers <b>Use</b> that customer instead of creating a duplicate."),
                    dict(name="Add package", who="China Warehouse", when="The delivery has more than one kind of goods.",
                         does="Adds another package row.", wrong="<b>Remove</b> on the row takes it off before confirming."),
                    dict(name="Confirm receiving", who="China Warehouse", when="Everything above matches what is physically on the floor.",
                         does="Creates the consignment in one go.",
                         changes=["Tracking number <b>SC…</b> created; status <b>Received in China</b>.",
                                  "One QR box label per package counted.", "Delivery note created.",
                                  "The customer is notified that the goods arrived in Guangzhou.", "The consignment appears on the Warehouse floor list."],
                         next="Print labels, stick them on, give the driver the delivery note. The cargo waits for a container.",
                         wrong="Correct the consignment on its own page (measurements, type, customer) — the old values are kept in the history. Pressing twice does not create two consignments: the form carries a one-time key.")],
           example="Customer <b>Amina Hassan</b> (0712 •••) delivers 12 cartons of handbags. Receipt <b>0003062</b>, cargo type <i>Bags</i>, packages 12, CBM 1.600, weight 180. One photo of the mark. Confirm → <b>SC0057</b>, 12 labels “Box 1 of 12 … 12 of 12”.",
           mistakes=["Typing the receipt number from memory instead of the paper.", "Choosing a cargo type by guess — it changes the price.",
                     "Estimating CBM.", "Creating a second customer for somebody already on file (search by phone first)."],
           trouble=[["“This number is already …”", "The customer exists. Press <b>Use</b> — do not create a new one."],
                    ["Confirm is refused", "Read the red message: usually a missing photo, receipt number, cargo type or CBM."],
                    ["Wrong customer after confirming", "Open the consignment → correct the customer (cargo edit). If it is already billed, tell Finance."]],
           shot=f"{P}-receive", callouts=[(1, "Who is it for? — find or add the customer"), (2, "What did they bring? — one row per kind of goods"),
                                          (3, "Receipt number"), (4, "Cargo type (sets the rate)"), (5, "CBM (the bill is priced from it)"),
                                          (6, "Add package — another kind of goods"), (7, "Confirm receiving")])
    g.shots(f"{P}-receive-newcust", "Adding a new customer at the counter (phone)", ("m",))

    g.page("Consignment (cargo) page", "/app/cargo/[id]",
           "Everything about one consignment: customer, lines, measurements (China and Dar side by side), photos, boxes, container, history.",
           "Every department (money parts only for Finance/Support/Manager/Admin).", "Open from Search, the floor list, a container, or by scanning a box label.",
           see=["Header: tracking number, status, customer, and actions (<b>Print labels</b> for the counter).",
                "Measurements: Guangzhou's figures and, after check-in, Dar's figures and the difference.",
                "Boxes: every carton with its label number and what happened to it (received in Dar, damaged, missing, collected).",
                "Timeline / history: every status and every correction with who made it."],
           buttons=[dict(name="Print labels", who="China Warehouse", when="After receiving, or to reprint a damaged label.",
                         does="Opens the label sheet: one sticker per carton with its QR code.",
                         changes="Nothing — printing again reprints the same codes.", next="Stick one label on each carton."),
                    dict(name="Issue delivery note", who="China Warehouse", when="The driver/supplier needs the paper.",
                         does="Produces the delivery note for the consignment.", changes="The note is recorded against the consignment.")],
           trouble=[["A measurement is wrong", "Correct the line on this page while the cargo is still in Guangzhou. Every change keeps the old value with your name."],
                    ["Wrong customer attached", "Edit the consignment's customer; if a bill exists, tell Finance."]],
           shot=f"{P}-cargo")
    g.shots(f"{P}-cargo-boxes", "Boxes on the consignment page — one row per carton, one QR each", ("d",))
    g.shots(f"{P}-cargo-label", "Box labels (print view)", ("d",))
    g.shots(f"{P}-delivery-note", "Delivery note", ("d", "m"))

    g.page("Warehouse floor", "/app/inventory",
           "Everything received in Guangzhou that is still here — waiting for a container, or already in one that has not sailed.",
           "China Warehouse, Dar Warehouse (their own floor), Manager, Admin.", "Sidebar → <b>Cargo → Warehouse floor</b>.",
           see=["Counters: on the floor, waiting for a container, in a container.", "Search by reference, mark, receipt number, customer or phone; filter by cargo type and date.",
                "Each row: customer, tracking number, goods, packages, pieces, photo proof, status, container, received date."],
           mistakes=["Assuming cargo is lost because it is not in “Waiting” — it may already be in a container (“In a container”)."],
           shot=f"{P}-floor")

    g.page("Shipments (containers)", "/app/containers",
           "All containers: open, loading, sealed, at sea, arrived.", "China Warehouse, Manager, Admin.", "Sidebar → <b>Shipping → Shipments</b>.",
           shot=f"{P}-shipments")
    g.page("Open a container", "/app/containers/new",
           "Start a new container for the next sailing.", "China Warehouse, Manager, Admin.", "Shipments or Loading containers → <b>Open a container</b>.",
           fields=[["Container type", "Yes", "20ft, 40ft, 40ft high cube…", "Usable capacity follows the type until you type your own."],
                   ["Usable capacity (CBM)", "Yes", "e.g. 67 for a 40ft HC", "A guide for the loading bar, never a block."],
                   ["Origin / Destination port", "Pre-filled", "Guangzhou / Dar es Salaam", "Change only for an exceptional route."],
                   ["Notes", "Optional", "Anything the team should know", "—"]],
           buttons=[dict(name="Open container", who="China Warehouse", when="Cargo is waiting and no container is taking it.",
                         does="Creates the container with its reference (e.g. SWC26M09C1) and a voyage.",
                         changes=["The last day for cargo is set automatically from the sailing schedule (shown on the container page).", "The container appears in Loading containers."],
                         next="Load cargo onto it.", wrong="An empty container can be left; ask a Manager/Admin to remove it.")],
           shot=f"{P}-container-new")
    g.page("Loading containers", "/app/containers/loading",
           "Every container still in Guangzhou and the ones that just sailed, and the cargo waiting on the floor.",
           "China Warehouse (also Dar, Support, Finance read it).", "Sidebar → <b>Containers → Loading containers</b>.",
           see=["<b>Taking cargo</b> — open containers with how much is loaded.", "<b>Sealed, waiting to sail</b>.", "<b>On the Guangzhou floor</b> — cargo on no container, oldest first.", "<b>Shipped recently</b>."],
           shot=f"{P}-loading-list")
    g.page("Container page — loading", "/app/containers/[id]",
           "Load cargo from the Guangzhou floor onto this container, take it off again, and seal.",
           "China Warehouse, Manager, Admin.", "Loading containers → open a container.",
           see=["Six figures across the top: consignments, customers, packages, pieces, weight, volume loaded against capacity.",
                "<b>Waiting in Guangzhou</b> (left): tick consignments and press <b>Load</b>.",
                "<b>What is in this container</b> (right): tick and <b>Take off</b> to remove.",
                "<b>Seal container</b> at the foot of the contents."],
           buttons=[dict(name="Load", who="China Warehouse", when="The consignments are physically going into this container.",
                         does="Moves the ticked consignments onto the container.",
                         changes=["Status <b>Loaded to container</b>.", "The packing list updates live.", "No message to the customer (loading is internal)."],
                         wrong="Tick it in the contents and press <b>Take off</b>."),
                    dict(name="Take off", who="China Warehouse", when="A consignment will not go in this container after all.",
                         does="Returns it to the Guangzhou floor.", changes="Back to <b>Received in China</b>, waiting for a container."),
                    dict(name="Seal container", who="China Warehouse", when="Loading is finished and the physical seal is on.",
                         does="Asks for the shipping line's <b>Container number</b> and <b>Seal number</b>, then <b>Seal the container</b>.",
                         changes=["Container <b>Sealed</b>; nothing can be added or removed.", "Every consignment on it: <b>Container sealed</b>.", "The packing list is frozen (PL-…) automatically."],
                         next="The container waits to sail.", wrong="A sealed container cannot be reopened in the system. Stop and tell the Manager before anything else happens to it.")],
           shot=f"{P}-container-loading", views=("d", "m", "t"))
    g.page("Container page — sealed, departing", "/app/containers/[id]",
           "Record that the container has left China.", "China Warehouse (departure), Manager, Admin.", "Open the sealed container.",
           see=["A progress strip: <b>Sealed → At sea → In Dar → Closed</b>.", "<b>Sealed — ready to leave Guangzhou</b> with one button."],
           buttons=[dict(name="The container has left China", who="China Warehouse", when="The ship has actually left with this container.",
                         does="Records the departure at today's date and time with your name.",
                         changes=["Container, shipment and every consignment go straight to <b>In transit</b> (one press — there is no separate “in transit” step).",
                                  "Every customer with goods inside receives one message: left China, on the way to Dar es Salaam.",
                                  "The tracking page shows <b>In transit</b> with the date it left."],
                         next="Dar, Finance or Support record the arrival when the container reaches Dar port.",
                         wrong="A departure cannot be undone in the system and customers have already been told. Tell the Manager immediately so Support can speak to the customers.")],
           shot=f"{P}-container-sealed", callouts=[(1, "Progress strip"), (2, "The container has left China — one press")])
    g.shots(f"{P}-packing-list", "The packing list — frozen when the container is sealed")
    g.shots(f"{P}-container-labels", "Box labels for a whole container", ("d",))

    g.page("Customers", "/app/customers",
           "Find, add and edit customers.", "Every department. China Warehouse may add and edit; delete is Finance/Manager/Admin only.",
           "Sidebar → <b>Customers → Customers</b>.",
           buttons=[dict(name="Add customer", who="All departments", when="A new customer needs a record before cargo arrives.",
                         does="Opens the new-customer form (name, phone, business, email, city…).", next="The customer can be picked at Receive cargo."),
                    dict(name="Edit", who="All departments", when="A phone, email or name is wrong or new.",
                         does="Opens the customer's details for editing.", changes="The change is saved with your name.")],
           shot=f"{P}-customers")
    g.shots(f"{P}-customer", "A customer's page: details, shipping mark, supplier address to copy, cargo")
    g.shots(f"{P}-customer-new", "Add customer form")
    g.page("Requests", "/app/support/requests",
           "Website requests: China pickups, bookings and quotes customers sent.", "China Warehouse and Customer Support.",
           "Sidebar → <b>Customers → Requests</b>.",
           see="Nothing here is confirmed until somebody confirms it, and nothing here is cargo until the counter receives the goods.",
           shot=f"{P}-requests")
    g.page("Issues & claims", "/app/exceptions",
           "Every item flagged missing, damaged or wrong — held until someone closes it.", "All departments (see); China may raise and resolve.",
           "Sidebar → <b>Customers → Issues & claims</b>.", shot=f"{P}-exceptions")
    g.page("Warehouse reports", "/app/reports",
           "Throughput at both ends over the last thirty days.", "China and Dar Warehouse, Manager, Admin.", "Sidebar → <b>Oversight → Warehouse reports</b>.",
           shot=f"{P}-reports")

    n += 1
    g.chapter("China Warehouse — troubleshooting", None, n)
    g.table(["Problem", "What to do"], [
        ["I scanned a label and “not found” appears.", "The code is not ours or is damaged. Search the tracking number printed under the code instead."],
        ["I entered the wrong CBM.", "Open the consignment and correct the line. Allowed while the cargo is in Guangzhou; the old value is kept with your name. After Dar checks it in, Dar corrects it."],
        ["A label is torn.", "Consignment → <b>Print labels</b>. The same code reprints — no duplicate cargo is created."],
        ["The wrong customer is attached.", "Correct it on the consignment (customer). If Finance has billed it, tell Finance."],
        ["Cargo is on the list but not on the floor.", "Search the floor for the receipt number or mark; check it is not already in a container; if truly missing, raise an issue and tell the Manager."],
        ["The container is over capacity.", "Capacity is a guide, not a block. Load what physically fits; take off the rest."],
        ["I pressed “The container has left China” by mistake.", "It cannot be undone in the system and customers were notified. Tell the Manager at once."],
        ["The screen stays on “Saving…”.", "Wait 12 seconds; if it says the app was updated, press <b>Reload</b> and repeat."],
    ], ["36%", "64%"])
    g.gaps(
        current=["Receiving with photos, per-carton QR labels, delivery note, loading/sealing, one-press departure, Chinese and English interface, phone and computer."],
        missing=["No built-in QR camera on the China menu (the Scan page is Dar's); staff scan labels with the phone camera, which opens the record.",
                 "A sealed container cannot be reopened, and a departure cannot be undone, by anyone in the system (an arrival can be undone).",
                 "No self-service password reset."],
        recommended=["Add the Scan page to the China menu for loading checks.", "A Manager-only “unseal” and “undo departure” for genuine mistakes.", "A “forgot password” flow by SMS/WhatsApp."])
