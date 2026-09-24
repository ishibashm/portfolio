"use client";
import { createContext, useContext } from "react";
const GmailEnabled = createContext(false);
export function GmailFeature({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <GmailEnabled.Provider value={enabled}>{children}</GmailEnabled.Provider>
  );
}
export function useGmailEnabled() {
  return useContext(GmailEnabled);
}
