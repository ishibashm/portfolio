"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { EmailListing } from "@/lib/listingDetails";
import { GmailConnectionPanel } from "./GmailConnectionPanel";
const DraftContext = createContext<{
  draft: EmailListing | null;
  setDraft: (draft: EmailListing | null) => void;
} | null>(null);
/** Selected fields live only in React memory across client navigation; never browser storage or URL. */
export function EmailListingDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<EmailListing | null>(null);
  return (
    <DraftContext.Provider value={{ draft, setDraft }}>
      {children}
    </DraftContext.Provider>
  );
}
export const useEmailListingDraft = () => useContext(DraftContext);
export function CandidateEmailImport() {
  const context = useEmailListingDraft();
  const router = useRouter();
  return (
    <GmailConnectionPanel
      onSelect={(url, details) => {
        context?.setDraft({ ...details, url });
        router.push("/relocation/arbitrage#candidate-import");
      }}
    />
  );
}
