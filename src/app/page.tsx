import { SolarTimeClock } from "@/components/SolarTimeClock";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 relative flex flex-col items-center justify-start overflow-y-auto py-4 px-6 gap-6">
      <SolarTimeClock />
    </div>
  );
}
