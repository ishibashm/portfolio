import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="text-white font-sans">
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center relative overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-black z-0"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl animate-pulse delay-700"></div>

        <div className="z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="text-6xl md:text-8xl font-bold mb-6 tracking-tighter bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent animate-fade-in-up">
            Creative Developer
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto animate-fade-in-up delay-100 leading-relaxed">
            Crafting digital experiences that merge <span className="text-indigo-400">art</span> and <span className="text-purple-400">technology</span>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-200">
            <Link
              href="/portfolio"
              className="px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold transition-all transform hover:scale-105 shadow-lg shadow-white/10"
            >
              View Portfolio
            </Link>
            <Link
              href="/blog"
              className="px-8 py-4 bg-transparent border border-white/20 hover:bg-white/10 text-white rounded-full font-bold transition-all transform hover:scale-105 backdrop-blur-sm"
            >
              Read Blog
            </Link>
          </div>
        </div>
      </section>

      {/* Featured/About Preview Section */}
      <section className="py-32 px-4 relative z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Passionate about Code & Design
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed">
              I specialize in building modern web applications using cutting-edge technologies like Next.js, React, and Tailwind CSS. My goal is to create performant, accessible, and beautiful interfaces.
            </p>
            <Link href="/about" className="inline-block text-white border-b border-indigo-500 pb-1 hover:text-indigo-400 transition-colors">
              Learn more about me →
            </Link>
          </div>
          <div className="relative transform hover:rotate-1 transition-transform duration-500">
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur-lg opacity-30"></div>
            <div className="relative bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl aspect-square">
              <Image
                src="/images/profile.jpg"
                alt="Profile"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
