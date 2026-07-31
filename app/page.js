"use client";

import Link from "next/link";

const roles = [
  {
    href: "/table",
    title: "Customer",
    subtitle: "Scan QR & order from your table",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
        <path d="M8.5 8.5v.01" />
        <path d="M16 15.5v.01" />
        <path d="M12 12v.01" />
      </svg>
    ),
    color: "#e8a33d",
    bg: "#fff5e0",
  },
  {
    href: "/receptionist",
    title: "Reception",
    subtitle: "Manage orders, menu & billing",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    color: "#1a1a2e",
    bg: "#f0f0f5",
  },
  {
    href: "/kitchen",
    title: "Kitchen",
    subtitle: "View tickets & update status",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v18" />
        <path d="M16 3v18" />
        <path d="M3 8h18" />
        <path d="M3 16h18" />
      </svg>
    ),
    color: "#22c55e",
    bg: "#dcfce7",
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
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
          </svg>
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
          maxWidth: 720,
        }}
      >
        {roles.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              className="card"
              style={{
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "";
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
                }}
              >
                {role.icon}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{role.title}</div>
                <div style={{ fontSize: 14, color: "#6b6b7b" }}>{role.subtitle}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: role.color, marginTop: 4 }}>
                Open
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
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