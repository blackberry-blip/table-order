"use client";

import Link from "next/link";

const roles = [
  {
    href: "/table",
    title: "Customer",
    subtitle: "Scan QR & order from your table",
    icon: "📱",
    color: "#e8a33d",
    bg: "#fff5e0",
  },
  {
    href: "/login",
    title: "Staff Login",
    subtitle: "Reception, Kitchen, or Owner",
    icon: "🔐",
    color: "#1a1a2e",
    bg: "#f0f0f5",
  },
];

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "linear-gradient(135deg, #faf8f5 0%, #f5f3ef 100%)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            color: "#e8a33d",
            fontSize: 28,
          }}
        >
          🍽️
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#1a1a2e", marginBottom: 8, letterSpacing: "-0.5px" }}>
          Table Order
        </h1>
        <p style={{ fontSize: 16, color: "#6b6b7b" }}>
          QR-based ordering system for restaurants
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          width: "100%",
          maxWidth: 560,
        }}
      >
        {roles.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                padding: 28,
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #e6e1d6",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(20,20,30,0.05)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(20,20,30,0.05)";
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: role.bg,
                  color: role.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                {role.icon}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{role.title}</div>
                <div style={{ fontSize: 14, color: "#6b6b7b" }}>{role.subtitle}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: role.color, marginTop: 4 }}>
                Open →
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p style={{ marginTop: 48, fontSize: 13, color: "#a0a0a8" }}>
        Built with Next.js & Firebase
      </p>
    </div>
  );
}