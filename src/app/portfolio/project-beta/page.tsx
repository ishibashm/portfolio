"use client";

import React from "react";
import GridBackground from "./_components/GridBackground";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ProjectBetaPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-hidden font-mono selection:bg-cyan-500/30">
      <GridBackground />

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="relative"
        >
          {/* Glitch effect layer 1 */}
          <h1 className="text-6xl md:text-9xl font-bold tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
            PROJECT BETA
          </h1>
          <div className="absolute top-0 left-0 w-full h-full text-6xl md:text-9xl font-bold tracking-tighter text-cyan-500/30 animate-pulse -z-10 blur-sm translate-x-1">
            PROJECT BETA
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <p className="text-lg md:text-2xl text-cyan-200/70 max-w-2xl mx-auto leading-relaxed mt-4 border-l-4 border-cyan-500 pl-4 bg-black/50 backdrop-blur-md py-2">
            SYSTEM: <span className="text-green-400">ONLINE</span> // TARGET: <span className="text-magenta-400">FUTURE</span><br />
            The grid is infinite. The possibilities are endless.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="mt-12"
        >
          <a
            href="#modules"
            className="group relative px-8 py-3 overflow-hidden rounded bg-transparent border border-cyan-500/50 text-cyan-400 hover:text-black transition-colors duration-300"
          >
            <span className="absolute top-0 left-0 w-0 h-full bg-cyan-500 transition-all duration-300 group-hover:w-full -z-10"></span>
            INITIALIZE MODULES
          </a>
        </motion.div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="relative z-10 py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-16 justify-center">
             <div className="h-px w-16 bg-gradient-to-r from-transparent to-cyan-500"></div>
             <motion.h2
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-center text-white tracking-widest uppercase"
            >
              Core Systems
            </motion.h2>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-cyan-500"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CyberCard
              title="NEURAL NET"
              code="0x1A4"
              description="Advanced AI integration utilizing deep learning algorithms for predictive modeling."
              delay={0.2}
            />
            <CyberCard
              title="CYBER SECURITY"
              code="0xB9F"
              description="Quantum-resistant encryption protocols securing data across the decentralized grid."
              delay={0.4}
            />
            <CyberCard
              title="VIRTUAL REALITY"
              code="0x4D2"
              description="Immersive full-dive interfaces bridging the gap between biological and digital consciousness."
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* Footer / Back */}
      <footer className="relative z-10 py-12 text-center border-t border-cyan-900/30 bg-black/80 backdrop-blur-sm">
        <Link
          href="/portfolio"
          className="inline-block px-6 py-2 border border-white/10 hover:border-cyan-500 text-sm text-gray-400 hover:text-cyan-400 transition-all uppercase tracking-wider"
        >
          {"<"} Return to Base
        </Link>
        <p className="mt-8 text-xs text-cyan-900">
          SYSTEM STATUS: STABLE<br />
          © 2026 PROJECT BETA. UNAUTHORIZED ACCESS PROHIBITED.
        </p>
      </footer>
    </div>
  );
}

function CyberCard({ title, code, description, delay }: { title: string; code: string; description: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      className="relative p-1 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/50 hover:to-purple-600/50 transition-colors duration-500 clip-path-polygon"
    >
      <div className="bg-black/90 p-8 h-full relative overflow-hidden group">
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-500"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-500"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-500"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-500"></div>
        
        <div className="flex justify-between items-start mb-4">
           <h3 className="text-xl font-bold text-cyan-100 group-hover:text-cyan-400 transition-colors tracking-wide">
            {title}
          </h3>
          <span className="text-xs font-mono text-cyan-700 border border-cyan-900 px-1">{code}</span>
        </div>
        
        <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-300 transition-colors">
          {description}
        </p>

        {/* Scanline effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000 pointer-events-none"></div>
      </div>
    </motion.div>
  );
}
