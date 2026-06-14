import { SolarTimeClock } from "@/components/SolarTimeClock";
import { CosmicCalendar } from "@/components/widgets/CosmicCalendar";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 relative flex flex-col items-center justify-start overflow-y-auto py-12 px-6 gap-12">
      <div className="w-full flex items-center justify-center min-h-[70vh]">
        <SolarTimeClock />
      </div>

      {/* Calendar Section on Portal */}
      <div className="max-w-[1200px] w-full mt-6 bg-white/[0.01] border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden">
        {/* Glowing top line */}
        <div
          className="absolute top-0 left-0 w-full h-[1px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-accent, #10b981), transparent)",
          }}
        />
        <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 8%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 25%, transparent)",
            }}
          >
            <span
              className="text-xs font-mono"
              style={{ color: "var(--color-accent, #10b981)" }}
            >
              📅
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              吉凶・天体テレメトリカレンダー
            </h2>
            <p className="text-xs text-zinc-500 font-mono uppercase">
              {"// Portal Cosmic Calendar Node"}
            </p>
          </div>
        </div>
        <CosmicCalendar />
      </div>
    </div>
  );
}
