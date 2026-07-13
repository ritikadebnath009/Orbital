"use client";

// Lightweight localStorage flags used only to drive the first-time "Getting
// Started" checklist. Not synced anywhere — purely a client-side UX hint, so
// a cleared browser just re-shows the checklist rather than breaking anything.

const KEYS = {
  funded: "orbital_onboarding_funded",
  swapped: "orbital_onboarding_swapped",
  dismissed: "orbital_onboarding_dismissed",
} as const;

function get(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}

function set(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, "1");
}

export const onboarding = {
  hasFunded: () => get(KEYS.funded),
  markFunded: () => set(KEYS.funded),
  hasSwapped: () => get(KEYS.swapped),
  markSwapped: () => set(KEYS.swapped),
  isDismissed: () => get(KEYS.dismissed),
  dismiss: () => set(KEYS.dismissed),
};
