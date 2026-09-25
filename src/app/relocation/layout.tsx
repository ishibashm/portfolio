import { EmailListingDraftProvider } from "@/components/relocation/EmailListingDraft";
export default function RelocationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EmailListingDraftProvider>{children}</EmailListingDraftProvider>;
}
