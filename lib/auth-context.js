"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setRestaurantId(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      // Check if this user is an owner (their UID = restaurantId)
      const ownerDoc = await getDoc(doc(db, "restaurants", firebaseUser.uid, "info", "profile"));
      if (ownerDoc.exists()) {
        setRole("owner");
        setRestaurantId(firebaseUser.uid);
        setLoading(false);
        return;
      }

      // Check if this user is staff in any restaurant
      // We need to search — for now, check a known restaurant or scan
      // Since Firestore doesn't support collectionGroup queries across subcollections easily,
      // we'll store a reverse lookup: users/{uid} → { restaurantId, role }
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setRole(data.role);
        setRestaurantId(data.restaurantId);
      } else {
        // New user — no role yet
        setRole(null);
        setRestaurantId(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  async function logout() {
    await signOut(auth);
    setUser(null);
    setRole(null);
    setRestaurantId(null);
  }

  return (
    <AuthContext.Provider value={{ user, role, restaurantId, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}