import { notFound } from "next/navigation";
import { WorkspacePanel } from "@/components/WorkspacePanel";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "MCPと記憶 | Cloud Palette",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (
    process.env.MCP_PERSONAL_ENABLED !== "true" ||
    process.env.MCP_CONSOLE_ENABLED !== "true"
  )
    notFound();
  return (
    <WorkspacePanel
      consoleEnabled
      memoryEnabled={process.env.MCP_MEMORY_ENABLED === "true"}
    />
  );
}
