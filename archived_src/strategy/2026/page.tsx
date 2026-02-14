'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import StrategyAnalysis from '@/components/strategy/StrategyAnalysis';

// Dynamic import for Leaflet (SSR false)
const RelocationMap = dynamic(() => import('@/components/strategy/RelocationMap'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-gray-900 animate-pulse rounded-xl flex items-center justify-center text-gray-500">Loading Map Data...</div>
});

export default function StrategyPage() {
  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 space-y-20">
      
      {/* Header */}
      <section className="text-center space-y-6 pt-10">
        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent"
        >
          2026 Strategic Relocation
        </motion.h1>
        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
          Optimizing Luck, Time, and Capital for the "Tenchusatsu" Period.
          <br/>
          Target: <span className="text-emerald-400 font-bold">North-East (Great Luck)</span>
        </p>
      </section>

      {/* Map Section */}
      <section className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold border-l-4 border-emerald-500 pl-4">Sector Analysis</h2>
          <span className="text-sm text-gray-500">Interactive Map</span>
        </div>
        <RelocationMap />
        <p className="text-center text-gray-400 text-sm">
           The Green Zone represents the "North-East (Ushi-Tora)" sector, the only safe direction for 2026.
        </p>
      </section>

      {/* Strategy Comparison */}
      <section className="max-w-6xl mx-auto space-y-8">
        <h2 className="text-3xl font-bold border-l-4 border-indigo-500 pl-4">Optimization Models</h2>
        <StrategyAnalysis />
      </section>

      {/* Monthly Timeline */}
      <section className="max-w-6xl mx-auto space-y-8 pb-20">
        <h2 className="text-3xl font-bold border-l-4 border-purple-500 pl-4">Temporal Strategy</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gray-900 p-6 rounded-2xl border border-white/10">
                <h3 className="text-xl font-bold mb-4 text-emerald-400">March 2026 (Launch Window)</h3>
                <p className="text-gray-400 mb-4">
                    The optimal month for relocation. The "Rabbit" month harmonizes with the user's stars, creating a protective buffer for the move.
                </p>
                {/* Images will be placed here by user */}
                <div className="aspect-video bg-black/50 rounded-lg flex items-center justify-center border border-white/5">
                    <span className="text-gray-600">Monthly Chart Image (20263.png)</span>
                </div>
            </div>

            <div className="bg-gray-900 p-6 rounded-2xl border border-white/10">
                <h3 className="text-xl font-bold mb-4 text-red-400">June/July 2026 (Danger Zone)</h3>
                <p className="text-gray-400 mb-4">
                    The peak of Tenchusatsu. Avoid all major decisions. Focus on internal growth ("Monastic Mode").
                </p>
                <div className="aspect-video bg-black/50 rounded-lg flex items-center justify-center border border-white/5">
                    <span className="text-gray-600">Monthly Chart Image (20266.png)</span>
                </div>
            </div>
        </div>
      </section>

    </div>
  );
}
