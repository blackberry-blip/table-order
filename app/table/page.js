"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";

export default function TablePage() {
  const [tableNo, setTableNo] = useState(null);
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState({});
  const [addingMore, setAddingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "profile"), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "menuItems"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMenuItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!tableNo) return;
    const q = query(collection(db, "orders"), where("table", "==", tableNo));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const activeOrder = all
        .filter((o) => o.status !== "served")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      setOrder(activeOrder || null);
    });
    return () => unsub();
  }, [tableNo]);

  const availableItems = menuItems.filter((m) => m.available);
  const categories = [...new Set(availableItems.map((m) => m.category))];

  function findItem(id) {
    return menuItems.find((m) => m.id === id);
  }

  function changeQty(id, delta) {
    setCart((prev) => {
      const next = { ...prev };
      next[id] = Math.max(0, (next[id] || 0) + delta);
      if (next[id] === 0) delete next[id];
      return next;
    });
  }

  async function placeOrder() {
    const items = Object.entries(cart).map(([id, qty]) => {
      const item = findItem(id);
      return { name: item.name, qty, price: item.price };
    });

    await addDoc(collection(db, "orders"), {
      table: tableNo,
      items,
      status: "pending",
      etaMinutes: null,
      preparingAt: null,
      createdAt: Date.now(),
    });

    setCart({});
  }

  async function addMoreItems() {
    const newItems = Object.entries(cart).map(([id, qty]) => {
      const item = findItem(id);
      return { name: item.name, qty, price: item.price };
    });

    const merged = [...order.items];
    newItems.forEach((ni) => {
      const existing = merged.find((m) => m.name === ni.name);
      if (existing) existing.qty += ni.qty;
      else merged.push(ni);
    });

    await updateDoc(doc(db, "orders", order.id), {
      items: merged,
      status: "pending",
      etaMinutes: null,
      preparingAt: null,
    });

    setCart({});
    setAddingMore(false);
  }

  function getCountdown(o) {
    if (o.status !== "preparing" || !o.etaMinutes || !o.preparingAt) return null;
    const totalSeconds = o.etaMinutes * 60;
    const elapsed = Math.floor((Date.now() - o.preparingAt) / 1000);
    const remaining = totalSeconds - elapsed;
    if (remaining <= 0) return "Any moment now";
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const Header = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      {profile?.logoUrl && (
        <img src={profile.logoUrl} alt="logo" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
      )}
      <div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
        {profile?.tagline && <div style={{ fontSize: 12, color: "#888" }}>{profile.tagline}</div>}
      </div>
    </div>
  );

  // ---------- Table picker ----------
  if (!tableNo) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
        <Header />
        <h2>Which table are you at?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setTableNo(n)} style={{ padding: 16, fontSize: 16 }}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Status screen ----------
  if (order && !addingMore) {
    const words = {
      pending: "Sent to the counter",
      confirmed: "Confirmed — heading to kitchen",
      preparing: "Being cooked",
      ready: "Ready — on its way to your table",
    };
    const countdown = getCountdown(order);

    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
        <Header />
        <h2>Table {order.table}</h2>
        <div style={{ background: "#1C1B1A", color: "#fff", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{words[order.status]}</div>
          {order.status === "preparing" && countdown && (
            <div style={{ fontSize: 38, marginTop: 10, fontFamily: "monospace" }}>
              {countdown}
            </div>
          )}
        </div>

        <h3 style={{ marginTop: 20 }}>Your order</h3>
        {order.items.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <span>{it.name}</span>
            <span>×{it.qty}</span>
          </div>
        ))}

        <button
          onClick={() => setAddingMore(true)}
          style={{ marginTop: 20, width: "100%", padding: 14, background: "#fff", color: "#1C1B1A", border: "1px solid #1C1B1A", borderRadius: 10 }}
        >
          + Add more items
        </button>
      </div>
    );
  }

  // ---------- Menu ----------
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [id, q]) => {
    const item = findItem(id);
    return sum + (item ? item.price * q : 0);
  }, 0);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 100px 20px", fontFamily: "sans-serif" }}>
      <Header />
      <h2>Table {tableNo} · Menu</h2>
      {addingMore && (
        <button onClick={() => { setAddingMore(false); setCart({}); }} style={{ marginBottom: 12 }}>
          ← Back to status
        </button>
      )}

      {availableItems.length === 0 && (
        <p style={{ color: "#888", marginTop: 20 }}>Menu is being set up — check back shortly.</p>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <h3 style={{ marginTop: 24 }}>{cat}</h3>
          {availableItems.filter((it) => it.category === cat).map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee", gap: 10 }}>
              {it.imageUrl && (
                <img src={it.imageUrl} alt={it.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              )}
              <div style={{ flex: 1 }}>
                <div>{it.name}</div>
                {it.description && <div style={{ fontSize: 12, color: "#888" }}>{it.description}</div>}
                <div style={{ color: "#888", fontSize: 13 }}>₹{it.price}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => changeQty(it.id, -1)}>−</button>
                <span>{cart[it.id] || 0}</span>
                <button onClick={() => changeQty(it.id, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {count > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 16, background: "#fff", borderTop: "1px solid #ddd" }}>
          <button
            onClick={addingMore ? addMoreItems : placeOrder}
            style={{ width: "100%", maxWidth: 480, margin: "0 auto", display: "block", padding: 16, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 10, fontSize: 15 }}
          >
            {addingMore ? "Add" : "Place order"} · {count} items · ₹{total}
          </button>
        </div>
      )}
    </div>
  );
}