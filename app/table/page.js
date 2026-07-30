"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

function TableContent() {
  const searchParams = useSearchParams();
  const tableParam = searchParams.get("table");

  const [tableNo, setTableNo] = useState(tableParam ? parseInt(tableParam) : null);
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState({});
  const [addingMore, setAddingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);

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
    const q = query(collection(db, "tables"), orderBy("number", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!tableNo) return;
    const q = query(collection(db, "orders"), where("table", "==", tableNo));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const activeOrder = all
        .filter((o) => o.status !== "paid")
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

  async function requestBill() {
    await updateDoc(doc(db, "orders", order.id), { status: "bill_requested" });
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

  // ---------- Table picker (only shown if no ?table= in the URL) ----------
  if (!tableNo) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
        <Header />
        <h2>Which table are you at?</h2>
        {tables.length === 0 && <p style={{ color: "#888" }}>No tables set up yet.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
          {tables.map((t) => (
            <button key={t.id} onClick={() => setTableNo(t.number)} style={{ padding: 16, fontSize: 16 }}>
              {t.number}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Bill screen ----------
  if (order && (order.status === "billed" || order.status === "bill_requested")) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
        <Header />
        <h2>Table {order.table} · Bill</h2>

        {order.status === "bill_requested" && (
          <div style={{ background: "#F1EBDD", borderRadius: 12, padding: 18, marginBottom: 16, textAlign: "center" }}>
            Bill requested — the front desk is preparing it now.
          </div>
        )}

        {order.status === "billed" && (
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 18 }}>
            {order.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                <span>{it.name} ×{it.qty}</span>
                <span>₹{it.price * it.qty}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #ccc", marginTop: 10, paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Subtotal</span>
                <span>₹{order.billSubtotal}</span>
              </div>
              {order.billTaxAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#888" }}>
                  <span>Tax ({order.billTaxPercent}%)</span>
                  <span>₹{order.billTaxAmount}</span>
                </div>
              )}
              {order.billServiceAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#888" }}>
                  <span>Service ({order.billServicePercent}%)</span>
                  <span>₹{order.billServiceAmount}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                <span>Total</span>
                <span>₹{order.billTotal}</span>
              </div>
            </div>
            <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#888" }}>
              Awaiting payment — pay at the counter or with staff.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- Status screen ----------
  if (order) {
    const words = {
      pending: "Sent to the counter",
      confirmed: "Confirmed — heading to kitchen",
      preparing: "Being cooked",
      ready: "Ready — on its way to your table",
      served: "Served. Enjoy!",
    };
    const countdown = getCountdown(order);

    if (!addingMore) {
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

          {order.status !== "served" && (
            <button
              onClick={() => setAddingMore(true)}
              style={{ marginTop: 20, width: "100%", padding: 14, background: "#fff", color: "#1C1B1A", border: "1px solid #1C1B1A", borderRadius: 10 }}
            >
              + Add more items
            </button>
          )}

          {order.status === "served" && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setAddingMore(true)}
                style={{ width: "100%", padding: 14, background: "#fff", color: "#1C1B1A", border: "1px solid #1C1B1A", borderRadius: 10 }}
              >
                + Add more items
              </button>
              <button
                onClick={requestBill}
                style={{ width: "100%", padding: 14, background: "#E8A33D", color: "#1C1B1A", border: "none", borderRadius: 10, fontWeight: 600 }}
              >
                Request bill
              </button>
            </div>
          )}
        </div>
      );
    }
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

export default function TablePage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading...</div>}>
      <TableContent />
    </Suspense>
  );
}