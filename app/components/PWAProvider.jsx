"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function PWAProvider({ children }) {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already running as installed PWA?
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS Safari (no beforeinstallprompt support)
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    setIsIOS(isIOSDevice && isSafari);

    // Only register SW on staff pages
    const isStaffPage =
      pathname &&
      (pathname.startsWith("/reception") || pathname.startsWith("/kitchen"));

    if (!isStaffPage) return;

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("[PWA] SW registered:", reg.scope))
        .catch((err) => console.log("[PWA] SW failed:", err));
    }

    // Capture Chrome/Edge install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [pathname]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  // Don't show banner if already installed
  if (isInstalled) return children;

  // Don't show anything on customer table page
  const isStaffPage =
    pathname &&
    (pathname.startsWith("/reception") || pathname.startsWith("/kitchen"));
  if (!isStaffPage) return children;

  return (
    <>
      {children}

      {/* Install Banner */}
      {showBanner && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#1a1a2e",
            color: "#fff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            zIndex: 9999,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
            borderTop: "2px solid #e8a33d",
          }}
        >
          <div style={{ fontSize: "14px", lineHeight: 1.4, flex: 1 }}>
            <strong style={{ color: "#e8a33d" }}>📲 Install Table Order</strong>
            <br />
            <span style={{ opacity: 0.8, fontSize: "13px" }}>
              {isIOS
                ? "Tap Share → Add to Home Screen"
                : "Add to home screen for quick access"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => setShowBanner(false)}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Later
            </button>

            {!isIOS && (
              <button
                onClick={handleInstallClick}
                style={{
                  background: "#e8a33d",
                  border: "none",
                  color: "#1a1a2e",
                  padding: "8px 18px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Install
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}