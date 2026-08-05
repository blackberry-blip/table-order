"use client";

import { useAuth } from "@/lib/auth-context";
import { HOTEL_STATUS } from "@/lib/plans";

export default function PendingPage() {
  const { subscription, logout } = useAuth();
  const status = subscription?.status;
  const isPaymentStep = status === HOTEL_STATUS.PENDING_PAYMENT;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "linear-gradient(135deg, #faf8f5 0%, #f5f3ef 100%)" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff5e0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
          {isPaymentStep ? "💳" : "⏳"}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginBottom: 10 }}>
          {isPaymentStep ? "One step left" : "You're almost in!"}
        </h1>
        <p style={{ color: "#6b6b7b", fontSize: 14.5, lineHeight: 1.6 }}>
          {isPaymentStep
            ? "We're waiting on your payment confirmation. Head back to signup to submit your transaction reference."
            : "We're reviewing your account and you'll get access shortly — usually within a few hours."}
        </p>
        <button onClick={logout} style={{ marginTop: 24, background: "none", border: "none", color: "#6b6b7b", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}