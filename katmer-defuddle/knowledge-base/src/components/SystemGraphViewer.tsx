"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { Loader2 } from "lucide-react";

export default function SystemGraphViewer() {
  const [data, setData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fgRef = useRef<ForceGraphMethods>(null as any);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    // Handle resize
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 80, // rough offset for headers
      });
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/kb/api/system-graph");
        if (res.status === 404) {
          throw new Error(
            "System Graph not found. Please run scripts/run_graphify.bat first.",
          );
        }
        if (!res.ok) throw new Error("Failed to fetch graph data");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    // Center on clicked node
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2, 2000);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-red-500 font-medium">Error: {error}</div>;
  }

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="p-10 text-zinc-500">
        No map available yet. Please run{" "}
        <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">
          run_graphify.bat
        </code>{" "}
        to generate it.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 relative">
      <div className="absolute top-4 left-4 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs shadow-sm">
        <p className="font-semibold mb-1">Graph Legend</p>
        <p className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>{" "}
          Directory
        </p>
        <p className="flex items-center gap-2 mt-1">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>{" "}
          Markdown / Text
        </p>
        <p className="flex items-center gap-2 mt-1">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span>{" "}
          Code Files
        </p>
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeId="id"
        nodeLabel="id"
        nodeColor={(node: any) => {
          const id = node.id || "";
          if (id.endsWith("/")) return "#3b82f6"; // dir
          if (id.endsWith(".md") || id.endsWith(".txt")) return "#22c55e"; // markdown
          if (id.endsWith(".ts") || id.endsWith(".js") || id.endsWith(".tsx"))
            return "#f97316"; // code
          return "#9ca3af";
        }}
        linkColor={() => "#3f3f4655"}
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label =
            typeof node.id === "string"
              ? node.id.split("/").pop() || node.id
              : "Unknown";
          const fontSize = 12 / globalScale;
          const r = 4;

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);

          const id = typeof node.id === "string" ? node.id : "";
          let color = "#9ca3af";
          if (id.endsWith("/")) color = "#3b82f6";
          else if (id.endsWith(".md") || id.endsWith(".txt")) color = "#22c55e";
          else if (
            id.endsWith(".ts") ||
            id.endsWith(".js") ||
            id.endsWith(".tsx") ||
            id.endsWith(".py")
          )
            color = "#f97316";

          ctx.fillStyle = node.color || color;
          ctx.fill();

          if (globalScale > 1.2) {
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = document.documentElement?.classList.contains("dark")
              ? "#e4e4e7"
              : "#27272a";
            ctx.fillText(label, node.x, node.y + r + fontSize);
          }
        }}
      />
    </div>
  );
}
