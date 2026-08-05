"use client";
// REPLACES your existing app/receptionist/page.js entirely.
//
// New in this version (see SETUP_GUIDE.md for the Firestore schema this needs):
//  - Floors: floors collection, "Add Floor" button, tables grouped by floor.
//  - VIP toggle per table.
//  - Veg/Non-veg required field on every menu item + combos ("Add Combo" ->
//    auto category "Combo Packs", isCombo:true, works exactly like a normal item).
//  - Dashboard stat boxes are now clickable, glass-styled, and route to real
//    Sales / Orders History / Items Sold analytics views with date filters.
//  - Split bill (even split by N — the simplest version that actually ships).
//  - UPI payment QR on "Generate Bill".
//  - Promo banner (Settings) shown at the bottom of the customer table page.
//  - Settings redesigned: flat full-width logo box, staff beside billing.
//  - Sidebar: no emojis, bold text, light-blue active state.
//  - Plan-gated: features not in the hotel's plan tier are hidden (see
//    lib/plans.js) — check `features.x` before rendering pro/mid-only UI.
//  - BULK IMPORT: CSV/JSON paste or upload, preview validation, auto-creates
//    missing categories, skips duplicates, downloads template.

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { playNotificationSound, requestNotificationPermission, showPopupNotification } from "@/lib/notifications";
import { AuthGuard } from "@/lib/auth-guard";
import { useAuth } from "@/lib/auth-context";
import {
  collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, setDoc, addDoc,
  getDoc, serverTimestamp, writeBatch,
} from "firebase/firestore";

const DEFAULT_CATEGORIES = ["Starters", "Mains", "Breads & Rice", "Continental", "Beverages", "Desserts"];
const COMBO_CATEGORY = "Combo Packs";

const ORDER_SECTIONS = [
  { key: "pending", label: "New", color: "#f59e0b", emptyMsg: "No new orders waiting.", emptyIcon: "🔔" },
  { key: "active", label: "In Kitchen", color: "#3b82f6", emptyMsg: "Nothing cooking right now.", emptyIcon: "👨‍🍳" },
  { key: "served", label: "Served", color: "#6b7280", emptyMsg: "No tables waiting on a bill.", emptyIcon: "🍽️" },
  { key: "billRequested", label: "Bill Requests", color: "#e8a33d", emptyMsg: "No bills requested.", emptyIcon: "🧾" },
  { key: "billed", label: "Awaiting Payment", color: "#8b5cf6", emptyMsg: "Nothing awaiting payment.", emptyIcon: "💳" },
];

function isToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function filterRangeStart(filterKey) {
  if (filterKey === "today") return daysAgo(0);
  if (filterKey === "3days") return daysAgo(3);
  if (filterKey === "week") return daysAgo(7);
  if (filterKey === "month") return daysAgo(30);
  return 0;
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

// === shared styles (module scope on purpose — see note below) ===
const inputStyle = { width: "100%", padding: "11px 14px", border: "1px solid var(--border, #e6e1d6)", borderRadius: 10, fontSize: 14, marginBottom: 12, background: "var(--surface, #ffffff)", fontFamily: "inherit", boxSizing: "border-box" };
const labelStyle = { fontSize: 12, color: "var(--text-secondary, #6b6b7b)", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 };
const glassCard = { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.5)" };

// === shared components — MUST live at module scope, not inside ReceptionPage ===
function StatCard({ label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ ...glassCard, padding: 20, display: "flex", alignItems: "center", gap: 16, borderRadius: 18, cursor: onClick ? "pointer" : "default", boxShadow: `0 8px 24px ${color}22` }}>
      <div style={{ width: 8, alignSelf: "stretch", borderRadius: 4, background: color, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: "#1a1a2e" }}>{value}</div>
        <div style={{ fontSize: 12.5, color: "#555", marginTop: 4, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function OrderCard({ order, children }) {
  return (
    <div className="card" style={{ padding: 16, borderRadius: 14, animation: "riseIn 0.3s ease", position: "relative", borderLeft: order.isVIP ? "4px solid #eab308" : undefined }}>
      {order.isVIP && <span style={{ position: "absolute", top: -8, right: 10, background: "#eab308", color: "#1a1a2e", fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 100 }}>VIP</span>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{order.table}</div>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>Table {order.table}</span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--text-secondary, #6b6b7b)" }}>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {order.items.map((it, i) => (
        <div key={i} style={{ padding: "3px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
            <span>{it.name}</span><span style={{ color: "var(--text-secondary, #6b6b7b)" }}>×{it.qty}</span>
          </div>
          {it.spiceLevel && <div style={{ fontSize: 11, color: "#e8a33d" }}>🌶 {it.spiceLevel}</div>}
          {it.notes && <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>"{it.notes}"</div>}
        </div>
      ))}
      {order.status === "preparing" && getCountdown(order) && (
        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 17, color: "#C1440E", fontWeight: 700 }}>⏱ {getCountdown(order)}</div>
      )}
      {children && <div style={{ marginTop: 12, display: "flex", gap: 8 }}>{children}</div>}
    </div>
  );
}

function FoodTypeToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {[["veg", "Veg", "#16a34a"], ["nonveg", "Non-veg", "#dc2626"]].map(([val, label, color]) => (
        <button key={val} type="button" onClick={() => onChange(val)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 100, border: value === val ? `2px solid ${color}` : "1px solid #ddd", background: value === val ? color + "15" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          <span style={{ width: 12, height: 12, border: `1.5px solid ${color}`, borderRadius: 3, position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", inset: 1.5, borderRadius: "50%", background: color }} />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

function MenuItemCard({ item, isEditing, editForm, setEditForm, editUploading, editFileInputRef, handleImageUpload, categories, saveEdit, cancelEdit, toggleAvailable, toggleFeatured, toggleChefSpecial, startEdit, deleteItem }) {
  if (isEditing) {
    return (
      <div className="card" style={{ padding: 16, borderRadius: 14, gridColumn: "1 / -1" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Price (₹)</label>
            <input type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Photo</label>
            <input ref={editFileInputRef} type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], true)} style={{ display: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => editFileInputRef.current?.click()} disabled={editUploading} className="btn btn-sm btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{editUploading ? "..." : "Change Photo"}</button>
              {editForm.imageUrl && !editUploading && <img src={editForm.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />}
            </div>
          </div>
        </div>
        <label style={labelStyle}>Description</label>
        <input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
        <label style={labelStyle}>Food Type</label>
        <FoodTypeToggle value={editForm.foodType || "veg"} onChange={(v) => setEditForm((p) => ({ ...p, foodType: v }))} />
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={!!editForm.featured} onChange={(e) => setEditForm((p) => ({ ...p, featured: e.target.checked }))} /> Featured
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={!!editForm.chefSpecial} onChange={(e) => setEditForm((p) => ({ ...p, chefSpecial: e.target.checked }))} /> Chef's Special
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={saveEdit} style={{ flex: 1 }}>Save Changes</button>
          <button className="btn btn-sm btn-ghost" onClick={cancelEdit} style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderRadius: 16, overflow: "hidden", opacity: item.available ? 1 : 0.6, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", height: 140, background: "var(--surface-2, #f3efe6)" }}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🍽️</div>}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {item.isCombo && <span style={{ background: "#1a1a2e", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 100 }}>COMBO</span>}
          {item.chefSpecial && <span style={{ background: "#1a1a2e", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 100 }}>CHEF'S SPECIAL</span>}
          {item.featured && <span style={{ background: "#e8a33d", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 100 }}>★ FEATURED</span>}
        </div>
        {!item.available && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 12.5, letterSpacing: 0.5 }}>OUT OF STOCK</span>
          </div>
        )}
      </div>
      <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, border: `1.5px solid ${item.foodType === "nonveg" ? "#dc2626" : "#16a34a"}`, borderRadius: 3, position: "relative", display: "inline-block", flexShrink: 0 }}>
              <span style={{ position: "absolute", inset: 1.5, borderRadius: "50%", background: item.foodType === "nonveg" ? "#dc2626" : "#16a34a" }} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#e8a33d", whiteSpace: "nowrap" }}>₹{item.price}</div>
        </div>
        {item.description && <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", marginTop: 4, flex: 1 }}>{item.description}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => toggleAvailable(item)} className="btn btn-sm" style={{ background: item.available ? "var(--success-light, #dcfce7)" : "var(--warning-light, #fef3c7)", color: item.available ? "#166534" : "#92400e", border: "none", flex: 1, minWidth: 90 }}>{item.available ? "In Stock" : "Out"}</button>
          <button onClick={() => toggleFeatured(item)} className="btn btn-sm" style={{ background: item.featured ? "#e8a33d20" : "var(--surface-2, #f3efe6)", color: item.featured ? "#92400e" : "var(--text-secondary, #6b6b7b)", border: "none" }} title="Toggle featured">★</button>
          {!item.isCombo && <button onClick={() => toggleChefSpecial(item)} className="btn btn-sm" style={{ background: item.chefSpecial ? "#1a1a2e" : "var(--surface-2, #f3efe6)", color: item.chefSpecial ? "#fff" : "var(--text-secondary, #6b6b7b)", border: "none" }} title="Toggle chef's special">CS</button>}
          <button onClick={() => startEdit(item)} className="btn btn-sm btn-ghost">Edit</button>
          <button onClick={() => deleteItem(item.id)} className="btn btn-sm btn-ghost" style={{ color: "var(--danger, #dc2626)" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function ReceptionPageWrapper() {
  return (
    <AuthGuard allowedRoles={["reception"]}>
      <ReceptionPage />
    </AuthGuard>
  );
}

function ReceptionPage() {
  const { role, logout, restaurantId, features } = useAuth();

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "menu", label: "Menu" },
    { id: "tables", label: "Tables" },
    { id: "settings", label: "Settings" },
  ];

  // === state ===
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboardView, setDashboardView] = useState("main"); // main | sales | orders | items
  const [analyticsFilter, setAnalyticsFilter] = useState("today"); // today | 3days | week | month
  const [orderFilter, setOrderFilter] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState({ name: "", tagline: "", logoUrl: "", address: "" });
  const [profileForm, setProfileForm] = useState({ name: "", tagline: "", logoUrl: "", address: "" });
  const [savedMsg, setSavedMsg] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "", category: "", imageUrl: "", chefSpecial: false, foodType: "veg" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [billing, setBilling] = useState({ taxPercent: 5, servicePercent: 0, upiId: "" });
  const [billingForm, setBillingForm] = useState({ taxPercent: 5, servicePercent: 0, upiId: "" });
  const [billingSaved, setBillingSaved] = useState(false);
  const [tables, setTables] = useState([]);
  const [floors, setFloors] = useState([]);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const floorPickerShownRef = useRef(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastPendingCount, setLastPendingCount] = useState(0);
  const [lastBillCount, setLastBillCount] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [menuTab, setMenuTab] = useState("all");
  const [menuSearch, setMenuSearch] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", imageUrl: "" });
  const [categoryUploading, setCategoryUploading] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ name: "", imageUrl: "" });
  const [editCategoryUploading, setEditCategoryUploading] = useState(false);
  const [showAddCombo, setShowAddCombo] = useState(false);
  const [newCombo, setNewCombo] = useState({ name: "", description: "", price: "", imageUrl: "", featured: false });
  const [comboUploading, setComboUploading] = useState(false);
  const [promoBanner, setPromoBanner] = useState({ imageUrl: "", title: "", linkedItemId: "" });
  const [promoForm, setPromoForm] = useState({ imageUrl: "", title: "", linkedItemId: "" });
  const [promoUploading, setPromoUploading] = useState(false);
  const [promoSaved, setPromoSaved] = useState(false);
  const [splitBillOrder, setSplitBillOrder] = useState(null);
  const [splitCount, setSplitCount] = useState(2);
  const [showSplash, setShowSplash] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);

  // --- NEW: bulk import state ---
  const [showAddItem, setShowAddItem] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFormat, setImportFormat] = useState("csv");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);

  const editCategoryFileInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);
  const logoFileInputRef = useRef(null);
  const categoryFileInputRef = useRef(null);
  const comboFileInputRef = useRef(null);
  const promoFileInputRef = useRef(null);
  const seededCategories = useRef(false);

  // Staff
  const [staffList, setStaffList] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("kitchen");
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState("");

  // === splash ===
  useEffect(() => { setShowSplash(true); }, []);
  useEffect(() => {
    if (!showSplash) return;
    const l = setTimeout(() => setSplashLeaving(true), 1900);
    const h = setTimeout(() => setShowSplash(false), 2450);
    return () => { clearTimeout(l); clearTimeout(h); };
  }, [showSplash]);
  function dismissSplash() { setSplashLeaving(true); setTimeout(() => setShowSplash(false), 400); }

  // === basic effects ===
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
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "orders"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "profile"), (snap) => {
      if (snap.exists()) { setProfile(snap.data()); setProfileForm(snap.data()); }
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "billing"), (snap) => {
      if (snap.exists()) { setBilling(snap.data()); setBillingForm(snap.data()); }
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "promoBanner"), (snap) => {
      if (snap.exists()) { setPromoBanner(snap.data()); setPromoForm(snap.data()); }
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "menuItems"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => setMenuItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "tables"), orderBy("number", "asc"));
    const unsub = onSnapshot(q, (snap) => setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [restaurantId]);

  // Floors
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "floors"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => setFloors(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [restaurantId]);

  // Show floor picker once per session if there's more than one floor
  useEffect(() => {
    if (floorPickerShownRef.current) return;
    if (floors.length > 1) {
      setShowFloorPicker(true);
      floorPickerShownRef.current = true;
    }
  }, [floors]);

  // Categories: live sync + one-time seed (+ always ensure Combo Packs exists)
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "categories"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(list);
      if (list.length === 0 && !seededCategories.current) {
        seededCategories.current = true;
        for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
          await addDoc(collection(db, "restaurants", restaurantId, "categories"), { name: DEFAULT_CATEGORIES[i], imageUrl: "", order: i, createdAt: Date.now() });
        }
      }
      if (list.length > 0 && !list.some((c) => c.name === COMBO_CATEGORY)) {
        await addDoc(collection(db, "restaurants", restaurantId, "categories"), { name: COMBO_CATEGORY, imageUrl: "", order: list.length, createdAt: Date.now() });
      }
    });
    return () => unsub();
  }, [restaurantId]);

  // Staff
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "staff"));
    const unsub = onSnapshot(q, (snap) => setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (!newItem.category && categories.length > 0) {
      const firstNonCombo = categories.find((c) => c.name !== COMBO_CATEGORY);
      setNewItem((p) => ({ ...p, category: firstNonCombo ? firstNonCombo.name : categories[0].name }));
    }
  }, [categories, newItem.category]);

  // === computed ===
  const pending = orders.filter((o) => o.status === "pending");
  const active = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const served = orders.filter((o) => o.status === "served");
  const billRequested = orders.filter((o) => o.status === "bill_requested");
  const billed = orders.filter((o) => o.status === "billed");

  const ordersToday = orders.filter((o) => isToday(o.createdAt));
  const revenueOrdersToday = ordersToday.filter((o) => o.status === "billed" || o.status === "paid");
  const todaySales = revenueOrdersToday.reduce((sum, o) => sum + (o.billTotal || 0), 0);
  const todayItemsSold = ordersToday.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + (it.qty || 0), 0), 0);
  const todayOrderCount = ordersToday.length;
  const avgOrderValue = revenueOrdersToday.length > 0 ? Math.round(todaySales / revenueOrdersToday.length) : 0;

  const orderDataByKey = { pending, active, served, billRequested, billed };

  useEffect(() => {
    if (pending.length > lastPendingCount && lastPendingCount > 0) {
      playNotificationSound("newOrder");
      showPopupNotification("New Order", `Table ${pending[pending.length - 1]?.table} just placed an order`, { tag: "new-order", renotify: true });
    }
    setLastPendingCount(pending.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  useEffect(() => {
    if (billRequested.length > lastBillCount && lastBillCount > 0) {
      playNotificationSound("bill");
      showPopupNotification("Bill Requested", `Table ${billRequested[billRequested.length - 1]?.table} requested the bill`, { tag: "bill-request", renotify: true });
    }
    setLastBillCount(billRequested.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billRequested.length]);

  // === uploads ===
  async function uploadGuard(file) {
    if (!file) return null;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return null; }
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return null; }
    return uploadToCloudinary(file);
  }
  async function handleImageUpload(file, isEdit = false) {
    if (isEdit) setEditUploading(true); else setUploadingImage(true);
    try {
      const url = await uploadGuard(file);
      if (url) { if (isEdit) setEditForm((p) => ({ ...p, imageUrl: url })); else setNewItem((p) => ({ ...p, imageUrl: url })); }
    } catch (err) { alert("Upload failed: " + err.message); }
    finally { if (isEdit) setEditUploading(false); else setUploadingImage(false); }
  }
  async function handleLogoUpload(file) {
    setLogoUploading(true);
    try { const url = await uploadGuard(file); if (url) setProfileForm((p) => ({ ...p, logoUrl: url })); }
    catch (err) { alert("Upload failed: " + err.message); }
    finally { setLogoUploading(false); }
  }
  async function handleCategoryImageUpload(file) {
    setCategoryUploading(true);
    try { const url = await uploadGuard(file); if (url) setNewCategory((p) => ({ ...p, imageUrl: url })); }
    catch (err) { alert("Upload failed: " + err.message); }
    finally { setCategoryUploading(false); }
  }
  async function handleEditCategoryImageUpload(file) {
    setEditCategoryUploading(true);
    try { const url = await uploadGuard(file); if (url) setEditCategoryForm((p) => ({ ...p, imageUrl: url })); }
    catch (err) { alert("Upload failed: " + err.message); }
    finally { setEditCategoryUploading(false); }
  }
  async function handleComboImageUpload(file) {
    setComboUploading(true);
    try { const url = await uploadGuard(file); if (url) setNewCombo((p) => ({ ...p, imageUrl: url })); }
    catch (err) { alert("Upload failed: " + err.message); }
    finally { setComboUploading(false); }
  }
  async function handlePromoImageUpload(file) {
    setPromoUploading(true);
    try { const url = await uploadGuard(file); if (url) setPromoForm((p) => ({ ...p, imageUrl: url })); }
    catch (err) { alert("Upload failed: " + err.message); }
    finally { setPromoUploading(false); }
  }

  // === order actions ===
  async function confirmOrder(id) { await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "confirmed" }); }
  async function declineOrder(id) { await deleteDoc(doc(db, "restaurants", restaurantId, "orders", id)); }
  async function markServed(id) { await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "served" }); }

  async function saveProfile() {
    await setDoc(doc(db, "restaurants", restaurantId, "info", "profile"), profileForm, { merge: true });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }
  async function saveBilling() {
    await setDoc(doc(db, "restaurants", restaurantId, "info", "billing"), {
      taxPercent: parseFloat(billingForm.taxPercent) || 0,
      servicePercent: parseFloat(billingForm.servicePercent) || 0,
      upiId: (billingForm.upiId || "").trim(),
    });
    setBillingSaved(true);
    setTimeout(() => setBillingSaved(false), 2000);
  }
  async function savePromoBanner() {
    await setDoc(doc(db, "restaurants", restaurantId, "info", "promoBanner"), {
      imageUrl: promoForm.imageUrl || "",
      title: promoForm.title || "",
           linkedItemId: promoForm.linkedItemId || "",
    });
    setPromoSaved(true);
    setTimeout(() => setPromoSaved(false), 2000);
  }

  async function generateBill(o, withQr = false) {
    const subtotal = o.items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const taxAmount = Math.round((subtotal * (billing.taxPercent || 0)) / 100);
    const serviceAmount = Math.round((subtotal * (billing.servicePercent || 0)) / 100);
    const grandTotal = subtotal + taxAmount + serviceAmount;
    const upiLink = withQr && billing.upiId
      ? `upi://pay?pa=${encodeURIComponent(billing.upiId)}&pn=${encodeURIComponent(profile.name || "Restaurant")}&am=${grandTotal}&cu=INR`
      : null;

    await updateDoc(doc(db, "restaurants", restaurantId, "orders", o.id), {
      status: "billed", billSubtotal: subtotal, billTaxPercent: billing.taxPercent || 0, billTaxAmount: taxAmount,
      billServicePercent: billing.servicePercent || 0, billServiceAmount: serviceAmount, billTotal: grandTotal,
      paymentQrUrl: upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiLink)}` : null,
    });
  }

  async function markPaid(id) { await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "paid" }); }

  function printBill(o) {
    const itemsHtml = o.items.map((it) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;">
          <span>${it.name} x${it.qty}</span><span>Rs.${it.price * it.qty}</span>
        </div>`).join("");
    const qrHtml = o.paymentQrUrl ? `<div style="text-align:center;margin-top:16px;"><img src="${o.paymentQrUrl}" style="width:160px;" /><div style="font-size:11px;color:#888;margin-top:6px;">Scan to pay via UPI</div></div>` : "";
    const html = `
      <html><head><title>Bill - Table ${o.table}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; max-width: 320px; margin: 20px auto; color: #1a1a2e; }
          h2 { text-align: center; margin-bottom: 0; font-size: 22px; }
          .sub { text-align: center; font-size: 12px; color: #6b6b7b; margin-bottom: 16px; }
          .line { border-top: 1px dashed #ccc; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
          .total { font-size: 20px; font-weight: 700; margin-top: 10px; }
        </style>
      </head><body>
        ${profile?.logoUrl ? `<div style="text-align:center;margin-bottom:10px;"><img src="${profile.logoUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" /></div>` : ""}
        <h2>${profile?.name || "Table Order"}</h2>
        <div class="sub">${profile?.tagline || ""}</div>
        <div class="sub">Table ${o.table} - ${new Date(o.createdAt).toLocaleString()}</div>
        <div class="line"></div>
        ${itemsHtml}
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>Rs.${o.billSubtotal}</span></div>
        ${o.billTaxAmount > 0 ? `<div class="row"><span>Tax (${o.billTaxPercent}%)</span><span>Rs.${o.billTaxAmount}</span></div>` : ""}
        ${o.billServiceAmount > 0 ? `<div class="row"><span>Service (${o.billServicePercent}%)</span><span>Rs.${o.billServiceAmount}</span></div>` : ""}
        <div class="line"></div>
        <div class="row total"><span>Total</span><span>Rs.${o.billTotal}</span></div>
        ${qrHtml}
        <div class="sub" style="margin-top:24px;">Thank you for dining with us!</div>
        <script>window.onload = () => window.print();</script>
      </body></html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(html);
    win.document.close();
  }

  // === split bill (even split by N — simplest version that ships reliably) ===
  function openSplitBill(o) { setSplitBillOrder(o); setSplitCount(2); }
  async function confirmEvenSplit() {
    if (!splitBillOrder) return;
    const total = splitBillOrder.billTotal;
    const n = Math.max(2, parseInt(splitCount) || 2);
    const perPerson = Math.round((total / n) * 100) / 100;
    const splits = Array.from({ length: n }, (_, i) => ({ index: i + 1, amount: perPerson, paid: false }));
    await updateDoc(doc(db, "restaurants", restaurantId, "orders", splitBillOrder.id), { billSplits: splits });
    setSplitBillOrder(null);
  }
  async function markSplitPaid(order, index) {
    const splits = (order.billSplits || []).map((s) => (s.index === index ? { ...s, paid: true } : s));
    const allPaid = splits.every((s) => s.paid);
    await updateDoc(doc(db, "restaurants", restaurantId, "orders", order.id), { billSplits: splits, ...(allPaid ? { status: "paid" } : {}) });
  }

  // === categories ===
  async function addCategory() {
    if (!newCategory.name.trim()) return alert("Give the category a name");
    if (categories.some((c) => c.name.toLowerCase() === newCategory.name.trim().toLowerCase())) return alert("That category already exists");
    await addDoc(collection(db, "restaurants", restaurantId, "categories"), { name: newCategory.name.trim(), imageUrl: newCategory.imageUrl, order: categories.length, createdAt: Date.now() });
    setNewCategory({ name: "", imageUrl: "" });
    setShowAddCategory(false);
  }
  async function deleteCategory(cat) {
    if (cat.name === COMBO_CATEGORY) return alert("The Combo Packs category can't be deleted.");
    const inUse = menuItems.some((m) => m.category === cat.name);
    if (inUse) return alert("This category still has menu items in it. Move or delete those items first.");
    if (!confirm(`Delete "${cat.name}" category?`)) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "categories", cat.id));
    if (menuTab === cat.name) setMenuTab("all");
  }
  function startEditCategory(cat) { setEditingCategoryId(cat.id); setEditCategoryForm({ name: cat.name, imageUrl: cat.imageUrl || "" }); setShowAddCategory(false); }
  async function saveEditCategory() {
    const cat = categories.find((c) => c.id === editingCategoryId);
    if (!cat) return;
    const newName = editCategoryForm.name.trim();
    if (!newName) return alert("Category name can't be empty");
    if (cat.name === COMBO_CATEGORY && newName !== COMBO_CATEGORY) return alert("Combo Packs category name can't be changed.");
    if (newName.toLowerCase() !== cat.name.toLowerCase() && categories.some((c) => c.name.toLowerCase() === newName.toLowerCase())) return alert("Another category already has that name");
    await updateDoc(doc(db, "restaurants", restaurantId, "categories", cat.id), { name: newName, imageUrl: editCategoryForm.imageUrl });
    if (newName !== cat.name) {
      const itemsToUpdate = menuItems.filter((m) => m.category === cat.name);
      await Promise.all(itemsToUpdate.map((m) => updateDoc(doc(db, "restaurants", restaurantId, "menuItems", m.id), { category: newName })));
      if (menuTab === cat.name) setMenuTab(newName);
    }
    setEditingCategoryId(null);
  }

  // === menu items ===
  async function addMenuItem() {
    if (!newItem.name || !newItem.price) return alert("Name and price are required");
    if (!newItem.category) return alert("Please choose a category (add one first if the list is empty)");
    if (!newItem.foodType) return alert("Please mark this item as Veg or Non-veg");
    await addDoc(collection(db, "restaurants", restaurantId, "menuItems"), {
      name: newItem.name, description: newItem.description, price: parseFloat(newItem.price), category: newItem.category,
      imageUrl: newItem.imageUrl, available: true, featured: false, chefSpecial: !!newItem.chefSpecial,
      foodType: newItem.foodType, isCombo: false, createdAt: Date.now(),
    });
    setNewItem({ name: "", description: "", price: "", category: newItem.category, imageUrl: "", chefSpecial: false, foodType: "veg" });
  }
  async function addCombo() {
    if (!newCombo.name || !newCombo.price) return alert("Combo name and price are required");
    await addDoc(collection(db, "restaurants", restaurantId, "menuItems"), {
      name: newCombo.name, description: newCombo.description, price: parseFloat(newCombo.price), category: COMBO_CATEGORY,
      imageUrl: newCombo.imageUrl, available: true, featured: !!newCombo.featured, chefSpecial: false,
      foodType: "veg", isCombo: true, createdAt: Date.now(),
    });
    setNewCombo({ name: "", description: "", price: "", imageUrl: "", featured: false });
    setShowAddCombo(false);
  }
  function startEdit(item) { setEditingId(item.id); setEditForm(item); }
  async function saveEdit() {
    await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", editingId), {
      name: editForm.name, description: editForm.description, price: parseFloat(editForm.price), category: editForm.category,
      imageUrl: editForm.imageUrl, featured: editForm.featured ?? false, chefSpecial: editForm.chefSpecial ?? false,
      foodType: editForm.foodType || "veg",
    });
    setEditingId(null);
  }
  async function toggleAvailable(item) { await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { available: !item.available }); }
  async function toggleFeatured(item) { await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { featured: !item.featured }); }
  async function toggleChefSpecial(item) { await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { chefSpecial: !item.chefSpecial }); }
  async function deleteItem(id) { if (!confirm("Delete this item?")) return; await deleteDoc(doc(db, "restaurants", restaurantId, "menuItems", id)); }

  // === floors & tables ===
  async function addFloor() {
    if (!newFloorName.trim()) return alert("Give the floor a name");
    await addDoc(collection(db, "restaurants", restaurantId, "floors"), { name: newFloorName.trim(), order: floors.length, createdAt: Date.now() });
    setNewFloorName("");
    setShowAddFloor(false);
  }
  async function deleteFloor(floor) {
    const inUse = tables.some((t) => t.floorId === floor.id);
    if (inUse) return alert("Move or delete tables on this floor first.");
    if (!confirm(`Delete floor "${floor.name}"?`)) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "floors", floor.id));
    if (selectedFloorId === floor.id) setSelectedFloorId(null);
  }
  async function addTable(floorId) {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
    await addDoc(collection(db, "restaurants", restaurantId, "tables"), { number: nextNumber, floorId: floorId || null, isVIP: false, createdAt: Date.now() });
  }
  async function deleteTable(id) {
    if (!confirm("Delete this table? Its QR code will stop working.")) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "tables", id));
  }
  async function toggleVip(t) { await updateDoc(doc(db, "restaurants", restaurantId, "tables", t.id), { isVIP: !t.isVIP }); }

  async function freeTable(tableNumber) {
    const activeForTable = orders.filter((o) => o.table === tableNumber && !["paid", "cancelled", "declined", "merged"].includes(o.status));
    if (activeForTable.length === 0) return alert(`Table ${tableNumber} has no active orders.`);
    if (!confirm(`Free Table ${tableNumber}? This will cancel ${activeForTable.length} active order(s).`)) return;
    const batch = writeBatch(db);
    activeForTable.forEach((o) => batch.update(doc(db, "restaurants", restaurantId, "orders", o.id), { status: "cancelled" }));
    await batch.commit();
  }

  function qrUrlFor(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}&restaurant=${restaurantId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
  }
  function printQr(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}&restaurant=${restaurantId}`;
    const imgUrl = qrUrlFor(tableNumber);
    const html = `
      <html><head><title>Table ${tableNumber} QR</title>
        <style>
          body { text-align: center; font-family: sans-serif; margin-top: 40px; color: #1a1a2e; }
          h2 { font-size: 24px; margin-bottom: 20px; }
          .qr-wrap { background: white; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          img { width: 260px; height: 260px; }
        </style>
      </head><body>
        <h2>Table ${tableNumber}</h2>
        <div class="qr-wrap"><img src="${imgUrl}" /></div>
        <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
      </body></html>`;
    const win = window.open("", "_blank", "width=420,height=520");
    win.document.write(html);
    win.document.close();
  }

  // === staff ===
  async function addStaff() {
    if (!newStaffEmail.trim()) return setStaffError("Email is required");
    if (!newStaffEmail.includes("@")) return setStaffError("Enter a valid email");
    setAddingStaff(true);
    setStaffError("");
    try {
      const emailKey = newStaffEmail.trim().toLowerCase().replace(/\./g, "_");
      const existing = await getDoc(doc(db, "staffEmails", emailKey));
      if (existing.exists()) { setStaffError("This email was already invited"); setAddingStaff(false); return; }
      await setDoc(doc(db, "staffEmails", emailKey), { restaurantId, role: newStaffRole, email: newStaffEmail.trim().toLowerCase(), invitedAt: serverTimestamp(), active: true });
      setNewStaffEmail(""); setNewStaffRole("kitchen"); setAddingStaff(false);
    } catch (err) { setStaffError(err.message); setAddingStaff(false); }
  }
  async function removeStaff(staffId, staffEmail) {
    if (!confirm("Remove this staff member? They won't be able to log in anymore.")) return;
    if (staffEmail) {
      const emailKey = staffEmail.toLowerCase().replace(/\./g, "_");
      await deleteDoc(doc(db, "staffEmails", emailKey));
    }
    await deleteDoc(doc(db, "restaurants", restaurantId, "staff", staffId));
  }

  // === BULK IMPORT FUNCTIONS ===
  function normalizeBool(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).toLowerCase().trim();
    return s === "true" || s === "yes" || s === "1" || s === "y";
  }
  function normalizeFoodType(val) {
    if (!val) return "veg";
    const s = String(val).toLowerCase().trim();
    if (s.includes("non")) return "nonveg";
    return "veg";
  }
  function cleanPrice(val) {
    if (!val) return null;
    const s = String(val).replace(/[₹,$\s]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
      rows.push(row);
    }
    return rows;
  }

  function parseImportData(text, format) {
    let rows = [];
    try {
      if (format === "json") {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        rows = parseCSV(text);
      }
    } catch (e) {
      return { error: "Invalid format. Check your CSV/JSON syntax." };
    }

    const items = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const name = row.name || row.Name || row.item || row.Item || "";
      const priceRaw = row.price || row.Price || row.price_inr || "";
      const category = row.category || row.Category || "";
      const description = row.description || row.Description || row.desc || "";
      const foodTypeRaw = row.foodtype || row.foodType || row.food_type || row.type || "veg";
      const chefSpecialRaw = row.chefspecial || row.chefSpecial || row.chef_special || row.chef || "no";
      const featuredRaw = row.featured || row.Featured || "no";
      const imageUrl = row.imageurl || row.imageUrl || row.image_url || row.image || "";

      const price = cleanPrice(priceRaw);
      if (!name.trim()) { errors.push(`Row ${idx + 1}: Name is required`); return; }
      if (price === null || price <= 0) { errors.push(`Row ${idx + 1}: Valid price is required`); return; }
      if (!category.trim()) { errors.push(`Row ${idx + 1}: Category is required`); return; }

      items.push({
        name: name.trim(),
        price,
        category: category.trim(),
        description: description.trim(),
        foodType: normalizeFoodType(foodTypeRaw),
        chefSpecial: normalizeBool(chefSpecialRaw),
        featured: normalizeBool(featuredRaw),
        imageUrl: imageUrl.trim(),
        isCombo: false,
        available: true,
      });
    });

    return { items, errors };
  }

  function buildImportPreview() {
    if (!importText.trim()) { setImportPreview(null); return; }
    const result = parseImportData(importText, importFormat);
    if (result.error) {
      setImportPreview({ error: result.error, items: [], categoriesNeeded: [], duplicates: [], valid: false });
      return;
    }

    const existingNames = new Set(menuItems.map((m) => m.name.toLowerCase()));
    const existingCategories = new Set(categories.map((c) => c.name));
    const categoriesNeeded = [];
    const duplicates = [];

    result.items.forEach((item) => {
      if (!existingCategories.has(item.category) && !categoriesNeeded.includes(item.category)) {
        categoriesNeeded.push(item.category);
      }
      if (existingNames.has(item.name.toLowerCase())) {
        duplicates.push(item.name);
      }
    });

    setImportPreview({
      items: result.items,
      errors: result.errors,
      categoriesNeeded,
      duplicates,
      valid: result.errors.length === 0,
    });
  }

  function downloadTemplate() {
    const csv = `Name,Price,Category,Description,FoodType,ChefSpecial,Featured,ImageUrl
Paneer Tikka,320,Starters,Cottage cheese marinated in spices,veg,no,no,
Butter Chicken,450,Mains,Tender chicken in rich tomato gravy,nonveg,yes,yes,
Garlic Naan,80,Breads & Rice,Soft naan brushed with garlic butter,veg,no,no,
Chocolate Lava Cake,220,Desserts,Warm cake with molten chocolate center,veg,no,yes,`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function executeImport() {
    if (!importPreview || !importPreview.valid || importPreview.items.length === 0) return;
    if (!restaurantId) return;

    setImporting(true);
    try {
      const batch = writeBatch(db);
      const menuCol = collection(db, "restaurants", restaurantId, "menuItems");
      const catCol = collection(db, "restaurants", restaurantId, "categories");

      // Create missing categories first
      const existingCats = new Set(categories.map((c) => c.name));
      const catsToCreate = importPreview.categoriesNeeded.filter((c) => !existingCats.has(c));
      const newCatIds = {};
      for (const catName of catsToCreate) {
        const ref = doc(catCol);
        batch.set(ref, { name: catName, imageUrl: "", order: categories.length + catsToCreate.indexOf(catName), createdAt: Date.now() });
        newCatIds[catName] = ref.id;
      }

      // Add menu items
      const existingNames = new Set(menuItems.map((m) => m.name.toLowerCase()));
      let imported = 0;
      for (const item of importPreview.items) {
        if (existingNames.has(item.name.toLowerCase())) continue; // skip duplicates
        const ref = doc(menuCol);
        batch.set(ref, { ...item, createdAt: Date.now() });
        imported++;
      }

      await batch.commit();

      setImporting(false);
      setShowImportModal(false);
      setImportText("");
      setImportPreview(null);
      alert(`${imported} item(s) imported successfully!${catsToCreate.length > 0 ? ` ${catsToCreate.length} new categor${catsToCreate.length === 1 ? "y" : "ies"} created.` : ""}`);
    } catch (err) {
      setImporting(false);
      alert("Import failed: " + err.message);
    }
  }

  // === ANALYTICS SUB-VIEWS ===
  function computeAnalytics(filterKey) {
    const start = filterRangeStart(filterKey);
    const inRange = orders.filter((o) => o.createdAt >= start && (o.status === "billed" || o.status === "paid"));
    const totalSales = inRange.reduce((s, o) => s + (o.billTotal || 0), 0);
    const orderCount = inRange.length;
    const avg = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

    const hourBuckets = Array(24).fill(0);
    inRange.forEach((o) => { hourBuckets[new Date(o.createdAt).getHours()]++; });
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

    const itemCounts = {};
    inRange.forEach((o) => o.items.forEach((it) => { itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty; }));
    const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return { totalSales, orderCount, avg, hourBuckets, peakHour, topItems, inRange };
  }

  function renderAnalyticsFilterBar() {
    const opts = [["today", "Today"], ["3days", "Last 3 Days"], ["week", "Last Week"], ["month", "Last Month"]];
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {opts.map(([key, label]) => (
          <button key={key} onClick={() => setAnalyticsFilter(key)}
            style={{ padding: "8px 16px", borderRadius: 100, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: analyticsFilter === key ? "#1a1a2e" : "var(--surface-2, #f3efe6)", color: analyticsFilter === key ? "#fff" : "#666" }}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  function renderSalesAnalytics() {
    const a = computeAnalytics(analyticsFilter);
    const maxBucket = Math.max(...a.hourBuckets, 1);
    return (
      <div>
        <button onClick={() => setDashboardView("main")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>← Back to dashboard</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Sales Analytics</h2>
        {renderAnalyticsFilterBar()}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard label="Total Sales" value={`₹${a.totalSales.toLocaleString()}`} color="#16a34a" />
          <StatCard label="Orders" value={a.orderCount} color="#3b82f6" />
          <StatCard label="Avg Order Value" value={`₹${a.avg}`} color="#e8a33d" />
          <StatCard label="Peak Hour" value={`${a.peakHour}:00`} color="#8b5cf6" sub="Most orders placed" />
        </div>
        <div className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Orders by Hour</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
            {a.hourBuckets.map((v, h) => (
              <div key={h} title={`${h}:00 — ${v} orders`} style={{ flex: 1, background: h === a.peakHour ? "#e8a33d" : "#f0ebe3", height: `${(v / maxBucket) * 100}%`, minHeight: 2, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 6 }}>
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </div>
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Top Selling Items</h3>
          {a.topItems.length === 0 ? <p style={{ color: "#999", fontSize: 13 }}>No sales in this period.</p> : a.topItems.map(([name, qty]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f4f4f4", fontSize: 14 }}>
              <span>{name}</span><span style={{ fontWeight: 700 }}>{qty} sold</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderOrdersHistory() {
    const start = filterRangeStart(analyticsFilter);
    const list = orders.filter((o) => o.createdAt >= start).sort((a, b) => b.createdAt - a.createdAt);
    return (
      <div>
        <button onClick={() => setDashboardView("main")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>← Back to dashboard</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Order History</h2>
        {renderAnalyticsFilterBar()}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.length === 0 && <p style={{ color: "#999" }}>No orders in this period.</p>}
          {list.map((o) => (
            <div key={o.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>Table {o.table} {o.isVIP && <span style={{ color: "#eab308" }}>★</span>}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{new Date(o.createdAt).toLocaleString()}</span>
              </div>
              {o.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                  <span>{it.name} ×{it.qty}{it.spiceLevel ? ` (${it.spiceLevel})` : ""}{it.notes ? ` — "${it.notes}"` : ""}</span>
                  <span>₹{it.price * it.qty}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #eee", fontSize: 12.5 }}>
                <span style={{ textTransform: "capitalize", color: "#888" }}>{o.status.replace("_", " ")}</span>
                {o.billTotal && <span style={{ fontWeight: 700 }}>₹{o.billTotal}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderItemsSoldAnalytics() {
    const a = computeAnalytics(analyticsFilter);
    const prevFilterMap = { today: "3days", "3days": "week", week: "month", month: "month" };
    const prior = computeAnalytics(prevFilterMap[analyticsFilter]);
    const priorCounts = {};
    prior.inRange.forEach((o) => o.items.forEach((it) => { priorCounts[it.name] = (priorCounts[it.name] || 0) + it.qty; }));
    return (
      <div>
        <button onClick={() => setDashboardView("main")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>← Back to dashboard</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Items Sold</h2>
        {renderAnalyticsFilterBar()}
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          {a.topItems.length === 0 ? <p style={{ color: "#999" }}>No items sold in this period.</p> : a.topItems.map(([name, qty]) => {
            const priorQty = priorCounts[name] || 0;
            const trend = qty - priorQty;
            return (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f4f4f4" }}>
                <span style={{ fontSize: 14 }}>{name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 700 }}>{qty}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: trend >= 0 ? "#16a34a" : "#dc2626" }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // === RENDER: DASHBOARD ===
  const renderDashboard = () => {
    if (dashboardView === "sales") return renderSalesAnalytics();
    if (dashboardView === "orders") return renderOrdersHistory();
    if (dashboardView === "items") return renderItemsSoldAnalytics();

    const currentSection = ORDER_SECTIONS.find((s) => s.key === orderFilter);
    const currentData = orderDataByKey[orderFilter] || [];

    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 2, fontFamily: "'Fraunces', serif" }}>Today at {profile?.name || "your restaurant"}</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary, #6b6b7b)", margin: 0 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 30 }}>
          <StatCard label="Today's Sales" value={`₹${todaySales.toLocaleString()}`} color="#16a34a" sub={`Avg ₹${avgOrderValue}/order`} onClick={() => { setDashboardView("sales"); setAnalyticsFilter("today"); }} />
          <StatCard label="Orders Today" value={todayOrderCount} color="#3b82f6" onClick={() => { setDashboardView("orders"); setAnalyticsFilter("today"); }} />
          <StatCard label="Items Sold" value={todayItemsSold} color="#e8a33d" onClick={() => { setDashboardView("items"); setAnalyticsFilter("today"); }} />
          <StatCard label="Needs Attention" value={pending.length + billRequested.length} color="#dc2626" sub={pending.length + billRequested.length > 0 ? "Action needed now" : "All caught up"} onClick={() => setOrderFilter(pending.length > 0 ? "pending" : "billRequested")} />
        </div>

        <div className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px 0" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Live Orders</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", margin: "3px 0 16px" }}>Every stage of service, with one-tap actions.</p>
          </div>

          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 20px 14px", borderBottom: "1px solid var(--border, #e6e1d6)" }}>
            {ORDER_SECTIONS.map((section) => {
              const count = orderDataByKey[section.key].length;
              const isActive = orderFilter === section.key;
              return (
                <button key={section.key} onClick={() => setOrderFilter(section.key)}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: isActive ? section.color : "var(--surface-2, #f3efe6)", color: isActive ? "#fff" : "var(--text-secondary, #6b6b7b)", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s ease", marginBottom: 6 }}>
                  {section.label}
                  {count > 0 && <span style={{ background: isActive ? "rgba(255,255,255,0.25)" : section.color + "22", color: isActive ? "#fff" : section.color, padding: "1px 8px", borderRadius: 100, fontSize: 11.5, fontWeight: 800 }}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ padding: 20 }}>
            {currentData.length === 0 ? (
              <div style={{ padding: 44, textAlign: "center", color: "var(--text-secondary, #6b6b7b)" }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>{currentSection.emptyIcon}</div>
                <p style={{ margin: 0, fontSize: 14 }}>{currentSection.emptyMsg}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {orderFilter === "pending" && currentData.map((o) => (
                  <OrderCard key={o.id} order={o}>
                    <button className="btn btn-sm btn-danger" onClick={() => declineOrder(o.id)} style={{ flex: 1 }}>Decline</button>
                    <button className="btn btn-sm btn-primary" onClick={() => confirmOrder(o.id)} style={{ flex: 1 }}>Confirm → Kitchen</button>
                  </OrderCard>
                ))}
                {orderFilter === "active" && currentData.map((o) => (
                  <OrderCard key={o.id} order={o}>
                    {o.status === "ready" ? (
                      <button className="btn btn-sm btn-success" onClick={() => markServed(o.id)} style={{ width: "100%" }}>Mark as Served</button>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-secondary, #6b6b7b)", width: "100%", textAlign: "center" }}>Managed from the kitchen screen</div>
                    )}
                  </OrderCard>
                ))}
                {orderFilter === "served" && currentData.map((o) => <OrderCard key={o.id} order={o} />)}
                {orderFilter === "billRequested" && currentData.map((o) => (
                  <OrderCard key={o.id} order={o}>
                    <button className="btn btn-sm btn-primary" onClick={() => generateBill(o, false)} style={{ flex: 1 }}>Generate Bill</button>
                    {billing.upiId && <button className="btn btn-sm btn-ghost" onClick={() => generateBill(o, true)} style={{ flex: 1 }}>Bill + QR</button>}
                  </OrderCard>
                ))}
                {orderFilter === "billed" && currentData.map((o) => (
                  <div key={o.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontWeight: 700 }}>Table {o.table}</span>
                      <span className="badge badge-billed">billed</span>
                    </div>
                    {o.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" }}>
                        <span>{it.name} ×{it.qty}</span><span>₹{it.price * it.qty}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px dashed var(--border, #e6e1d6)", marginTop: 10, paddingTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}><span>Total</span><span>₹{o.billTotal}</span></div>
                    </div>

                    {o.billSplits && o.billSplits.length > 0 ? (
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        {o.billSplits.map((s) => (
                          <div key={s.index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-2, #f3efe6)", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
                            <span>Guest {s.index} · ₹{s.amount}</span>
                            {s.paid ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Paid ✓</span> : <button className="btn btn-sm btn-success" onClick={() => markSplitPaid(o, s.index)}>Mark Paid</button>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => printBill(o)} style={{ flex: 1 }}>Print</button>
                        {features.splitBill && <button className="btn btn-sm btn-ghost" onClick={() => openSplitBill(o)} style={{ flex: 1 }}>Split Bill</button>}
                        <button className="btn btn-sm btn-success" onClick={() => markPaid(o.id)} style={{ flex: 1 }}>Mark Paid</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // === RENDER: MENU ===
  const filteredCategoryItems = menuItems.filter((m) => {
    const matchesTab = menuTab === "all" || m.category === menuTab;
    const matchesSearch = !menuSearch.trim() || m.name.toLowerCase().includes(menuSearch.trim().toLowerCase()) || (m.description || "").toLowerCase().includes(menuSearch.trim().toLowerCase());
    return matchesTab && matchesSearch;
  });

  const renderMenu = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif" }}>Menu</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setShowAddItem((s) => !s); setShowAddCombo(false); setShowAddCategory(false); setShowImportModal(false); }}>{showAddItem ? "Close" : "+ Add Item"}</button>
          {features.combos && <button className="btn btn-ghost" onClick={() => { setShowAddCombo((s) => !s); setShowAddItem(false); setShowAddCategory(false); setShowImportModal(false); }}>{showAddCombo ? "Close" : "+ Add Combo"}</button>}
          <button className="btn btn-ghost" onClick={() => { setShowAddCategory((s) => !s); setShowAddItem(false); setShowAddCombo(false); setShowImportModal(false); }}>{showAddCategory ? "Close" : "+ Add Category"}</button>
          <button className="btn btn-primary" onClick={() => { setShowImportModal(true); setShowAddItem(false); setShowAddCombo(false); setShowAddCategory(false); }}>↑ Import Menu</button>
        </div>
      </div>

      {/* BULK IMPORT MODAL */}
      {showImportModal && (
        <div className="card" style={{ padding: 24, borderRadius: 16, marginBottom: 24, border: "2px dashed #1a1a2e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Import Menu</h3>
            <button onClick={() => { setShowImportModal(false); setImportText(""); setImportPreview(null); }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => setImportFormat("csv")} style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: importFormat === "csv" ? "#1a1a2e" : "#f3efe6", color: importFormat === "csv" ? "#fff" : "#666" }}>CSV</button>
            <button onClick={() => setImportFormat("json")} style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: importFormat === "json" ? "#1a1a2e" : "#f3efe6", color: importFormat === "json" ? "#fff" : "#666" }}>JSON</button>
            <button onClick={downloadTemplate} className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>↓ Download Template</button>
          </div>

          <p style={{ fontSize: 12.5, color: "#6b6b7b", marginBottom: 12 }}>
            {importFormat === "csv"
              ? "Paste CSV text below. Columns: Name, Price, Category, Description, FoodType, ChefSpecial, Featured, ImageUrl"
              : "Paste JSON array below. Each object needs: name, price, category. Optional: description, foodType, chefSpecial, featured, imageUrl"}
          </p>

          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportPreview(null); }}
            placeholder={importFormat === "csv"
              ? `Name,Price,Category,Description,FoodType,ChefSpecial,Featured,ImageUrl\nPaneer Tikka,320,Starters,Marinated cottage cheese,veg,no,no,`
              : `[\n  {\n    "name": "Paneer Tikka",\n    "price": 320,\n    "category": "Starters",\n    "description": "Marinated cottage cheese",\n    "foodType": "veg",\n    "chefSpecial": false,\n    "featured": false\n  }\n]`}
            style={{ width: "100%", minHeight: 160, padding: 14, borderRadius: 10, border: "1px solid #e6e1d6", fontSize: 13, fontFamily: "monospace", resize: "vertical", marginBottom: 12, boxSizing: "border-box" }}
          />

          <button onClick={buildImportPreview} className="btn btn-primary" style={{ marginBottom: 16 }} disabled={!importText.trim()}>
            Preview Import
          </button>

          {/* PREVIEW SECTION */}
          {importPreview && (
            <div style={{ marginBottom: 16 }}>
              {importPreview.error && (
                <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  {importPreview.error}
                </div>
              )}

              {importPreview.errors.length > 0 && (
                <div style={{ background: "#fffbeb", color: "#92400e", padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 12 }}>
                  <strong>Validation Issues ({importPreview.errors.length}):</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {importPreview.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {importPreview.valid && (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      <span style={{ color: "#16a34a" }}>{importPreview.items.length}</span> items ready
                    </div>
                    {importPreview.duplicates.length > 0 && (
                      <div style={{ fontSize: 13, color: "#92400e" }}>
                        <span style={{ fontWeight: 700 }}>{importPreview.duplicates.length}</span> duplicates will be skipped
                      </div>
                    )}
                    {importPreview.categoriesNeeded.length > 0 && (
                      <div style={{ fontSize: 13, color: "#3b82f6" }}>
                        <span style={{ fontWeight: 700 }}>{importPreview.categoriesNeeded.length}</span> new categor{importPreview.categoriesNeeded.length === 1 ? "y" : "ies"} to create
                      </div>
                    )}
                  </div>

                  {importPreview.categoriesNeeded.length > 0 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 10, background: "#eff6ff", borderRadius: 8 }}>
                      <input type="checkbox" checked={autoCreateCategories} onChange={(e) => setAutoCreateCategories(e.target.checked)} />
                      Auto-create missing categories: {importPreview.categoriesNeeded.join(", ")}
                    </label>
                  )}

                  {!autoCreateCategories && importPreview.categoriesNeeded.length > 0 && (
                    <div style={{ background: "#fef2f2", color: "#dc2626", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                      ⚠️ Cannot import without creating these categories first. Either enable auto-create or add them manually.
                    </div>
                  )}

                  <div className="card" style={{ padding: 16, borderRadius: 12, marginBottom: 12, maxHeight: 240, overflow: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e6e1d6", textAlign: "left" }}>
                          <th style={{ padding: "6px 8px" }}>Name</th>
                          <th style={{ padding: "6px 8px" }}>Price</th>
                          <th style={{ padding: "6px 8px" }}>Category</th>
                          <th style={{ padding: "6px 8px" }}>Type</th>
                          <th style={{ padding: "6px 8px" }}>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.items.slice(0, 10).map((item, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f4f4f4" }}>
                            <td style={{ padding: "6px 8px" }}>{item.name}</td>
                            <td style={{ padding: "6px 8px" }}>₹{item.price}</td>
                            <td style={{ padding: "6px 8px" }}>{item.category}</td>
                            <td style={{ padding: "6px 8px" }}>
                              <span style={{ color: item.foodType === "nonveg" ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{item.foodType}</span>
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {item.chefSpecial && <span style={{ fontSize: 10, background: "#1a1a2e", color: "#fff", padding: "2px 6px", borderRadius: 4, marginRight: 4 }}>CS</span>}
                              {item.featured && <span style={{ fontSize: 10, background: "#e8a33d", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>★</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.items.length > 10 && (
                      <p style={{ fontSize: 11, color: "#888", margin: "8px 0 0", textAlign: "center" }}>...and {importPreview.items.length - 10} more</p>
                    )}
                  </div>

                  <button
                    onClick={executeImport}
                    disabled={importing || (importPreview.categoriesNeeded.length > 0 && !autoCreateCategories)}
                    className="btn btn-primary"
                    style={{ width: "100%", opacity: importing || (importPreview.categoriesNeeded.length > 0 && !autoCreateCategories) ? 0.5 : 1 }}
                  >
                    {importing ? "Importing..." : `Import ${importPreview.items.length - importPreview.duplicates.length} Items`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showAddCombo && (
        <div className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 20, border: "2px dashed #1a1a2e" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>New Combo Pack</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
            <div><label style={labelStyle}>Combo Name</label><input placeholder="e.g. Family Feast" value={newCombo.name} onChange={(e) => setNewCombo((p) => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Price (₹)</label><input type="number" value={newCombo.price} onChange={(e) => setNewCombo((p) => ({ ...p, price: e.target.value }))} style={inputStyle} /></div>
          </div>
          <label style={labelStyle}>Description</label>
          <input placeholder="What's included in the combo" value={newCombo.description} onChange={(e) => setNewCombo((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Photo</label>
          <input ref={comboFileInputRef} type="file" accept="image/*" onChange={(e) => handleComboImageUpload(e.target.files[0])} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => comboFileInputRef.current?.click()} disabled={comboUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{comboUploading ? "Uploading..." : "Choose Photo"}</button>
            {newCombo.imageUrl && !comboUploading && <img src={newCombo.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
            <input type="checkbox" checked={!!newCombo.featured} onChange={(e) => setNewCombo((p) => ({ ...p, featured: e.target.checked }))} /> Show in Featured box
          </label>
          <button className="btn btn-primary" onClick={addCombo}>+ Add Combo</button>
        </div>
      )}

      {showAddCategory && (
        <div className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 20, border: "2px dashed var(--border, #e6e1d6)" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>New Category</h3>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Category Name</label>
              <input placeholder="e.g. Tandoor Specials" value={newCategory.name} onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <div>
              <label style={labelStyle}>Icon Photo</label>
              <input ref={categoryFileInputRef} type="file" accept="image/*" onChange={(e) => handleCategoryImageUpload(e.target.files[0])} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => categoryFileInputRef.current?.click()} disabled={categoryUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{categoryUploading ? "..." : "Upload"}</button>
                {newCategory.imageUrl && !categoryUploading && <img src={newCategory.imageUrl} alt="" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />}
              </div>
            </div>
            <button className="btn btn-primary" onClick={addCategory}>Add Category</button>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE ADD NEW ITEM */}
      {showAddItem && (
        <div className="card" style={{ padding: 22, borderRadius: 18, marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Add New Item</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
            <div><label style={labelStyle}>Name</label><input placeholder="e.g. Paneer Tikka" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Price (₹)</label><input placeholder="0" type="number" value={newItem.price} onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))} style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
                {categories.length === 0 && <option value="">Add a category first</option>}
                {categories.filter((c) => c.name !== COMBO_CATEGORY).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label style={labelStyle}>Food Type *</label>
          <FoodTypeToggle value={newItem.foodType} onChange={(v) => setNewItem((p) => ({ ...p, foodType: v }))} />

          <label style={labelStyle}>Food Photo</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], false)} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{uploadingImage ? "Uploading..." : "Choose Photo"}</button>
            {newItem.imageUrl && !uploadingImage && <img src={newItem.imageUrl} alt="Preview" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />}
          </div>

          <label style={labelStyle}>Description</label>
          <input placeholder="Short, appetising description (optional)" value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
            <input type="checkbox" checked={!!newItem.chefSpecial} onChange={(e) => setNewItem((p) => ({ ...p, chefSpecial: e.target.checked }))} /> Mark as Chef's Special
          </label>

          <button className="btn btn-primary" onClick={addMenuItem}>+ Add Item to Menu</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 220 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔎</span>
          <input placeholder="Search the menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} style={{ ...inputStyle, marginBottom: 0, paddingLeft: 38 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 22 }}>
        <button onClick={() => setMenuTab("all")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 68, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: menuTab === "all" ? "#1a1a2e" : "var(--surface-2, #f3efe6)", color: menuTab === "all" ? "#fff" : "var(--text-secondary, #6b6b7b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: menuTab === "all" ? "2px solid #1a1a2e" : "2px solid transparent" }}>🍴</div>
          <span style={{ fontSize: 11.5, fontWeight: menuTab === "all" ? 800 : 600, color: menuTab === "all" ? "var(--text, #1a1a2e)" : "var(--text-secondary, #6b6b7b)" }}>All</span>
        </button>
        {categories.map((cat) => {
          const isActive = menuTab === cat.name;
          const count = menuItems.filter((m) => m.category === cat.name).length;
          return (
            <div key={cat.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 68, flexShrink: 0, position: "relative", paddingTop: 4 }}>
              <div style={{ position: "relative" }}>
                <button onClick={() => setMenuTab(cat.name)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", background: isActive ? "#e8a33d" : "var(--surface-2, #f3efe6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: isActive ? "2px solid #e8a33d" : "2px solid var(--border, #e6e1d6)" }}>
                    {cat.imageUrl ? <img src={cat.imageUrl} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🍽️"}
                  </div>
                </button>
                {cat.name !== COMBO_CATEGORY && (
                  <>
                    <button onClick={() => startEditCategory(cat)} title="Edit category" style={{ position: "absolute", top: -4, left: -4, width: 19, height: 19, borderRadius: "50%", background: "#1a1a2e", color: "#fff", border: "2px solid var(--surface, #fff)", fontSize: 9.5, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                    <button onClick={() => deleteCategory(cat)} title="Delete category" style={{ position: "absolute", top: -4, right: -4, width: 19, height: 19, borderRadius: "50%", background: "var(--danger, #dc2626)", color: "#fff", border: "2px solid var(--surface, #fff)", fontSize: 10, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </>
                )}
              </div>
              <span onClick={() => setMenuTab(cat.name)} style={{ fontSize: 11.5, fontWeight: isActive ? 800 : 600, color: isActive ? "var(--text, #1a1a2e)" : "var(--text-secondary, #6b6b7b)", cursor: "pointer", whiteSpace: "nowrap" }}>{cat.name}{count > 0 ? ` (${count})` : ""}</span>
            </div>
          );
        })}
      </div>

      {editingCategoryId && (
        <div className="card" style={{ padding: 20, marginBottom: 22, border: "2px dashed #e8a33d" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Edit Category</h3>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}><label style={labelStyle}>Category Name</label><input className="to-input" value={editCategoryForm.name} onChange={(e) => setEditCategoryForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div>
              <label style={labelStyle}>Icon Photo</label>
              <input ref={editCategoryFileInputRef} type="file" accept="image/*" onChange={(e) => handleEditCategoryImageUpload(e.target.files[0])} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => editCategoryFileInputRef.current?.click()} disabled={editCategoryUploading} className="btn btn-ghost btn-sm">{editCategoryUploading ? "..." : "Change"}</button>
                {editCategoryForm.imageUrl && !editCategoryUploading && <img src={editCategoryForm.imageUrl} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveEditCategory}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingCategoryId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {filteredCategoryItems.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary, #6b6b7b)", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
          <p style={{ margin: 0 }}>{menuSearch ? "No dishes match your search." : "No items in this category yet."}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
          {filteredCategoryItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              isEditing={editingId === item.id}
              editForm={editForm}
              setEditForm={setEditForm}
              editUploading={editUploading}
              editFileInputRef={editFileInputRef}
              handleImageUpload={handleImageUpload}
              categories={categories}
              saveEdit={saveEdit}
              cancelEdit={() => setEditingId(null)}
              toggleAvailable={toggleAvailable}
              toggleFeatured={toggleFeatured}
              toggleChefSpecial={toggleChefSpecial}
              startEdit={startEdit}
              deleteItem={deleteItem}
            />
          ))}
        </div>
      )}
    </div>
  );

    // === RENDER: TABLES ===
  const renderTables = () => {
    const useFloors = features.floors && floors.length > 0;
    const floorsToShow = useFloors ? floors : [{ id: null, name: "All Tables" }];

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif" }}>Tables & QR Codes</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary, #6b6b7b)", margin: "4px 0 0" }}>Print a code for each table — guests scan to open the menu.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {features.floors && <button className="btn btn-ghost" onClick={() => setShowAddFloor((s) => !s)}>{showAddFloor ? "Close" : "+ Add Floor"}</button>}
            <button className="btn btn-primary" onClick={() => addTable(null)}>+ Add Table</button>
          </div>
        </div>

        {showAddFloor && (
          <div className="card" style={{ padding: 18, borderRadius: 14, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end", border: "2px dashed var(--border, #e6e1d6)" }}>
            <div style={{ flex: 1, maxWidth: 260 }}>
              <label style={labelStyle}>Floor Name</label>
              <input placeholder="e.g. Ground Floor, Rooftop" value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <button className="btn btn-primary" onClick={addFloor}>Add Floor</button>
          </div>
        )}

        {tables.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary, #6b6b7b)", borderRadius: 16 }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🪑</div>
            <p style={{ margin: 0 }}>No tables yet — add one to generate its QR code.</p>
          </div>
        ) : (
          floorsToShow.map((floor) => {
            const floorTables = useFloors ? tables.filter((t) => t.floorId === floor.id) : tables;
            return (
              <div key={floor.id || "none"} style={{ marginBottom: 32 }}>
                {useFloors && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{floor.name}</h3>
                    <button className="btn btn-sm btn-ghost" onClick={() => addTable(floor.id)}>+ Table here</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => deleteFloor(floor)} style={{ color: "#dc2626" }}>Delete Floor</button>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 }}>
                  {floorTables.map((t) => {
                    const activeCount = orders.filter((o) => o.table === t.number && !["paid", "cancelled", "declined", "merged"].includes(o.status)).length;
                    return (
                      <div key={t.id} className="card" style={{ borderRadius: 18, overflow: "hidden", border: t.isVIP ? "2px solid #eab308" : undefined }}>
                        <div style={{ background: "#1a1a2e", color: "#fff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>Table {t.number} {t.isVIP && <span style={{ color: "#eab308" }}>★</span>}</span>
                          <span style={{ fontSize: 11, background: activeCount > 0 ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.15)", padding: "3px 9px", borderRadius: 100, fontWeight: 700 }}>{activeCount > 0 ? `${activeCount} ACTIVE` : "FREE"}</span>
                        </div>
                        <div style={{ padding: 20, textAlign: "center" }}>
                          {siteUrl && (
                            <div style={{ background: "#fff", padding: 12, borderRadius: 14, display: "inline-block", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                              <img src={qrUrlFor(t.number)} alt={`QR table ${t.number}`} style={{ width: 140, height: 140, display: "block" }} />
                            </div>
                          )}
                          {features.vipTables && (
                            <button onClick={() => toggleVip(t)} className="btn btn-sm" style={{ width: "100%", marginTop: 14, background: t.isVIP ? "#fef3c7" : "var(--surface-2, #f3efe6)", color: t.isVIP ? "#92400e" : "#888", border: "none" }}>
                              {t.isVIP ? "★ VIP Table" : "Mark as VIP"}
                            </button>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => printQr(t.number)} style={{ flex: 1 }}>Print</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => deleteTable(t.id)} style={{ flex: 1, color: "var(--danger, #dc2626)" }}>Delete</button>
                          </div>
                          {activeCount > 0 && (
                            <button onClick={() => freeTable(t.number)} className="btn btn-sm" style={{ width: "100%", marginTop: 8, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                              Free Table ({activeCount} active order{activeCount > 1 ? "s" : ""})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // === RENDER: SETTINGS ===
  const renderSettings = () => (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, fontFamily: "'Fraunces', serif" }}>Settings</h2>

      {/* Flat full-width logo box (replaces old circular-logo header) */}
      <div className="card" style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}>
        <div style={{
          height: 180, position: "relative",
          background: profileForm.logoUrl ? `url(${profileForm.logoUrl}) center/cover` : "linear-gradient(135deg, #1a1a2e, #3a3a5e)",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 40%, rgba(0,0,0,0.75))", display: "flex", alignItems: "flex-end", padding: 24 }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, fontFamily: "'Fraunces', serif" }}>{profileForm.name || "Your Restaurant"}</h3>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{profileForm.tagline || "Add a tagline to introduce your place"}</p>
            </div>
          </div>
        </div>
        <div style={{ padding: 28, maxWidth: 480, margin: "0 auto" }}>
          <label style={labelStyle}>Restaurant Name</label>
          <input value={profileForm.name || ""} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Tagline / Slogan</label>
          <input value={profileForm.tagline || ""} onChange={(e) => setProfileForm((p) => ({ ...p, tagline: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Address</label>
          <input value={profileForm.address || ""} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} style={inputStyle} />

          <label style={labelStyle}>Logo / Banner Image</label>
          <input ref={logoFileInputRef} type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files[0])} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => logoFileInputRef.current?.click()} disabled={logoUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{logoUploading ? "Uploading..." : "Upload Image"}</button>
          </div>

          <button className="btn btn-primary" onClick={saveProfile} style={{ width: "100%" }}>{savedMsg ? "Saved ✓" : "Save Profile"}</button>
        </div>
      </div>

      {/* Billing + Staff side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24, borderRadius: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Billing Settings</h3>
          <label style={labelStyle}>Tax / GST %</label>
          <input type="number" value={billingForm.taxPercent} onChange={(e) => setBillingForm((p) => ({ ...p, taxPercent: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Service Charge %</label>
          <input type="number" value={billingForm.servicePercent} onChange={(e) => setBillingForm((p) => ({ ...p, servicePercent: e.target.value }))} style={inputStyle} />
          {features.upiQr && (
            <>
              <label style={labelStyle}>UPI ID (for payment QR)</label>
              <input placeholder="yourhotel@upi" value={billingForm.upiId || ""} onChange={(e) => setBillingForm((p) => ({ ...p, upiId: e.target.value }))} style={inputStyle} />
            </>
          )}
          <button className="btn btn-primary" onClick={saveBilling}>{billingSaved ? "Saved ✓" : "Save Billing Settings"}</button>
        </div>

        <div className="card" style={{ padding: 24, borderRadius: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Staff Management</h3>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", marginBottom: 16 }}>Invite staff by email. They sign in with Google and are linked to your restaurant automatically.</p>

          {staffError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{staffError}</div>}

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="staff@example.com" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={labelStyle}>Role</label>
              <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }}>
                <option value="kitchen">Kitchen</option>
                <option value="reception">Reception</option>
              </select>
            </div>
            <button onClick={addStaff} disabled={addingStaff} className="btn btn-primary" style={{ padding: "11px 20px", opacity: addingStaff ? 0.6 : 1 }}>{addingStaff ? "..." : "Invite"}</button>
          </div>

          {staffList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {staffList.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surface-2, #f3efe6)", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name || s.email}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary, #6b6b7b)", textTransform: "capitalize" }}>{s.role}</div>
                  </div>
                  <button onClick={() => removeStaff(s.id, s.email)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 4 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Promo banner — shown at bottom of customer table page */}
      {features.promoBanner && (
        <div className="card" style={{ padding: 24, borderRadius: 18, maxWidth: 460 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Exclusive Deal Banner</h3>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", marginBottom: 16 }}>Shown at the bottom of the customer menu. Optionally link it to a menu item/combo so tapping it adds that item to the cart.</p>
          <label style={labelStyle}>Banner Title</label>
          <input placeholder="e.g. 30% off combos this week" value={promoForm.title} onChange={(e) => setPromoForm((p) => ({ ...p, title: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Banner Image</label>
          <input ref={promoFileInputRef} type="file" accept="image/*" onChange={(e) => handlePromoImageUpload(e.target.files[0])} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => promoFileInputRef.current?.click()} disabled={promoUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>{promoUploading ? "Uploading..." : "Upload Photo"}</button>
            {promoForm.imageUrl && !promoUploading && <img src={promoForm.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />}
          </div>
          <label style={labelStyle}>Link to item/combo (optional)</label>
          <select value={promoForm.linkedItemId} onChange={(e) => setPromoForm((p) => ({ ...p, linkedItemId: e.target.value }))} style={inputStyle}>
            <option value="">No link — image only</option>
            {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={savePromoBanner}>{promoSaved ? "Saved ✓" : "Save Banner"}</button>
        </div>
      )}
    </div>
  );

  // === SPLASH ===
  const renderSplash = () => (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "linear-gradient(135deg, #1a1a2e 0%, #241f3d 55%, #2d1b1b 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: splashLeaving ? 0 : 1, transition: "opacity 0.5s ease" }} onClick={dismissSplash}>
      <div style={{ animation: "splashPop 0.9s cubic-bezier(0.22, 1, 0.36, 1)", textAlign: "center", padding: 20 }}>
        {profile?.logoUrl && <img src={profile.logoUrl} alt="" style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "cover", margin: "0 auto 20px", display: "block", border: "3px solid rgba(232,163,61,0.6)", animation: "splashGlow 2.2s ease-in-out infinite" }} />}
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: isMobile ? 30 : 44, fontWeight: 700, color: "#fff", letterSpacing: 0.5, animation: "splashLetters 1s ease" }}>{profile?.name || "Table Order"}</div>
        <div style={{ width: 46, height: 2, background: "#e8a33d", margin: "16px auto", animation: "splashLine 0.9s ease 0.3s both" }} />
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", animation: "splashFade 1s ease 0.5s both" }}>Powered by Table Order</div>
      </div>
    </div>
  );

  // === floor picker modal ===
  const floorPickerModal = showFloorPicker && floors.length > 1 && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 360, width: "90%", textAlign: "center" }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Which floor are you working today?</h3>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 18 }}>You can switch anytime from the Tables tab.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {floors.map((f) => (
            <button key={f.id} onClick={() => { setSelectedFloorId(f.id); setActiveTab("tables"); setShowFloorPicker(false); }} className="btn btn-ghost" style={{ padding: 14 }}>{f.name}</button>
          ))}
          <button onClick={() => setShowFloorPicker(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 13, marginTop: 8, cursor: "pointer" }}>Skip — show all floors</button>
        </div>
      </div>
    </div>
  );

  // === split bill modal ===
  const splitBillModal = splitBillOrder && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSplitBillOrder(null)}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 340, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Split Bill — Table {splitBillOrder.table}</h3>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Splits the ₹{splitBillOrder.billTotal} total evenly. Each guest gets their own "Mark Paid" — the table frees once everyone's paid.</p>
        <label style={labelStyle}>Number of guests</label>
        <input type="number" min={2} value={splitCount} onChange={(e) => setSplitCount(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>≈ ₹{Math.round((splitBillOrder.billTotal / Math.max(2, parseInt(splitCount) || 2)) * 100) / 100} per person</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setSplitBillOrder(null)} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-primary" onClick={confirmEvenSplit} style={{ flex: 1 }}>Split</button>
        </div>
      </div>
    </div>
  );

  // === RETURN ===
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes riseIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splashPop { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
        @keyframes splashGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(232,163,61,0.35); } 50% { box-shadow: 0 0 0 14px rgba(232,163,61,0); } }
        @keyframes splashLetters { from { opacity: 0; letter-spacing: 6px; } to { opacity: 1; letter-spacing: 0.5px; } }
        @keyframes splashLine { from { width: 0; } to { width: 46px; } }
        @keyframes splashFade { from { opacity: 0; } to { opacity: 1; } }

        .card { background: var(--surface, #ffffff) !important; border: 1px solid var(--border, #e6e1d6) !important; box-shadow: 0 1px 3px rgba(20,20,30,0.05), 0 1px 2px rgba(20,20,30,0.03) !important; border-radius: 14px; }
        .btn { font-family: inherit !important; font-weight: 700 !important; border-radius: 10px !important; cursor: pointer !important; border: none !important; padding: 11px 20px !important; font-size: 14px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease !important; line-height: 1.2 !important; }
        .btn:hover { transform: translateY(-1px); filter: brightness(1.04); }
        .btn:active { transform: translateY(0); filter: brightness(0.98); }
        .btn-sm { padding: 8px 14px !important; font-size: 13px !important; border-radius: 8px !important; }
        .btn-primary { background: #e8a33d !important; color: #ffffff !important; box-shadow: 0 2px 6px rgba(232,163,61,0.35) !important; }
        .btn-danger { background: #fef2f2 !important; color: #dc2626 !important; }
        .btn-success { background: #16a34a !important; color: #ffffff !important; box-shadow: 0 2px 6px rgba(22,163,74,0.3) !important; }
        .btn-ghost { background: var(--surface-2, #f3efe6) !important; color: var(--text-secondary, #6b6b7b) !important; border: 1px solid var(--border, #e6e1d6) !important; }
        .badge { display: inline-flex !important; align-items: center !important; padding: 3px 10px !important; border-radius: 100px !important; font-size: 11.5px !important; font-weight: 700 !important; background: var(--surface-2, #f3efe6) !important; color: var(--text-secondary, #6b6b7b) !important; }
        .badge-billed { background: #ede9fe !important; color: #6d28d9 !important; }
        .to-input { width: 100%; box-sizing: border-box; padding: 11px 14px; border: 1px solid var(--border, #e6e1d6); border-radius: 10px; font-size: 14px; background: var(--surface, #ffffff); font-family: inherit; color: var(--text, #1a1a2e); }
        .to-input:focus, select:focus, input:focus { outline: none; border-color: #e8a33d; box-shadow: 0 0 0 3px rgba(232,163,61,0.15); }
      `}</style>

      {showSplash && renderSplash()}
      {floorPickerModal}
      {splitBillModal}

      {isMobile && sidebarOpen && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} onClick={() => setSidebarOpen(false)} />}

      <aside className="no-print" style={{
        width: isMobile ? 260 : (sidebarCollapsed ? 78 : 260), background: "#1a1a2e", color: "#fff", position: "fixed", left: 0, top: 0, bottom: 0,
        overflowY: "auto", overflowX: "hidden", zIndex: 100, display: "flex", flexDirection: "column",
        transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)", transition: "transform 0.3s ease, width 0.22s ease",
      }}>
        <div style={{ padding: sidebarCollapsed && !isMobile ? "22px 14px" : "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
            {profile?.logoUrl ? <img src={profile.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 30, height: 30, borderRadius: 9, background: "#5B9BD5", flexShrink: 0 }} />}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.name || "Your Restaurant"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Reception Desk</div>
              </div>
            )}
          </div>
          {!isMobile && (
            <button onClick={() => setSidebarCollapsed((c) => !c)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.7)", width: 26, height: 26, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{sidebarCollapsed ? "»" : "«"}</button>
          )}
        </div>
        <nav style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setDashboardView("main"); if (isMobile) setSidebarOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: sidebarCollapsed && !isMobile ? "12px 0" : "12px 16px", justifyContent: sidebarCollapsed && !isMobile ? "center" : "flex-start", borderRadius: 10, border: "none", background: activeTab === tab.id ? "rgba(91,155,213,0.18)" : "transparent", color: activeTab === tab.id ? "#5B9BD5" : "rgba(255,255,255,0.75)", fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s ease", position: "relative" }}>
              {(!sidebarCollapsed || isMobile) ? tab.label : tab.label.charAt(0)}
              {tab.id === "dashboard" && (pending.length + billRequested.length > 0) && (
                <span style={{ marginLeft: sidebarCollapsed && !isMobile ? 0 : "auto", position: sidebarCollapsed && !isMobile ? "absolute" : "static", top: sidebarCollapsed && !isMobile ? 6 : "auto", right: sidebarCollapsed && !isMobile ? 10 : "auto", background: "#dc2626", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 100 }}>{pending.length + billRequested.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{ padding: sidebarCollapsed && !isMobile ? "16px 0" : 20, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11.5, color: "rgba(255,255,255,0.4)", textAlign: sidebarCollapsed && !isMobile ? "center" : "left" }}>
          {sidebarCollapsed && !isMobile ? "T.O." : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span>Powered by Table Order</span>
              <button onClick={logout} style={{ background: "rgba(220,38,38,0.15)", border: "none", color: "#fca5a5", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%" }}>Logout {role ? `(${role})` : ""}</button>
            </div>
          )}
        </div>
      </aside>

      <main style={{ marginLeft: isMobile ? 0 : (sidebarCollapsed ? 78 : 260), flex: 1, background: "var(--bg, #faf8f2)", minHeight: "100vh", width: "100%", transition: "margin-left 0.22s ease" }}>
        {isMobile && (
          <div className="no-print" style={{ padding: "16px 20px", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>☰</button>
            <span style={{ fontWeight: 700 }}>{TABS.find((t) => t.id === activeTab)?.label}</span>
          </div>
        )}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "20px" : "32px" }}>
          {activeTab === "dashboard" && renderDashboard()}
          {activeTab === "menu" && renderMenu()}
          {activeTab === "tables" && renderTables()}
          {activeTab === "settings" && renderSettings()}
        </div>
      </main>
    </div>
  );
}