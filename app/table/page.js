"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
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
  const [activeCategory, setActiveCategory] = useState("All");
  const [showCartSummary, setShowCartSummary] = useState(false);
  const [lastOrderStatus, setLastOrderStatus] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroItems, setHeroItems] = useState([]);

  // Tick timer
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Profile
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "profile"), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, []);

  // Menu items
  useEffect(() => {
    const q = query(collection(db, "menuItems"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMenuItems(items);
      // Hero items = featured items (receptionist can set featured flag, or just first 5 available)
      const featured = items.filter((m) => m.available && m.imageUrl).slice(0, 5);
      setHeroItems(featured);
    });
    return () => unsub();
  }, []);

  // Tables
  useEffect(() => {
    const q = query(collection(db, "tables"), orderBy("number", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Order listener
  useEffect(() => {
    if (!tableNo) return;
    const q = query(collection(db, "orders"), where("table", "==", tableNo));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const activeOrder = all
        .filter((o) => o.status !== "paid")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (activeOrder && lastOrderStatus && activeOrder.status !== lastOrderStatus) {
        // Sound could play here
      }
      if (activeOrder) setLastOrderStatus(activeOrder.status);
      setOrder(activeOrder || null);
    });
    return () => unsub();
  }, [tableNo, lastOrderStatus]);

  // Hero auto-slide
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const t = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroItems.length);
    }, 4000);
    return () => clearInterval(t);
  }, [heroItems.length]);

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
      <div style={{ minHeight: "100vh", background: "#fff", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {profile?.logoUrl && (
              <img
                src={profile.logoUrl}
                alt="logo"
                style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", marginBottom: 16 }}
              />
            )}
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1a1a2e" }}>{profile?.name || "Welcome"}</h1>
            {profile?.tagline && <p style={{ color: "#888", marginTop: 4, fontSize: 14 }}>{profile.tagline}</p>}
          </div>

          <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Which table are you at?</h2>
            <p style={{ fontSize: 14, color: "#888", marginBottom: 20 }}>Select your table number to view the menu</p>

            {tables.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
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
                      padding: "20px 8px",
                      fontSize: 22,
                      fontWeight: 700,
                      borderRadius: 16,
                      border: "2px solid #eee",
                      background: "#fff",
                      color: "#1a1a2e",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#e8a33d";
                      e.currentTarget.style.background = "#fff5e0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#eee";
                      e.currentTarget.style.background = "#fff";
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
      <div style={{ minHeight: "100vh", background: "#f8f6f3", padding: 24, fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            {profile?.logoUrl && (
              <img src={profile.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
              <div style={{ fontSize: 13, color: "#888" }}>Table {order.table}</div>
            </div>
          </div>

          {order.status === "bill_requested" && (
            <div style={{ background: "linear-gradient(135deg, #fff5e0 0%, #fef3c7 100%)", borderRadius: 20, padding: 32, textAlign: "center", marginBottom: 20, border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Bill Requested</h3>
              <p style={{ color: "#92400e", fontSize: 14 }}>The front desk is preparing your bill now.</p>
            </div>
          )}

          {order.status === "billed" && (
            <div style={{ background: "#fff", borderRadius: 20, padding: 0, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
              <div style={{ padding: "24px 24px 16px", borderBottom: "2px dashed #eee" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Receipt</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{profile?.name || "Table Order"}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Table {order.table}</div>
                </div>

                {order.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 15, borderBottom: i < order.items.length - 1 ? "1px dotted #eee" : "none" }}>
                    <span>{it.name} <span style={{ color: "#888" }}>×{it.qty}</span></span>
                    <span style={{ fontWeight: 600 }}>₹{it.price * it.qty}</span>
                  </div>
                ))}
              </div>

              <div style={{ padding: 20, background: "#f8f6f3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>Subtotal</span>
                  <span>₹{order.billSubtotal}</span>
                </div>
                {order.billTaxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "#888" }}>
                    <span>Tax ({order.billTaxPercent}%)</span>
                    <span>₹{order.billTaxAmount}</span>
                  </div>
                )}
                {order.billServiceAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "#888" }}>
                    <span>Service ({order.billServicePercent}%)</span>
                    <span>₹{order.billServiceAmount}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: "2px solid #1a1a2e" }}>
                  <span>Total</span>
                  <span>₹{order.billTotal}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#888" }}>
            Awaiting payment — pay at the counter or with staff.
          </div>
        </div>
      </div>
    );
  }

  // ---------- Status screen — BLACK BOX PRESERVED ----------
  if (order && !addingMore) {
    const countdown = getCountdown(order);

    return (
      <div style={{ minHeight: "100vh", background: "#f8f6f3", padding: 24, fontFamily: "sans-serif", paddingBottom: 100 }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            {profile?.logoUrl && (
              <img src={profile.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
              <div style={{ fontSize: 13, color: "#888" }}>Table {order.table}</div>
            </div>
          </div>

          {/* === THE BLACK BOX — EXACTLY AS YOU HAD IT === */}
          <div style={{ background: "#1C1B1A", color: "#fff", borderRadius: 20, padding: 32, textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{statusWords[order.status]}</div>
            {order.status === "preparing" && countdown && (
              <div style={{ fontSize: 48, marginTop: 14, fontFamily: "monospace", fontWeight: 700, letterSpacing: 2, color: "#e8a33d" }}>
                {countdown}
              </div>
            )}
          </div>

          {/* Order Items */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🛍️</span> Your Order
            </h3>
            {order.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < order.items.length - 1 ? "1px solid #eee" : "none" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{it.name}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>₹{it.price} each</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>×{it.qty}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "2px solid #eee", fontWeight: 700, fontSize: 16 }}>
              <span>Total items</span>
              <span>{order.items.reduce((s, i) => s + i.qty, 0)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => setAddingMore(true)}
              style={{
                width: "100%",
                padding: 16,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 14,
                border: "2px solid #1a1a2e",
                background: "#fff",
                color: "#1a1a2e",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span>➕</span> Add more items
            </button>

            {order.status === "served" && (
              <button
                onClick={requestBill}
                style={{
                  width: "100%",
                  padding: 16,
                  fontSize: 16,
                  fontWeight: 700,
                  borderRadius: 14,
                  border: "none",
                  background: "#e8a33d",
                  color: "#1a1a2e",
                  cursor: "pointer",
                }}
              >
                🧾 Request Bill
              </button>
            )}
          </div>
        </div>

        {/* Bottom Cart Button */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", padding: "12px 20px", zIndex: 50 }}>
          <button
            onClick={() => setAddingMore(true)}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 14,
              borderRadius: 50,
              border: "none",
              background: "#1a1a2e",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            }}
          >
            <span>🛒</span>
            {count > 0 ? `${count} items · ₹${total}` : "Browse Menu"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- MENU — DAIRY QUEEN STYLE ----------
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", paddingBottom: 100 }}>
      {/* Sticky Header */}
      <div style={{ background: "#fff", position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px" }}>
          {/* Logo + Table Info */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {profile?.logoUrl ? (
                <img src={profile.logoUrl} alt="logo" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#e8a33d", fontWeight: 800, fontSize: 18 }}>
                  {profile?.name?.charAt(0) || "T"}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e" }}>{profile?.name || "Menu"}</div>
              </div>
            </div>
            {addingMore && (
              <button
                onClick={() => { setAddingMore(false); setCart({}); }}
                style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
              >
                ← Back
              </button>
            )}
          </div>

          {/* Order to Table X — DQ Style Location Bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            background: "#f8f6f3",
            borderRadius: 14,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>Order to</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>Table {tableNo}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Hero Slider — Today's Special */}
        {heroItems.length > 0 && !addingMore && (
          <div style={{ padding: "20px 20px 0", position: "relative" }}>
            <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", height: 200, background: "#1a1a2e" }}>
              {heroItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: idx === heroIndex ? 1 : 0,
                    transition: "opacity 0.6s ease",
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
                  />
                  <div style={{ position: "relative", zIndex: 2, padding: 20, width: "100%", background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                    <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{item.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 10 }}>{item.description || "Chef's special pick"}</div>
                    <button
                      onClick={() => {
                        changeQty(item.id, 1);
                        setShowCartSummary(true);
                      }}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 50,
                        border: "none",
                        background: "#e8a33d",
                        color: "#1a1a2e",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      Order Now →
                    </button>
                  </div>
                </div>
              ))}
              {/* Dots */}
              <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 3 }}>
                {heroItems.map((_, idx) => (
                  <div key={idx} style={{ width: 8, height: 8, borderRadius: "50%", background: idx === heroIndex ? "#e8a33d" : "rgba(255,255,255,0.4)" }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Category Icons — DQ Style */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 14px",
                  borderRadius: 16,
                  border: "none",
                  background: activeCategory === cat ? "#1a1a2e" : "#f8f6f3",
                  color: activeCategory === cat ? "#fff" : "#666",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  minWidth: 70,
                }}
              >
                <span style={{ fontSize: 24 }}>
                  {cat === "All" ? "🍽️" : cat === "Starters" ? "🥗" : cat === "Mains" ? "🍛" : cat === "Breads & Rice" ? "🍞" : cat === "Beverages" ? "🥤" : cat === "Desserts" ? "🍰" : "🍴"}
                </span>
                <span>{cat === "Breads & Rice" ? "Breads" : cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Popular Picks / Menu Grid */}
        <div style={{ padding: "24px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>{activeCategory === "All" ? "Popular Picks" : activeCategory}</h2>
            {activeCategory !== "All" && (
              <button onClick={() => setActiveCategory("All")} style={{ background: "none", border: "none", color: "#e8a33d", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                View All →
              </button>
            )}
          </div>

          {filteredItems.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
              <p>No items in this category.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {filteredItems.map((it) => (
              <div key={it.id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
                <div style={{ position: "relative", height: 140, background: "#f8f6f3" }}>
                  {it.imageUrl ? (
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="eager"
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
                      🍽️
                    </div>
                  )}
                  {/* Quick Add Button */}
                  <button
                    onClick={() => changeQty(it.id, 1)}
                    style={{
                      position: "absolute",
                      bottom: -16,
                      right: 12,
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border: "none",
                      background: "#e8a33d",
                      color: "#fff",
                      fontSize: 20,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(232,163,61,0.4)",
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ padding: "20px 12px 12px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e", marginBottom: 2, lineHeight: 1.3 }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8, lineHeight: 1.3, minHeight: 16 }}>
                    {it.description?.slice(0, 30)}{it.description?.length > 30 ? "..." : ""}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#e8a33d" }}>₹{it.price}</span>
                    {cart[it.id] > 0 && (
                      <span style={{
                        background: "#1a1a2e",
                        color: "#fff",
                        padding: "2px 10px",
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 700,
                      }}>
                        {cart[it.id]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed Bottom — Cart Button Only */}
      {(count > 0 || order) && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", padding: "12px 20px", zIndex: 50 }}>
          <button
            onClick={() => order ? setAddingMore(true) : setShowCartSummary(true)}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 14,
              borderRadius: 50,
              border: "none",
              background: "#1a1a2e",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            }}
          >
            <span style={{ position: "relative" }}>
              🛒
              {count > 0 && (
                <span style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  background: "#e8a33d",
                  color: "#1a1a2e",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: 100,
                }}>
                  {count}
                </span>
              )}
            </span>
            {count > 0 ? `View Cart · ₹${total}` : "View Order Status"}
          </button>
        </div>
      )}

      {/* Cart Summary Modal */}
      {showCartSummary && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowCartSummary(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxWidth: 480,
              maxHeight: "80vh",
              overflow: "auto",
              padding: 24,
              animation: "slideUp 0.3s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800 }}>Your Cart</h3>
              <button onClick={() => setShowCartSummary(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            {Object.entries(cart).map(([id, qty]) => {
              const item = findItem(id);
              if (!item) return null;
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 13, color: "#888" }}>₹{item.price} × {qty}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => changeQty(id, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #ddd", background: "none", cursor: "pointer" }}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qty}</span>
                    <button onClick={() => changeQty(id, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#1a1a2e", color: "#fff", cursor: "pointer" }}>+</button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "2px solid #1a1a2e", fontSize: 18, fontWeight: 800 }}>
              <span>Total</span>
              <span>₹{total}</span>
            </div>

            <button
              onClick={addingMore ? addMoreItems : placeOrder}
              style={{
                width: "100%",
                marginTop: 20,
                padding: 16,
                borderRadius: 14,
                border: "none",
                background: "#e8a33d",
                color: "#1a1a2e",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#888" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #eee", borderTopColor: "#e8a33d", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          Loading menu...
        </div>
      </div>
    }>
      <TableContent />
    </Suspense>
  );
}