import prisma from "@/lib/prisma";
import {
  Terminal,
  Shield,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

export const revalidate = 0; // Disable cache to get real-time logs

export default async function AgentLogPage() {
  let logs: any[] = [];
  let successCount = 0;
  let errorCount = 0;

  try {
    logs = await prisma.agentActivityLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    successCount = await prisma.agentActivityLog.count({
      where: { status: "SUCCESS" },
    });

    errorCount = await prisma.agentActivityLog.count({
      where: { status: "FAILURE_ROLLEDBACK" },
    });
  } catch (err) {
    console.error("Failed to fetch agent logs:", err);
  }

  return (
    <div className="min-h-screen bg-black text-emerald-400 font-mono relative overflow-hidden p-6 custom-scrollbar select-none">
      {/* Retro scanline & screen noise overlays */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] opacity-80" />
      <div className="absolute inset-0 bg-radial-glow pointer-events-none z-10"></div>

      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-25"></div>

      <div className="max-w-6xl mx-auto relative z-20 space-y-6">
        {/* Header Console Navigation */}
        <div className="flex justify-between items-center border-b border-emerald-950 pb-4 mb-4">
          <Link
            href="/relocation/simulator"
            className="flex items-center gap-2 text-xs text-emerald-500 hover:text-emerald-300 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            RETURN TO COMMANDER
          </Link>
          <div className="text-[10px] text-emerald-600 font-bold tracking-widest uppercase flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            SYS-DAEMON LINK ESTABLISHED
          </div>
        </div>

        {/* System Diagnostics Block */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-emerald-950/5 border border-emerald-500/20 rounded-lg p-4 flex flex-col gap-2 shadow-[0_0_15px_rgba(16,185,129,0.02)] hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center gap-2 text-emerald-500">
              <Cpu className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Agent Core Status
              </span>
            </div>
            <span className="text-xl font-bold text-emerald-300">ONLINE</span>
            <span className="text-[9px] text-emerald-600">
              Runtime: Python 3.11 + SDK
            </span>
          </div>

          <div className="bg-emerald-950/5 border border-emerald-500/20 rounded-lg p-4 flex flex-col gap-2 shadow-[0_0_15px_rgba(16,185,129,0.02)] hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center gap-2 text-emerald-500">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Immune System
              </span>
            </div>
            <span className="text-xl font-bold text-emerald-300">
              ACTIVE [100%]
            </span>
            <span className="text-[9px] text-emerald-600">
              Auto-Rollback / Sanity Checks
            </span>
          </div>

          <div className="bg-emerald-950/5 border border-emerald-500/20 rounded-lg p-4 flex flex-col gap-2 shadow-[0_0_15px_rgba(16,185,129,0.02)] hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Evolutions Succeeded
              </span>
            </div>
            <span className="text-xl font-bold text-emerald-300">
              {successCount}
            </span>
            <span className="text-[9px] text-emerald-600">
              Prisma Theme Updates Saved
            </span>
          </div>

          <div className="bg-emerald-950/5 border border-emerald-500/20 rounded-lg p-4 flex flex-col gap-2 shadow-[0_0_15px_rgba(16,185,129,0.02)] hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center gap-2 text-emerald-500">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Self-Healing Triggers
              </span>
            </div>
            <span className="text-xl font-bold text-red-400">{errorCount}</span>
            <span className="text-[9px] text-emerald-600">
              Invalid outputs auto-reverted
            </span>
          </div>
        </div>

        {/* Live Terminal Log Stream */}
        <div className="bg-black/90 border border-emerald-500/30 rounded-xl p-5 flex flex-col gap-4 shadow-[0_0_40px_rgba(16,185,129,0.05)]">
          <div className="flex justify-between items-center border-b border-emerald-950 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                COGNITIVE ACTIVITY FEED / 思考ログ
              </h2>
            </div>
            <div className="text-[10px] text-emerald-600 font-mono">
              Displaying last 100 entries
            </div>
          </div>

          {/* Logs Feed */}
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-emerald-700 text-xs">
                [SYSTEM] NO COGNITIVE LOGS RECORDED IN DATABASE yet.
              </div>
            ) : (
              logs.map((log) => {
                const dateStr = new Date(log.timestamp).toISOString();
                const isError = log.status === "FAILURE_ROLLEDBACK";

                return (
                  <div
                    key={log.id}
                    className={`border rounded-lg p-3 bg-black/40 hover:bg-emerald-950/5 transition-colors group ${
                      isError
                        ? "border-red-950 hover:border-red-800"
                        : "border-emerald-950/80 hover:border-emerald-800/80"
                    }`}
                  >
                    {/* Log Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-emerald-950/40 pb-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-emerald-700 font-bold">
                          {dateStr}
                        </span>
                        <span className="text-emerald-600">|</span>
                        <span className="text-emerald-300 font-semibold">
                          [{log.triggerType}]
                        </span>
                        <span className="text-emerald-600">|</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            isError
                              ? "bg-red-950/50 text-red-400 border border-red-900/30"
                              : "bg-emerald-950/50 text-emerald-400 border border-emerald-900/30"
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <span className="text-[9px] text-emerald-600 uppercase tracking-widest italic shrink-0">
                        {log.actions}
                      </span>
                    </div>

                    {/* Trigger Detail */}
                    <div className="text-[11px] text-emerald-500 mb-2 leading-relaxed bg-emerald-950/10 p-2 rounded border border-emerald-950/30">
                      <span className="text-emerald-600 font-bold uppercase mr-1">
                        [TRIGGER DETAIL]:
                      </span>
                      {log.details}
                    </div>

                    {/* Detailed Thought Accordion */}
                    <details className="group/details mt-2">
                      <summary className="list-none flex items-center gap-1.5 text-[9px] text-emerald-600 hover:text-emerald-400 cursor-pointer select-none font-bold uppercase transition-colors">
                        <span className="transition-transform group-open/details:rotate-90 inline-block">
                          ▶
                        </span>
                        READ AGENT THOUGHT PROCESS & CODE CHANGES /
                        思考・ソース差分を読む
                      </summary>

                      <div className="mt-3 space-y-3 pl-3 border-l border-emerald-900/50 text-xs text-emerald-400/90 leading-relaxed font-sans text-justify whitespace-pre-wrap font-mono">
                        {/* System Rollback Alert if errored */}
                        {isError && (
                          <div className="p-3 bg-red-950/20 border border-red-500/30 rounded text-red-400 text-[10px] font-mono leading-relaxed mb-3">
                            <h4 className="font-bold flex items-center gap-1.5 mb-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              IMMUNIZATION SYSTEM ROLLBACK /
                              免疫自動自己修復発動
                            </h4>
                            <p>
                              エージェントが作成したコードに構文エラー、または制約違反が検出されました。
                              <br />
                              Next.jsのクラッシュを防止するため、システムは自動的に変更を適用せず
                              Git ロールバックを実施しました。
                              <br />
                              <span className="font-bold text-red-300">
                                [ERROR DETAIL]: {log.errorMessage}
                              </span>
                            </p>
                          </div>
                        )}

                        {/* Thought process block */}
                        <div className="bg-emerald-950/5 border border-emerald-900/30 p-3.5 rounded-lg max-h-72 overflow-y-auto custom-scrollbar font-mono text-[10px] whitespace-pre-wrap">
                          <span className="text-emerald-600 font-bold block mb-2 uppercase tracking-wider">
                            [1. Agent Cognitive Flow / 思考プロセス]:
                          </span>
                          {log.thoughtProcess}
                        </div>

                        {/* Code change display */}
                        {log.codeChange && (
                          <div className="bg-black border border-emerald-900/60 rounded-lg overflow-hidden">
                            <div className="bg-emerald-950/20 border-b border-emerald-900/60 px-3 py-1.5 text-[9px] font-bold text-emerald-500 font-mono">
                              PROPOSED CHANGESET / 適用された変更パラメータ
                            </div>
                            <pre className="p-3 text-[10px] overflow-x-auto text-emerald-400/80 custom-scrollbar font-mono">
                              {JSON.stringify(log.codeChange, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[9px] text-emerald-700 font-mono py-4 border-t border-emerald-950/50">
          SECURE PORTAL CORE V1.0 // DEVELOPED BY ANTIGRAVITY AGENT DAEMON //
          ALL LOGS IMMUTABLY STORED
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .bg-radial-glow {
          background: radial-gradient(circle 800px at 50% 200px, rgba(16,185,129,0.05), transparent 80%);
        }
        details summary::-webkit-details-marker {
          display: none;
        }
      `,
        }}
      />
    </div>
  );
}
