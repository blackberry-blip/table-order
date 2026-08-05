"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getPlanFeatures } from "./plans";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [features, setFeatures] = useState(getPlanFeatures("base"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setRestaurantId(null);
        setSubscription(null);
        setFeatures(getPlanFeatures("base"));
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setRole(data.role);
        setRestaurantId(data.restaurantId);

        try {
          const hotelDoc = await getDoc(doc(db, "hotels", data.restaurantId));
          if (hotelDoc.exists()) {
            const h = hotelDoc.data();
            setSubscription(h);
            setFeatures(getPlanFeatures(h.plan));
          } else {
            // No hotels/{id} doc yet. Once /signup is live this should be
            // rare — every new account gets a hotels/{uid} doc at signup.
            // Default to "base" (not "pro") so an unconfigured account
            // never accidentally gets premium features for free.
            setSubscription({ status: "active", plan: "base" });
            setFeatures(getPlanFeatures("base"));
          }
        } catch {
          setSubscription({ status: "active", plan: "base" });
          setFeatures(getPlanFeatures("base"));
        }
      } else {
        setRole(null);
        setRestaurantId(null);
        setSubscription(null);
        setFeatures(getPlanFeatures("base"));
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
    setSubscription(null);
    setFeatures(getPlanFeatures("base"));
  }

  return (
    <AuthContext.Provider value={{ user, role, restaurantId, subscription, features, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}