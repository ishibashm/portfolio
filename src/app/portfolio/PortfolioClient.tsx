'use client';

import Link from 'next/link';
import Image from 'next/image';
import { portfolios } from '@/lib/portfolios';
import { useRef, useState, MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';

export default function PortfolioClient() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-16 text-center"
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent inline-block">
            Portfolio
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            A collection of my recent projects, experiments, and digital creations.
          </p>
        </motion.header>

        {/* Regular Portfolios Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((project, i) => (
            <SpotlightCard key={project.id} index={i} href={`/portfolio/${project.slug}`}>
               <div className="aspect-video bg-gray-800 relative overflow-hidden">
                  <div className="absolute inset-0 transition-transform duration-500 hover:scale-105">
                    <Image
                      src={project.image}
                      alt={project.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      unoptimized
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-60 z-10 pointer-events-none"></div>

                  <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2">
                    {project.tags && project.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-2 py-1 text-xs font-semibold bg-black/50 backdrop-blur-sm border border-white/20 rounded-md text-white">
                          {tag}
                        </span>
                    ))}
                  </div>
               </div>
               
               <div className="p-6 relative z-20 bg-gray-900/40">
                  <h2 className="text-2xl font-bold mb-3 group-hover:text-indigo-400 transition-colors">
                    {project.title}
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">
                    {project.description}
                  </p>
                  <div className="mt-4 flex items-center text-indigo-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                    View Project <span className="ml-2">→</span>
                  </div>
               </div>
            </SpotlightCard>
          ))}
        </div>

        {/* Interactive Demos Section */}
        <div className="mt-16">
          <motion.h2 
             initial={{ opacity: 0 }}
             whileInView={{ opacity: 1 }}
             viewport={{ once: true }}
             className="text-3xl font-bold mb-8 text-white border-b border-white/10 pb-4 flex items-center gap-3"
          >
             <span>🚀</span> Interactive Demos
          </motion.h2>
          
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
             <DemoCard 
                href="/portfolio/blog-buddy-ai"
                title="Blog Buddy AI"
                desc="Interactive AI assistant powered by Gemini."
                icon="🤖"
                gradient="from-indigo-900 to-purple-900"
                tags={['Gemini API', 'React', 'Voice']}
                color="indigo"
             />
             
             <DemoCard 
                href="/portfolio/sanpeki-ki"
                title="Sanpeki Mokusei"
                desc="Visualizing the directional flow of Three Turquoise Wood Star."
                icon="🔮"
                gradient="from-teal-900 to-emerald-900"
                tags={['Nine Star Ki', 'Visualizer']}
                color="teal"
             />

            {/* Yakumoin Scraper */}
             <DemoCard 
                href="/portfolio/yakumoin-scraper"
                title="Kyusei Dashboard"
                desc="Real-time Nine Star Ki dashboard displaying Year, Month, Day, and Time plates."
                icon="🌌"
                gradient="from-slate-900 via-purple-900 to-slate-900"
                tags={['Nine Star Ki', 'Dashboard', 'Real-time']}
                color="purple"
                isCosmic
             />

             <DemoCard 
                href="/portfolio/newsletter"
                title="Newsletter Template"
                desc="Modern responsive subscription page."
                icon="📧"
                gradient="from-orange-900 to-red-900"
                tags={['Template', 'UI/UX']}
                color="orange"
             />
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotlightCard({ children, index, href }: { children: React.ReactNode, index: number, href: string }) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <Link href={href} className="block group relative">
             <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                onMouseMove={handleMouseMove}
                className="group relative h-full border border-white/10 bg-gray-900 rounded-2xl overflow-hidden"
             >
                <motion.div
                    className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover:opacity-100"
                    style={{
                        background: useMotionTemplate`
                            radial-gradient(
                                650px circle at ${mouseX}px ${mouseY}px,
                                rgba(129, 140, 248, 0.15),
                                transparent 80%
                            )
                        `
                    }}
                />
                <div className="relative h-full">
                    {children}
                </div>
             </motion.div>
        </Link>
    );
}

function DemoCard({ href, title, desc, icon, gradient, tags, color, isCosmic }: any) {
    return (
        <Link href={href} className="block group">
           <motion.article 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className={`h-full bg-slate-900 border border-${color}-500/30 rounded-2xl overflow-hidden hover:border-${color}-400 transition-all duration-300 hover:shadow-2xl hover:shadow-${color}-500/20 relative`}
           >
                <div className={`aspect-video bg-gradient-to-br ${gradient} relative overflow-hidden flex items-center justify-center`}>
                     {isCosmic ? (
                        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-400 to-transparent animate-pulse"></div>
                     ) : (
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>
                     )}
                     <span className={`text-6xl ${isCosmic ? 'drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'animate-pulse'}`}>{icon}</span>
                </div>

                <div className="p-6">
                  <h2 className={`text-2xl font-bold mb-3 text-white group-hover:text-${color}-400 transition-colors`}>
                    {title}
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {desc}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag: string) => (
                         <span key={tag} className={`px-2 py-1 text-xs font-semibold bg-${color}-500/20 text-${color}-300 rounded-md`}>
                            {tag}
                         </span>
                    ))}
                  </div>
                  <div className={`mt-4 flex items-center text-${color}-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0`}>
                    View Demo <span className="ml-2">→</span>
                  </div>
                </div>
           </motion.article>
        </Link>
    )
}
