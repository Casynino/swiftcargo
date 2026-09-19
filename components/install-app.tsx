"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what lets a phone offer "Install
 * app" and open Swift Cargo full screen from the home screen. It caches
 * nothing; see public/sw.js.
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
