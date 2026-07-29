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

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
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

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h2>Kitchen</h2>

      <h3 style={{ marginTop: 20 }}>Needs a time ({confirmed.length})</h3>
      {confirmed.length === 0 && <p style={{ color: "#888" }}>Nothing waiting on an estimate.</p>}
      {confirmed.map((o) => (
        <div key={o.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Table {o.table}</div>
          {o.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{it.name}</span>
              <span>×{it.qty}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <input
              type="number"
              placeholder="10"
              defaultValue={10}
              onChange={(e) => setEtaInputs((prev) => ({ ...prev, [o.id]: e.target.value }))}
              style={{ width: 60, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
            />
            <span style={{ fontSize: 13, color: "#888" }}>min</span>
            <button
              onClick={() => startCooking(o.id)}
              style={{ marginLeft: "auto", padding: "10px 14px", background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}
            >
              Start cooking
            </button>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>Cooking ({preparing.length})</h3>
      {preparing.length === 0 && <p style={{ color: "#888" }}>Nothing on the stove.</p>}
      {preparing.map((o) => (
        <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Table {o.table}</span>
            <span style={{ fontSize: 13, color: "#C1440E" }}>{o.etaMinutes} min</span>
          </div>
          {o.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{it.name}</span>
              <span>×{it.qty}</span>
            </div>
          ))}
          <button
            onClick={() => markReady(o.id)}
            style={{ marginTop: 10, width: "100%", padding: 10, background: "#4C7A4A", color: "#fff", border: "none", borderRadius: 8 }}
          >
            Mark ready
          </button>
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>Ready for pickup</h3>
      {ready.length === 0 && <p style={{ color: "#888" }}>Nothing plated yet.</p>}
      {ready.map((o) => (
        <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Table {o.table}</div>
        </div>
      ))}
    </div>
  );
}