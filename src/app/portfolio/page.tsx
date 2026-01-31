import { Metadata } from "next";
import PortfolioClient from "./PortfolioClient";

// Server Component for Metadata
export const metadata: Metadata = {
  title: "Portfolio | My Portfolio",
  description: "Selected works and experiments.",
};

export default function PortfolioPage() {
  return <PortfolioClient />;
}
