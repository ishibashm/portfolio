"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { Loader2 } from "lucide-react";

export default function GraphViewer() {
  const [data, setData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fgRef = useRef<ForceGraphMethods>(null as any);
  const router = useRouter();
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
        const res = await fetch("/kb/api/graph", { credentials: "include" });
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

  const handleNodeClick = useCallback(
    (node: any) => {
      if (node.group === "document") {
        router.push(`/${node.id}`);
      } else {
        // Center on clicked tag/category
        if (fgRef.current) {
          fgRef.current.centerAt(node.x, node.y, 1000);
          fgRef.current.zoom(2, 2000);
        }
      }
    },
    [router],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-red-500">Error: {error}</div>;
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-10 text-zinc-500">
        No documents available to map yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 relative">
      <div className="absolute top-4 left-4 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs shadow-sm">
        <p className="font-semibold mb-1">Graph Legend</p>
        <p className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>{" "}
          Documents (Click to open)
        </p>
        <p className="flex items-center gap-2 mt-1">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span>{" "}
          Tags
        </p>
        <p className="flex items-center gap-2 mt-1">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block"></span>{" "}
          Categories
        </p>
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel="name"
        nodeColor={(node: any) => {
          if (node.group === "document") return "#3b82f6"; // blue-500
          if (node.group === "category") return "#a855f7"; // purple-500
          if (node.group === "tag") return "#f97316"; // orange-500
          return "#9ca3af";
        }}
        nodeVal={(node) => node.val}
        linkColor={() => "#3f3f4655"} // muted zinc dark
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        // Visual polish
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          const r = Math.sqrt(Math.max(0, node.val || 1)) * 4;

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle =
            node.color ||
            (node.group === "document"
              ? "#3b82f6"
              : node.group === "category"
                ? "#a855f7"
                : "#f97316");
          ctx.fill();

          // Only draw label if somewhat zoomed in, or if it's a big node
          if (globalScale > 1.2 || node.val > 3) {
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = document.documentElement.classList.contains("dark")
              ? "#e4e4e7"
              : "#27272a";
            ctx.fillText(label, node.x, node.y + r + fontSize);
          }
        }}
      />
    </div>
  );
}
