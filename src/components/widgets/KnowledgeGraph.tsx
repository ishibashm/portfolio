"use client";

import React, { useMemo, useState } from "react";
import { Network, HelpCircle, Layers, ZoomIn } from "lucide-react";

interface DocumentNode {
  id: string;
  kb_id: number;
  title: string;
  category?: string | null;
  tags: string[];
}

interface KnowledgeGraphProps {
  documents: DocumentNode[];
  onNodeClick: (doc: any) => void;
  selectedNodeId?: string | null;
}

export function KnowledgeGraph({
  documents,
  onNodeClick,
  selectedNodeId,
}: KnowledgeGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<DocumentNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const width = 600;
  const height = 400;

  // Determine colors based on category
  const getCategoryColor = (category?: string | null) => {
    switch (category?.toLowerCase()) {
      case "web extract":
      case "web":
        return "#10b981"; // Emerald
      case "note":
      case "knowledge":
        return "#6366f1"; // Indigo
      case "research":
      case "analysis":
        return "#f59e0b"; // Amber
      case "incident":
      case "itsm":
        return "#f43f5e"; // Rose
      default:
        return "#a1a1aa"; // Zinc
    }
  };

  // Layout calculations: deterministic layout based on document id hash and category clustering
  const nodes = useMemo(() => {
    if (documents.length === 0) return [];

    // Group by category to form clusters
    const categories = Array.from(new Set(documents.map((d) => d.category || "Other")));
    const clusterCenters = categories.reduce((acc, cat, idx) => {
      // Position clusters in a circle or layout grid
      const angle = (idx / categories.length) * 2 * Math.PI;
      const radius = 120;
      acc[cat] = {
        cx: width / 2 + Math.cos(angle) * radius,
        cy: height / 2 + Math.sin(angle) * radius,
      };
      return acc;
    }, {} as Record<string, { cx: number; cy: number }>);

    return documents.map((doc, idx) => {
      const cat = doc.category || "Other";
      const center = clusterCenters[cat] || { cx: width / 2, cy: height / 2 };

      // Add slight offset based on index to spread nodes in their cluster
      const angle = (idx / documents.length) * 10 * Math.PI;
      const radius = 30 + (idx % 3) * 15;
      const x = center.cx + Math.cos(angle) * radius;
      const y = center.cy + Math.sin(angle) * radius;

      // Ensure nodes fit in the SVG boundaries
      const padding = 30;
      const boundedX = Math.max(padding, Math.min(width - padding, x));
      const boundedY = Math.max(padding, Math.min(height - padding, y));

      return {
        ...doc,
        x: boundedX,
        y: boundedY,
        color: getCategoryColor(doc.category),
      };
    });
  }, [documents]);

  // Calculate links between nodes if they share at least one tag or have the same category
  const links = useMemo(() => {
    const calculatedLinks: Array<{ source: typeof nodes[0]; target: typeof nodes[0]; key: string }> = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        // Connect if they share any tag
        const sharedTags = nodeA.tags.filter((t) => nodeB.tags.includes(t));
        const sameCategory = nodeA.category === nodeB.category && nodeA.category !== null;

        if (sharedTags.length > 0 || sameCategory) {
          calculatedLinks.push({
            source: nodeA,
            target: nodeB,
            key: `${nodeA.id}-${nodeB.id}`,
          });
        }
      }
    }

    return calculatedLinks;
  }, [nodes]);

  // Filter nodes based on search query highlighting
  const highlightedNodeIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const query = searchQuery.toLowerCase();
    return new Set(
      nodes
        .filter(
          (n) =>
            n.title.toLowerCase().includes(query) ||
            n.tags.some((t) => t.toLowerCase().includes(query)) ||
            (n.category && n.category.toLowerCase().includes(query)),
        )
        .map((n) => n.id),
    );
  }, [nodes, searchQuery]);

  return (
    <div className="w-full bg-neutral-950 border border-neutral-900 rounded-2xl p-5 flex flex-col gap-4 text-white">
      {/* Header controls */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-400 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold text-neutral-100">ナレッジ関係性マップ</h3>
            <p className="text-[10px] text-neutral-500 font-mono">ITSM RELATIONSHIP VISUALIZER</p>
          </div>
        </div>

        {/* Highlight Search input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ノードを強調検索..."
          className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-xl text-xs focus:outline-none focus:border-indigo-500 placeholder:text-neutral-600 w-44 font-medium transition-colors"
        />
      </div>

      {/* Main SVG Graph */}
      <div className="relative border border-neutral-900 bg-neutral-950/40 rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center">
        {documents.length === 0 ? (
          <div className="text-center py-20 text-neutral-600 text-xs flex flex-col items-center gap-2">
            <Layers className="w-8 h-8 opacity-45" />
            <p>関連を表示するドキュメントがありません</p>
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            style={{ maxHeight: "400px" }}
          >
            {/* Links Layer */}
            <g>
              {links.map((link) => {
                const isHighlighted =
                  highlightedNodeIds.size > 0 &&
                  (highlightedNodeIds.has(link.source.id) || highlightedNodeIds.has(link.target.id));

                const isHovered =
                  hoveredNode &&
                  (hoveredNode.id === link.source.id || hoveredNode.id === link.target.id);

                return (
                  <line
                    key={link.key}
                    x1={link.source.x}
                    y1={link.source.y}
                    x2={link.target.x}
                    y2={link.target.y}
                    stroke={
                      isHovered
                        ? "rgba(99, 102, 241, 0.4)"
                        : isHighlighted
                          ? "rgba(16, 185, 129, 0.25)"
                          : "rgba(255, 255, 255, 0.05)"
                    }
                    strokeWidth={isHovered ? 1.5 : isHighlighted ? 1.2 : 0.8}
                    className="transition-all duration-300"
                  />
                );
              })}
            </g>

            {/* Nodes Layer */}
            <g>
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHighlighted = highlightedNodeIds.size > 0 && highlightedNodeIds.has(node.id);
                const isFaded =
                  (highlightedNodeIds.size > 0 && !isHighlighted) ||
                  (hoveredNode !== null && hoveredNode.id !== node.id);

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => onNodeClick(node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Node pulse glow (for highlighted or selected) */}
                    {(isSelected || isHighlighted) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={12}
                        fill={node.color}
                        opacity={isHighlighted ? 0.25 : 0.4}
                        className="animate-ping"
                      />
                    )}

                    {/* Main Node Circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? 7 : 5}
                      fill={node.color}
                      stroke={isSelected ? "#ffffff" : "transparent"}
                      strokeWidth={1.5}
                      opacity={isFaded ? 0.35 : 1.0}
                      className="transition-all duration-300"
                    />

                    {/* Node Text Label (always visible if selected/highlighted/hovered, else visible for clusters) */}
                    {(isSelected ||
                      isHighlighted ||
                      (hoveredNode && hoveredNode.id === node.id)) && (
                      <text
                        x={node.x}
                        y={node.y - 10}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={10}
                        fontWeight="bold"
                        opacity={isFaded ? 0.5 : 1.0}
                        className="pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      >
                        {node.title.length > 15 ? node.title.substring(0, 15) + "..." : node.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Hover node tooltip overlay inside SVG container */}
        {hoveredNode && (
          <div className="absolute bottom-3 left-3 bg-neutral-900/90 border border-neutral-800 rounded-xl px-3 py-2 text-[10px] space-y-0.5 pointer-events-none shadow-xl backdrop-blur-md animate-fade-in">
            <div className="flex items-center gap-1">
              <span className="font-bold text-neutral-200">KB{String(hoveredNode.kb_id).padStart(6, "0")}</span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getCategoryColor(hoveredNode.category) }}
              />
              <span className="text-neutral-400 capitalize">{hoveredNode.category || "Other"}</span>
            </div>
            <p className="font-medium text-white text-xs leading-normal max-w-[200px]">
              {hoveredNode.title}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {hoveredNode.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="px-1 py-0.25 bg-neutral-800 border border-neutral-700/60 rounded text-[8px] text-neutral-400"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend & Help Info */}
      <div className="flex justify-between items-center text-[10px] text-neutral-500 border-t border-neutral-900/80 pt-3 flex-wrap gap-2">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>Web Extract</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#6366f1]" />
            <span>Notes / Knowledge</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <span>Research</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#f43f5e]" />
            <span>Incidents</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>ノードクリックでドキュメント詳細を表示</span>
        </div>
      </div>
    </div>
  );
}
