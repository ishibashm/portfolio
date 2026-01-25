"use client";

import React from "react";
import ParticleBackground from "./_components/ParticleBackground";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ProjectAlphaPage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e1b4b] to-[#0f172a] text-white overflow-hidden selection:bg-yellow-500/30">
      <ParticleBackground />

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(253,185,49,0.5)]">
            Project Alpha
          </h1>
          <p className="text-lg md:text-2xl text-blue-200/80 max-w-2xl mx-auto leading-relaxed font-light">
            The future of digital alchemy. Where code meets magic.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-12"
        >
          <a
            href="#features"
            className="px-8 py-3 rounded-full border border-yellow-500/30 text-yellow-100 hover:bg-yellow-500/10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(253,185,49,0.2)] backdrop-blur-sm"
          >
            Explore the Magic
          </a>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-24 px-4 bg-black/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold mb-16 text-center text-blue-100"
          >
            Core Capabilities
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              title="Particle Physics"
              description="Real-time simulation of thousands of interactive particles using HTML5 Canvas API."
              delay={0.2}
            />
            <FeatureCard
              title="Aethereal UI"
              description="Glassmorphism aesthetics combined with deep space gradients for an immersive experience."
              delay={0.4}
            />
            <FeatureCard
              title="Sonic Resonance"
              description="Audio-reactive visualizations that pulse with the rhythm of the cosmos."
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* Footer / Back */}
      <footer className="relative z-10 py-12 text-center border-t border-white/5">
        <Link
          href="/portfolio"
          className="text-sm text-blue-300 hover:text-white transition-colors"
        >
          ← Back to Portfolio
        </Link>
        <p className="mt-4 text-xs text-white/20">© 2026 Project Alpha. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description, delay }: { title: string; description: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-yellow-500/30 hover:bg-white/10 transition-all duration-500 group"
    >
      <div className="w-12 h-12 mb-6 rounded-full bg-yellow-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
        <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(253,185,49,0.8)]"></div>
      </div>
      <h3 className="text-xl font-semibold mb-3 text-yellow-50 group-hover:text-yellow-200 transition-colors">
        {title}
      </h3>
      <p className="text-blue-200/60 leading-relaxed text-sm">
        {description}
      </p>
    </motion.div>
  );
}
