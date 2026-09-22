"""Customer Support guide."""
from common import role_permissions


def build(g, n0=1):
    n = n0
    g.chapter("Customer Support — your job", "The desk customers talk to. Answer from the system, never from memory; record what customers pay; move requests forward.", n)
    g.h2("Department purpose")
    g.p("Customer Support answers every customer question from what the system records — where the cargo is, what is owed, whether a payment arrived, "
        "whether cargo may be collected — handles website requests and tickets, records payments customers make and hands them to Finance, "
        "and makes sure every problem reaches the desk that can solve it.")
    g.h2("Main responsibilities")
    g.ul(["Answer customers by looking the cargo up (Search, customer page, cargo timeline).",
          "Chase payment on bills that are out (<b>Collections</b>) and record what customers say they paid — it goes to Finance to verify.",
          "Handle <b>Website requests</b>: China pickups, service bookings and quotes — assign, set collection days, record quotations.",
          "Keep <b>Tickets</b>: every call, complaint and question, with what happened next.",
          "Mark containers arrived and cleared when the clearing agent tells you (you are one of the desks allowed).",
          "Confirm prices on a container's price list when asked (you hold price confirmation).",
          "Add and edit customers; print pickup notes and ring customers whose cargo is ready."])
    g.h2("A normal day")
    g.ol(["Support desk home: <i>Needs your attention</i> — urgent tickets, collections to chase, payments sent back by Finance, open sourcing, cases waiting on the customer, pickups asked for on the website.",
          "Work the call list: ring customers with bills out; record their payments.",
          "Answer tickets and website requests.",
          "Pickup notes: ring customers whose cargo is ready.",
          "End of day: <i>Contacted today</i> — every call recorded."])
    g.h2("Answering the common questions")
    g.table(["The customer asks", "Where to look", "What to say"], [
        ["Where is my cargo?", "Search the tracking number, name or phone → the consignment's status and timeline.", "Read the status: received in Guangzhou / in transit (expected date) / arrived in Dar — clearance in progress / cleared / collected."],
        ["Has my cargo arrived?", "The consignment: status <i>Ship at Dar port</i> or <i>Arrived in Dar</i>.", "If arrived but not cleared: it is at the port with customs — not ready yet."],
        ["How much do I owe?", "Customer page (Owed) or the consignment's bill.", "The balance in TZS at the rate on their bill (and USD). Only verified payments reduce it."],
        ["Has my payment been received?", "The bill's payments: <i>waiting for Finance</i> vs <i>verified</i>.", "Waiting: Finance is checking the account. Verified: receipt issued."],
        ["Is my cargo ready?", "The consignment's release panel / Pickup notes.", "Ready only when cleared and paid (or released on credit). The panel says exactly what is missing."],
        ["Which container is it in?", "The consignment → Container.", "Container reference, vessel and expected arrival."],
        ["Why can't I collect?", "Release panel on the consignment.", "Not cleared yet / bill not paid / payment still being verified / on hold (a case)."],
    ], ["22%", "38%", "40%"])
    g.h2("Your permissions")
    role_permissions(g, "CUSTOMER_SUPPORT")

    n += 1
    g.chapter("Customer Support — page by page", None, n)
    g.page("Support desk (home)", "/app/support", "The call list and everything waiting on this desk.", "Customer Support (also Admin).",
           "Sidebar → <b>Support home</b>; the first tab on the phone.",
           see=["Search: tracking number, customer name, phone, container or invoice.",
                "<b>Needs your attention</b>: tickets marked urgent, collections to chase, sent back by Finance, with Finance, sourcing, cases waiting on the customer, website pickups.",
                "<b>The desk · today</b>: customers on the books, active cargo, ready for pickup, contacted today.",
                "<b>Where the queue is stuck</b>: every consignment in the Dar warehouse by whether its money has arrived."],
           shot="sup-home", views=("d", "m", "t"))
    g.shots("sup-drawer", "Phone: Support's full menu behind Navigation", ("m",))
    g.page("Customers and a customer's page", "/app/customers · /app/customers/[id]",
           "Find a customer, see everything about them, add and edit them.", "All departments; delete is Finance/Manager/Admin.",
           "Sidebar → <b>Customers</b>.",
           see=["List: customer, code, phone, city, cargo count, owed, last cargo; filters and columns; WhatsApp button.",
                "Customer page: cargo, active shipments, bookings, pickup requests; details; name/shipping mark; the Guangzhou address to copy for their supplier."],
           buttons=[dict(name="Add customer", who="All departments", when="A new customer calls before sending goods.", does="Opens the new-customer form."),
                    dict(name="Edit", who="All departments", when="Phone, email, city or other details change.", does="Opens the details form.", changes="Saved with your name."),
                    dict(name="Copy for supplier", who="All departments", when="The customer needs our Guangzhou address for their supplier.",
                         does="Copies the Chinese warehouse address with the customer's shipping mark, ready to paste into WhatsApp.")],
           shot="sup-customers")
    g.shots("sup-customer", "A customer's page")
    g.shots("sup-customer-edit", "Editing a customer")
    g.page("Consignment page", "/app/cargo/[id]", "Everything about one consignment, including its bill and payments.", "All departments.",
           "Search → open.",
           see=["Status, timeline, container, measurements (China and Dar), photos, boxes.",
                "<b>Actions</b> (money): record a payment against the bill, give a discount, edit price, change the rate, open/download the invoice, pickup note."],
           buttons=[dict(name="Notify on WhatsApp", who="Support, Finance, Manager, Admin", when="You want to tell the customer where their cargo is or what they owe.",
                         does="Opens WhatsApp with the message written for this stage (tracking link included). You press send.",
                         changes="The contact is logged against the customer."),
                    dict(name="Submit to Finance (record payment)", who="Customer Support", when="The customer says they paid and gives proof.",
                         does="Records the amount, currency, account it landed in and proof, and sends it to Finance.",
                         changes=["The payment is <b>waiting for Finance</b> — it does not reduce the balance yet.",
                                  "If short, you may press <b>Clear it</b> — this <i>asks</i> Finance to write the difference off when they verify."],
                         next="Finance verifies (receipt issued) or sends it back with a reason.",
                         wrong="Finance can send it back; ask Finance.")],
           shot="sup-cargo")
    g.shots("sup-cargo-actions", "Actions on a consignment: record payment, discount, price, rate, invoice", ("d",))
    g.page("Collections (payment follow-up)", "/app/finance/collections",
           "Who owes money, what has gone to Finance, and what has come back.", "Support, Finance, Manager, Admin.",
           "Sidebar → <b>Billing → Collections</b>.",
           see=["Tabs: to chase, with Finance, sent back.", "Each row: customer, cargo, how long waiting, owed, next action, reach them (call/WhatsApp), open the bill."],
           buttons=[dict(name="Record Payment", who="Support, Finance, Manager, Admin", when="A customer paid.",
                         does="Opens the payment dialog: find the bill, amount, currency, transport, account, proof.",
                         changes="Support: sent to Finance. Finance: verified at once."),
                    dict(name="Merge Payment", who="Support, Finance, Manager, Admin", when="One payment covers several bills.",
                         does="Spreads one payment across the customer's bills, oldest first; each consignment keeps its own bill."),
                    dict(name="Release on credit", who="Asked by Support/Finance; decided by Finance", when="The business agrees to let cargo go before full payment.",
                         does="Requests release on credit; the debt stays on the credit book.")],
           shot="sup-collections")
    g.shots("sup-record-payment", "The Record Payment dialog")
    g.shots("sup-merge", "Merge Payment for one customer")
    g.page("Rate book (read)", "/app/finance/rates", "The price per CBM for each cargo type, customers' agreed rates and today's exchange rate.",
           "Support (read); Finance/Manager/Admin change it.", "Sidebar → <b>Billing → Rate book</b>.", shot="sup-rates")
    g.page("Credit", "/app/finance/credit", "Cargo released before payment — money customers still owe. The oldest debt is the one to ring about.",
           "Support (read), Finance, Manager, Admin.", "Sidebar → <b>Billing → Credit</b>.", shot="sup-credit")
    g.page("Pickup notes", "/app/finance/pickup-notes", "The warehouse's authority to hand cargo over. Issued when a bill is settled; everyone else prints it and rings the customer.",
           "Support, Finance, Manager, Admin.", "Sidebar → <b>Billing → Pickup notes</b>.",
           buttons=[dict(name="Call / Notify on WhatsApp / Print", who="Support", when="A note is waiting and the customer has not come.",
                         does="Rings, messages, or prints the note (with its QR code) for the customer.")],
           shot="sup-pickup-notes")
    g.page("Tickets", "/app/support/tickets", "Every question, complaint and request, and what happened next.", "Support, Manager, Admin.",
           "Sidebar → <b>Customer support → Tickets</b>.",
           fields=[["Customer", "If no cargo ref", "Who it is about", "Leave empty when the cargo reference says who it is."],
                   ["Priority", "Yes", "Normal / urgent", "Urgent shows on the home page."],
                   ["Summary", "Yes", "One line, e.g. carton arrived open", "—"],
                   ["What the customer said", "Optional", "Their words", "Internal note — the customer never sees it."]],
           buttons=[dict(name="New ticket / Open ticket", who="Support", when="A customer raises anything that needs follow-up.", does="Creates the ticket."),
                    dict(name="Reply", who="Support", when="Answering on a ticket.", does="Sends a reply, or an internal note the customer never sees; sets status (open, waiting on customer, waiting on us, resolved, closed).")],
           shot="sup-tickets")
    g.shots("sup-ticket", "A ticket thread with the customer and their cargo beside it")
    g.page("Website requests", "/app/support/requests", "China pickups, service bookings and quotes customers sent from the website/portal.",
           "Support, China Warehouse, Manager, Admin.", "Sidebar → <b>Customer support → Requests</b>.",
           buttons=[dict(name="Assign / Set collection day / Record quotation", who="Support", when="Working a request.",
                         does="Assigns it, sets the China collection date, records the price you told the customer.",
                         changes="The customer sees the request move (under review → quote ready → confirmed → in progress → completed)."),
                    dict(name="Goods received — link the consignment", who="Support", when="The goods have been received at the counter.",
                         does="Links the request to the consignment reference.")],
           shot="sup-requests")
    g.page("Issues & claims", "/app/exceptions", "Cases: missing, damaged, disputes.", "All.", "Sidebar → <b>Issues & claims</b>.", shot="sup-exceptions")
    g.page("China markets & Sourcing", "/app/support/markets · /app/support/sourcing",
           "Where to send a customer for what they are buying; customers who asked us to find something in China.", "Support, Admin.",
           "Sidebar → <b>China services</b>.", shot="sup-markets")
    g.shots("sup-sourcing", "Sourcing requests")
    g.page("Arrived containers", "/app/containers/arrived", "Every sailing; open one to mark arrival or clearance when the agent confirms.",
           "All.", "Sidebar → <b>Containers</b>.", shot="sup-arrived")

    n += 1
    g.chapter("Customer Support — troubleshooting", None, n)
    g.table(["Problem", "What to do"], [
        ["“The customer says they paid.”", "Open the bill: is a payment waiting for Finance? If not, record it with proof. If Finance sent it back, the reason is on it — ring the customer."],
        ["Payment recorded against the wrong bill.", "Tell Finance before they verify; they send it back and you record it again correctly."],
        ["Customer insists the cargo is ready.", "Read the release panel on the consignment — it names what is missing."],
        ["Cargo shows Ready but the warehouse cannot find it.", "Raise an issue (missing) and tell the Manager; ring the customer with the case number."],
        ["Wrong customer on a consignment.", "Ask China/Dar (they correct the consignment); if billed, Finance re-issues."],
        ["A duplicate customer record.", "Merging is not available in the system yet. Use the record with the cargo; ask Finance/Manager to delete the empty duplicate (only a customer with no cargo or bills can be deleted)."],
    ], ["36%", "64%"])
    g.gaps(current=["Answering from live data, payment recording to Finance, requests, tickets, WhatsApp messages written for each stage, customer add/edit."],
           missing=["WhatsApp messages open WhatsApp — the system does not send them itself.", "No customer self-service password reset: customers must call."],
           recommended=["WhatsApp Business API sending with delivery status.", "Customer “forgot password” by SMS."])
