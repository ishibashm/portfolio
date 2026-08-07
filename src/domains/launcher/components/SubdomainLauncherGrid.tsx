import React from 'react';
import Link from 'next/link';
import { Compass, Database, TrendingUp, ArrowUpRight, Sparkles, Heart } from 'lucide-react';

export const SubdomainLauncherGrid: React.FC = () => {
  const subdomains = [
    {
      id: 'brain',
      name: 'brain.cloud-palette.com',
      title: 'Katmer Brain & Real Estate',
      subtitle: 'ナレッジベース・空間不動産分析',
      description: 'Second Brain ドキュメントノート、港区賃貸物件アービトラージ、地価所得マトリクス',
      icon: Database,
      href: 'https://katmer.cloud-palette.com/brain',
      color: 'bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-yellow-50/40',
      borderColor: 'border-amber-300/80 hover:border-amber-400',
      shadowColor: 'shadow-md shadow-amber-200/50 hover:shadow-xl hover:shadow-amber-300/60',
      badgeBg: 'bg-amber-700 text-white font-bold',
      iconBg: 'bg-amber-600 text-white shadow-md shadow-amber-200',
      badge: 'Brain & Real Estate',
    },
  ];

  return (
    <div className="w-full my-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-600 text-white shadow-md shadow-rose-200">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 font-serif">アプリポータル</h2>
            <p className="text-xs font-medium text-slate-700">サブドメイン別に心地よく整理された機能へアクセス</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-white/95 px-3.5 py-1.5 rounded-full border border-slate-300 shadow-sm">
          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          <span>直感的にシームレス同期</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {subdomains.map((sub) => {
          const Icon = sub.icon;
          return (
            <Link
              key={sub.id}
              href={sub.href}
              className={`group p-6 rounded-3xl bg-white/95 backdrop-blur-xl ${sub.color} border ${sub.borderColor} ${sub.shadowColor} transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between relative overflow-hidden`}
            >
              {/* Background Accent Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/60 rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-transform duration-500" />

              <div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <span className={`text-[11px] tracking-wide px-3 py-1 rounded-full shadow-xs ${sub.badgeBg}`}>
                    {sub.badge}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors text-slate-700 shadow-xs border border-slate-200">
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>

                <div className="flex items-center gap-3.5 mb-3 relative z-10">
                  <div className={`p-3 rounded-2xl ${sub.iconBg}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight font-serif group-hover:text-rose-600 transition-colors">
                      {sub.title}
                    </h3>
                    <p className="text-[12px] font-semibold text-slate-700">{sub.subtitle}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-800 leading-relaxed mb-5 font-medium relative z-10">
                  {sub.description}
                </p>
              </div>

              <div className="text-[11px] font-mono flex items-center justify-between border-t border-slate-200/90 pt-3.5 relative z-10">
                <span className="truncate max-w-[200px] text-slate-700 font-bold">{sub.name}</span>
                <span className="text-rose-600 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  開く →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
