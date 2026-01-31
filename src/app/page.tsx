'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import Background from '@/components/ui/Background';

export default function Home() {
  return (
    <div className="text-white font-sans min-h-screen">
      <Background />
      
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center relative z-10">
        <div className="text-center px-4 max-w-4xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-6xl md:text-8xl font-bold mb-6 tracking-tighter bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent"
          >
            Creative Developer
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            Crafting digital experiences that merge <span className="text-indigo-400 font-medium">art</span> and <span className="text-purple-400 font-medium">technology</span>.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/portfolio"
              className="group relative px-8 py-4 bg-white text-black rounded-full font-bold overflow-hidden transition-all hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:-translate-y-1"
            >
              <span className="relative z-10">View Portfolio</span>
              <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            
            <Link
              href="/blog"
              className="group relative px-8 py-4 bg-transparent border border-white/20 text-white rounded-full font-bold overflow-hidden transition-all hover:bg-white/10 hover:border-white/40 backdrop-blur-sm hover:-translate-y-1"
            >
              <span>Read Blog</span>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Featured/About Preview Section */}
      <section className="py-32 px-4 relative z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <motion.h2 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
            >
              Passionate about Code & Design
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-gray-400 text-lg leading-relaxed"
            >
              I specialize in building modern web applications using cutting-edge technologies like Next.js, React, and Tailwind CSS. My goal is to create performant, accessible, and beautiful interfaces.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link href="/about" className="inline-flex items-center text-white/80 hover:text-indigo-400 transition-colors group">
                <span className="border-b border-indigo-500/50 pb-1 group-hover:border-indigo-400">Learn more about me</span>
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </motion.div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: "spring" }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-20 animate-pulse"></div>
            <div className="relative bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl aspect-square group">
              <Image
                src="/images/profile.jpg"
                alt="Profile"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                unoptimized
              />
              <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-overlay"></div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
