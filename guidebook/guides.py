"""Which PDFs exist and what goes in each."""
from kit import Guide
import common
import g_china_en, g_china_zh, g_dar, g_support, g_finance, g_manager_admin, g_portal_public

INTRO = ("This guide describes Swift Cargo as it is built today. Pages, buttons and permissions were read from the system itself, "
         "and every screenshot was taken from the running system with demonstration data; personal phone numbers and emails are masked. "
         "Where something is not built yet it is said plainly, in the System gaps box at the end of each section — "
         "never described as if it worked.")


def staff_front(g, n):
    g.chapter("About this guide", INTRO, n)
    common.using_the_system(g, n + 1)
    common.roles_chapter(g, n + 2)
    common.journey_chapter(g, n + 3)
    common.qr_chapter(g, n + 4)
    return n + 5


def dept(builder, title, file, audience, header, extra_back=True):
    def make():
        g = Guide("en")
        n = staff_front(g, 1)
        builder(g, n)
        common.workflows_chapter(g, n + 3)
        common.master_chapter(g, n + 4)
        common.status_glossary(g, n + 5)
        return g
    return dict(file=file, make=make, title=title, audience=audience, header=header)


def china_en():
    g = Guide("en")
    n = staff_front(g, 1)
    g_china_en.build(g, n)
    common.workflows_chapter(g, n + 3)
    common.status_glossary(g, n + 4)
    g.chapter("Quick reference", None, n + 5)
    g.quickref("China Warehouse", "Receive → Label → Store → Load → Seal → Depart",
               ["Receive: customer, receipt number, cargo type, packages, CBM, photo → <b>Confirm receiving</b>.",
                "One QR label on every carton; delivery note to the driver.", "Load from <b>Waiting in Guangzhou</b> → <b>Load</b>.",
                "Seal: container number + seal number → <b>Seal the container</b>.", "Ship gone → <b>The container has left China</b>.",
                "Every sign-in opens in Chinese; English is one press away for that session."])
    return g


def china_zh():
    g = Guide("zh")
    g_china_zh.build(g, 1)
    return g


def master():
    g = Guide("en")
    n = staff_front(g, 1)
    g_support.build(g, n); n += 3
    g_china_en.build(g, n); n += 3
    g_dar.build(g, n); n += 3
    g_finance.build(g, n); n += 3
    g_manager_admin.build_manager(g, n); n += 2
    g_manager_admin.build_admin(g, n); n += 2
    g_portal_public.build_portal(g, n); n += 2
    g_portal_public.build_public(g, n); n += 1
    common.workflows_chapter(g, n)
    common.master_chapter(g, n + 1)
    common.status_glossary(g, n + 2)
    common.quickrefs(g, n + 3)
    return g


def portal():
    g = Guide("en")
    g.chapter("About this guide", "For Swift Cargo customers: how to use your account on the website and your phone. " + INTRO, 1)
    g_portal_public.build_portal(g, 2)
    common.journey_chapter(g, 4)
    return g


def public():
    g = Guide("en")
    g.chapter("About this guide", INTRO, 1)
    g_portal_public.build_public(g, 2)
    return g


def _dept_guide(build):
    def make():
        g = Guide("en")
        n = staff_front(g, 1)
        n2 = build(g, n)
        common.workflows_chapter(g, n + 3)
        common.master_chapter(g, n + 4)
        common.status_glossary(g, n + 5)
        return g
    return make


def _mgr():
    g = Guide("en"); n = staff_front(g, 1)
    g_manager_admin.build_manager(g, n)
    common.workflows_chapter(g, n + 2); common.master_chapter(g, n + 3); common.status_glossary(g, n + 4); common.quickrefs(g, n + 5)
    return g


def _adm():
    g = Guide("en"); n = staff_front(g, 1)
    g_manager_admin.build_admin(g, n)
    common.workflows_chapter(g, n + 2); common.master_chapter(g, n + 3); common.status_glossary(g, n + 4); common.quickrefs(g, n + 5)
    return g


GUIDES = {
    "master": (master, "Complete System Guidebook", "Every department, the customer portal and the public website — the system screen by screen, on computer and phone.", "All staff", "Complete System Guidebook"),
    "china_en": (china_en, "China Warehouse Guide", "Receiving, labelling, loading, sealing and departure in Guangzhou.", "China Warehouse · English", "China Warehouse Guide"),
    "china_zh": (china_zh, "中国仓库操作手册", "广州收货、贴标签、装柜、封柜与离港——电脑端和手机端操作说明。", "中国仓库 · 中文版", "中国仓库操作手册"),
    "dar": (_dept_guide(g_dar.build), "Dar Warehouse Guide", "Arrival, check-in, clearance, storage and handover in Dar es Salaam.", "Dar Warehouse", "Dar Warehouse Guide"),
    "support": (_dept_guide(g_support.build), "Customer Support Guide", "Answering customers from the system, payments to Finance, requests and tickets.", "Customer Support", "Customer Support Guide"),
    "finance": (_dept_guide(g_finance.build), "Finance Guide", "Prices, bills, payments, receipts, accounts, payroll and reconciliation.", "Finance", "Finance Guide"),
    "manager": (_mgr, "Manager Guide", "Running the business day to day: queues, approvals, cases, staff and the numbers.", "Manager", "Manager Guide"),
    "admin": (_adm, "Admin Guide", "The owner's configuration: staff, company settings, warehouses, website content and records.", "Admin (owner)", "Admin Guide"),
    "portal": (portal, "Customer Portal Guide", "Your Swift Cargo account: tracking, bills, payments, bookings and pickups.", "Customers", "Customer Portal Guide"),
    "public": (public, "Public Website Guide", "www.swiftcargotz.com page by page.", "Website visitors & staff", "Public Website Guide"),
}
FILES = {"master": "Swift Cargo — Complete System Guidebook", "china_en": "Swift Cargo — China Warehouse Guide — English",
         "china_zh": "Swift Cargo — China Warehouse Guide — Chinese", "dar": "Swift Cargo — Dar Warehouse Guide",
         "support": "Swift Cargo — Customer Support Guide", "finance": "Swift Cargo — Finance Guide", "manager": "Swift Cargo — Manager Guide",
         "admin": "Swift Cargo — Admin Guide", "portal": "Swift Cargo — Customer Portal Guide", "public": "Swift Cargo — Public Website Guide"}


def build_all(render, only=None):
    for key, (make, title, sub, aud, header) in GUIDES.items():
        if only and key not in only:
            continue
        print(f"{key}:")
        g = make()
        render(FILES[key], g, title, sub, aud, header, toc_levels=2 if key == "master" else 3)
