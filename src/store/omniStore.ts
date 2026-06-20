import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WidgetConfig {
  type:
    | "chart"
    | "draft_editor"
    | "youtube_extractor"
    | "youtube_chat"
    | "xtrends"
    | "markdown_viewer"
    | "data_analyzer"
    | "jsonl_splitter"
    | "omni_pipeline"
    | "knowledge_editor";
  data: any;
  title?: string;
  size?: "normal" | "large" | "full" | "tall" | "wide" | "half";
}

export interface KnowledgeSuggestion {
  id: string;
  title: string;
  description: string;
  sourceType: "x" | "pdf" | "note";
  targetType: "note" | "pdf" | "x";
  relation: string;
  timestamp: string;
}

export interface OmniTerminalStore {
  activeWorkspaceId: string | null;
  canvasWidgets: WidgetConfig[];
  isSidebarOpen: boolean;
  workspaces: Record<string, WidgetConfig[]>; // 全ワークスペースの状態を保持
  globalWatchlist: string[]; // TradingViewと共有するウォッチリスト
  knowledgeSuggestions: KnowledgeSuggestion[]; // Knowledge Architectからの発見サジェスト
  setActiveWorkspace: (id: string) => void;
  addWidgetToCanvas: (widget: WidgetConfig) => void;
  removeWidgetFromCanvas: (index: number) => void;
  updateWidgetSize: (index: number, size: WidgetConfig["size"]) => void;
  clearCanvas: () => void;
  toggleSidebar: () => void;
  addToWatchlist: (tickers: string[]) => void;
  clearWatchlist: () => void;
  dismissSuggestion: (id: string) => void;
}

// ワークスペースごとの初期ウィジェット定義 (ユーザーの目的に合わせた整理)
const workspaceDefaults: Record<string, WidgetConfig[]> = {
  "ws-1": [
    {
      type: "data_analyzer",
      data: {},
      title: "JSONL形態素解析・キーワード抽出 (AI分析)",
      size: "full",
    },
  ],
  "ws-2": [],
  default: [
    {
      type: "data_analyzer",
      data: {},
      title: "X Information Analysis",
      size: "full",
    },
  ],
};

export const useOmniStore = create<OmniTerminalStore>()(
  persist(
    (set) => ({
      activeWorkspaceId: "ws-1",
      canvasWidgets: workspaceDefaults["ws-1"],
      isSidebarOpen: true,
      workspaces: workspaceDefaults,
      globalWatchlist: [
        "NASDAQ:AAPL",
        "NASDAQ:TSLA",
        "NASDAQ:NVDA",
        "CRYPTO:BTCUSD",
      ],
      knowledgeSuggestions: [],

      setActiveWorkspace: (id) =>
        set((state) => {
          const newWorkspaces = { ...state.workspaces };
          if (state.activeWorkspaceId) {
            newWorkspaces[state.activeWorkspaceId] = state.canvasWidgets;
          }

          return {
            workspaces: newWorkspaces,
            activeWorkspaceId: id,
            canvasWidgets: newWorkspaces[id] || workspaceDefaults[id] || [],
          };
        }),

      addWidgetToCanvas: (widget) =>
        set((state) => {
          let newWidgets = [...state.canvasWidgets];

          if (
            widget.type === "data_analyzer" ||
            widget.type === "omni_pipeline" ||
            widget.type === "knowledge_editor"
          ) {
            const existingIndex = newWidgets.findIndex(
              (w) => w.type === widget.type,
            );
            if (existingIndex >= 0) {
              // すでに存在する場合は、先頭に移動させて目立たせる
              const existingWidget = newWidgets.splice(existingIndex, 1)[0];
              return { canvasWidgets: [existingWidget, ...newWidgets] };
            }
          }

          return { canvasWidgets: [widget, ...newWidgets] };
        }),

      removeWidgetFromCanvas: (index) =>
        set((state) => ({
          canvasWidgets: state.canvasWidgets.filter((_, i) => i !== index),
        })),

      updateWidgetSize: (index, size) =>
        set((state) => {
          const newWidgets = [...state.canvasWidgets];
          if (newWidgets[index]) {
            newWidgets[index] = { ...newWidgets[index], size };
          }
          return { canvasWidgets: newWidgets };
        }),

      clearCanvas: () => set({ canvasWidgets: [] }),

      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      addToWatchlist: (tickers: string[]) =>
        set((state) => {
          const newWatchlist = [...state.globalWatchlist];
          let added = false;
          tickers.forEach((t) => {
            if (!newWatchlist.includes(t)) {
              newWatchlist.push(t);
              added = true;
            }
          });
          return added ? { globalWatchlist: newWatchlist } : state;
        }),

      clearWatchlist: () => set({ globalWatchlist: [] }),

      dismissSuggestion: (id) =>
        set((state) => ({
          knowledgeSuggestions: state.knowledgeSuggestions.filter(
            (s) => s.id !== id,
          ),
        })),
    }),
    {
      name: "omni-terminal-storage",
      version: 7, // バージョンを上げて古いローカルストレージを強制リセット
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        isSidebarOpen: state.isSidebarOpen,
        globalWatchlist: state.globalWatchlist,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.activeWorkspaceId && state.workspaces) {
          state.canvasWidgets =
            state.workspaces[state.activeWorkspaceId] ||
            workspaceDefaults[state.activeWorkspaceId] ||
            [];
        }
      },
      migrate: (persistedState: any, version: number) => {
        // バージョン7未満からの強制移行
        if (version < 7) {
          return {
            ...persistedState,
            workspaces: workspaceDefaults,
            activeWorkspaceId: "ws-1",
            knowledgeSuggestions: [],
          };
        }
        return persistedState;
      },
    },
  ),
);
