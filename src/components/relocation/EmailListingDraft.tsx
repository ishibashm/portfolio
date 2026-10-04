"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const context = useEmailListingDraft();
  const router = useRouter();
  return (
    <details
      className="group rounded-2xl border border-stone-200 bg-white/90 shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-bold text-stone-700">
        <Mail className="h-4 w-4 text-rose-500" aria-hidden />
        Gmail の物件通知から候補を取り込む（任意）
        <span className="ml-auto text-xs font-normal text-stone-500 group-open:hidden">
          開く
        </span>
      </summary>
      {open && (
        <div className="border-t border-stone-100 p-4">
          <GmailConnectionPanel
            showMap
            onSelect={(url, details) => {
              context?.setDraft({ ...details, url });
              router.push("/relocation/arbitrage#candidate-import");
            }}
          />
        </div>
      )}
    </details>
  );
}
