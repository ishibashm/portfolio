import { Background } from "./_components/background";
import { Footer } from "./_components/footer";
import { Newsletter } from "./_components/newsletter";

export default function Home() {
  return (
    <main className="p-inset h-[100dvh] w-full">
      <div className="relative h-full w-full">
        <Background src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/alt-g7Cv2QzqL3k6ey3igjNYkM32d8Fld7.mp4" placeholder="/newsletter/alt-placeholder.png" />
        <Newsletter />
        <Footer />
      </div>
    </main>
  );
}
