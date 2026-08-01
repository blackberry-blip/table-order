"use client";

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { playNotificationSound, requestNotificationPermission, showPopupNotification } from "@/lib/notifications";
import { AuthGuard } from "@/lib/auth-guard";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
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
  getDocs,
  getDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";

const DEFAULT_CATEGORIES = ["Starters", "Mains", "Breads & Rice", "Continental", "Beverages", "Desserts"];

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

export default function ReceptionPageWrapper() {
  return (
    <AuthGuard allowedRoles={["reception"]}>
      <ReceptionPage />
    </AuthGuard>
  );
}

function ReceptionPage() {
  const { role, logout, restaurantId } = useAuth();
  const router = useRouter();

  const TABS = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "menu", label: "Menu", icon: "🍽️" },
    { id: "tables", label: "Tables", icon: "🪑" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  // === ALL useState declarations FIRST ===
  const [activeTab, setActiveTab] = useState("dashboard");
  const [orderFilter, setOrderFilter] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState({ name: "", tagline: "", logoUrl: "", address: "" });
  const [profileForm, setProfileForm] = useState({ name: "", tagline: "", logoUrl: "", address: "" });
  const [savedMsg, setSavedMsg] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "", category: "", imageUrl: "", chefSpecial: false });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [billing, setBilling] = useState({ taxPercent: 5, servicePercent: 0 });
  const [billingForm, setBillingForm] = useState({ taxPercent: 5, servicePercent: 0 });
  const [billingSaved, setBillingSaved] = useState(false);
  const [tables, setTables] = useState([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastPendingCount, setLastPendingCount] = useState(0);
  const [lastBillCount, setLastBillCount] = useState(0);
  const [notifPermission, setNotifPermission] = useState(false);
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
  const editCategoryFileInputRef = useRef(null);
  const [showSplash, setShowSplash] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);
  const logoFileInputRef = useRef(null);
  const categoryFileInputRef = useRef(null);
  const seededCategories = useRef(false);

  // Staff management states
  const [staffList, setStaffList] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("kitchen");
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState("");

  // === SPLASH ANIMATION (shows on every load/refresh) ===
  useEffect(() => {
    setShowSplash(true);
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    const leaveTimer = setTimeout(() => setSplashLeaving(true), 1900);
    const hideTimer = setTimeout(() => setShowSplash(false), 2450);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
  }, [showSplash]);

  function dismissSplash() {
    setSplashLeaving(true);
    setTimeout(() => setShowSplash(false), 400);
  }

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

  // Listen to restaurant-specific collections
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "orders"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "profile"), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
        setProfileForm(snap.data());
      }
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId, "info", "billing"), (snap) => {
      if (snap.exists()) {
        setBilling(snap.data());
        setBillingForm(snap.data());
      }
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "menuItems"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMenuItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "tables"), orderBy("number", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  // Categories: live sync + one-time seed
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "categories"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(list);
      if (list.length === 0 && !seededCategories.current) {
        seededCategories.current = true;
        for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
          await addDoc(collection(db, "restaurants", restaurantId, "categories"), {
            name: DEFAULT_CATEGORIES[i],
            imageUrl: "",
            order: i,
            createdAt: Date.now(),
          });
        }
      }
    });
    return () => unsub();
  }, [restaurantId]);

  // Staff list
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "staff"));
    const unsub = onSnapshot(q, (snap) => {
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    requestNotificationPermission().then(setNotifPermission);
  }, []);

  useEffect(() => {
    if (!newItem.category && categories.length > 0) {
      setNewItem((p) => ({ ...p, category: categories[0].name }));
    }
  }, [categories, newItem.category]);

  // === ALL computed/filtered values ===
  const pending = orders.filter((o) => o.status === "pending");
  const active = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const served = orders.filter((o) => o.status === "served");
  const billRequested = orders.filter((o) => o.status === "bill_requested");
  const billed = orders.filter((o) => o.status === "billed");
  const paid = orders.filter((o) => o.status === "paid");

  const ordersToday = orders.filter((o) => isToday(o.createdAt));
  const revenueOrdersToday = ordersToday.filter((o) => o.status === "billed" || o.status === "paid");
  const todaySales = revenueOrdersToday.reduce((sum, o) => sum + (o.billTotal || 0), 0);
  const todayItemsSold = ordersToday.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + (it.qty || 0), 0), 0);
  const todayOrderCount = ordersToday.length;
  const avgOrderValue = revenueOrdersToday.length > 0 ? Math.round(todaySales / revenueOrdersToday.length) : 0;

  const orderDataByKey = {
    pending,
    active,
    served,
    billRequested,
    billed,
  };

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

  // === IMAGE UPLOAD FUNCTIONS ===
  async function handleImageUpload(file, isEdit = false) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }

    if (isEdit) setEditUploading(true);
    else setUploadingImage(true);

    try {
      const url = await uploadToCloudinary(file);
      if (isEdit) setEditForm((p) => ({ ...p, imageUrl: url }));
      else setNewItem((p) => ({ ...p, imageUrl: url }));
    } catch (err) {
      alert("Upload failed: " + err.message);
      console.error(err);
    } finally {
      if (isEdit) setEditUploading(false);
      else setUploadingImage(false);
    }
  }

  async function handleLogoUpload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    setLogoUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setProfileForm((p) => ({ ...p, logoUrl: url }));
    } catch (err) {
      alert("Upload failed: " + err.message);
      console.error(err);
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleCategoryImageUpload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    setCategoryUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setNewCategory((p) => ({ ...p, imageUrl: url }));
    } catch (err) {
      alert("Upload failed: " + err.message);
      console.error(err);
    } finally {
      setCategoryUploading(false);
    }
  }

  async function handleEditCategoryImageUpload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    setEditCategoryUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setEditCategoryForm((p) => ({ ...p, imageUrl: url }));
    } catch (err) {
      alert("Upload failed: " + err.message);
      console.error(err);
    } finally {
      setEditCategoryUploading(false);
    }
  }

  // === ALL OTHER FUNCTIONS ===
  async function confirmOrder(id) {
    await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "confirmed" });
  }
  async function declineOrder(id) {
    await deleteDoc(doc(db, "restaurants", restaurantId, "orders", id));
  }
  async function markServed(id) {
    await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "served" });
  }
  async function saveProfile() {
    await setDoc(doc(db, "restaurants", restaurantId, "info", "profile"), profileForm, { merge: true });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }
  async function saveBilling() {
    await setDoc(doc(db, "restaurants", restaurantId, "info", "billing"), {
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

    await updateDoc(doc(db, "restaurants", restaurantId, "orders", o.id), {
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
    await updateDoc(doc(db, "restaurants", restaurantId, "orders", id), { status: "paid" });
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

  async function addCategory() {
    if (!newCategory.name.trim()) return alert("Give the category a name");
    if (categories.some((c) => c.name.toLowerCase() === newCategory.name.trim().toLowerCase())) {
      return alert("That category already exists");
    }
    await addDoc(collection(db, "restaurants", restaurantId, "categories"), {
      name: newCategory.name.trim(),
      imageUrl: newCategory.imageUrl,
      order: categories.length,
      createdAt: Date.now(),
    });
    setNewCategory({ name: "", imageUrl: "" });
    setShowAddCategory(false);
  }

  async function deleteCategory(cat) {
    const inUse = menuItems.some((m) => m.category === cat.name);
    if (inUse) {
      alert("This category still has menu items in it. Move or delete those items first.");
      return;
    }
    if (!confirm(`Delete "${cat.name}" category?`)) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "categories", cat.id));
    if (menuTab === cat.name) setMenuTab("all");
  }

  function startEditCategory(cat) {
    setEditingCategoryId(cat.id);
    setEditCategoryForm({ name: cat.name, imageUrl: cat.imageUrl || "" });
    setShowAddCategory(false);
  }

  async function saveEditCategory() {
    const cat = categories.find((c) => c.id === editingCategoryId);
    if (!cat) return;
    const newName = editCategoryForm.name.trim();
    if (!newName) return alert("Category name can't be empty");
    if (
      newName.toLowerCase() !== cat.name.toLowerCase() &&
      categories.some((c) => c.name.toLowerCase() === newName.toLowerCase())
    ) {
      return alert("Another category already has that name");
    }
    await updateDoc(doc(db, "restaurants", restaurantId, "categories", cat.id), {
      name: newName,
      imageUrl: editCategoryForm.imageUrl,
    });
    if (newName !== cat.name) {
      const itemsToUpdate = menuItems.filter((m) => m.category === cat.name);
      await Promise.all(itemsToUpdate.map((m) => updateDoc(doc(db, "restaurants", restaurantId, "menuItems", m.id), { category: newName })));
      if (menuTab === cat.name) setMenuTab(newName);
    }
    setEditingCategoryId(null);
  }

  async function addMenuItem() {
    if (!newItem.name || !newItem.price) return alert("Name and price are required");
    if (!newItem.category) return alert("Please choose a category (add one first if the list is empty)");
    await addDoc(collection(db, "restaurants", restaurantId, "menuItems"), {
      name: newItem.name,
      description: newItem.description,
      price: parseFloat(newItem.price),
      category: newItem.category,
      imageUrl: newItem.imageUrl,
      available: true,
      featured: false,
      chefSpecial: !!newItem.chefSpecial,
      createdAt: Date.now(),
    });
    setNewItem({ name: "", description: "", price: "", category: newItem.category, imageUrl: "", chefSpecial: false });
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm(item);
  }
  async function saveEdit() {
    await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", editingId), {
      name: editForm.name,
      description: editForm.description,
      price: parseFloat(editForm.price),
      category: editForm.category,
      imageUrl: editForm.imageUrl,
      featured: editForm.featured ?? false,
      chefSpecial: editForm.chefSpecial ?? false,
    });
    setEditingId(null);
  }
  async function toggleAvailable(item) {
    await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { available: !item.available });
  }
  async function toggleFeatured(item) {
    await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { featured: !item.featured });
  }
  async function toggleChefSpecial(item) {
    await updateDoc(doc(db, "restaurants", restaurantId, "menuItems", item.id), { chefSpecial: !item.chefSpecial });
  }
  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "menuItems", id));
  }

  async function addTable() {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
    await addDoc(collection(db, "restaurants", restaurantId, "tables"), { number: nextNumber, createdAt: Date.now() });
  }

  async function deleteTable(id) {
    if (!confirm("Delete this table? Its QR code will stop working.")) return;
    await deleteDoc(doc(db, "restaurants", restaurantId, "tables", id));
  }

  function qrUrlFor(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}&restaurant=${restaurantId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
  }

  function printQr(tableNumber) {
    const link = `${siteUrl}/table?table=${tableNumber}&restaurant=${restaurantId}`;
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
        </style>
      </head>
      <body>
        <h2>Table ${tableNumber}</h2>
        <div class="qr-wrap">
          <img src="${imgUrl}" />
        </div>
        <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
      </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=420,height=520");
    win.document.write(html);
    win.document.close();
  }

  // === STAFF MANAGEMENT ===
  async function addStaff() {
    if (!newStaffEmail.trim()) {
      setStaffError("Email is required");
      return;
    }
    if (!newStaffEmail.includes("@")) {
      setStaffError("Enter a valid email");
      return;
    }
    setAddingStaff(true);
    setStaffError("");
    try {
      const emailKey = newStaffEmail.trim().toLowerCase().replace(/\./g, "_");
      
      // Check if already invited
      const existing = await getDoc(doc(db, "staffEmails", emailKey));
      if (existing.exists()) {
        setStaffError("This email was already invited");
        setAddingStaff(false);
        return;
      }

      await setDoc(doc(db, "staffEmails", emailKey), {
        restaurantId,
        role: newStaffRole,
        email: newStaffEmail.trim().toLowerCase(),
        invitedAt: serverTimestamp(),
      });

      setNewStaffEmail("");
      setNewStaffRole("kitchen");
      setAddingStaff(false);
    } catch (err) {
      setStaffError(err.message);
      setAddingStaff(false);
    }
  }

  async function removeStaff(staffId) {
    if (!confirm("Remove this staff member? They won't be able to log in anymore.")) return;
    const staff = staffList.find((s) => s.id === staffId);
    if (staff) {
      const emailKey = staff.email.toLowerCase().replace(/\./g, "_");
      await deleteDoc(doc(db, "staffEmails", emailKey));
      await deleteDoc(doc(db, "restaurants", restaurantId, "staff", staffId));
    }
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
  const inputStyle = { width: "100%", padding: "11px 14px", border: "1px solid var(--border, #e6e1d6)", borderRadius: 10, fontSize: 14, marginBottom: 12, background: "var(--surface, #ffffff)", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12, color: "var(--text-secondary, #6b6b7b)", fontWeight: 700, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 };

  const StatCard = ({ label, value, color, icon, sub }) => (
    <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, borderRadius: 16 }}>
      <div style={{ width: 50, height: 50, borderRadius: 14, background: color + "18", color: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", marginTop: 4, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-secondary, #6b6b7b)", opacity: 0.8, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );

  const OrderCard = ({ order, children }) => (
    <div className="card" style={{ padding: 16, borderRadius: 14, animation: "riseIn 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
            {order.table}
          </div>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>Table {order.table}</span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--text-secondary, #6b6b7b)" }}>
          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {order.items.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" }}>
          <span>{it.name}</span>
          <span style={{ color: "var(--text-secondary, #6b6b7b)" }}>×{it.qty}</span>
        </div>
      ))}
      {order.status === "preparing" && getCountdown(order) && (
        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 17, color: "#C1440E", fontWeight: 700 }}>
          ⏱ {getCountdown(order)}
        </div>
      )}
      {children && <div style={{ marginTop: 12, display: "flex", gap: 8 }}>{children}</div>}
    </div>
  );

  // === RENDER: DASHBOARD ===
  const renderDashboard = () => {
    const currentSection = ORDER_SECTIONS.find((s) => s.key === orderFilter);
    const currentData = orderDataByKey[orderFilter] || [];

    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 2, fontFamily: "'Fraunces', serif" }}>Today at {profile?.name || "your restaurant"}</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary, #6b6b7b)", margin: 0 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14, marginBottom: 30 }}>
          <StatCard label="Today's Sales" value={`₹${todaySales.toLocaleString()}`} color="#16a34a" icon="💰" sub={`Avg ₹${avgOrderValue}/order`} />
          <StatCard label="Orders Today" value={todayOrderCount} color="#3b82f6" icon="🧾" />
          <StatCard label="Items Sold" value={todayItemsSold} color="#e8a33d" icon="🍛" />
          <StatCard label="Needs Attention" value={pending.length + billRequested.length} color="#dc2626" icon="⚡" sub={pending.length + billRequested.length > 0 ? "Action needed now" : "All caught up"} />
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
                <button
                  key={section.key}
                  onClick={() => setOrderFilter(section.key)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: isActive ? section.color : "var(--surface-2, #f3efe6)",
                    color: isActive ? "#fff" : "var(--text-secondary, #6b6b7b)",
                    fontSize: 13.5,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s ease",
                    marginBottom: 6,
                  }}
                >
                  {section.label}
                  {count > 0 && (
                    <span style={{ background: isActive ? "rgba(255,255,255,0.25)" : section.color + "22", color: isActive ? "#fff" : section.color, padding: "1px 8px", borderRadius: 100, fontSize: 11.5, fontWeight: 800 }}>
                      {count}
                    </span>
                  )}
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
                {orderFilter === "pending" &&
                  currentData.map((o) => (
                    <OrderCard key={o.id} order={o}>
                      <button className="btn btn-sm btn-danger" onClick={() => declineOrder(o.id)} style={{ flex: 1 }}>Decline</button>
                      <button className="btn btn-sm btn-primary" onClick={() => confirmOrder(o.id)} style={{ flex: 1 }}>Confirm → Kitchen</button>
                    </OrderCard>
                  ))}

                {orderFilter === "active" &&
                  currentData.map((o) => (
                    <OrderCard key={o.id} order={o}>
                      {o.status === "ready" ? (
                        <button className="btn btn-sm btn-success" onClick={() => markServed(o.id)} style={{ width: "100%" }}>Mark as Served</button>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-secondary, #6b6b7b)", width: "100%", textAlign: "center" }}>Managed from the kitchen screen</div>
                      )}
                    </OrderCard>
                  ))}

                {orderFilter === "served" && currentData.map((o) => <OrderCard key={o.id} order={o} />)}

                {orderFilter === "billRequested" &&
                  currentData.map((o) => (
                    <OrderCard key={o.id} order={o}>
                      <button className="btn btn-sm btn-primary" onClick={() => generateBill(o)} style={{ width: "100%" }}>Generate Bill</button>
                    </OrderCard>
                  ))}

                {orderFilter === "billed" &&
                  currentData.map((o) => (
                    <div key={o.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontWeight: 700 }}>Table {o.table}</span>
                        <span className="badge badge-billed">billed</span>
                      </div>
                      {o.items.map((it, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" }}>
                          <span>{it.name} ×{it.qty}</span>
                          <span>₹{it.price * it.qty}</span>
                        </div>
                      ))}
                      <div style={{ borderTop: "1px dashed var(--border, #e6e1d6)", marginTop: 10, paddingTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
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
      </div>
    );
  };

  // === RENDER: MENU ===
  const filteredCategoryItems = menuItems.filter((m) => {
    const matchesTab = menuTab === "all" || m.category === menuTab;
    const matchesSearch =
      !menuSearch.trim() ||
      m.name.toLowerCase().includes(menuSearch.trim().toLowerCase()) ||
      (m.description || "").toLowerCase().includes(menuSearch.trim().toLowerCase());
    return matchesTab && matchesSearch;
  });

  const MenuItemCard = ({ item }) => {
    if (editingId === item.id) {
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
                <button onClick={() => editFileInputRef.current?.click()} disabled={editUploading} className="btn btn-sm btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>
                  {editUploading ? "⏳..." : "📷 Change"}
                </button>
                {editForm.imageUrl && !editUploading && <img src={editForm.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />}
              </div>
            </div>
          </div>
          <label style={labelStyle}>Description</label>
          <input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={!!editForm.featured} onChange={(e) => setEditForm((p) => ({ ...p, featured: e.target.checked }))} /> ★ Featured
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={!!editForm.chefSpecial} onChange={(e) => setEditForm((p) => ({ ...p, chefSpecial: e.target.checked }))} /> 👨‍🍳 Chef's Special
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={saveEdit} style={{ flex: 1 }}>Save Changes</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)} style={{ flex: 1 }}>Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <div className="card" style={{ borderRadius: 16, overflow: "hidden", opacity: item.available ? 1 : 0.6, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", height: 140, background: "var(--surface-2, #f3efe6)" }}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🍽️</div>
          )}
          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.chefSpecial && <span style={{ background: "#1a1a2e", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 100 }}>👨‍🍳 CHEF'S SPECIAL</span>}
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#e8a33d", whiteSpace: "nowrap" }}>₹{item.price}</div>
          </div>
          {item.description && <div style={{ fontSize: 12.5, color: "var(--text-secondary, #6b6b7b)", marginTop: 4, flex: 1 }}>{item.description}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => toggleAvailable(item)} className="btn btn-sm" style={{ background: item.available ? "var(--success-light, #dcfce7)" : "var(--warning-light, #fef3c7)", color: item.available ? "#166534" : "#92400e", border: "none", flex: 1, minWidth: 90 }}>
              {item.available ? "In Stock" : "Out"}
            </button>
            <button onClick={() => toggleFeatured(item)} className="btn btn-sm" style={{ background: item.featured ? "#e8a33d20" : "var(--surface-2, #f3efe6)", color: item.featured ? "#92400e" : "var(--text-secondary, #6b6b7b)", border: "none" }} title="Toggle featured">★</button>
            <button onClick={() => toggleChefSpecial(item)} className="btn btn-sm" style={{ background: item.chefSpecial ? "#1a1a2e" : "var(--surface-2, #f3efe6)", color: item.chefSpecial ? "#fff" : "var(--text-secondary, #6b6b7b)", border: "none" }} title="Toggle chef's special">👨‍🍳</button>
            <button onClick={() => startEdit(item)} className="btn btn-sm btn-ghost">Edit</button>
            <button onClick={() => deleteItem(item.id)} className="btn btn-sm btn-ghost" style={{ color: "var(--danger, #dc2626)" }}>Delete</button>
          </div>
        </div>
      </div>
    );
  };

  const renderMenu = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif" }}>Menu</h2>
        <button className="btn btn-ghost" onClick={() => setShowAddCategory((s) => !s)}>
          {showAddCategory ? "✕ Close" : "+ Add Category"}
        </button>
      </div>

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
                <button onClick={() => categoryFileInputRef.current?.click()} disabled={categoryUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>
                  {categoryUploading ? "⏳..." : "📷 Upload"}
                </button>
                {newCategory.imageUrl && !categoryUploading && <img src={newCategory.imageUrl} alt="" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />}
              </div>
            </div>
            <button className="btn btn-primary" onClick={addCategory}>Add Category</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 22, borderRadius: 18, marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>➕ Add New Item</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input placeholder="e.g. Paneer Tikka" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Price (₹)</label>
            <input placeholder="0" type="number" value={newItem.price} onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
              {categories.length === 0 && <option value="">Add a category first</option>}
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <label style={labelStyle}>Food Photo</label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0], false)} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>
            {uploadingImage ? "⏳ Uploading..." : "📷 Choose Photo"}
          </button>
          {newItem.imageUrl && !uploadingImage && <img src={newItem.imageUrl} alt="Preview" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />}
        </div>

        <label style={labelStyle}>Description</label>
        <input placeholder="Short, appetising description (optional)" value={newItem.description} onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))} style={inputStyle} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          <input type="checkbox" checked={!!newItem.chefSpecial} onChange={(e) => setNewItem((p) => ({ ...p, chefSpecial: e.target.checked }))} /> 👨‍🍳 Mark as Chef's Special
        </label>

        <button className="btn btn-primary" onClick={addMenuItem}>+ Add Item to Menu</button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 220 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔎</span>
          <input placeholder="Search the menu..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} style={{ ...inputStyle, marginBottom: 0, paddingLeft: 38 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 22 }}>
        <button onClick={() => setMenuTab("all")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 68, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: menuTab === "all" ? "#1a1a2e" : "var(--surface-2, #f3efe6)", color: menuTab === "all" ? "#fff" : "var(--text-secondary, #6b6b7b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: menuTab === "all" ? "2px solid #1a1a2e" : "2px solid transparent" }}>
            🍴
          </div>
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
                <button onClick={() => startEditCategory(cat)} title="Edit category" style={{ position: "absolute", top: -4, left: -4, width: 19, height: 19, borderRadius: "50%", background: "#1a1a2e", color: "#fff", border: "2px solid var(--surface, #fff)", fontSize: 9.5, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                <button onClick={() => deleteCategory(cat)} title="Delete category" style={{ position: "absolute", top: -4, right: -4, width: 19, height: 19, borderRadius: "50%", background: "var(--danger, #dc2626)", color: "#fff", border: "2px solid var(--surface, #fff)", fontSize: 10, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
              <span onClick={() => setMenuTab(cat.name)} style={{ fontSize: 11.5, fontWeight: isActive ? 800 : 600, color: isActive ? "var(--text, #1a1a2e)" : "var(--text-secondary, #6b6b7b)", cursor: "pointer", whiteSpace: "nowrap" }}>
                {cat.name}{count > 0 ? ` (${count})` : ""}
              </span>
            </div>
          );
        })}
      </div>

      {editingCategoryId && (
        <div className="card" style={{ padding: 20, marginBottom: 22, border: "2px dashed #e8a33d" }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Edit Category</h3>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Category Name</label>
              <input className="to-input" value={editCategoryForm.name} onChange={(e) => setEditCategoryForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Icon Photo</label>
              <input ref={editCategoryFileInputRef} type="file" accept="image/*" onChange={(e) => handleEditCategoryImageUpload(e.target.files[0])} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => editCategoryFileInputRef.current?.click()} disabled={editCategoryUploading} className="btn btn-ghost btn-sm">
                  {editCategoryUploading ? "⏳..." : "📷 Change"}
                </button>
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
          {filteredCategoryItems.map((item) => <MenuItemCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );

  // === RENDER: TABLES ===
  const renderTables = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif" }}>Tables & QR Codes</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary, #6b6b7b)", margin: "4px 0 0" }}>Print a code for each table — guests scan to open the menu.</p>
        </div>
        <button className="btn btn-primary" onClick={addTable}>+ Add Table</button>
      </div>

      {tables.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary, #6b6b7b)", borderRadius: 16 }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🪑</div>
          <p style={{ margin: 0 }}>No tables yet — add one to generate its QR code.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 }}>
          {tables.map((t) => (
            <div key={t.id} className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
              <div style={{ background: "#1a1a2e", color: "#fff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Table {t.number}</span>
                <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "3px 9px", borderRadius: 100, fontWeight: 700 }}>🟢 ACTIVE</span>
              </div>
              <div style={{ padding: 20, textAlign: "center" }}>
                {siteUrl && (
                  <div style={{ background: "#fff", padding: 12, borderRadius: 14, display: "inline-block", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                                        <img src={qrUrlFor(t.number)} alt={`QR table ${t.number}`} style={{ width: 140, height: 140, display: "block" }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => printQr(t.number)} style={{ flex: 1 }}>🖨 Print</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => deleteTable(t.id)} style={{ flex: 1, color: "var(--danger, #dc2626)" }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // === RENDER: SETTINGS (profile + billing + staff management) ===
  const renderSettings = () => (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, fontFamily: "'Fraunces', serif" }}>Settings</h2>

      {/* Profile Card */}
      <div className="card" style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}>
        <div style={{
          height: 150,
          position: "relative",
          background: profileForm.logoUrl
            ? `linear-gradient(180deg, rgba(26,26,46,0.55), rgba(26,26,46,0.75)), url(${profileForm.logoUrl}) center/cover`
            : "linear-gradient(135deg, #1a1a2e, #3a3a5e)",
          filter: profileForm.logoUrl ? "saturate(1.1)" : "none",
        }}>
          <div style={{ position: "absolute", inset: 0, backdropFilter: profileForm.logoUrl ? "blur(6px)" : "none" }} />
        </div>
        <div style={{ padding: "0 28px 28px", marginTop: -46, textAlign: "center" }}>
          <div style={{ width: 92, height: 92, borderRadius: "50%", border: "4px solid var(--surface, #ffffff)", background: "var(--surface-2, #f3efe6)", margin: "0 auto", overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }}>
            {profileForm.logoUrl ? (
              <img src={profileForm.logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🏪</div>
            )}
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 800, marginTop: 14, marginBottom: 2, fontFamily: "'Fraunces', serif" }}>{profileForm.name || "Your Restaurant"}</h3>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary, #6b6b7b)", margin: 0 }}>{profileForm.tagline || "Add a tagline to introduce your place"}</p>

          <div style={{ textAlign: "left", marginTop: 28, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
            <label style={labelStyle}>Restaurant Name</label>
            <input value={profileForm.name || ""} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
            <label style={labelStyle}>Tagline</label>
            <input value={profileForm.tagline || ""} onChange={(e) => setProfileForm((p) => ({ ...p, tagline: e.target.value }))} style={inputStyle} />
            <label style={labelStyle}>Address</label>
            <input value={profileForm.address || ""} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} style={inputStyle} />

            <label style={labelStyle}>Logo</label>
            <input ref={logoFileInputRef} type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files[0])} style={{ display: "none" }} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
              <button onClick={() => logoFileInputRef.current?.click()} disabled={logoUploading} className="btn btn-ghost" style={{ border: "2px dashed var(--border, #e6e1d6)" }}>
                {logoUploading ? "⏳ Uploading..." : "📷 Upload Logo"}
              </button>
            </div>

            <button className="btn btn-primary" onClick={saveProfile} style={{ width: "100%" }}>
              {savedMsg ? "Saved ✓" : "Save Profile"}
            </button>
          </div>
        </div>
      </div>

      {/* Billing Settings */}
      <div className="card" style={{ padding: 24, borderRadius: 18, maxWidth: 420, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💰 Billing Settings</h3>
        <label style={labelStyle}>Tax / GST %</label>
        <input type="number" value={billingForm.taxPercent} onChange={(e) => setBillingForm((p) => ({ ...p, taxPercent: e.target.value }))} style={inputStyle} />
        <label style={labelStyle}>Service Charge %</label>
        <input type="number" value={billingForm.servicePercent} onChange={(e) => setBillingForm((p) => ({ ...p, servicePercent: e.target.value }))} style={inputStyle} />
        <button className="btn btn-primary" onClick={saveBilling}>
          {billingSaved ? "Saved ✓" : "Save Billing Settings"}
        </button>
      </div>

      {/* Staff Management */}
      <div className="card" style={{ padding: 24, borderRadius: 18, maxWidth: 520 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>👥 Staff Management</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary, #6b6b7b)", marginBottom: 16 }}>
          Invite staff by email. They'll sign in with Google and be automatically linked to your restaurant.
        </p>

        {staffError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{staffError}</div>}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="staff@example.com"
              value={newStaffEmail}
              onChange={(e) => setNewStaffEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0 }}
            />
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={labelStyle}>Role</label>
            <select
              value={newStaffRole}
              onChange={(e) => setNewStaffRole(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0 }}
            >
              <option value="kitchen">Kitchen</option>
              <option value="reception">Reception</option>
            </select>
          </div>
          <button
            onClick={addStaff}
            disabled={addingStaff}
            className="btn btn-primary"
            style={{ padding: "11px 20px", opacity: addingStaff ? 0.6 : 1 }}
          >
            {addingStaff ? "..." : "Invite"}
          </button>
        </div>

        {staffList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staffList.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surface-2, #f3efe6)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: s.role === "reception" ? "#dbeafe" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                    {s.role === "reception" ? "🖥️" : "👨‍🍳"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name || s.email}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary, #6b6b7b)", textTransform: "capitalize" }}>{s.role}</div>
                  </div>
                </div>
                <button
                  onClick={() => removeStaff(s.id)}
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: 4 }}
                  title="Remove staff"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // === SPLASH SCREEN ===
  const renderSplash = () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "linear-gradient(135deg, #1a1a2e 0%, #241f3d 55%, #2d1b1b 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: splashLeaving ? 0 : 1,
        transition: "opacity 0.5s ease",
      }}
      onClick={dismissSplash}
    >
      <div style={{ animation: "splashPop 0.9s cubic-bezier(0.22, 1, 0.36, 1)", textAlign: "center", padding: 20 }}>
        {profile?.logoUrl && (
          <img src={profile.logoUrl} alt="" style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "cover", margin: "0 auto 20px", display: "block", border: "3px solid rgba(232,163,61,0.6)", animation: "splashGlow 2.2s ease-in-out infinite" }} />
        )}
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: isMobile ? 30 : 44, fontWeight: 700, color: "#fff", letterSpacing: 0.5, animation: "splashLetters 1s ease" }}>
          {profile?.name || "Table Order"}
        </div>
        <div style={{ width: 46, height: 2, background: "#e8a33d", margin: "16px auto", animation: "splashLine 0.9s ease 0.3s both" }} />
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", animation: "splashFade 1s ease 0.5s both" }}>
          Powered by Table Order
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

        .card {
          background: var(--surface, #ffffff) !important;
          border: 1px solid var(--border, #e6e1d6) !important;
          box-shadow: 0 1px 3px rgba(20,20,30,0.05), 0 1px 2px rgba(20,20,30,0.03) !important;
          border-radius: 14px;
        }
        .btn {
          font-family: inherit !important;
          font-weight: 700 !important;
          border-radius: 10px !important;
          cursor: pointer !important;
          border: none !important;
          padding: 11px 20px !important;
          font-size: 14px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease !important;
          line-height: 1.2 !important;
        }
        .btn:hover { transform: translateY(-1px); filter: brightness(1.04); }
        .btn:active { transform: translateY(0); filter: brightness(0.98); }
        .btn-sm { padding: 8px 14px !important; font-size: 13px !important; border-radius: 8px !important; }
        .btn-primary { background: #e8a33d !important; color: #ffffff !important; box-shadow: 0 2px 6px rgba(232,163,61,0.35) !important; }
        .btn-danger { background: #fef2f2 !important; color: #dc2626 !important; }
        .btn-success { background: #16a34a !important; color: #ffffff !important; box-shadow: 0 2px 6px rgba(22,163,74,0.3) !important; }
        .btn-ghost { background: var(--surface-2, #f3efe6) !important; color: var(--text-secondary, #6b6b7b) !important; border: 1px solid var(--border, #e6e1d6) !important; }
        .badge {
          display: inline-flex !important;
          align-items: center !important;
          padding: 3px 10px !important;
          border-radius: 100px !important;
          font-size: 11.5px !important;
          font-weight: 700 !important;
          background: var(--surface-2, #f3efe6) !important;
          color: var(--text-secondary, #6b6b7b) !important;
        }
        .badge-billed { background: #ede9fe !important; color: #6d28d9 !important; }
        .to-input {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 14px;
          border: 1px solid var(--border, #e6e1d6);
          border-radius: 10px;
          font-size: 14px;
          background: var(--surface, #ffffff);
          font-family: inherit;
          color: var(--text, #1a1a2e);
        }
        .to-input:focus, select:focus, input:focus {
          outline: none;
          border-color: #e8a33d;
          box-shadow: 0 0 0 3px rgba(232,163,61,0.15);
        }
      `}</style>

      {showSplash && renderSplash()}

      {isMobile && sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className="no-print"
        style={{
          width: isMobile ? 260 : (sidebarCollapsed ? 78 : 260),
          background: "#1a1a2e",
          color: "#fff",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          overflowY: "auto",
          overflowX: "hidden",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
          transition: "transform 0.3s ease, width 0.22s ease",
        }}
      >
        <div style={{ padding: sidebarCollapsed && !isMobile ? "22px 14px" : "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
            {profile?.logoUrl ? (
              <img src={profile.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 24, flexShrink: 0 }}>🍽️</span>
            )}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Fraunces', serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {profile?.name || "Your Restaurant"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Reception Desk</div>
              </div>
            )}
          </div>
          {!isMobile && (
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.7)", width: 26, height: 26, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          )}
        </div>
        <nav style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (isMobile) setSidebarOpen(false); }}
              title={tab.label}
              style={{
                width: "100%",
                textAlign: "left",
                padding: sidebarCollapsed && !isMobile ? "12px 0" : "12px 16px",
                justifyContent: sidebarCollapsed && !isMobile ? "center" : "flex-start",
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
                position: "relative",
              }}
            >
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              {(!sidebarCollapsed || isMobile) && tab.label}
              {tab.id === "dashboard" && (pending.length + billRequested.length > 0) && (
                <span style={{
                  marginLeft: sidebarCollapsed && !isMobile ? 0 : "auto",
                  position: sidebarCollapsed && !isMobile ? "absolute" : "static",
                  top: sidebarCollapsed && !isMobile ? 6 : "auto",
                  right: sidebarCollapsed && !isMobile ? 10 : "auto",
                  background: "#dc2626", color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 100,
                }}>
                  {pending.length + billRequested.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div style={{ padding: sidebarCollapsed && !isMobile ? "16px 0" : 20, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11.5, color: "rgba(255,255,255,0.4)", textAlign: sidebarCollapsed && !isMobile ? "center" : "left" }}>
          {sidebarCollapsed && !isMobile ? "🍽️" : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span>Powered by Table Order</span>
              <button
                onClick={logout}
                style={{
                  background: "rgba(220,38,38,0.15)",
                  border: "none",
                  color: "#fca5a5",
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  width: "100%",
                }}
              >
                🚪 Logout {role ? `(${role})` : ""}
              </button>
            </div>
          )}
        </div>
      </aside>

      <main style={{ marginLeft: isMobile ? 0 : (sidebarCollapsed ? 78 : 260), flex: 1, background: "var(--bg, #faf8f2)", minHeight: "100vh", width: "100%", transition: "margin-left 0.22s ease" }}>
        {isMobile && (
          <div className="no-print" style={{ padding: "16px 20px", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>
              ☰
            </button>
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