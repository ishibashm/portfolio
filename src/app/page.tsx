// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      {/* Hero Section */}
      <section className="h-screen flex flex-col justify-center items-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black opacity-50 z-0"></div>
        <div className="z-10 text-center px-4">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight animate-fade-in-up">
            Creative Developer
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto animate-fade-in-up delay-100">
            Crafting digital experiences with code and passion.
          </p>
          <div className="flex gap-4 justify-center animate-fade-in-up delay-200">
            <Link
              href="/portfolio"
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-full font-semibold transition-all hover:scale-105"
            >
              View Portfolio
            </Link>
            <Link
              href="/blog"
              className="px-8 py-3 bg-transparent border border-white hover:bg-white hover:text-black rounded-full font-semibold transition-all hover:scale-105"
            >
              Read Blog
            </Link>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 px-4 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8 text-indigo-400">About Me</h2>
          <p className="text-gray-400 leading-relaxed text-lg">
            I am a developer who loves to build things for the web. 
            From interactive front-end interfaces to robust back-end systems, 
            I enjoy every aspect of the development process.
          </p>
        </div>
      </section>
    </div>
  );
}
