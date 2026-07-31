"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { playNotificationSound } from "@/lib/notifications";
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
  const [lastOrderStatus, setLastOrderStatus] = useState(null);

  const [tableNo, setTableNo] = useState(tableParam ? parseInt(tableParam) : null);
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState({});
  const [addingMore, setAddingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [showCartSummary, setShowCartSummary] = useState(false);

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
    
    // Detect status change and play sound
    if (activeOrder && lastOrderStatus && activeOrder.status !== lastOrderStatus) {
      if (activeOrder.status === "confirmed") playNotificationSound("default");
      else if (activeOrder.status === "preparing") playNotificationSound("newOrder");
      else if (activeOrder.status === "ready") playNotificationSound("ready");
      else if (activeOrder.status === "served") playNotificationSound("default");
      else if (activeOrder.status === "billed") playNotificationSound("bill");
    }
    
    if (activeOrder) setLastOrderStatus(activeOrder.status);
    setOrder(activeOrder || null);
  });
  return () => unsub();
}, [tableNo, lastOrderStatus]);

  const availableItems = menuItems.filter((m) => m.available);
  const categories = ["All", ...new Set(availableItems.map((m) => m.category))];
  const filteredItems = activeCategory === "All" ? availableItems : availableItems.filter((m) => m.category === activeCategory);

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
    playNotificationSound("newOrder");
    setShowCartSummary(false);
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
    setShowCartSummary(false);
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

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [id, q]) => {
    const item = findItem(id);
    return sum + (item ? item.price * q : 0);
  }, 0);

  const statusWords = {
    pending: "Sent to the counter",
    confirmed: "Confirmed — heading to kitchen",
    preparing: "Being cooked",
    ready: "Ready — on its way to your table",
    served: "Served. Enjoy!",
  };

  // ---------- Table picker ----------
  if (!tableNo) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 24, fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {profile?.logoUrl && (
              <img
                src={profile.logoUrl}
                alt="logo"
                style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", marginBottom: 16, boxShadow: "var(--shadow-md)" }}
              />
            )}
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>{profile?.name || "Welcome"}</h1>
            {profile?.tagline && <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>{profile.tagline}</p>}
          </div>

          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Which table are you at?</h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>Select your table number to view the menu</p>

            {tables.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
                <p>No tables set up yet.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {tables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTableNo(t.number)}
                    style={{
                      padding: "18px 8px",
                      fontSize: 20,
                      fontWeight: 700,
                      borderRadius: 14,
                      border: "2px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.background = "var(--accent-light)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--surface)";
                    }}
                  >
                    {t.number}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Bill screen ----------
  if (order && (order.status === "billed" || order.status === "bill_requested")) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 24, fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            {profile?.logoUrl && (
              <img src={profile.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Table {order.table}</div>
            </div>
          </div>

          {order.status === "bill_requested" && (
            <div
              className="card animate-fade-in"
              style={{
                padding: 32,
                textAlign: "center",
                marginBottom: 20,
                background: "linear-gradient(135deg, #fff5e0 0%, #fef3c7 100%)",
                border: "1px solid #fde68a",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Bill Requested</h3>
              <p style={{ color: "#92400e", fontSize: 14 }}>The front desk is preparing your bill now.</p>
            </div>
          )}

          {order.status === "billed" && (
            <div className="card animate-fade-in" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "24px 24px 16px", borderBottom: "2px dashed var(--border)" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>Receipt</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{profile?.name || "Table Order"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Table {order.table}</div>
                </div>

                {order.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 15, borderBottom: "1px dotted var(--border)" }}>
                    <span>
                      {it.name} <span style={{ color: "var(--text-secondary)" }}>×{it.qty}</span>
                    </span>
                    <span style={{ fontWeight: 600 }}>₹{it.price * it.qty}</span>
                  </div>
                ))}
              </div>

              <div style={{ padding: 20, background: "var(--surface-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Subtotal</span>
                  <span>₹{order.billSubtotal}</span>
                </div>
                {order.billTaxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "var(--text-secondary)" }}>
                    <span>Tax ({order.billTaxPercent}%)</span>
                    <span>₹{order.billTaxAmount}</span>
                  </div>
                )}
                {order.billServiceAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "var(--text-secondary)" }}>
                    <span>Service ({order.billServicePercent}%)</span>
                    <span>₹{order.billServiceAmount}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: "2px solid var(--text)" }}>
                  <span>Total</span>
                  <span>₹{order.billTotal}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--text-secondary)" }}>
            Awaiting payment — pay at the counter or with staff.
          </div>
        </div>
      </div>
    );
  }

  // ---------- Status screen — WITH THE ORIGINAL BLACK BOX ----------
  if (order && !addingMore) {
    const countdown = getCountdown(order);

    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 24, fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            {profile?.logoUrl && (
              <img src={profile.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Table {order.table}</div>
            </div>
          </div>

          {/* === THE ORIGINAL BLACK STATUS BOX — EXACTLY AS YOU HAD IT === */}
          <div
            style={{
              background: "#1C1B1A",
              color: "#fff",
              borderRadius: 16,
              padding: 28,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600 }}>{statusWords[order.status]}</div>
            {order.status === "preparing" && countdown && (
              <div style={{ fontSize: 42, marginTop: 14, fontFamily: "monospace", fontWeight: 700, letterSpacing: 2, color: "#e8a33d" }}>
                {countdown}
              </div>
            )}
          </div>

          {/* Order Items */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              Your Order
            </h3>
            {order.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < order.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{it.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>₹{it.price} each</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>×{it.qty}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "2px solid var(--border)", fontWeight: 700, fontSize: 16 }}>
              <span>Total items</span>
              <span>{order.items.reduce((s, i) => s + i.qty, 0)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => setAddingMore(true)}
              className="btn btn-ghost"
              style={{ width: "100%", padding: 16, fontSize: 15 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              Add more items
            </button>

            {order.status === "served" && (
              <button
                onClick={requestBill}
                className="btn btn-accent"
                style={{ width: "100%", padding: 16, fontSize: 16 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                </svg>
                Request Bill
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Menu ----------
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "sans-serif" }}>
      {/* Sticky Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            {profile?.logoUrl && (
              <img src={profile.logoUrl} alt="logo" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{profile?.name || "Menu"}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Table {tableNo}</div>
            </div>
            {addingMore && (
              <button
                onClick={() => { setAddingMore(false); setCart({}); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 100,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: activeCategory === cat ? "var(--primary)" : "var(--surface-2)",
                  color: activeCategory === cat ? "#fff" : "var(--text-secondary)",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 120px" }}>
        {availableItems.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
            <p>Menu is being set up — check back shortly.</p>
          </div>
        )}

        {categories
          .filter((c) => c !== "All")
          .filter((c) => activeCategory === "All" || c === activeCategory)
          .map((cat) => {
            const itemsInCat = availableItems.filter((it) => it.category === cat);
            if (itemsInCat.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-secondary)", marginBottom: 14 }}>
                  {cat}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {itemsInCat.map((it) => (
                    <div
                      key={it.id}
                      className="card"
                      style={{
                        padding: 14,
                        display: "flex",
                        gap: 14,
                        alignItems: "center",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 12,
                            background: "var(--surface-2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 28,
                            flexShrink: 0,
                          }}
                        >
                          🍽️
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{it.name}</div>
                        {it.description && (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.4 }}>{it.description}</div>
                        )}
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--accent)" }}>₹{it.price}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <button
                          onClick={() => changeQty(it.id, -1)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            border: "1.5px solid var(--border)",
                            background: "var(--surface)",
                            color: "var(--text)",
                            fontSize: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: "center" }}>
                          {cart[it.id] || 0}
                        </span>
                        <button
                          onClick={() => changeQty(it.id, 1)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            border: "none",
                            background: "var(--primary)",
                            color: "#fff",
                            fontSize: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      {/* Fixed Bottom Bar */}
      {count > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
            zIndex: 20,
          }}
        >
          <div style={{ maxWidth: 480, margin: "0 auto", padding: 14 }}>
            <button
              onClick={() => setShowCartSummary(true)}
              className="btn btn-primary"
              style={{ width: "100%", padding: 16, fontSize: 15, justifyContent: "space-between" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    padding: "2px 10px",
                    borderRadius: 100,
                    fontSize: 13,
                  }}
                >
                  {count} items
                </span>
                <span style={{ fontWeight: 500 }}>View cart</span>
              </span>
              <span style={{ fontWeight: 700 }}>₹{total}</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart Summary Modal */}
      {showCartSummary && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setShowCartSummary(false)}
        >
          <div
            className="animate-slide-up"
            style={{
              background: "var(--surface)",
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxWidth: 480,
              maxHeight: "80vh",
              overflow: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700 }}>Your Cart</h3>
              <button
                onClick={() => setShowCartSummary(false)}
                style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            {Object.entries(cart).map(([id, qty]) => {
              const item = findItem(id);
              if (!item) return null;
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>₹{item.price} × {qty}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => changeQty(id, -1)}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "none", cursor: "pointer" }}
                    >
                      −
                    </button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qty}</span>
                    <button
                      onClick={() => changeQty(id, 1)}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer" }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "2px solid var(--border)", fontSize: 18, fontWeight: 700 }}>
              <span>Total</span>
              <span>₹{total}</span>
            </div>

            <button
              onClick={addingMore ? addMoreItems : placeOrder}
              className="btn btn-accent"
              style={{ width: "100%", marginTop: 20, padding: 16, fontSize: 16 }}
            >
              {addingMore ? "Add to Order" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TablePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "var(--text-secondary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          Loading menu...
        </div>
      </div>
    }>
      <TableContent />
    </Suspense>
  );
}