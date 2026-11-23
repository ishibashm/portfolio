import { Suspense } from "react";
import { FortuneReport } from "@/components/fortune/FortuneReport";
import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/siteUrl";
import { description, path, title } from "./metadataValues";

// Evaluate the server flag and authenticated report on each page request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: path },
  title,
  description,
  openGraph: pageOpenGraph(path, title, description),
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <FortuneReport />
      </Suspense>
      {children}
    </>
  );
}
