"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { playNotificationSound, requestNotificationPermission, showPopupNotification } from "@/lib/notifications";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
} from "firebase/firestore";

const CATEGORIES = ["Starters", "Mains", "Breads & Rice", "Beverages", "Desserts"];

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "orders", label: "Orders", icon: "🧾" },
  { id: "menu", label: "Menu", icon: "🍽️" },
  { id: "tables", label: "Tables", icon: "🪑" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function ReceptionPage() {
  // === ALL useState declarations FIRST ===
  const [activeTab, setActiveTab] = useState("dashboard");
  const [orderFilter, setOrderFilter] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState({ name: "", tagline: "", logoUrl: "" });
  const [profileForm, setProfileForm] = useState({ name: "", tagline: "", logoUrl: "" });
  const [savedMsg, setSavedMsg] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "", category: CATEGORIES[0], imageUrl: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [billing, setBilling] = useState({ taxPercent: 5, servicePercent: 0 });
  const [billingForm, setBillingForm] = useState({ taxPercent: 5, servicePercent: 0 });
  const [billingSaved, setBillingSaved] = useState(false);
  const [tables, setTables] = useState([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastPendingCount, setLastPendingCount] = useState(0);
  const [lastBillCount, setLastBillCount] = useState(0);
  const [notifPermission, setNotifPermission] = useState(false);

  // === useEffects that don't depend on computed values ===
  useEffect(() => {
    setSiteUrl(window.location.origin);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "profile"), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
        setProfileForm(snap.data());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "billing"), (snap) => {
      if (snap.exists()) {
        setBilling(snap.data());
        setBillingForm(snap.data());
      }
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
    requestNotificationPermission().then(setNotifPermission);
  }, []);

  // === ALL computed/filtered values ===
  const pending = orders.filter((o) => o.status === "pending");
  const active = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const served = orders.filter((o) => o.status === "served");
  const billRequested = orders.filter((o) => o.status === "bill_requested");
  const billed = orders.filter((o) => o.status === "billed");
  const paid = orders.filter((o) => o.status === "paid");

  // === useEffects that DEPEND on computed values ===
  useEffect(() => {
    if (pending.length > lastPendingCount && lastPendingCount > 0) {
      playNotificationSound("newOrder");
      showPopupNotification(
        "🆕 New Order!",
        `Table ${pending[pending.length - 1]?.table} just placed an order`,
        { tag: "new-order", renotify: true }
      );
    }
    setLastPendingCount(pending.length);
  }, [pending.length, lastPendingCount]);

  useEffect(() => {
    if (billRequested.length > lastBillCount && lastBillCount > 0) {
      playNotificationSound("bill");
      showPopupNotification(
        "🧾 Bill Requested",
        `Table ${billRequested[billRequested.length - 1]?.table} requested the bill`,
        { tag: "bill-request", renotify: true }
      );
    }
    setLastBillCount(billRequested.length);
  }, [billRequested.length, lastBillCount]);

  // === ALL functions ===
  async function confirmOrder(id) {
    await updateDoc(doc(db, "orders", id), { status: "confirmed" });
  }
  async function declineOrder(id) {
    await deleteDoc(doc(db, "orders", id));
  }
  async function markServed(id) {
    await updateDoc(doc(db, "orders", id), { status: "served" });
  }
  async function saveProfile() {
    await setDoc(doc(db, "settings", "profile"), profileForm, { merge: true });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }
  async function saveBilling() {
    await setDoc(doc(db, "settings", "billing"), {
      taxPercent: parseFloat(billingForm.taxPercent) || 0,
      servicePercent: parseFloat(billingForm.servicePercent) || 0,
    });
    setBillingSaved(true);
    setTimeout(() => setBillingSaved(false), 2000);
  }

  async function generateBill(o) {
    const subtotal = o.items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const taxAmount = Math.round((subtotal * (billing.taxPercent || 0)) / 100);
    const serviceAmount = Math.round((subtotal * (billing.servicePercent || 0)) / 100);
    const grandTotal = subtotal + taxAmount + serviceAmount;

    await updateDoc(doc(db, "orders", o.id), {
      status: "billed",
      billSubtotal: subtotal,
      billTaxPercent: billing.taxPercent || 0,
      billTaxAmount: taxAmount,
      billServicePercent: billing.servicePercent || 0,
      billServiceAmount: serviceAmount,
      billTotal: grandTotal,
    });
  }

  async function markPaid(id) {
    await updateDoc(doc(db, "orders", id), { status: "paid" });
  }

  function printBill(o) {
    const itemsHtml = o.items
      .map(
        (it) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;">
          <span>${it.name} ×${it.qty}</span>
          <span>₹${it.price * it.qty}</span>
        </div>`
      )
      .join("");

    const html = `
      <html>
      <head>
        <title>Bill - Table ${o.table}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; max-width: 320px; margin: 20px auto; color: #1a1a2e; }
          h2 { text-align: center; margin-bottom: 0; font-size: 22px; }
          .sub { text-align: center; font-size: 12px; color: #6b6b7b; margin-bottom: 16px; }
          .line { border-top: 1px dashed #ccc; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
          .total { font-size: 20px; font-weight: 700; margin-top: 10px; }
          .header-img { text-align: center; margin-bottom: 10px; }
          .header-img img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
        </style>
      </head>
      <body>
        ${profile?.logoUrl ? `<div class="header-img"><img src="${profile.logoUrl}" /></div>` : ""}
        <h2>${profile?.name || "Table Order"}</h2>
        <div class="sub">${profile?.tagline || ""}</div>
        <div class="sub">Table ${o.table} · ${new Date(o.createdAt).toLocaleString()}</div>
        <div class="line"></div>
        ${itemsHtml}
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>₹${o.billSubtotal}</span></div>
        ${o.billTaxAmount > 0 ? `<div class="row"><span>Tax (${o.billTaxPercent}%)</span><span>₹${o.billTaxAmount}</span></div>` : ""}
        ${o.billServiceAmount > 0 ? `<div class="row"><span>Service (${o.billServicePercent}%)</span><span>₹${o.billServiceAmount}</span></div>` : ""}
        <div class="line"></div>
        <div class="row total"><span>Total</span><span>₹${o.billTotal}</span></div>
        <div class="sub" style="margin-top:24px;">Thank you for dining with us!</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(html);
    win.document.close();
  }

  async function addMenuItem() {
    if (!newItem.name || !newItem.price) return alert("Name and price are required");
    await addDoc(collection(db, "menuItems"), {
      name: newItem.name,
      description: newItem.description,
      price: parseFloat(newItem.price),
      category: newItem.category,
      imageUrl: newItem.imageUrl,
      available: true,
      createdAt: Date.now(),
    });
    setNewItem({ name: "", description: "", price: "", category: CATEGORIES[0], imageUrl: "" });
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm(item);
  }
  async function saveEdit() {
    await updateDoc(doc(db, "menuItems", editingId), {
      name: editForm.name,
      description: editForm.description,
      price: parseFloat(editForm.price),
      category: editForm.category,
      imageUrl: editForm.imageUrl,
    });
    setEditingId(null);
  }
  async function toggleAvailable(item) {
    await updateDoc(doc(db, "menuItems", item.id), { available: !item.available });
  }
  async function toggleFeatured(item) {
  await updateDoc(doc(db, "menuItems", item.id), { featured: !item.featured });
  }
  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    await deleteDoc(doc(db, "menuItems", id));
  }

  async function addTable() {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
    await addDoc(collection(db, "tables"), { number: nextNumber, createdAt: Date.now() });
  }

  async function deleteTable(id) {
    if (!confirm("Delete this table? Its QR code will stop working.")) return;
    await deleteDoc(doc(db, "tables", id));
  }

  function qrUrlFor(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
  }

  function printQr(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}`;
    const imgUrl = qrUrlFor(tableNumber);
    const html = `
      <html>
      <head>
        <title>Table ${tableNumber} QR</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
          body { text-align: center; font-family: 'Inter', sans-serif; margin-top: 40px; color: #1a1a2e; }
          h2 { font-size: 24px; margin-bottom: 20px; }
          .qr-wrap { background: white; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          img { width: 260px; height: 260px; }
          p { font-size: 12px; color: #888; word-break: break-all; max-width: 300px; margin: 16px auto 0; }
        </style>
      </head>
      <body>
        <h2>Table ${tableNumber}</h2>
        <div class="qr-wrap">
          <img src="${imgUrl}" />
        </div>
        <p>${link}</p>
        <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
      </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=420,height=520");
    win.document.write(html);
    win.document.close();
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

  // === STYLES & COMPONENTS ===
  const inputStyle = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, marginBottom: 10, background: "var(--surface)", fontFamily: "inherit" };

  const StatCard = ({ label, value, color, icon }) => (
    <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color + "18", color: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );

  const OrderCard = ({ order, children }) => (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Table {order.table}</span>
          <span className={`badge badge-${order.status}`}>{order.status.replace("_", " ")}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {order.items.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}>
          <span>{it.name}</span>
          <span style={{ color: "var(--text-secondary)" }}>×{it.qty}</span>
        </div>
      ))}
      {order.status === "preparing" && getCountdown(order) && (
        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 18, color: "#C1440E", fontWeight: 700 }}>
          ⏱ {getCountdown(order)}
        </div>
      )}
      {children && <div style={{ marginTop: 12, display: "flex", gap: 8 }}>{children}</div>}
    </div>
  );

  const SectionHeader = ({ title, count, color = "var(--text)" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 24 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
      {count > 0 && <span className="badge" style={{ background: color + "18", color: color }}>{count}</span>}
    </div>
  );

  // === RENDER METHODS ===
  const renderDashboard = () => (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Pending" value={pending.length} color="#f59e0b" icon="⏳" />
        <StatCard label="In Kitchen" value={active.length} color="#3b82f6" icon="👨‍🍳" />
        <StatCard label="Bill Requests" value={billRequested.length} color="#e8a33d" icon="🧾" />
        <StatCard label="Menu Items" value={menuItems.length} color="#22c55e" icon="🍽️" />
      </div>

      {pending.length > 0 && (
        <>
          <SectionHeader title="New Orders" count={pending.length} color="#f59e0b" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {pending.map((o) => (
              <OrderCard key={o.id} order={o}>
                <button className="btn btn-sm btn-danger" onClick={() => declineOrder(o.id)} style={{ flex: 1 }}>Decline</button>
                <button className="btn btn-sm btn-primary" onClick={() => confirmOrder(o.id)} style={{ flex: 1 }}>Confirm → Kitchen</button>
              </OrderCard>
            ))}
          </div>
        </>
      )}

      {billRequested.length > 0 && (
        <>
          <SectionHeader title="Bill Requests" count={billRequested.length} color="#e8a33d" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {billRequested.map((o) => (
              <OrderCard key={o.id} order={o}>
                <button className="btn btn-sm btn-primary" onClick={() => generateBill(o)} style={{ width: "100%" }}>Generate Bill</button>
              </OrderCard>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderOrders = () => {
    const orderSections = [
      { key: "pending", label: "Pending", count: pending.length, color: "#f59e0b", data: pending, emptyMsg: "No new orders waiting." },
      { key: "active", label: "In Progress", count: active.length, color: "#3b82f6", data: active, emptyMsg: "Nothing in the kitchen right now." },
      { key: "served", label: "Served", count: served.length, color: "#6b7280", data: served, emptyMsg: "No tables waiting on a bill." },
      { key: "billRequested", label: "Bill Requests", count: billRequested.length, color: "#e8a33d", data: billRequested, emptyMsg: "No bills requested." },
      { key: "billed", label: "Awaiting Payment", count: billed.length, color: "#8b5cf6", data: billed, emptyMsg: "Nothing awaiting payment." },
    ];

    const currentSection = orderSections.find((s) => s.key === orderFilter);

    return (
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Orders</h2>

        {/* Horizontal Tabs */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24, borderBottom: "2px solid var(--border)" }}>
          {orderSections.map((section) => (
            <button
              key={section.key}
              onClick={() => setOrderFilter(section.key)}
              style={{
                padding: "12px 18px",
                borderRadius: "10px 10px 0 0",
                border: "none",
                borderBottom: orderFilter === section.key ? `3px solid ${section.color}` : "3px solid transparent",
                background: orderFilter === section.key ? `${section.color}10` : "transparent",
                color: orderFilter === section.key ? section.color : "var(--text-secondary)",
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {section.label}
              <span style={{ background: orderFilter === section.key ? section.color : "var(--surface-2)", color: orderFilter === section.key ? "#fff" : "var(--text-secondary)", padding: "1px 8px", borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                {section.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {currentSection.data.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p>{currentSection.emptyMsg}</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {currentSection.key === "pending" && currentSection.data.map((o) => (
                <OrderCard key={o.id} order={o}>
                  <button className="btn btn-sm btn-danger" onClick={() => declineOrder(o.id)} style={{ flex: 1 }}>Decline</button>
                  <button className="btn btn-sm btn-primary" onClick={() => confirmOrder(o.id)} style={{ flex: 1 }}>Confirm → Kitchen</button>
                </OrderCard>
              ))}

              {currentSection.key === "active" && currentSection.data.map((o) => (
                <OrderCard key={o.id} order={o}>
                  {o.status === "ready" && (
                    <button className="btn btn-sm btn-success" onClick={() => markServed(o.id)} style={{ width: "100%" }}>Mark as Served</button>
                  )}
                </OrderCard>
              ))}

              {currentSection.key === "served" && currentSection.data.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}

              {currentSection.key === "billRequested" && currentSection.data.map((o) => (
                <OrderCard key={o.id} order={o}>
                  <button className="btn btn-sm btn-primary" onClick={() => generateBill(o)} style={{ width: "100%" }}>Generate Bill</button>
                </OrderCard>
              ))}

              {currentSection.key === "billed" && currentSection.data.map((o) => (
                <div key={o.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700 }}>Table {o.table}</span>
                    <span className="badge badge-billed">billed</span>
                  </div>
                  {o.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}>
                      <span>{it.name} ×{it.qty}</span>
                      <span>₹{it.price * it.qty}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" }}>
                      <span>Subtotal</span><span>₹{o.billSubtotal}</span>
                    </div>
                    {o.billTaxAmount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" }}>
                        <span>Tax ({o.billTaxPercent}%)</span><span>₹{o.billTaxAmount}</span>
                      </div>
                    )}
                    {o.billServiceAmount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" }}>
                        <span>Service ({o.billServicePercent}%)</span><span>₹{o.billServiceAmount}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 6 }}>
                      <span>Total</span><span>₹{o.billTotal}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => printBill(o)} style={{ flex: 1 }}>🖨 Print</button>
                    <button className="btn btn-sm btn-success" onClick={() => markPaid(o.id)} style={{ flex: 1 }}>Mark Paid</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMenu = () => (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Menu Management</h2>

      <div className="card" style={{ padding: 24, marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>➕ Add New Item</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <input placeholder="Price (₹)" type="number" value={newItem.price} onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))} style={inputStyle} />
          <select value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Photo URL (optional)" value={newItem.imageUrl} onChange={(e) => setNewItem((p) => ({ ...p, imageUrl: e.target.value }))} style={inputStyle} />
        </div>
        <input placeholder="Description (optional)" value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
        <button className="btn btn-primary" onClick={addMenuItem} style={{ marginTop: 4 }}>+ Add Item</button>
      </div>

      {CATEGORIES.map((cat) => {
        const itemsInCat = menuItems.filter((m) => m.category === cat);
        if (itemsInCat.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-secondary)", marginBottom: 12 }}>{cat}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {itemsInCat.map((item) => (
                <div key={item.id} className="card" style={{ padding: 14, display: "flex", gap: 14, alignItems: "center" }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🍽️</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === item.id ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                        <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="Name" />
                        <input type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} style={inputStyle} placeholder="Price" />
                        <select value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={editForm.imageUrl} onChange={(e) => setEditForm((p) => ({ ...p, imageUrl: e.target.value }))} style={inputStyle} placeholder="Image URL" />
                        <input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} style={inputStyle} placeholder="Description" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-sm btn-primary" onClick={saveEdit} style={{ flex: 1 }}>Save</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)} style={{ flex: 1 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                         <div>
                            <div style={{ fontWeight: 700, fontSize: 15, opacity: item.available ? 1 : 0.5 }}>{item.name}</div>
                            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>₹{item.price} · {item.description}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                               {/* ⭐ FEATURED TOGGLE */}
                              <button 
                                     className="btn btn-sm" 
                                     onClick={() => toggleFeatured(item)}
                                     style={{ 
                                              background: item.featured ? "#e8a33d20" : "var(--surface-2)", 
                                              color: item.featured ? "#92400e" : "var(--text-secondary)", 
                                              border: "none",
                                              fontWeight: item.featured ? 700 : 500,
                                             }}
                                             >
                                    {item.featured ? "★ Featured" : "☆ Feature"}
                               </button>
                              <button className="btn btn-sm" onClick={() => toggleAvailable(item)} style={{ background: item.available ? "var(--success-light)" : "var(--warning-light)", color: item.available ? "#166534" : "#92400e", border: "none" }}>
                                {item.available ? "Available" : "Out of Stock"}
                              </button>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(item)}>Edit</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => deleteItem(item.id)} style={{ color: "var(--danger)" }}>Delete</button>
                          </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTables = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>Tables & QR Codes</h2>
        <button className="btn btn-primary" onClick={addTable}>+ Add Table</button>
      </div>

      {tables.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
          <p>No tables yet — add one to generate its QR code.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {tables.map((t) => (
          <div key={t.id} className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Table {t.number}</div>
            {siteUrl && (
              <img src={qrUrlFor(t.number)} alt={`QR table ${t.number}`} style={{ width: "100%", maxWidth: 180, borderRadius: 12, margin: "0 auto 12px", display: "block" }} />
            )}
            <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all", marginBottom: 12 }}>
              {siteUrl}/table?table={t.number}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => printQr(t.number)} style={{ flex: 1 }}>🖨 Print</button>
              <button className="btn btn-sm btn-ghost" onClick={() => deleteTable(t.id)} style={{ flex: 1, color: "var(--danger)" }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Settings</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🏪 Restaurant Profile</h3>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Restaurant Name</label>
          <input value={profileForm.name || ""} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Tagline</label>
          <input value={profileForm.tagline || ""} onChange={(e) => setProfileForm((p) => ({ ...p, tagline: e.target.value }))} style={inputStyle} />
          <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Logo Image URL</label>
          <input value={profileForm.logoUrl || ""} onChange={(e) => setProfileForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." style={inputStyle} />
          {profileForm.logoUrl && (
            <img src={profileForm.logoUrl} alt="Preview" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
          )}
          <button className="btn btn-primary" onClick={saveProfile}>
            {savedMsg ? "Saved ✓" : "Save Profile"}
          </button>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💰 Billing Settings</h3>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Tax / GST %</label>
          <input type="number" value={billingForm.taxPercent} onChange={(e) => setBillingForm((p) => ({ ...p, taxPercent: e.target.value }))} style={inputStyle} />
          <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Service Charge %</label>
          <input type="number" value={billingForm.servicePercent} onChange={(e) => setBillingForm((p) => ({ ...p, servicePercent: e.target.value }))} style={inputStyle} />
          <button className="btn btn-primary" onClick={saveBilling}>
            {billingSaved ? "Saved ✓" : "Save Billing Settings"}
          </button>
        </div>
      </div>
    </div>
  );

  // === RETURN ===
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      {isMobile && sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className="no-print"
        style={{
          width: 260,
          background: "#1a1a2e",
          color: "#fff",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          overflowY: "auto",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
          transition: "transform 0.3s ease",
        }}
      >
        <div style={{ padding: "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🍽️</span>
            <span>Table Order</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Reception Desk</div>
        </div>
        <nav style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (isMobile) setSidebarOpen(false); }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: activeTab === tab.id ? "rgba(232,163,61,0.15)" : "transparent",
                color: activeTab === tab.id ? "#e8a33d" : "rgba(255,255,255,0.7)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: 20, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {profile?.name || "Restaurant Name"}
        </div>
      </aside>

      <main style={{ marginLeft: isMobile ? 0 : 260, flex: 1, background: "var(--bg)", minHeight: "100vh", width: "100%" }}>
        {isMobile && (
          <div className="no-print" style={{ padding: "16px 20px", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>
              ☰
            </button>
            <span style={{ fontWeight: 700 }}>Reception</span>
          </div>
        )}

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "20px" : "32px" }}>
          {activeTab === "dashboard" && renderDashboard()}
          {activeTab === "orders" && renderOrders()}
          {activeTab === "menu" && renderMenu()}
          {activeTab === "tables" && renderTables()}
          {activeTab === "settings" && renderSettings()}
        </div>
      </main>
    </div>
  );
}