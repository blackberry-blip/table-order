// lib/plans.js

export const PLAN_FEATURES = {
  base: {
    floors: false, vipTables: false, combos: false, customization: false,
    splitBill: false, upiQr: false, analytics: "none",
    brandColor: false, promoBanner: false, rating: false,
  },
  mid: {
    floors: true, vipTables: true, combos: true, customization: true,
    splitBill: false, upiQr: true, analytics: "basic",
    brandColor: true, promoBanner: false, rating: true,
  },
  pro: {
    floors: true, vipTables: true, combos: true, customization: true,
    splitBill: true, upiQr: true, analytics: "full",
    brandColor: true, promoBanner: true, rating: true,
  },
};

export function getPlanFeatures(plan) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.base;
}

export const PLAN_LABELS = { base: "Base", mid: "Mid", pro: "Pro" };

// NEW: pricing shown on both /signup and the receptionist upgrade screen.
// Single source of truth — never hardcode a price anywhere else.
export const PLAN_PRICING = {
  base: { amount: 499, cycleDays: 30, label: "₹1,999 / month" },
  mid:  { amount: 999, cycleDays: 30, label: "₹2,999 / month" },
  pro:  { amount: 1799, cycleDays: 30, label: "₹3,799 / month" },
};

export const PLAN_ORDER = ["base", "mid", "pro"];

// NEW: hotel account lifecycle states — single source of truth so admin
// panel, login, and auth-guard all reference the same strings.
export const HOTEL_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  PENDING_APPROVAL: "pending_approval",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  EXPIRED: "expired",
  REJECTED: "rejected",
};

// Your business UPI ID that customers pay signup/renewal fees to.
// (Separate from a restaurant's own billing.upiId, which is hotel->diner.)
export const PLATFORM_UPI_ID = "yourbusiness@upi"; // <-- replace with your real UPI ID
export const PLATFORM_PAYEE_NAME = "Table Order";   // <-- replace with your business name