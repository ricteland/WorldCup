"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // A worker registered by a past production build on this origin would
      // keep serving its cached chunks to the dev server (stale client code,
      // hydration mismatches). Evict it and its caches.
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {});
      }
    }
  }, []);
  return null;
}
