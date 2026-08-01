"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

function TableContent() {
  const searchParams = useSearchParams();
  const tableParam = searchParams.get("table");
  const restaurantId = searchParams.get("restaurant");

  const [debug, setDebug] = useState("Loading...");

  useEffect(() => {
    setDebug(`URL params: table=${tableParam}, restaurant=${restaurantId}`);

    if (!restaurantId) {
      setDebug((prev) => prev + "\n❌ NO RESTAURANT ID - showing error screen");
      return;
    }

    setDebug((prev) => prev + "\n✅ Have restaurantId, trying Firestore...");

    // Try to read profile
    const unsub = onSnapshot(
      doc(db, "restaurants", restaurantId, "info", "profile"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDebug((prev) => prev + `\n✅ PROFILE: ${JSON.stringify(data)}`);
        } else {
          setDebug((prev) => prev + "\n❌ Profile doc does NOT exist at path: restaurants/" + restaurantId + "/info/profile");
        }
      },
      (err) => {
        setDebug((prev) => prev + `\n❌ FIRESTORE ERROR: ${err.message}`);
      }
    );

    // Try to read menu items
    const q = query(collection(db, "restaurants", restaurantId, "menuItems"), orderBy("createdAt", "asc"));
    const unsub2 = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDebug((prev) => prev + `\n✅ MENU ITEMS: ${items.length} items found`);
      if (items.length > 0) {
        setDebug((prev) => prev + `\n   First item: ${JSON.stringify(items[0])}`);
      }
    }, (err) => {
      setDebug((prev) => prev + `\n❌ MENU ERROR: ${err.message}`);
    });

    return () => {
      unsub();
      unsub2();
    };
  }, [restaurantId, tableParam]);

  return (
    <div style={{ padding: 20, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      <h1>DEBUG MODE</h1>
      <div style={{ background: "#1a1a2e", color: "#fff", padding: 20, borderRadius: 10, marginTop: 20 }}>
        {debug}
      </div>
      <div style={{ marginTop: 20, color: "#666" }}>
        <p>Current URL: {typeof window !== "undefined" ? window.location.href : "SSR"}</p>
        <p>Restaurant ID from URL: {restaurantId || "NULL"}</p>
        <p>Table from URL: {tableParam || "NULL"}</p>
      </div>
    </div>
  );
}

export default function TablePage() {
  return (
    <Suspense fallback={<div style={{padding:40}}>Loading...</div>}>
      <TableContent />
    </Suspense>
  );
} 