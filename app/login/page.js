"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db, googleProvider } from "@/lib/firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const [mode, setMode] = useState("select"); // "select" | "owner" | "staff"
  const [staffRole, setStaffRole] = useState(""); // "reception" | "kitchen"
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const router = useRouter();
  const { user, role, loading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user && role) {
      if (role === "owner") router.replace("/receptionist");
      else if (role === "reception") router.replace("/receptionist");
      else if (role === "kitchen") router.replace("/kitchen");
    }
  }, [user, role, loading, router]);

  async function handleGoogleLogin() {
    setError("");
    setLoggingIn(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const uid = firebaseUser.uid;

      if (mode === "owner") {
        // Owner login — check if restaurant exists
        const profileDoc = await getDoc(doc(db, "restaurants", uid, "info", "profile"));
        
        if (!profileDoc.exists()) {
          // First time — create restaurant
          await setDoc(doc(db, "restaurants", uid, "info", "profile"), {
            name: firebaseUser.displayName || "My Restaurant",
            email: firebaseUser.email,
            ownerName: firebaseUser.displayName || "",
            createdAt: serverTimestamp(),
          });
          
          // Create owner entry in users collection for reverse lookup
          await setDoc(doc(db, "users", uid), {
            restaurantId: uid,
            role: "owner",
            email: firebaseUser.email,
            name: firebaseUser.displayName || "",
            addedAt: serverTimestamp(),
          });
        }

        router.replace("/receptionist");

      } else if (mode === "staff") {
        // Staff login — check if they were added by an owner
        let userDoc = await getDoc(doc(db, "users", uid));
        
        // If not in users collection, check if owner added them by email
        if (!userDoc.exists()) {
          const staffEmailKey = firebaseUser.email.toLowerCase().replace(/\./g, "_");
          const globalStaffDoc = await getDoc(doc(db, "staffEmails", staffEmailKey));
          
          if (globalStaffDoc.exists()) {
            const globalData = globalStaffDoc.data();
            
            // Verify the role matches what they selected
            if (globalData.role !== staffRole) {
              setError(`You are registered as ${globalData.role}, not ${staffRole}.`);
              await signOut(auth);
              setLoggingIn(false);
              return;
            }
            
            // Create the user mapping and staff/{uid} document
            await setDoc(doc(db, "users", uid), {
              restaurantId: globalData.restaurantId,
              role: globalData.role,
              email: firebaseUser.email,
              name: firebaseUser.displayName || globalData.name || "",
              addedAt: serverTimestamp(),
            });
            
            await setDoc(doc(db, "restaurants", globalData.restaurantId, "staff", uid), {
              email: firebaseUser.email,
              name: firebaseUser.displayName || globalData.name || "",
              role: globalData.role,
              addedAt: serverTimestamp(),
              active: true,
            });
            
            // Refresh userDoc
            userDoc = await getDoc(doc(db, "users", uid));
          }
        }
        
        if (!userDoc.exists()) {
          setError("You are not registered as staff. Ask the owner to add you first.");
          await signOut(auth);
          setLoggingIn(false);
          return;
        }

        const userData = userDoc.data();
        
        // Double-check role matches what they clicked
        if (userData.role !== staffRole) {
          setError(`You are registered as ${userData.role}, not ${staffRole}.`);
          await signOut(auth);
          setLoggingIn(false);
          return;
        }

        if (staffRole === "kitchen") router.replace("/kitchen");
        else router.replace("/receptionist");
      }
    } catch (err) {
      setError(err.message);
      setLoggingIn(false);
    }
  }

  // === SELECT MODE SCREEN ===
  if (mode === "select") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "linear-gradient(135deg, #faf8f5 0%, #f5f3ef 100%)" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <span style={{ fontSize: 28 }}>🍽️</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1a1a2e", marginBottom: 6 }}>Table Order</h1>
            <p style={{ color: "#6b6b7b", fontSize: 15 }}>Sign in to your account</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => setMode("owner")}
              style={{
                padding: 20,
                borderRadius: 16,
                border: "2px solid #e6e1d6",
                background: "#fff",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8a33d"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e6e1d6"}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fff5e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👑</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Restaurant Owner</div>
                <div style={{ fontSize: 13, color: "#6b6b7b" }}>Full access — menu, orders, billing, staff</div>
              </div>
            </button>

            <button
              onClick={() => { setStaffRole("reception"); setMode("staff"); }}
              style={{
                padding: 20,
                borderRadius: 16,
                border: "2px solid #e6e1d6",
                background: "#fff",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8a33d"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e6e1d6"}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f0f0f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🖥️</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Reception Staff</div>
                <div style={{ fontSize: 13, color: "#6b6b7b" }}>Orders, tables, billing, menu view</div>
              </div>
            </button>

            <button
              onClick={() => { setStaffRole("kitchen"); setMode("staff"); }}
              style={{
                padding: 20,
                borderRadius: 16,
                border: "2px solid #e6e1d6",
                background: "#fff",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8a33d"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e6e1d6"}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👨‍🍳</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Kitchen Staff</div>
                <div style={{ fontSize: 13, color: "#6b6b7b" }}>View tickets, cooking, ready status</div>
              </div>
            </button>
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/table" style={{ color: "#e8a33d", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              ← Back to Customer Menu
            </a>
          </div>
        </div>
      </div>
    );
  }

  // === OWNER OR STAFF LOGIN SCREEN ===
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "linear-gradient(135deg, #faf8f5 0%, #f5f3ef 100%)" }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <button
          onClick={() => setMode("select")}
          style={{ background: "none", border: "none", color: "#6b6b7b", cursor: "pointer", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back
        </button>

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <span style={{ fontSize: 28 }}>
            {mode === "owner" ? "👑" : staffRole === "reception" ? "🖥️" : "👨‍🍳"}
          </span>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", marginBottom: 6 }}>
          {mode === "owner" ? "Owner Sign In" : staffRole === "reception" ? "Reception Sign In" : "Kitchen Sign In"}
        </h2>
        <p style={{ color: "#6b6b7b", fontSize: 14, marginBottom: 32 }}>
          {mode === "owner" 
            ? "Sign in with Google to access your restaurant dashboard" 
            : "Sign in with Google — you must be added by the owner first"}
        </p>

        {error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loggingIn}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #e6e1d6",
            background: "#fff",
            cursor: loggingIn ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1a2e",
            opacity: loggingIn ? 0.6 : 1,
          }}
        >
          {loggingIn ? (
            <span>Signing in...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}