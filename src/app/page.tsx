import { SolarTimeClock } from "@/components/SolarTimeClock";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 relative flex flex-col items-center justify-start overflow-y-auto py-12 px-6 gap-12">
      <div className="w-full flex items-center justify-center min-h-[70vh]">
        <SolarTimeClock />
      </div>
    </div>
  );
}
