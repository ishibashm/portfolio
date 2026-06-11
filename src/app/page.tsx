import { SolarTimeClock } from "@/components/SolarTimeClock";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 relative flex items-center justify-center">
      <SolarTimeClock />
    </div>
  );
}
