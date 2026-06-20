import React from "react";
import { WidgetConfig, useOmniStore } from "@/store/omniStore";
import { TimesFMChart } from "../widgets/TimesFMChart";
import { SocialDraftEditor } from "../widgets/SocialDraftEditor";
import YouTubeExtractor from "../widgets/YouTubeExtractor";
import YouTubeChat from "../widgets/YouTubeChat";
import XTrendsWidget from "../widgets/XTrendsWidget";
import DataAnalyzerWidget from "../widgets/DataAnalyzerWidget";
import MarkdownViewerWidget from "../widgets/MarkdownViewerWidget";
import JSONLSplitterWidget from "../widgets/JSONLSplitterWidget";
import OmniPipelineWidget from "../widgets/OmniPipelineWidget";
import KnowledgeEditorWidget from "../widgets/KnowledgeEditorWidget";

interface DynamicCanvasProps {
  widgets: WidgetConfig[];
}

export const DynamicCanvas = ({ widgets }: DynamicCanvasProps) => {
  const {
    removeWidgetFromCanvas,
    updateWidgetSize,
    knowledgeSuggestions,
    dismissSuggestion,
    addWidgetToCanvas,
  } = useOmniStore();

  const handleOpenKnowledge = (suggestionId: string) => {
    addWidgetToCanvas({
      type: "knowledge_editor",
      data: {},
      title: "Knowledge Editor",
      size: "wide",
    });
    dismissSuggestion(suggestionId);
  };

  return (
    <aside className="flex-1 bg-[#050810] overflow-y-auto p-4 md:p-6 lg:p-8 relative custom-scrollbar flex flex-col">
      <div className="flex justify-between items-center mb-6 px-2">
        <h2 className="text-xl font-bold text-slate-100 tracking-wider uppercase flex items-center gap-3">
          <div className="w-2 h-6 bg-blue-500 rounded-sm"></div>
          Dynamic Workspace
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            LIVE
          </span>
          <span className="text-[10px] text-slate-400 font-mono bg-slate-900/80 px-3 py-1 rounded border border-slate-700/50 shadow-inner">
            4K OPTIMIZED
          </span>
        </div>
      </div>

      {/* Aha Moment Notification: Knowledge Suggestions */}
      {knowledgeSuggestions && knowledgeSuggestions.length > 0 && (
        <div className="mb-8 px-2">
          {knowledgeSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="relative group bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-5 shadow-lg shadow-indigo-500/10 overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:bg-indigo-900/40 hover:border-indigo-400/50"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>

              <div className="flex items-start gap-4">
                <div className="mt-1 bg-indigo-500/20 p-2.5 rounded-lg border border-indigo-500/30 text-indigo-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h13l4-3.5L18 6Z" />
                    <path d="M12 13v8" />
                    <path d="M12 3v3" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-indigo-400 tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase">
                      Aha Moment
                    </span>
                    <h3 className="text-base font-semibold text-slate-200">
                      {suggestion.title}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
                    {suggestion.description}
                  </p>

                  <div className="flex items-center gap-3 mt-3 text-xs font-mono text-slate-500">
                    <span className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded border border-slate-700">
                      {suggestion.sourceType === "note" && (
                        <svg
                          className="w-3.5 h-3.5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      {suggestion.sourceType === "x" && (
                        <svg
                          className="w-3.5 h-3.5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 4l11.733 16h4.267l-11.733-16z" />
                          <path d="M4 20l6.768-6.768m2.46-2.46L20 4" />
                        </svg>
                      )}
                      Source
                    </span>
                    <span className="text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 rounded-full text-[10px] tracking-widest">
                      {suggestion.relation}
                    </span>
                    <span className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded border border-slate-700">
                      {suggestion.targetType === "note" && (
                        <svg
                          className="w-3.5 h-3.5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      {suggestion.targetType === "x" && (
                        <svg
                          className="w-3.5 h-3.5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 4l11.733 16h4.267l-11.733-16z" />
                          <path d="M4 20l6.768-6.768m2.46-2.46L20 4" />
                        </svg>
                      )}
                      Target
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 pl-14 md:pl-0">
                <button
                  onClick={() => handleOpenKnowledge(suggestion.id)}
                  className="flex-1 md:flex-none text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  チャート・業績を確認
                </button>
                <button
                  onClick={() => dismissSuggestion(suggestion.id)}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition-all"
                  title="閉じる"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50">
          <div className="w-20 h-20 border-2 border-dashed border-slate-700 rounded-2xl mb-6 flex items-center justify-center bg-slate-800/30">
            <span className="text-3xl">+</span>
          </div>
          <p className="font-bold text-slate-300 text-lg tracking-wide mb-2">
            No Active Widgets
          </p>
          <p className="text-sm">
            左側のサイドバーからワークスペースを選択するか、
          </p>
          <p className="text-sm">
            チャットでAIに指示を出してツールを展開してください。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 auto-rows-min gap-4 lg:gap-6 pb-20">
          {widgets.map((widget, idx) => {
            // Determine sizing classes based on widget config
            // Default is 'normal' which takes 1 column and medium height
            let colSpan =
              "col-span-1 md:col-span-1 xl:col-span-1 2xl:col-span-1";
            let rowSpan = "row-span-1";
            let heightClass = "h-[450px]"; // Base height

            // 黄金比・4Kモジュール配置ロジック
            if (widgets.length === 1) {
              // 1つしかない場合は全画面ぶち抜き
              colSpan = "col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-4";
              heightClass = "h-[calc(100vh-140px)]";
            } else {
              switch (widget.size) {
                case "full":
                  colSpan =
                    "col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-4";
                  heightClass = "h-[650px] 2xl:h-[750px]";
                  rowSpan = "row-span-2";
                  break;
                case "wide":
                  colSpan =
                    "col-span-1 md:col-span-2 xl:col-span-2 2xl:col-span-3";
                  heightClass = "h-[500px] 2xl:h-[600px]";
                  rowSpan = "row-span-2";
                  break;
                case "tall":
                  colSpan =
                    "col-span-1 md:col-span-1 xl:col-span-1 2xl:col-span-1";
                  heightClass = "h-[650px] 2xl:h-[750px]";
                  rowSpan = "row-span-2";
                  break;
                case "half":
                  colSpan =
                    "col-span-1 md:col-span-1 xl:col-span-1 2xl:col-span-2";
                  heightClass = "h-[400px]";
                  rowSpan = "row-span-1";
                  break;
                case "large":
                  colSpan =
                    "col-span-1 md:col-span-2 xl:col-span-2 2xl:col-span-2";
                  heightClass = "h-[600px]";
                  rowSpan = "row-span-2";
                  break;
                case "normal":
                default:
                  break;
              }


            }

            return (
              <div
                key={`${widget.type}-${idx}`}
                className={`${colSpan} ${rowSpan} bg-slate-900/70 border border-slate-700/60 rounded-xl flex flex-col shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:border-slate-600/80 ${heightClass}`}
              >
                {widget.title && (
                  <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between group">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 opacity-70"></span>
                      {widget.title}
                    </span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 bg-slate-900 px-1 py-0.5 rounded border border-slate-700">
                      <button
                        onClick={() => updateWidgetSize(idx, "normal")}
                        className={`px-1.5 py-0.5 text-[9px] rounded ${widget.size === "normal" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
                        title="標準サイズ"
                      >
                        S
                      </button>
                      <button
                        onClick={() => updateWidgetSize(idx, "wide")}
                        className={`px-1.5 py-0.5 text-[9px] rounded ${widget.size === "wide" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
                        title="横長に広げる"
                      >
                        M
                      </button>
                      <button
                        onClick={() => updateWidgetSize(idx, "full")}
                        className={`px-1.5 py-0.5 text-[9px] rounded ${widget.size === "full" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
                        title="全幅に広げる"
                      >
                        L
                      </button>
                      <div className="w-px h-3 bg-slate-700 mx-1"></div>
                      <button
                        onClick={() => removeWidgetFromCanvas(idx)}
                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded"
                        title="閉じる"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-hidden h-full relative">
                  {widget.type === "chart" && (
                    <TimesFMChart forecastData={widget.data.forecast || []} />
                  )}
                  {widget.type === "draft_editor" && (
                    <SocialDraftEditor draftText={widget.data.content || ""} />
                  )}
                  {widget.type === "youtube_extractor" && <YouTubeExtractor />}
                  {widget.type === "youtube_chat" && <YouTubeChat />}
                  {widget.type === "xtrends" && <XTrendsWidget />}
                  {widget.type === "data_analyzer" && <DataAnalyzerWidget />}
                  {widget.type === "markdown_viewer" && (
                    <MarkdownViewerWidget />
                  )}
                  {widget.type === "jsonl_splitter" && <JSONLSplitterWidget />}
                  {widget.type === "omni_pipeline" && <OmniPipelineWidget />}
                  {widget.type === "knowledge_editor" && (
                    <KnowledgeEditorWidget />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
