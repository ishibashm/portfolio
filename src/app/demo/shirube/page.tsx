import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/siteStructure";
import { ShirubeDemoClient } from "./ShirubeDemoClient";

export const metadata: Metadata = {
  title: "しるべ歩き回り試作（デモ）",
  description:
    "案内役しるべが画面下端をゆっくり歩き回る試作デモページ。検索エンジン非公開。",
  robots: NOINDEX_ROBOTS,
};

export default function ShirubeDemoPage() {
  return <ShirubeDemoClient />;
}
