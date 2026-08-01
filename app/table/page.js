"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
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

// ---------------------------------------------------------------------------
// Config / helpers (module scope so they aren't recreated every render)
// ---------------------------------------------------------------------------

// How many items show in the horizontally-scrollable "Popular Picks" strip
// before the rest get tucked behind "View All".
const POPULAR_LIMIT = 8;

// Emoji fallback per category. Add/rename freely to match your menu.
// This covers a much wider spread of categories you'd see on a typical
// mid-range Indian hotel/restaurant menu (not just the original 5).
const CATEGORY_ICONS = {
  All: "🍽️",
  Starters: "🥗",
  "Soups": "🍲",
  Soup: "🍲",
  Salads: "🥙",
  Salad: "🥙",
  Mains: "🍛",
  "Main Course": "🍛",
  "North Indian": "🍛",
  "South Indian": "🥞",
  Chinese: "🥡",
  "Indo Chinese": "🥡",
  Tandoor: "🍢",
  Tandoori: "🍢",
  Biryani: "🍚",
  "Breads & Rice": "🍞",
  Breads: "🫓",
  Bread: "🫓",
  Rice: "🍚",
  Rolls: "🌯",
  Wraps: "🌯",
  Sandwiches: "🥪",
  Pizza: "🍕",
  Continental: "🍝",
  Pasta: "🍝",
  Sizzlers: "🔥",
  Chaat: "🥘",
  "Pan Asian": "🍜",
  Noodles: "🍜",
  Seafood: "🦐",
  Grill: "🍖",
  "BBQ": "🍖",
  Beverages: "🥤",
  Drinks: "🥤",
  Mocktails: "🍹",
  Shakes: "🥤",
  "Milkshakes": "🥤",
  Juices: "🧃",
  Desserts: "🍰",
  "Ice Cream": "🍨",
  "Live Counter": "👨‍🍳",
  Combos: "🍱",
  "Kids Menu": "🧒",
};

// Returns either { type: "emoji", value } or, if the restaurant has uploaded
// a custom icon for that category (see notes below), { type: "image", src }.
function getCategoryIcon(cat, customIcons) {
  if (customIcons && customIcons[cat]) {
    return { type: "image", src: customIcons[cat] };
  }
  return { type: "emoji", value: CATEGORY_ICONS[cat] || "🍴" };
}

// Rotating, non-repeating (until the cycle is exhausted) humour-ish quotes
// for the rewards strip. Feel free to edit/add — order is shuffled per cycle.
const REWARD_QUOTES = [
  "Good food, good mood, good rewards.",
  "Calories don't count when points are involved.",
  "Behind every great meal is an even greater discount.",
  "Order now, brag about it later.",
  "Hungry today, rewarded tomorrow.",
  "First rule of foodie club: always order dessert.",
  "Chew slowly, earn quickly.",
  "Warning: extreme deliciousness may cause repeat orders.",
  "Every bite counts — literally, towards your rewards.",
  "Eat well. Reward better.",
  "Patience is a virtue, but so is ordering dessert first.",
  "The best things in life are fried, and free with points.",
  "A balanced diet is a starter in each hand.",
  "Great appetite, greater rewards.",
];

// Shuffle-bag: pulls quotes without repeats until the whole list is used,
// then reshuffles and starts a fresh cycle. Persists across page loads.
function getNextRewardQuote() {
  if (typeof window === "undefined") return REWARD_QUOTES[0];
  try {
    const stored = window.localStorage.getItem("rewardQuoteBag");
    let bag = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(bag) || bag.length === 0) {
      bag = REWARD_QUOTES.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    const nextIndex = bag.pop();
    window.localStorage.setItem("rewardQuoteBag", JSON.stringify(bag));
    return REWARD_QUOTES[nextIndex];
  } catch {
    return REWARD_QUOTES[Math.floor(Math.random() * REWARD_QUOTES.length)];
  }
}

