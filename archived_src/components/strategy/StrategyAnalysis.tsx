'use client';

import { motion } from 'framer-motion';

const strategies = [
  {
    rank: 1,
    name: "Sakyo-ku (Demachiyanagi)",
    luck: "Great (NE)",
    cost: "¥70,000 / mo",
    time: "75 min",
    feature: "Seated Commute (Keihan)",
    verdict: "Optimal Defense",
    color: "from-green-500 to-emerald-700"
  },
  {
    rank: 2,
    name: "Hieizan Sakamoto",
    luck: "Great (NE)",
    cost: "¥50,000 / mo",
    time: "50 min",
    feature: "Nature & Speed (JR Kosei)",
    verdict: "Sanctuary Retreat",
    color: "from-teal-500 to-cyan-700"
  },
  {
    rank: 3,
    name: "Maibara (Shinkansen)",
    luck: "Great (NE)",
    cost: "¥160,000 / mo",
    time: "60 min",
    feature: "Speed & Comfort",
    verdict: "Financial Power Move",
    color: "from-blue-500 to-indigo-700"
  },
  {
    rank: 4,
    name: "Osaka (Status Quo)",
    luck: "Bad (SW)",
    cost: "¥80,000 / mo",
    time: "20 min",
    feature: "Convenience Only",
    verdict: "Avoid at all costs",
    color: "from-red-500 to-orange-700"
  }
];

export default function StrategyAnalysis() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {strategies.map((strategy, index) => (
        <motion.div
          key={strategy.name}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          viewport={{ once: true }}
          className={`relative p-6 rounded-2xl bg-gray-900 border border-white/10 overflow-hidden group hover:border-white/30 transition-colors`}
        >
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${strategy.color}`} />
          
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold">{strategy.name}</h3>
            <span className={`px-2 py-1 rounded text-xs font-bold ${strategy.luck.includes('Great') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {strategy.luck}
            </span>
          </div>
          
          <div className="space-y-2 text-sm text-gray-400">
            <div className="flex justify-between">
              <span>Cost:</span>
              <span className="text-white">{strategy.cost}</span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span className="text-white">{strategy.time}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Key Feature</span>
              <span className="text-indigo-400 font-medium">{strategy.feature}</span>
            </div>
          </div>
          
          <div className="mt-6">
            <div className={`inline-block w-full text-center py-2 rounded-lg bg-gradient-to-r ${strategy.color} font-bold text-white text-sm opacity-90 group-hover:opacity-100 transition-opacity`}>
                {strategy.verdict}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
