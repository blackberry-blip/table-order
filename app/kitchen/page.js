"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [etaInputs, setEtaInputs] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const confirmed = orders.filter((o) => o.status === "confirmed");
  const preparing = orders.filter((o) => o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready");

  async function startCooking(id) {
    const mins = parseInt(etaInputs[id]) || 10;
    await updateDoc(doc(db, "orders", id), {
      status: "preparing",
      etaMinutes: mins,
      preparingAt: Date.now(),
    });
  }

  async function markReady(id) {
    await updateDoc(doc(db, "orders", id), { status: "ready" });
  }

  function getCountdown(o) {
    if (!o.etaMinutes || !o.preparingAt) return null;
    const totalSeconds = o.etaMinutes * 60;
    const elapsed = Math.floor((Date.now() - o.preparingAt) / 1000);
    const remaining = totalSeconds - elapsed;
    if (remaining <= 0) return "Overdue!";
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function getElapsed(o) {
    const elapsed = Math.floor((Date.now() - o.createdAt) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }

  const TicketCard = ({ order, type, children }) => {
    const countdown = type === "preparing" ? getCountdown(order) : null;
    const isOverdue = countdown === "Overdue!";

    return (
      <div
        className="card"
        style={{
          padding: 20,
          marginBottom: 16,
          borderLeft: `4px solid ${
            type === "confirmed" ? "#f59e0b" : type === "preparing" ? (isOverdue ? "#ef4444" : "#3b82f6") : "#22c55e"
          }`,
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)" }}>Table {order.table}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {getElapsed(order)} ago
            </div>
          </div>
          {type === "preparing" && countdown && (
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 24,
                fontWeight: 700,
                color: isOverdue ? "#ef4444" : "#3b82f6",
                background: isOverdue ? "#fee2e2" : "#dbeafe",
                padding: "6px 14px",
                borderRadius: 10,
              }}
            >
              {countdown}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {order.items.map((it, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 10,
                fontSize: 15,
              }}
            >
              <span style={{ fontWeight: 600 }}>{it.name}</span>
              <span
                style={{
                  background: "var(--primary)",
                  color: "#fff",
                  padding: "2px 10px",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                ×{it.qty}
              </span>
            </div>
          ))}
        </div>

        {children}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "sans-serif" }}>
      {/* Kitchen Header */}
      <div
        style={{
          background: "var(--primary)",
          color: "#fff",
          padding: "20px 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 2px 20px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(232,163,61,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
              }}
            >
              👨‍🍳
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Kitchen Display</h1>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{currentTime.toLocaleTimeString()}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{confirmed.length}</div>
              <div style={{ opacity: 0.7 }}>Waiting</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{preparing.length}</div>
              <div style={{ opacity: 0.7 }}>Cooking</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{ready.length}</div>
              <div style={{ opacity: 0.7 }}>Ready</div>
            </div>
          </div>
        </div>
      </div>

      {/* Kitchen Columns */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 24,
        }}
      >
        {/* Column 1: Needs Time */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "2px solid #f59e0b",
            }}
          >
            <span style={{ fontSize: 20 }}>⏳</span>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Needs ETA</h2>
            <span
              style={{
                marginLeft: "auto",
                background: "#fef3c7",
                color: "#92400e",
                padding: "2px 10px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {confirmed.length}
            </span>
          </div>

          {confirmed.length === 0 && (
            <div
              className="card"
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>☕</div>
              <p>Nothing waiting — time for a break!</p>
            </div>
          )}

          {confirmed.map((o) => (
            <TicketCard key={o.id} order={o} type="confirmed">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  placeholder="10"
                  defaultValue={10}
                  onChange={(e) => setEtaInputs((prev) => ({ ...prev, [o.id]: e.target.value }))}
                  style={{
                    width: 70,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 15,
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                />
                <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>min</span>
                <button
                  className="btn btn-primary"
                  onClick={() => startCooking(o.id)}
                  style={{ marginLeft: "auto", padding: "12px 20px", fontSize: 14 }}
                >
                  ▶ Start Cooking
                </button>
              </div>
            </TicketCard>
          ))}
        </div>

        {/* Column 2: Cooking */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "2px solid #3b82f6",
            }}
          >
            <span style={{ fontSize: 20 }}>🔥</span>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>On the Stove</h2>
            <span
              style={{
                marginLeft: "auto",
                background: "#dbeafe",
                color: "#1e40af",
                padding: "2px 10px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {preparing.length}
            </span>
          </div>

          {preparing.length === 0 && (
            <div
              className="card"
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>🍳</div>
              <p>Nothing on the stove right now.</p>
            </div>
          )}

          {preparing.map((o) => (
            <TicketCard key={o.id} order={o} type="preparing">
              <button
                className="btn btn-success"
                onClick={() => markReady(o.id)}
                style={{ width: "100%", padding: 14, fontSize: 15 }}
              >
                ✓ Mark Ready for Pickup
              </button>
            </TicketCard>
          ))}
        </div>

        {/* Column 3: Ready */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "2px solid #22c55e",
            }}
          >
            <span style={{ fontSize: 20 }}>✅</span>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Ready for Pickup</h2>
            <span
              style={{
                marginLeft: "auto",
                background: "#dcfce7",
                color: "#166534",
                padding: "2px 10px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {ready.length}
            </span>
          </div>

          {ready.length === 0 && (
            <div
              className="card"
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>🍽️</div>
              <p>Nothing plated yet.</p>
            </div>
          )}

          {ready.map((o) => (
            <TicketCard key={o.id} order={o} type="ready">
              <div
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "12px 16px",
                  borderRadius: 10,
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Waiting for server pickup
              </div>
            </TicketCard>
          ))}
        </div>
      </div>
    </div>
  );
}