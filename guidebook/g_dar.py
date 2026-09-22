"""Dar Warehouse guide."""
from common import role_permissions


def build(g, n0=1):
    n = n0
    g.chapter("Dar Warehouse — your job", "Receive, verify, clear, store and hand over. The last pair of hands before the customer's.", n)
    g.h2("Department purpose")
    g.p("The Dar Warehouse receives containers at Dar es Salaam, checks every consignment against the frozen packing list, "
        "records anything missing or damaged, marks the goods cleared when customs is done, keeps them safe on the floor, "
        "and hands them over only to the person entitled to collect — when the system says they may go.")
    g.h2("Main responsibilities")
    g.ul(["Record the container's arrival at the port (<b>The container has arrived in Dar</b>).",
          "Check every consignment in at the <b>Receiving dock</b>: scan boxes off, confirm what is present, record differences.",
          "Report missing and damaged cargo — the system opens a case and holds release.",
          "Press <b>Mark cleared</b> when customs releases the goods.",
          "Hand cargo over from the <b>Pickup list</b>: scan boxes out, record who collected, their ID and signature.",
          "Keep the Dar floor honest (<b>Warehouse floor</b>)."])
    g.h2("A normal day")
    g.ol(["Home: <i>Needs your attention</i> — containers landed and not checked, cases, cargo waiting long.",
          "Receiving dock: containers at sea and on the floor; check in what has landed.",
          "Mark cleared when the clearing agent confirms customs is done.",
          "Pickup list: serve customers who arrive; scan their pickup note or search the reference.",
          "End of day: Collected cargo — every handover recorded; Warehouse floor — nothing unexpected."])
    g.h2("Handover")
    g.table(["You receive", "From", "You hand over", "To"], [
        ["A departed container with a frozen packing list", "China Warehouse", "Checked-in consignments with Dar's own count, photos and any cases", "Finance (pricing), Support"],
        ["A pickup note / ready status", "Finance (settled bill) and the system's release check", "Cargo to the collector, with who/ID/signature", "Customer"],
    ], ["28%", "22%", "32%", "18%"])
    g.h2("Escalation")
    g.table(["You solve", "You escalate"], [
        ["Count differences on check-in (record Dar's count).", "Consignment not found at all → Missing (case opens) → Manager."],
        ["Minor damage (record it with photos).", "Serious damage or a customer claim → Issues & claims → Manager."],
        ["A customer asking about readiness (the release panel says why not).", "“The customer says they paid” → Finance (Verify payments)."],
    ], ["50%", "50%"])
    g.h2("Your permissions")
    role_permissions(g, "DAR_WAREHOUSE")

    n += 1
    g.chapter("Dar Warehouse — page by page", None, n)
    g.page("Home (dashboard)", "/app/dashboard", "Your desk at a glance.", "Dar Warehouse.", "Sidebar → <b>Home</b>.",
           see="Attention cards for landed-but-unchecked containers, open cases and long-waiting cargo, plus the figures for the Dar floor.",
           shot="dar-dashboard", views=("d", "m", "t"))
    g.shots("dar-drawer", "Phone: the Navigation drawer holds the full Dar menu; the bottom bar has Home, Search, Receiving dock and Pickup list", ("m",))
    g.page("Container page — arriving", "/app/containers/[id]", "Record that a container has arrived at Dar port.",
           "Dar Warehouse, Finance, Customer Support, Manager, Admin.", "Arrived containers or Receiving dock → open the container at sea.",
           buttons=[dict(name="The container has arrived in Dar", who="Dar, Finance, Support, Manager, Admin",
                         when="The container is physically at Dar es Salaam port.",
                         does="Records the arrival at today's date and time with your name.",
                         changes=["Container <b>Arrived</b>; every consignment <b>Ship at Dar port</b>.",
                                  "Each customer gets one message: arrived in Dar — clearance in progress (with their own bill if one exists).",
                                  "Draft prices are raised from the rate book for Finance's price list.",
                                  "The customer's tracking shows <b>Arrived in Dar — clearance in progress</b>."],
                         next="Check the cargo in at the Receiving dock; mark it cleared when customs is done.",
                         wrong="<b>Undo arrived</b> appears on the container while nothing has happened since (nothing checked in, reported missing or cleared). After that, tell the Manager."),
                    ],
           shot="dar-container-sea")
    g.page("Receiving dock", "/app/receive/dar",
           "Everything inbound — on the water, landed, and being checked off. Oldest first.", "Dar Warehouse, Admin.", "Sidebar → <b>Cargo → Receiving dock</b>.",
           see=["<b>Cargo to check in</b>, <b>Containers on the floor</b> (landed, not closed), <b>Containers at sea</b>.",
                "Each container: where it is, vessel/voyage, departed/landed, cargo, checked in, packages present, who checked."],
           buttons=[dict(name="Mark cleared (on a landed container)", who="Dar, Finance, Support, Manager, Admin",
                         when="Customs has released the container's goods.",
                         does="Clears every consignment on the container that is waiting on clearance.",
                         changes=["Each consignment gets its clearance date; anything not yet checked in is booked into our warehouse as China sent it.",
                                  "The storage clock starts.", "Each customer is told: ready for pickup (if paid) or payment required."],
                         wrong="Not reversible from the screen — tell the Manager.")],
           shot="dar-dock")
    g.page("Check in a container", "/app/receive/dar/[id]",
           "Count every consignment off the container against the packing list.", "Dar Warehouse, Admin.", "Receiving dock → open a landed container.",
           see=["<b>Scan boxes off the container</b> — scan each box sticker as it comes off; a box from another container, scanned twice or already handed over is flagged at once. A bar shows boxes received of the total.",
                "Chips: packages, pieces, volume counted against expected; received, unchecked, missing, damaged, discrepancies.",
                "The list: tracking, customer, goods, cargo <b>type</b>, <b>expected</b> (China's count), <b>counted as</b> (Dar's), proof photos, status and the three check buttons."],
           buttons=[dict(name="✓ Present and correct", who="Dar Warehouse", when="The consignment is here and matches the packing list.",
                         does="Checks it in with China's figures as Dar's count.", changes="Status <b>Arrived in Dar</b>; the row shows <i>Verified</i>."),
                    dict(name="⚖ The count is different", who="Dar Warehouse", when="Packages, pieces, weight or volume differ from China's figures.",
                         does="Opens Dar's count; enter what is physically here.",
                         changes="Dar's figures are kept beside China's — the difference is the evidence of what happened at sea. Draft bills re-price from Dar's figures."),
                    dict(name="⚠ Something is wrong", who="Dar Warehouse", when="Damaged, repacked, came off a different box, or missing.",
                         does="Records the condition with photos and notes.",
                         changes=["A case opens in Issues & claims.", "Release is held until someone resolves it.", "Missing: status <b>Missing at Dar</b>; the customer sees <i>Being located</i>."]),
                    dict(name="Confirm container", who="Dar Warehouse (sign-off); Manager/Admin for unchecked rows",
                         when="Every consignment is checked or reported.",
                         does="Signs the container's check-in off.", changes="The container's check-in is recorded as confirmed with your name.",
                         next="When everything is booked in and released, the container can be closed.")],
           fields=[["Cargo type", "Yes (for pricing)", "The real category if China left it blank", "Finance prices the line from it."],
                   ["Dar count", "When different", "Packages / pieces / weight / CBM physically here", "Never lower a count to hide a missing carton — report it."],
                   ["Condition, photos, notes", "When something is wrong", "What you found", "Photos protect the company in a claim."]],
           mistakes=["Pressing ✓ without counting.", "Changing the count instead of reporting a missing carton.", "Forgetting the cargo type — Finance cannot price the line."],
           shot="dar-dock-container", views=("d", "m", "t"))
    g.page("Consignment in clearance", "/app/cargo/[id]", "One consignment's record in Dar, with <b>Mark cleared</b> for a single consignment.",
           "Dar, Finance, Support, Manager, Admin.", "Search or scan.", shot="dar-cargo-clearance")
    g.page("Scan", "/app/scan", "Scan a box label or a pickup note, or type the reference. It opens the consignment.",
           "Dar Warehouse, Manager, Admin.", "Sidebar → <b>Today → Scan</b>.",
           see="A camera/scanner box. A box label opens its consignment with the box picked out; a live pickup note opens the Pickup list for that consignment.",
           shot="dar-scan")
    g.shots("dar-scan-result", "After scanning a box label", ("m",))
    g.page("Pickup list", "/app/release",
           "Customers who have paid and whose cargo is cleared to collect. Open a row to hand it over.",
           "Dar Warehouse (release), Manager, Admin; others can see the list.", "Sidebar → <b>Release → Pickup list</b>, or scan the customer's pickup note.",
           see=["<b>Ready to collect</b> — each consignment with its pickup note number (PN-…) and state.",
                "<b>Scan each box as it goes out</b> — boxes handed over of the total.", "<b>Hand it over</b>."],
           buttons=[dict(name="Hand it over", who="Dar Warehouse", when="The collector is at the counter and the boxes are in front of you.",
                         does="Opens the handover form.",
                         changes=["Status <b>Collected</b> (or <b>Delivered</b>).", "The pickup note is used.", "The consignment moves to Collected cargo with who collected it."],
                         next="The customer's tracking shows <b>Collected</b>.",
                         wrong="Tell the Manager at once — the handover is recorded and the boxes have left.")],
           fields=[["How is it going?", "Yes", "Collected from the warehouse / Delivered", "—"],
                   ["Packages handed over", "Yes", "How many boxes actually went", "Scan them out where possible."],
                   ["Collected by", "Yes", "The person who actually walked out with the boxes", "Not who was supposed to come."],
                   ["Phone, ID number, relationship", "Yes (ID)", "Their phone, ID, and relation to the customer (driver, brother, agent…)", "Check the ID physically."],
                   ["Signature or photo", "Recommended", "Signature or a photo of the handover", "Evidence if the customer disputes it."],
                   ["Notes", "Optional", "Anything unusual", "—"]],
           shot="dar-release", views=("d", "m", "t"))
    g.warn("Never hand cargo over because of a screenshot, a phone call or the customer's word. The Pickup list only contains cargo the system has computed as releasable: cleared, billed, paid (or released on credit by Finance) and not on hold.", "Release rule")
    g.shots("dar-release-one", "One consignment on the Pickup list, ready to scan out and hand over", ("d", "m"))
    g.page("Collected cargo", "/app/release/collected", "Everything that has left the Dar warehouse, newest first — who took it and who handed it over.",
           "Dar Warehouse, Manager, Admin.", "Sidebar → <b>Release → Collected cargo</b>.", shot="dar-collected")
    g.page("Warehouse floor (Dar)", "/app/inventory", "Everything landed in Dar and still here, oldest first.", "Dar Warehouse.", "Sidebar → <b>Cargo → Warehouse floor</b>.",
           shot="dar-floor")
    g.page("Arrived containers", "/app/containers/arrived", "Every sailing that has left China; open one to see its cargo, documents and timeline.",
           "All departments.", "Sidebar → <b>Containers → Arrived containers</b>.", shot="dar-arrived-list")
    g.page("Container page — arrived", "/app/containers/[id]", "An arrived container: contents, clearance and closing.",
           "Dar (close), Dar/Finance/Support (clear).", "Arrived containers → open.",
           buttons=[dict(name="Mark cleared (N)", who="Dar, Finance, Support, Manager, Admin", when="Customs is done for this container's goods.",
                         does="Clears all N consignments waiting on clearance.", changes="See Receiving dock above."),
                    dict(name="Close the container", who="Dar Warehouse, Manager, Admin",
                         when="Every consignment on it is checked in or reported missing.",
                         does="Closes the container.", changes="It leaves the receiving dock; nothing more can happen to it.",
                         wrong="Refused while anything on it is unchecked — the message names them.")],
           shot="dar-container-arrived")
    g.page("Issues & claims", "/app/exceptions", "Every missing, damaged or disputed item.", "All departments (see); Dar raises and resolves.",
           "Sidebar → <b>Customers → Issues & claims</b>.", shot="dar-exceptions")
    g.shots("dar-exception", "One case: what happened, the boxes, the history, and the next action")
    g.page("Warehouse reports", "/app/reports", "Throughput over the last thirty days.", "Dar Warehouse, Manager, Admin.", "Sidebar → <b>Oversight</b>.", shot="dar-reports")

    n += 1
    g.chapter("Dar Warehouse — troubleshooting", None, n)
    g.table(["Problem", "What to do"], [
        ["A box scan says it is from another container.", "Put the box aside; open the consignment by scanning it — it shows which container it belongs to. Tell the Manager."],
        ["Cargo is showing Ready but cannot be found.", "Do not release anything else in its place. Search the floor by mark/receipt; raise an issue (missing) — release is held — and tell the Manager."],
        ["The customer says they paid but the cargo is not on the Pickup list.", "Open the consignment: the release panel says why (not cleared, bill not settled, payment waiting for Finance, on hold). Payments must be verified by Finance."],
        ["The QR label is damaged.", "Search the tracking number; ask China/Support to reprint the label from the consignment (same code, no duplicate)."],
        ["I recorded the wrong Dar count.", "Correct Dar's count on the consignment (<b>Correct Dar's count</b>) — the old figure is kept with your name."],
        ["I marked a container arrived by mistake.", "<b>Undo arrived</b> on the container, if nothing has been checked in/cleared since. Otherwise tell the Manager."],
    ], ["38%", "62%"])
    g.gaps(current=["Arrival by several desks, per-box scan-off, check-in with counts/damage/missing, clearance, computed release, handover with ID and signature."],
           missing=["No undo for Mark cleared or for a handover.", "No offline mode — check-in needs a connection."],
           recommended=["Manager-only reversal for a mistaken clearance.", "Offline queue for scanning in the yard."])
