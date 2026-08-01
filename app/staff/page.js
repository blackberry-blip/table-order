"use client";

import { useState, useEffect } from "react";
import { AuthGuard } from "@/lib/auth-guard";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function StaffPage() {
  return (
    <AuthGuard allowedRoles={["owner"]}>
      <StaffContent />
    </AuthGuard>
  );
}

function StaffContent() {
  const { user, restaurantId, logout } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("reception");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const router = useRouter();

  // Load staff list from this restaurant
  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "restaurants", restaurantId, "staff"));
    const unsub = onSnapshot(q, (snap) => {
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [restaurantId]);

  async function addStaff(e) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    setAdding(true);
    setMessage("");

    try {
      // Create a safe key from email (lowercase, dots → underscores)
      // This same key is used in the global lookup
      const staffId = email.toLowerCase().trim().replace(/\./g, "_");

      // 1. Save to this restaurant's staff collection
      await setDoc(doc(db, "restaurants", restaurantId, "staff", staffId), {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role,
        addedBy: user.uid,
        addedAt: serverTimestamp(),
        active: true,
      });

      // 2. ALSO save to GLOBAL lookup so login page can find them
      // When staff first logs in, login page reads this and creates their account
      await setDoc(doc(db, "staffEmails", staffId), {
        email: email.toLowerCase().trim(),
        restaurantId: restaurantId,
        role: role,
        addedAt: serverTimestamp(),
      });

      setEmail("");
      setName("");
      setMessage("✅ Staff added! They can now login with their Google account.");
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setMessage("❌ Error: " + err.message);
    } finally {
      setAdding(false);
    }
  }

  async function removeStaff(staffId) {
    if (!confirm("Remove this staff member? They will no longer be able to login.")) return;
    
    setRemovingId(staffId);
    try {
      // Remove from restaurant staff
      await deleteDoc(doc(db, "restaurants", restaurantId, "staff", staffId));
      
      // Also remove from global lookup
      await deleteDoc(doc(db, "staffEmails", staffId));
      
      setMessage("✅ Staff removed.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage("❌ Error: " + err.message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf8f2", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>

      {/* Header */}
      <div style={{ background: "#1a1a2e", color: "#fff", padding: "20px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>👥 Staff Management</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "4px 0 0" }}>Add or remove reception and kitchen staff</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => router.push("/receptionist")}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              ← Dashboard
            </button>
            <button
              onClick={logout}
              style={{ background: "rgba(220,38,38,0.2)", border: "none", color: "#fca5a5", padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {/* Add Staff Form */}
        <div style={{ background: "#fff", borderRadius: 18, padding: 24, marginBottom: 24, border: "1px solid #e6e1d6" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>➕ Add New Staff</h2>

          {message && (
            <div style={{ 
              background: message.startsWith("✅") ? "#dcfce7" : message.startsWith("❌") ? "#fef2f2" : "#f0f0f5", 
              color: message.startsWith("✅") ? "#166534" : message.startsWith("❌") ? "#dc2626" : "#6b6b7b", 
              padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16 
            }}>
              {message}
            </div>
          )}

          <form onSubmit={addStaff} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b6b7b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #e6e1d6", borderRadius: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b6b7b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Email (Google account)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rahul@gmail.com"
                required
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #e6e1d6", borderRadius: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b6b7b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #e6e1d6", borderRadius: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" }}
              >
                <option value="reception">Reception</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={adding}
              style={{
                padding: "11px 20px",
                borderRadius: 10,
                border: "none",
                background: "#e8a33d",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: adding ? "not-allowed" : "pointer",
                opacity: adding ? 0.7 : 1,
              }}
            >
              {adding ? "Adding..." : "Add Staff"}
            </button>
          </form>

          <p style={{ fontSize: 12, color: "#888", marginTop: 12, marginBottom: 0 }}>
            ℹ️ Staff will use their Google account email to login. Make sure the email matches exactly.
          </p>
        </div>

        {/* Staff List */}
        <div style={{ background: "#fff", borderRadius: 18, padding: 24, border: "1px solid #e6e1d6" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>👥 Current Staff ({staffList.length})</h2>

          {staffList.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <p>No staff added yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {staffList.map((staff) => (
                <div
                  key={staff.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 16,
                    background: "#faf8f2",
                    borderRadius: 12,
                    border: "1px solid #f0ebe3",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: staff.role === "reception" ? "#f0f0f5" : "#dcfce7",
                      color: staff.role === "reception" ? "#1a1a2e" : "#166534",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18,
                    }}>
                      {staff.role === "reception" ? "🖥️" : "👨‍🍳"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{staff.name}</div>
                      <div style={{ fontSize: 12, color: "#888" }}>{staff.email}</div>
                      <span style={{
                        display: "inline-block",
                        marginTop: 4,
                        padding: "2px 8px",
                        borderRadius: 100,
                        fontSize: 11,
                        fontWeight: 700,
                        background: staff.role === "reception" ? "#f0f0f5" : "#dcfce7",
                        color: staff.role === "reception" ? "#1a1a2e" : "#166534",
                      }}>
                        {staff.role === "reception" ? "RECEPTION" : "KITCHEN"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeStaff(staff.id)}
                    disabled={removingId === staff.id}
                    style={{
                      background: "none",
                      border: "1px solid #fecaca",
                      color: "#dc2626",
                      padding: "6px 14px",
                      borderRadius: 8,
                      cursor: removingId === staff.id ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: removingId === staff.id ? 0.6 : 1,
                    }}
                  >
                    {removingId === staff.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}