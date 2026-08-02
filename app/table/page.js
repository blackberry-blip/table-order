"use client";

import { Suspense, useEffect, useState, useRef } from "react";
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
  writeBatch,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Config / helpers
// ---------------------------------------------------------------------------
const POPULAR_LIMIT = 8;

const CATEGORY_ICONS = {
  All: "🍽️",
  Starters: "🥗",
  Soups: "🍲",
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
  BBQ: "🍖",
  Beverages: "🥤",
  Drinks: "🥤",
  Mocktails: "🍹",
  Shakes: "🥤",
  Milkshakes: "🥤",
  Juices: "🧃",
  Desserts: "🍰",
  "Ice Cream": "🍨",
  "Live Counter": "👨‍🍳",
  Combos: "🍱",
  "Kids Menu": "🧒",
};

function getCategoryIcon(cat, categoryIconMap) {
  if (categoryIconMap && categoryIconMap[cat]) {
    return { type: "image", src: categoryIconMap[cat] };
  }
  return { type: "emoji", value: CATEGORY_ICONS[cat] || "🍴" };
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
let _audioCtx = null;
function getAudioCtx() {
  if (typeof window === "undefined") return null;
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

function playTone(freq = 600, duration = 100, type = "sine") {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

function playChime() {
  playTone(660, 130, "triangle");
  setTimeout(() => playTone(880, 190, "triangle"), 120);
  setTimeout(() => playTone(1040, 220, "triangle"), 260);
}

// ---------------------------------------------------------------------------
// Global CSS
// ---------------------------------------------------------------------------
const GLOBAL_ANIMATION_CSS = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes popIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes checkPop { 0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
  @keyframes toastSlideDown { from { opacity: 0; transform: translate(-50%, -18px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes floatUp { 0% { opacity: 0; transform: translateY(0) scale(0.8); } 25% { opacity: 1; transform: translateY(-6px) scale(1); } 100% { opacity: 0; transform: translateY(-40px) scale(1); } }
  @keyframes bump { 0% { transform: scale(1); } 35% { transform: scale(1.35) rotate(-8deg); } 60% { transform: scale(0.92) rotate(4deg); } 100% { transform: scale(1) rotate(0deg); } }
  @keyframes splashPop { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
  @keyframes splashGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(232,163,61,0.35); } 50% { box-shadow: 0 0 0 14px rgba(232,163,61,0); } }
  @keyframes splashLetters { from { opacity: 0; letter-spacing: 6px; } to { opacity: 1; letter-spacing: 0.5px; } }
  @keyframes splashLine { from { width: 0; } to { width: 46px; } }
  @keyframes splashFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes foodFloat {
    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
    15% { opacity: 0.9; }
    50% { transform: translateY(-18px) rotate(10deg); }
    85% { opacity: 0.9; }
    100% { transform: translateY(0) rotate(-8deg); opacity: 0; }
  }

  .tap-btn { transition: transform 0.12s ease, filter 0.12s ease; }
  .tap-btn:active { transform: scale(0.94); filter: brightness(0.97); }

  .cart-bump { display: inline-flex; animation: bump 0.4s ease; }

  .menu-card-plus-float {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #1a1a2e;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    padding: 2px 9px;
    border-radius: 100px;
    animation: floatUp 0.7s ease forwards;
    pointer-events: none;
    z-index: 3;
  }

  .splash-food {
    position: absolute;
    font-size: 28px;
    opacity: 0;
    animation: foodFloat 3.4s ease-in-out infinite;
  }
`;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function MenuCard({ item, qty, onAdd, width }) {
  const [pulses, setPulses] = useState([]);

  function handleAdd() {
    const id = `${Date.now()}-${Math.random()}`;
    setPulses((p) => [...p, id]);
    setTimeout(() => {
      setPulses((p) => p.filter((x) => x !== id));
    }, 700);
    playTone(680, 90, "triangle");
    onAdd();
  }

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
        {pulses.map((id) => (
          <span key={id} className="menu-card-plus-float">+1</span>
        ))}
        <button
          onClick={handleAdd}
          className="tap-btn"
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

function SuccessOverlay({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(26,26,46,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.25s ease",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: "36px 32px",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          animation: "popIn 0.4s cubic-bezier(0.22,1,0.36,1)",
          maxWidth: 280,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#e8a33d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            animation: "checkPop 0.5s ease 0.1s both",
          }}
        >
          <span style={{ fontSize: 32, color: "#fff" }}>✓</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1a1a2e" }}>{message}</div>
      </div>
    </div>
  );
}

function StatusToast({ emoji, msg }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 200,
        background: "#1a1a2e",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 100,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
        fontWeight: 700,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        animation: "toastSlideDown 0.35s cubic-bezier(0.22,1,0.36,1)",
        maxWidth: "90vw",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span>{msg}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableContent
// ---------------------------------------------------------------------------
function TableContent() {
  const searchParams = useSearchParams();
  const tableParam = searchParams.get("table");
  const restaurantId = searchParams.get("restaurant");

  const [tableNo, setTableNo] = useState(tableParam ? parseInt(tableParam) : null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [addingMore, setAddingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [showCartSummary, setShowCartSummary] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroItems, setHeroItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryDocs, setCategoryDocs] = useState([]);
  const [screen, setScreen] = useState("menu");
  const [successOverlay, setSuccessOverlay] = useState(null);
  const [statusToast, setStatusToast] = useState(null);
  const [cartBump, setCartBump] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);

  const heroScrollRef = useRef(null);
  const prevCartCountRef = useRef(0);
  const prevOrderStatusRef = useRef(null);

  // Tick
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Profile
  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "profile"), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [restaurantId]);

  // Menu items
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "menuItems"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMenuItems(items);
      const featured = items.filter((m) => m.available && m.imageUrl).slice(0, 5);
      setHeroItems(featured);
    });
    return () => unsub();
  }, [restaurantId]);

  // Tables
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "tables"), orderBy("number", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  // Categories
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "categories"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setCategoryDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  // Order listener - now tracks ALL active orders for this table
  useEffect(() => {
    if (!tableNo || !restaurantId) return;
    const q = query(
      collection(db, "restaurants", restaurantId, "orders"),
      where("table", "==", tableNo)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const active = all
          .filter((o) => !["paid", "cancelled", "declined"].includes(o.status))
          .sort((a, b) => a.createdAt - b.createdAt);
        setActiveOrders(active);
      },
      (err) => console.error("Order listener failed:", err.code, err.message)
    );
    return () => unsub();
  }, [tableNo, restaurantId]);

  // Status toast on change - uses latest active order
  const latestOrder = activeOrders[activeOrders.length - 1] || null;

  useEffect(() => {
    if (latestOrder && prevOrderStatusRef.current && prevOrderStatusRef.current !== latestOrder.status) {
      const configs = {
        confirmed: { emoji: "✅", msg: "Order confirmed!", tone: 520 },
        preparing: { emoji: "👨‍🍳", msg: "Your food is being cooked!", tone: 600 },
        ready: { emoji: "🔔", msg: "Your order is ready!", tone: 720 },
        served: { emoji: "🎉", msg: "Enjoy your meal!", tone: 840 },
      };
      const cfg = configs[latestOrder.status];
      if (cfg) {
        playTone(cfg.tone, 180, "triangle");
        setStatusToast(cfg);
        const t = setTimeout(() => setStatusToast(null), 2600);
        prevOrderStatusRef.current = latestOrder.status;
        return () => clearTimeout(t);
      }
    }
    prevOrderStatusRef.current = latestOrder?.status || null;
  }, [latestOrder?.status]);

  // Hero auto-slide
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

  // Cart bump
  useEffect(() => {
    const c = Object.values(cart).reduce((a, b) => a + b, 0);
    if (c > prevCartCountRef.current) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 400);
      prevCartCountRef.current = c;
      return () => clearTimeout(t);
    }
    prevCartCountRef.current = c;
  }, [cart]);

  // Splash
  useEffect(() => {
    const leaveTimer = setTimeout(() => setSplashLeaving(true), 1500);
    const hideTimer = setTimeout(() => setShowSplash(false), 1950);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  function dismissSplash() {
    setSplashLeaving(true);
    setTimeout(() => setShowSplash(false), 350);
  }

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

  const categoryIconMap = {};
  categoryDocs.forEach((c) => {
    if (c.imageUrl) categoryIconMap[c.name] = c.imageUrl;
  });
  const itemCategoryNames = new Set(availableItems.map((m) => m.category));
  const orderedCategoryNames = categoryDocs.map((c) => c.name).filter((n) => itemCategoryNames.has(n));
  const looseCategoryNames = [...itemCategoryNames].filter((n) => !categoryDocs.some((c) => c.name === n));
  const categories = ["All", ...orderedCategoryNames, ...looseCategoryNames];

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

  function triggerSuccessOverlay(message) {
    playChime();
    setSuccessOverlay(message);
    setTimeout(() => setSuccessOverlay(null), 1600);
  }

  // Unified submit function - creates a NEW order document every time
  async function submitCart() {
    const items = Object.entries(cart).map(([id, qty]) => {
      const item = findItem(id);
      return { name: item.name, qty, price: item.price };
    });
    if (items.length === 0) return;

    await addDoc(collection(db, "restaurants", restaurantId, "orders"), {
      table: tableNo,
      items,
      status: "pending",
      etaMinutes: null,
      preparingAt: null,
      createdAt: Date.now(),
    });

    setCart({});
    setShowCartSummary(false);
    setAddingMore(false);
    setScreen("menu");
    triggerSuccessOverlay(activeOrders.length > 0 ? "Added to your order!" : "Order placed!");
  }

  // Request bill for all served orders
  async function requestBill() {
    const batch = writeBatch(db);
    activeOrders
      .filter((o) => o.status === "served")
      .forEach((o) => batch.update(doc(db, "restaurants", restaurantId, "orders", o.id), { status: "bill_requested" }));
    await batch.commit();
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

  const bottomCartBar = (count > 0 || activeOrders.length > 0) ? (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", padding: "12px 20px", zIndex: 50 }}>
      <button
        onClick={() => {
          playTone(560, 70, "sine");
          if (count > 0) {
            setShowCartSummary(true);
          } else if (activeOrders.length > 0) {
            setAddingMore(false);
            setScreen("menu");
          }
        }}
        className="tap-btn"
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
        <span style={{ position: "relative" }} className={cartBump ? "cart-bump" : ""}>
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
        {count > 0 ? `View Cart · ₹${total}` : "Back to Order Status"}
      </button>
    </div>
  ) : null;

  const cartSummaryModal = showCartSummary ? (
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
                <button onClick={() => { playTone(420, 60); changeQty(id, -1); }} className="tap-btn" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #ddd", background: "none", cursor: "pointer" }}>−</button>
                <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qty}</span>
                <button onClick={() => { playTone(680, 70, "triangle"); changeQty(id, 1); }} className="tap-btn" style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#1a1a2e", color: "#fff", cursor: "pointer" }}>+</button>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "2px solid #1a1a2e", fontSize: 18, fontWeight: 800 }}>
          <span>Total</span>
          <span>₹{total}</span>
        </div>

        <button
          onClick={submitCart}
          className="tap-btn"
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
          {activeOrders.length > 0 ? "Add to Order" : "Place Order"}
        </button>
      </div>
    </div>
  ) : null;

  // ---------- Invalid QR guard ----------
  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#faf8f5" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>Invalid QR Code</h2>
          <p style={{ color: "#6b6b7b", marginTop: 8 }}>Please scan a valid table QR code.</p>
        </div>
      </div>
    );
  }

  // ---------- Splash ----------
  if (showSplash) {
    const foodEmojis = ["🍕", "🍔", "🍜", "🍰", "🥗", "🍣", "🍩", "🥤"];
    return (
      <div
        onClick={dismissSplash}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          cursor: "pointer",
          background: "linear-gradient(135deg, #1a1a2e 0%, #241f3d 55%, #2d1b1b 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: splashLeaving ? 0 : 1,
          transition: "opacity 0.45s ease",
          overflow: "hidden",
        }}
      >
        {foodEmojis.map((e, i) => (
          <span
            key={i}
            className="splash-food"
            style={{
              left: `${8 + i * 11}%`,
              top: `${18 + (i % 3) * 24}%`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            {e}
          </span>
        ))}
        <div style={{ animation: "splashPop 0.9s cubic-bezier(0.22, 1, 0.36, 1)", textAlign: "center", padding: 20, position: "relative", zIndex: 1 }}>
          {profile?.logoUrl && (
            <img
              src={profile.logoUrl}
              alt=""
              style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "cover", margin: "0 auto 20px", display: "block", border: "3px solid rgba(232,163,61,0.6)", animation: "splashGlow 2.2s ease-in-out infinite" }}
            />
          )}
          <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, fontWeight: 700, color: "#fff", letterSpacing: 0.5, animation: "splashLetters 1s ease" }}>
            {profile?.name || "Welcome"}
          </div>
          <div style={{ width: 46, height: 2, background: "#e8a33d", margin: "16px auto", animation: "splashLine 0.9s ease 0.3s both" }} />
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", animation: "splashFade 1s ease 0.5s both" }}>
            {profile?.tagline || "Scan, order, enjoy"}
          </div>
        </div>
      </div>
    );
  }

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
                    onClick={() => { playTone(520, 80, "triangle"); setTableNo(t.number); }}
                    className="tap-btn"
                    style={{
                      padding: "20px 8px",
                      fontSize: 22,
                      fontWeight: 700,
                      borderRadius: 16,
                      border: "2px solid #eee",
                      background: "#fff",
                      color: "#1a1a2e",
                      cursor: "pointer",
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

  // ---------- Unified Status + Bill screen ----------
  if (activeOrders.length > 0 && !addingMore) {
    const allServed = activeOrders.every((o) => o.status === "served");
    const anyBillRequested = activeOrders.some((o) => o.status === "bill_requested");

    return (
      <div style={{ minHeight: "100vh", background: "#f8f6f3", padding: 24, fontFamily: "sans-serif", paddingBottom: 100 }}>
        {statusToast && <StatusToast emoji={statusToast.emoji} msg={statusToast.msg} />}
        {successOverlay && <SuccessOverlay message={successOverlay} />}
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            {profile?.logoUrl && <img src={profile.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.name || "Table Order"}</div>
              <div style={{ fontSize: 13, color: "#888" }}>Table {tableNo}</div>
            </div>
          </div>

          {activeOrders.map((o) => {
            const countdown = getCountdown(o);
            if (o.status === "billed") {
              return (
                <div key={o.id} style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 16 }}>
                  <div style={{ padding: "20px 24px", borderBottom: "2px dashed #eee" }}>
                    <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Receipt</div>
                    {o.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
                        <span>{it.name} ×{it.qty}</span><span>₹{it.price * it.qty}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: 16, background: "#f8f6f3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800 }}>
                      <span>Total</span><span>₹{o.billTotal}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Awaiting payment — pay at the counter.</div>
                  </div>
                </div>
              );
            }
            return (
              <div key={o.id} style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Order · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#e8a33d" }}>{statusWords[o.status] || o.status}</span>
                </div>
                {countdown && <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, color: "#e8a33d", marginBottom: 10 }}>{countdown}</div>}
                {o.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderTop: i > 0 ? "1px solid #f4f4f4" : "none" }}>
                    <span>{it.name}</span><span style={{ fontWeight: 700 }}>×{it.qty}</span>
                  </div>
                ))}
              </div>
            );
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => { playTone(560, 70); setAddingMore(true); setScreen("menu"); }} className="tap-btn"
              style={{ width: "100%", padding: 16, fontSize: 15, fontWeight: 600, borderRadius: 14, border: "2px solid #1a1a2e", background: "#fff", color: "#1a1a2e", cursor: "pointer" }}>
              ➕ Add more items
            </button>
            {allServed && !anyBillRequested && (
              <button onClick={() => { playTone(700, 90, "triangle"); requestBill(); }} className="tap-btn"
                style={{ width: "100%", padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 14, border: "none", background: "#e8a33d", color: "#1a1a2e", cursor: "pointer" }}>
                🧾 Request Bill
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Full Menu ("View All") ----------
  if (screen === "allMenu") {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", paddingBottom: 100 }}>
        {successOverlay && <SuccessOverlay message={successOverlay} />}

        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => { playTone(440, 70); setScreen("menu"); }}
              className="tap-btn"
              style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #eee", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a2e", flexShrink: 0 }}
              aria-label="Back"
            >
              ←
            </button>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a2e" }}>Full Menu</div>
          </div>
        </div>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: 20 }}>
          {availableItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
              <p>No items on the menu yet.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              {availableItems.map((it) => (
                <MenuCard key={it.id} item={it} qty={cart[it.id] || 0} onAdd={() => changeQty(it.id, 1)} />
              ))}
            </div>
          )}
        </div>

        {bottomCartBar}
        {cartSummaryModal}
      </div>
    );
  }

  // ---------- MENU ----------
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", paddingBottom: 100 }}>
      <style jsx>{`
        .hscroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {successOverlay && <SuccessOverlay message={successOverlay} />}

      <div style={{ background: "linear-gradient(135deg, #fff5e0 0%, #fef3c7 100%)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            {profile?.logoUrl ? (
              <img src={profile.logoUrl} alt="logo" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#e8a33d", fontWeight: 800, fontSize: 18 }}>
                {profile?.name?.charAt(0) || "T"}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", lineHeight: 1.25 }}>{profile?.name || "Menu"}</div>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <span>📍</span> Table {tableNo}
              </div>
            </div>
          </div>

          {addingMore && (
            <button
              onClick={() => { playTone(440, 70); setAddingMore(false); setCart({}); setScreen("menu"); }}
              className="tap-btn"
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0 }}
            >
              ← Back to order status
            </button>
          )}

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
                background: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                color: "#1a1a2e",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {isSearching ? (
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
                              playTone(680, 90, "triangle");
                              changeQty(item.id, 1);
                              setShowCartSummary(true);
                            }}
                            className="tap-btn"
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

            <div style={{ padding: "20px 20px 0" }}>
              <div className="hscroll" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                {categories.map((cat) => {
                  const icon = getCategoryIcon(cat, categoryIconMap);
                  return (
                    <button
                      key={cat}
                      onClick={() => { playTone(500, 60); setActiveCategory(cat); }}
                      className="tap-btn"
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
                        minWidth: 70,
                        flexShrink: 0,
                      }}
                    >
                      {icon.type === "image" ? (
                        <img src={icon.src} alt={cat} style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 8 }} />
                      ) : (
                        <span style={{ fontSize: 24 }}>{icon.value}</span>
                      )}
                      <span>{cat === "Breads & Rice" ? "Breads" : cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: "24px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>
                  {activeCategory === "All" ? "Popular Picks" : activeCategory}
                </h2>

                {activeCategory === "All" && availableItems.length > POPULAR_LIMIT && (
                  <button
                    onClick={() => { playTone(440, 70); setScreen("allMenu"); }}
                    className="tap-btn"
                    style={{ background: "none", border: "none", color: "#e8a33d", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                  >
                    View All →
                  </button>
                )}
                {activeCategory !== "All" && (
                  <button
                    onClick={() => { playTone(440, 70); setActiveCategory("All"); }}
                    className="tap-btn"
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

              {activeCategory === "All" ? (
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

            {activeCategory === "All" && filteredItems.length > POPULAR_LIMIT && (
              <div style={{ padding: "0 20px 24px" }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e", marginBottom: 16 }}>More to Explore</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                  {filteredItems.slice(POPULAR_LIMIT).map((it) => (
                    <MenuCard key={it.id} item={it} qty={cart[it.id] || 0} onAdd={() => changeQty(it.id, 1)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {bottomCartBar}
      {cartSummaryModal}
    </div>
  );
}

export default function TablePage() {
  return (
    <>
      <style>{GLOBAL_ANIMATION_CSS}</style>
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
    </>
  );
}