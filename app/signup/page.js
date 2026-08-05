"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, googleProvider, uploadToCloudinary } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { PLAN_FEATURES, PLAN_PRICING, PLAN_LABELS, PLAN_ORDER, HOTEL_STATUS, PLATFORM_UPI_ID, PLATFORM_PAYEE_NAME } from "@/lib/plans";

const FEATURE_LABELS = {
  floors: "Multiple floors", vipTables: "VIP tables", combos: "Combo packs",
  customization: "Spice level & notes", splitBill: "Split bill", upiQr: "UPI payment QR",
  brandColor: "Custom branding", promoBanner: "Promo banner", rating: "Guest ratings",
};

export default function SignupPage() {
  const [step, setStep] = useState("details"); // details -> signin -> plan -> payment -> done
  const [form, setForm] = useState({ name: "", tagline: "", address: "", logoUrl: "" });
  const [logoUploading, setLogoUploading] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("mid");
  const [txnRef, setTxnRef] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogoUpload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please select an image");
    if (file.size > 5 * 1024 * 1024) return alert("Image must be under 5MB");
    setLogoUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setForm((p) => ({ ...p, logoUrl: url }));
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setLogoUploading(false);
    }
  }

  function goToSignIn() {
    if (!form.name.trim()) { setError("Restaurant name is required"); return; }
    setError("");
    setStep("signin");
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setFirebaseUser(result.user);
      setStep("plan");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function confirmPlan() {
    setStep("payment");
  }

  async function submitPayment() {
    if (!txnRef.trim()) { setError("Please enter your transaction reference / UTR number"); return; }
    setError("");
    setLoading(true);
    try {
      const restaurantId = firebaseUser.uid;

      await setDoc(doc(db, "restaurants", restaurantId, "info", "profile"), {
        name: form.name.trim(), tagline: form.tagline, address: form.address,
        logoUrl: form.logoUrl, email: firebaseUser.email, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "restaurants", restaurantId, "info", "billing"), {
        taxPercent: 5, servicePercent: 0, upiId: "",
      });
      await setDoc(doc(db, "users", restaurantId), {
        restaurantId, role: "reception", email: firebaseUser.email, name: firebaseUser.displayName || "",
        isCreator: true, addedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "restaurants", restaurantId, "staff", restaurantId), {
        email: firebaseUser.email, name: firebaseUser.displayName || "", role: "reception",
        uid: restaurantId, status: "active", addedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "hotels", restaurantId), {
        status: HOTEL_STATUS.PENDING_APPROVAL,
        plan: selectedPlan,
        planAmount: PLAN_PRICING[selectedPlan].amount,
        txnRef: txnRef.trim(),
        ownerEmail: firebaseUser.email,
        createdAt: Date.now(),
        submittedAt: Date.now(),
      });

      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const containerStyle = { minHeight: "100vh", padding: 24, background: "linear-gradient(135deg, #faf8f5 0%, #f5f3ef 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 48 };
  const inputStyle = { width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #e6e1d6", fontSize: 15, outline: "none", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 700, color: "#6b6b7b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 };

  return (
    <div style={containerStyle}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>🍽️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e" }}>Set up your restaurant</h1>
        </div>

        {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

        {step === "details" && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <label style={labelStyle}>Restaurant Name *</label>
            <input style={{ ...inputStyle, marginBottom: 18 }} placeholder="e.g. Spice Garden" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <label style={labelStyle}>Tagline</label>
            <input style={{ ...inputStyle, marginBottom: 18 }} placeholder="e.g. Authentic North Indian Cuisine" value={form.tagline} onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))} />
            <label style={labelStyle}>Address</label>
            <input style={{ ...inputStyle, marginBottom: 18 }} placeholder="Restaurant address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            <label style={labelStyle}>Logo</label>
            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files[0])} style={{ display: "none" }} id="signup-logo" />
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
              <label htmlFor="signup-logo" style={{ padding: "12px 20px", borderRadius: 12, border: "2px dashed #e6e1d6", background: "#faf8f5", cursor: "pointer", fontSize: 14, color: "#6b6b7b", fontWeight: 600 }}>
                {logoUploading ? "Uploading..." : "📷 Upload Logo"}
              </label>
              {form.logoUrl && !logoUploading && <img src={form.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />}
            </div>
            <button onClick={goToSignIn} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "#e8a33d", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              Continue →
            </button>
            <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "#aaa" }}>
              Already have an account? <a href="/login" style={{ color: "#e8a33d", fontWeight: 700, textDecoration: "none" }}>Log in</a>
            </p>
          </div>
        )}

        {step === "signin" && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <p style={{ color: "#6b6b7b", marginBottom: 24, fontSize: 15 }}>Sign in with Google to secure your restaurant account</p>
            <button onClick={handleGoogleSignIn} disabled={loading} style={{ width: "100%", padding: 14, borderRadius: 12, border: "1px solid #e6e1d6", background: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {loading ? "Signing in..." : "Sign in with Google"}
            </button>
            <button onClick={() => setStep("details")} style={{ marginTop: 16, background: "none", border: "none", color: "#6b6b7b", fontSize: 14, cursor: "pointer" }}>← Go back</button>
          </div>
        )}

        {step === "plan" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              {PLAN_ORDER.map((planKey) => {
                const isSelected = selectedPlan === planKey;
                const feats = PLAN_FEATURES[planKey];
                return (
                  <div key={planKey} onClick={() => setSelectedPlan(planKey)}
                    style={{ background: "#fff", borderRadius: 18, padding: 22, cursor: "pointer", border: isSelected ? "2px solid #e8a33d" : "2px solid #eee", boxShadow: isSelected ? "0 4px 16px rgba(232,163,61,0.15)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{PLAN_LABELS[planKey]}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#e8a33d" }}>{PLAN_PRICING[planKey].label}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(feats).filter(([, v]) => v && v !== "none").map(([key]) => (
                        <span key={key} style={{ fontSize: 11.5, background: "#faf8f5", color: "#6b6b7b", padding: "3px 9px", borderRadius: 100 }}>{FEATURE_LABELS[key] || key}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={confirmPlan} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "#e8a33d", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              Continue with {PLAN_LABELS[selectedPlan]} →
            </button>
          </div>
        )}

        {step === "payment" && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Pay {PLAN_PRICING[selectedPlan].label}</h3>
            <p style={{ fontSize: 13.5, color: "#6b6b7b", marginBottom: 20 }}>Pay via UPI, then enter your transaction reference below so we can confirm it.</p>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${PLATFORM_UPI_ID}&pn=${encodeURIComponent(PLATFORM_PAYEE_NAME)}&am=${PLAN_PRICING[selectedPlan].amount}&cu=INR`)}`}
                alt="Payment QR" style={{ width: 180, height: 180, margin: "0 auto", display: "block", borderRadius: 12 }}
              />
              <div style={{ fontSize: 13, color: "#6b6b7b", marginTop: 10 }}>UPI ID: <strong>{PLATFORM_UPI_ID}</strong></div>
            </div>
            <label style={labelStyle}>Transaction Reference / UTR Number *</label>
            <input style={{ ...inputStyle, marginBottom: 20 }} placeholder="e.g. 425678901234" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} />
            <button onClick={submitPayment} disabled={loading} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "#e8a33d", color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "Submitting..." : "I've Paid — Submit for Review"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
            <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Thanks — under review!</h3>
            <p style={{ color: "#6b6b7b", fontSize: 14.5, lineHeight: 1.6, marginBottom: 20 }}>
              We're verifying your payment. You'll get access shortly — usually within a few hours.
            </p>
            <button onClick={() => router.replace("/login")} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "#1a1a2e", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}