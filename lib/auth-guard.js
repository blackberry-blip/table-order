"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import { HOTEL_STATUS } from "./plans";

export function AuthGuard({ allowedRoles, children }) {
  const { user, role, loading, subscription } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (allowedRoles && !allowedRoles.includes(role)) { router.replace("/login"); return; }

    const status = subscription?.status;
    const expired = subscription?.planEndDate && subscription.planEndDate < Date.now();

    if (status === HOTEL_STATUS.PENDING_PAYMENT || status === HOTEL_STATUS.PENDING_APPROVAL) {
      router.replace("/pending");
      return;
    }
    if (status === HOTEL_STATUS.SUSPENDED || status === HOTEL_STATUS.REJECTED || expired) {
      router.replace("/login?blocked=1");
    }
  }, [user, role, loading, subscription, router, allowedRoles]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #eee", borderTopColor: "#e8a33d", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#888" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(role)) return null;

  const status = subscription?.status;
  const expired = subscription?.planEndDate && subscription.planEndDate < Date.now();
  if (status === HOTEL_STATUS.PENDING_PAYMENT || status === HOTEL_STATUS.PENDING_APPROVAL) return null;
  if (status === HOTEL_STATUS.SUSPENDED || status === HOTEL_STATUS.REJECTED || expired) return null;

  return children;
}