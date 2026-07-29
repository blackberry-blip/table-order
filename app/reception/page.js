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
  deleteDoc,
  setDoc,
  addDoc,
} from "firebase/firestore";

const CATEGORIES = ["Starters", "Mains", "Breads & Rice", "Beverages", "Desserts"];

export default function ReceptionPage() {
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

  const pending = orders.filter((o) => o.status === "pending");
  const active = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const served = orders.filter((o) => o.status === "served");
  const billRequested = orders.filter((o) => o.status === "bill_requested");
  const billed = orders.filter((o) => o.status === "billed");

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
  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    await deleteDoc(doc(db, "menuItems", id));
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

  const inputStyle = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, marginBottom: 6 };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h2>Reception</h2>

      <details style={{ marginBottom: 16, border: "1px solid #ddd", borderRadius: 10, padding: 14 }} suppressHydrationWarning>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>Restaurant profile</summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888" }}>Name</label>
            <input value={profileForm.name || ""} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888" }}>Tagline</label>
            <input value={profileForm.tagline || ""} onChange={(e) => setProfileForm((p) => ({ ...p, tagline: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888" }}>Logo image URL</label>
            <input value={profileForm.logoUrl || ""} onChange={(e) => setProfileForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." style={inputStyle} />
          </div>
          <button onClick={saveProfile} style={{ padding: 10, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}>
            {savedMsg ? "Saved ✓" : "Save profile"}
          </button>
        </div>
      </details>

      <details style={{ marginBottom: 16, border: "1px solid #ddd", borderRadius: 10, padding: 14 }} suppressHydrationWarning>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>Billing settings</summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888" }}>Tax / GST %</label>
            <input type="number" value={billingForm.taxPercent} onChange={(e) => setBillingForm((p) => ({ ...p, taxPercent: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888" }}>Service charge %</label>
            <input type="number" value={billingForm.servicePercent} onChange={(e) => setBillingForm((p) => ({ ...p, servicePercent: e.target.value }))} style={inputStyle} />
          </div>
          <button onClick={saveBilling} style={{ padding: 10, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}>
            {billingSaved ? "Saved ✓" : "Save billing settings"}
          </button>
        </div>
      </details>

      <details style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 10, padding: 14 }} suppressHydrationWarning>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>Menu management ({menuItems.length} items)</summary>
        <div style={{ marginTop: 14, padding: 12, background: "#f7f7f5", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Add new item</div>
          <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <input placeholder="Description" value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
          <input placeholder="Price (₹)" type="number" value={newItem.price} onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))} style={inputStyle} />
          <select value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Photo URL (optional)" value={newItem.imageUrl} onChange={(e) => setNewItem((p) => ({ ...p, imageUrl: e.target.value }))} style={inputStyle} />
          <button onClick={addMenuItem} style={{ width: "100%", padding: 10, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}>
            + Add item
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {CATEGORIES.map((cat) => {
            const itemsInCat = menuItems.filter((m) => m.category === cat);
            if (itemsInCat.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", color: "#888", marginBottom: 6 }}>{cat}</div>
                {itemsInCat.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    {editingId === item.id ? (
                      <div>
                        <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
                        <input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
                        <input type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} style={inputStyle} />
                        <select value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={editForm.imageUrl} onChange={(e) => setEditForm((p) => ({ ...p, imageUrl: e.target.value }))} style={inputStyle} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={saveEdit} style={{ flex: 1, padding: 8, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 6 }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 8, background: "#fff", border: "1px solid #ccc", borderRadius: 6 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600, opacity: item.available ? 1 : 0.4 }}>{item.name}</span>
                          <span>₹{item.price}</span>
                        </div>
                        {item.description && <div style={{ fontSize: 12, color: "#888" }}>{item.description}</div>}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button onClick={() => toggleAvailable(item)} style={{ flex: 1, padding: 6, fontSize: 12, background: item.available ? "#E3EFE2" : "#F1EBDD", border: "none", borderRadius: 6 }}>
                            {item.available ? "Available" : "Out of stock"}
                          </button>
                          <button onClick={() => startEdit(item)} style={{ flex: 1, padding: 6, fontSize: 12, background: "#fff", border: "1px solid #ccc", borderRadius: 6 }}>Edit</button>
                          <button onClick={() => deleteItem(item.id)} style={{ flex: 1, padding: 6, fontSize: 12, background: "#fff", color: "#C1440E", border: "1px solid #C1440E", borderRadius: 6 }}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </details>

      <h3 style={{ marginTop: 20 }}>New orders ({pending.length})</h3>
      {pending.length === 0 && <p style={{ color: "#888" }}>No new orders waiting.</p>}
      {pending.map((o) => (
        <div key={o.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Table {o.table}</div>
          {o.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{it.name}</span>
              <span>×{it.qty}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => declineOrder(o.id)} style={{ flex: 1, padding: 10, background: "#fff", color: "#C1440E", border: "1px solid #C1440E", borderRadius: 8 }}>Decline</button>
            <button onClick={() => confirmOrder(o.id)} style={{ flex: 1, padding: 10, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}>Confirm → Kitchen</button>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>In progress</h3>
      {active.length === 0 && <p style={{ color: "#888" }}>Nothing in the kitchen right now.</p>}
      {active.map((o) => {
        const countdown = getCountdown(o);
        return (
          <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>Table {o.table}</span>
              <span style={{ fontSize: 12, textTransform: "uppercase", color: "#888" }}>{o.status}</span>
            </div>
            {o.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{it.name}</span>
                <span>×{it.qty}</span>
              </div>
            ))}
            {o.status === "preparing" && countdown && (
              <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 20, color: "#C1440E" }}>{countdown}</div>
            )}
            {o.status === "ready" && (
              <button onClick={() => markServed(o.id)} style={{ marginTop: 10, width: "100%", padding: 10, background: "#4C7A4A", color: "#fff", border: "none", borderRadius: 8 }}>
                Mark as served
              </button>
            )}
          </div>
        );
      })}

      <h3 style={{ marginTop: 28 }}>Served ({served.length})</h3>
      {served.length === 0 && <p style={{ color: "#888" }}>No tables waiting on a bill.</p>}
      {served.map((o) => (
        <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Table {o.table}</div>
          <div style={{ fontSize: 12, color: "#888" }}>Waiting for the customer to request the bill.</div>
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>Bill requests ({billRequested.length})</h3>
      {billRequested.length === 0 && <p style={{ color: "#888" }}>No bills requested.</p>}
      {billRequested.map((o) => {
        const subtotal = o.items.reduce((sum, it) => sum + it.price * it.qty, 0);
        return (
          <div key={o.id} style={{ border: "1px solid #E8A33D", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Table {o.table} · ₹{subtotal} (before tax)</div>
            {o.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{it.name}</span>
                <span>×{it.qty}</span>
              </div>
            ))}
            <button onClick={() => generateBill(o)} style={{ marginTop: 10, width: "100%", padding: 10, background: "#1C1B1A", color: "#fff", border: "none", borderRadius: 8 }}>
              Generate bill
            </button>
          </div>
        );
      })}

      <h3 style={{ marginTop: 28 }}>Awaiting payment ({billed.length})</h3>
      {billed.length === 0 && <p style={{ color: "#888" }}>Nothing awaiting payment.</p>}
      {billed.map((o) => (
        <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Table {o.table} · ₹{o.billTotal}</div>
          <button onClick={() => markPaid(o.id)} style={{ marginTop: 10, width: "100%", padding: 10, background: "#4C7A4A", color: "#fff", border: "none", borderRadius: 8 }}>
            Mark as paid
          </button>
        </div>
      ))}
    </div>
  );
}