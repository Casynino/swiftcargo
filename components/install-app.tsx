"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, Download, EllipsisVertical, Menu, Share, Smartphone, SquarePlus, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * THE SERVICE WORKER, AND THE WAY TO THE HOME SCREEN.
 *
 * A website in a browser tab always keeps the browser's own bars and no page
 * can hide them; the only full-screen version is the one put on the home
 * screen. The service worker is what lets a phone offer "Install app". A phone
 * that has not installed it is told how — one tap on Android, three steps on an
 * iPhone, the right menu for Samsung, Huawei and Chrome, and a way out of
 * WeChat or WhatsApp, whose own browser cannot add anything to the home screen.
 * Nothing shows once the app is installed. Copied from Target Express.
 */
export function InstallApp() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Set by the small script in the page head, which hears Chrome's install offer before this file has loaded. */
    __scInstall?: InstallEvent | null;
  }
}

// Chrome on Android fires this once, early; kept here so any part of the page can use it later.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.__scInstall = null;
    listeners.forEach((f) => f());
  });
  window.addEventListener("sc-install-ready", () => {
    deferred = deferred ?? window.__scInstall ?? null;
    listeners.forEach((f) => f());
  });
  deferred = window.__scInstall ?? null;
}

const SEEN = "sc.installSeen";

type Browser = "safari" | "ios-other" | "chrome" | "samsung" | "huawei" | "android-other" | "in-app";

function browserOf(ua: string, ios: boolean): Browser {
  if (/MicroMessenger|WhatsApp|FBAN|FBAV|Instagram|Line\//i.test(ua)) return "in-app";
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "safari";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/HuaweiBrowser|HBPC|HarmonyOS|OpenHarmony|ArkWeb/i.test(ua)) return "huawei";
  if (/Chrome\//i.test(ua) && !/EdgA|OPR|Firefox|YaBrowser|UCBrowser|MiuiBrowser|HeyTapBrowser/i.test(ua)) return "chrome";
  return "android-other";
}

function useInstall() {
  const [state, setState] = useState({ ready: false, phone: false, installed: false, ios: false, browser: "chrome" as Browser, canPrompt: false });
  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const phone = window.matchMedia("(max-width: 1023px)").matches && window.matchMedia("(pointer: coarse)").matches;
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState({ ready: true, phone, installed: standalone, ios, browser: browserOf(navigator.userAgent, ios), canPrompt: !!deferred });
    };
    check();
    listeners.add(check);
    return () => void listeners.delete(check);
  }, []);
  const install = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      window.__scInstall = null;
      listeners.forEach((f) => f());
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, []);
  return { ...state, install };
}

function Step({ n, icon: Icon, children }: { n: number; icon?: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-2.5 py-2 text-[12.5px] leading-snug">
      <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-signal text-[10.5px] font-semibold text-signal-foreground">{n}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {Icon ? <Icon className="size-3.5 shrink-0 text-white/55" /> : null}
    </li>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { ios, browser, canPrompt, install } = useInstall();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("Use it like an app")} className="relative w-full max-w-[19.5rem] rounded-2xl border border-white/10 bg-[#0a1624] p-4 text-left text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold leading-tight">{t("Use it like an app")}</p>
            <p className="mt-0.5 text-[12px] text-white/60">{t("Full screen, no browser bar, its own icon.")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        {canPrompt ? (
          <div className="mt-3.5 flex flex-col gap-1.5">
            <button type="button" onClick={async () => { if (await install()) onClose(); }} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-signal text-[13px] font-semibold text-signal-foreground hover:bg-signal/90">
              <Download className="size-3.5" />
              {t("Install the app")}
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 text-[12.5px] font-medium hover:bg-white/5">
              {t("Not now")}
            </button>
          </div>
        ) : (
          <>
            <ol className="mt-3 space-y-1.5">
              {browser === "in-app" ? (
                <>
                  <Step n={1} icon={EllipsisVertical}>{t("Tap ··· at the top right, then Open in browser.")}</Step>
                  <Step n={2}>{ios ? t("In Safari, sign in and tap Get the full-screen app again.") : t("In the browser, sign in and tap Get the full-screen app again.")}</Step>
                </>
              ) : ios ? (
                <>
                  <Step n={1} icon={Share}>{browser === "safari" ? t("Tap Share at the bottom of Safari.") : t("Tap Share in the address bar or the menu.")}</Step>
                  <Step n={2} icon={SquarePlus}>{t("Scroll down and tap Add to Home Screen.")}</Step>
                  <Step n={3}>{t("Tap Add, then open Swift Cargo from your home screen.")}</Step>
                </>
              ) : browser === "samsung" ? (
                <>
                  <Step n={1} icon={Menu}>{t("Tap the menu at the bottom right.")}</Step>
                  <Step n={2}>{t("Tap Add page to, then Home screen.")}</Step>
                  <Step n={3}>{t("Open Swift Cargo from your home screen.")}</Step>
                </>
              ) : browser === "huawei" ? (
                <>
                  <Step n={1} icon={Menu}>{t("Tap the menu at the bottom of the browser.")}</Step>
                  <Step n={2}>{t("Tap Add to home screen (it may be under Add to).")}</Step>
                  <Step n={3}>{t("Open Swift Cargo from your home screen.")}</Step>
                </>
              ) : (
                <>
                  <Step n={1} icon={browser === "chrome" ? EllipsisVertical : Menu}>
                    {browser === "chrome" ? t("Open the browser menu at the top right.") : t("Open the browser menu.")}
                  </Step>
                  <Step n={2}>{t("Tap Install app or Add to Home screen.")}</Step>
                  <Step n={3}>{t("Open Swift Cargo from your home screen.")}</Step>
                </>
              )}
            </ol>
            {browser !== "in-app" ? (
              <p className="mt-2 text-[11px] leading-snug text-white/50">
                {ios ? t("If this page opened inside WeChat or WhatsApp, open it in Safari first.") : t("If this page opened inside WeChat or WhatsApp, open it in Chrome first.")}
              </p>
            ) : null}
            <button type="button" onClick={onClose} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-full border border-white/15 text-[12.5px] font-medium hover:bg-white/5">
              {t("Got it")}
            </button>
          </>
        )}
      </div>

      {/* An iPhone has no one-tap install, so the next best thing: while the pop-up is open in Safari, a small arrow
          bounces over the toolbar where Share actually is, so nobody hunts for it. */}
      {ios && browser === "safari" && !canPrompt ? (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[120] flex justify-center">
          <span className="flex animate-bounce flex-col items-center gap-0.5 text-[10px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {t("Share")}
            <ArrowDown className="size-3.5 text-signal" />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Opens by itself a moment after a phone's browser opens the app, on every visit until the app is installed (closing it is remembered for that visit only). It never shows once installed. */
export function InstallPrompt() {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !phone || installed) return;
    try {
      if (window.sessionStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, [ready, phone, installed]);
  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(SEEN, "1");
    } catch {
      /* private window: it simply asks again next time */
    }
  };
  return <InstallSheet open={open} onClose={close} />;
}

/** A button that opens the sheet. Draws nothing on a computer or once the app is installed. */
export function InstallButton({ render, className }: { render: (open: () => void) => React.ReactNode; className?: string }) {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  if (!ready || !phone || installed) return null;
  return (
    <div className={cn(className)}>
      {render(() => setOpen(true))}
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