// Shared card used by both the Popular Picks strip and the full grid, so the
// two layouts always stay visually identical.
function MenuCard({ item, qty, onAdd, width }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        border: "1px solid #f0f0f0",
        flexShrink: width ? 0 : undefined,
        width: width || "auto",
      }}
    >
      <div style={{ position: "relative", height: 140, background: "#f8f6f3" }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="eager"
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
            🍽️
          </div>
        )}
        <button
          onClick={onAdd}
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
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e", marginBottom: 2, lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8, lineHeight: 1.3, minHeight: 16 }}>
          {item.description?.slice(0, 30)}
          {item.description?.length > 30 ? "..." : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#e8a33d" }}>₹{item.price}</span>
          {qty > 0 && (
            <span
              style={{
                background: "#1a1a2e",
                color: "#fff",
                padding: "2px 10px",
                borderRadius: 100,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {qty}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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

  // --- new state for this update ---
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [rewardQuote, setRewardQuote] = useState(REWARD_QUOTES[0]);
  const heroScrollRef = useRef(null);

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

  // Hero auto-slide (now drives an actual scrollable strip, not opacity fades)
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const t = setInterval(() => {
      setHeroIndex((prev) => {
        const next = (prev + 1) % heroItems.length;
        const el = heroScrollRef.current;
        if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [heroItems.length]);

  // Pick a reward quote once per page load (won't repeat until the full list cycles)
  useEffect(() => {
    setRewardQuote(getNextRewardQuote());
  }, []);

  function handleHeroScroll(e) {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== heroIndex) setHeroIndex(idx);
  }

  function scrollHeroTo(idx) {
    setHeroIndex(idx);
    const el = heroScrollRef.current;
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }

  const availableItems = menuItems.filter((m) => m.available);
  const categories = ["All", ...new Set(availableItems.map((m) => m.category))];
  const filteredItems = activeCategory === "All" ? availableItems : availableItems.filter((m) => m.category === activeCategory);

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = isSearching
    ? availableItems.filter((m) => m.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

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
      {/* hides the scrollbar track on Chrome/Safari for our horizontal strips;
          scrollbarWidth:"none" (set inline below) covers Firefox */}
      <style jsx>{`
        .hscroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Full-bleed Banner (logo left, table number right) */}
      <div style={{ background: "linear-gradient(135deg, #fff5e0 0%, #fef3c7 100%)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {profile?.logoUrl ? (
                <img src={profile.logoUrl} alt="logo" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#e8a33d", fontWeight: 800, fontSize: 18 }}>
                  {profile?.name?.charAt(0) || "T"}
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e" }}>{profile?.name || "Menu"}</div>
            </div>

            <div
              style={{
                background: "#1a1a2e",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              <span>📍</span> Table {tableNo}
            </div>
          </div>

          {addingMore && (
            <button
              onClick={() => { setAddingMore(false); setCart({}); }}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, marginTop: 10, padding: 0 }}
            >
              ← Back to order status
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Search bar (replaces the old "Deliver to" bar) */}
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#aaa" }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for dishes..."
              style={{
                width: "100%",
                padding: "12px 16px 12px 42px",
                borderRadius: 14,
                border: "none",
                background: "#f8f6f3",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                color: "#1a1a2e",
              }}
            />
          </div>
        </div>

        {isSearching ? (
          // ---------- Search results ----------
          <div style={{ padding: "20px 20px 24px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 16 }}>
              Results for &ldquo;{searchQuery}&rdquo;
            </h2>
            {searchResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <p>No dishes match your search.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                {searchResults.map((it) => (
                  <MenuCard key={it.id} item={it} qty={cart[it.id] || 0} onAdd={() => changeQty(it.id, 1)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Hero Slider — hand-swipeable, ratio matched to reference (5:4) */}
            {heroItems.length > 0 && !addingMore && (
              <div style={{ padding: "20px 20px 0" }}>
                <div
                  ref={heroScrollRef}
                  onScroll={handleHeroScroll}
                  className="hscroll"
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    scrollSnapType: "x mandatory",
                    borderRadius: 20,
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none",
                  }}
                >
                  {heroItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        flex: "0 0 100%",
                        scrollSnapAlign: "start",
                        position: "relative",
                        aspectRatio: "5 / 4",
                        background: "#1a1a2e",
                      }}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "flex-end",
                          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                        }}
                      >
                        <div style={{ padding: 20, width: "100%" }}>
                          <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{item.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 10 }}>
                            {item.description || "Chef's special pick"}
                          </div>
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
                    </div>
                  ))}
                </div>
                {heroItems.length > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                    {heroItems.map((_, idx) => (
                      <div
                        key={idx}
                        onClick={() => scrollHeroTo(idx)}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: idx === heroIndex ? "#e8a33d" : "#ddd",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category Icons — expanded set, horizontally scrollable */}
            <div style={{ padding: "20px 20px 0" }}>
              <div className="hscroll" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                {categories.map((cat) => {
                  const icon = getCategoryIcon(cat, profile?.categoryIcons);
                  return (
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
                        flexShrink: 0,
                      }}
                    >
                      {icon.type === "image" ? (
                        <img src={icon.src} alt={cat} style={{ width: 24, height: 24, objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: 24 }}>{icon.value}</span>
                      )}
                      <span>{cat === "Breads & Rice" ? "Breads" : cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Popular Picks (horizontal strip) / Category Grid */}
            <div style={{ padding: "24px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>
                  {activeCategory === "All" ? "Popular Picks" : activeCategory}
                </h2>

                {activeCategory === "All" && availableItems.length > POPULAR_LIMIT && (
                  <button
                    onClick={() => setShowAllPopular((v) => !v)}
                    style={{ background: "none", border: "none", color: "#e8a33d", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                  >
                    {showAllPopular ? "← Show Less" : "View All →"}
                  </button>
                )}
                {activeCategory !== "All" && (
                  <button
                    onClick={() => setActiveCategory("All")}
                    style={{ background: "none", border: "none", color: "#e8a33d", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                  >
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

              {activeCategory === "All" && !showAllPopular ? (
                <div className="hscroll" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                  {filteredItems.slice(0, POPULAR_LIMIT).map((it) => (
                    <MenuCard key={it.id} item={it} qty={cart[it.id] || 0} onAdd={() => changeQty(it.id, 1)} width={150} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                  {filteredItems.map((it) => (
                    <MenuCard key={it.id} item={it} qty={cart[it.id] || 0} onAdd={() => changeQty(it.id, 1)} />
                  ))}
                </div>
              )}
            </div>

            {/* Rewards strip — rotating quote instead of a fixed line */}
            <div style={{ padding: "0 20px 24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 18px",
                  borderRadius: 18,
                  background: "linear-gradient(135deg, #1a1a2e 0%, #2d2b52 100%)",
                  color: "#fff",
                }}
              >
                <div style={{ fontSize: 28 }}>🎁</div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{rewardQuote}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fixed Bottom — Cart Button Only (left exactly as-is, per your note) */}
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