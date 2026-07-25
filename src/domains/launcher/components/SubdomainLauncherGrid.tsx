import React from 'react';
import Link from 'next/link';
import { Compass, Database, TrendingUp, ArrowUpRight, Sparkles } from 'lucide-react';

export const SubdomainLauncherGrid: React.FC = () => {
  const subdomains = [
    {
      id: 'fortune',
      name: 'fortune.cloud-palette.com',
      title: 'Fortune & Healing Sub-App',
      description: '時空・暦・バイオダイナミクス。SolarTimeClock、九星気学、天中殺、宇宙物理・吉方位移転エンジン',
      icon: Compass,
      href: '/metaphysical',
      externalUrl: 'https://fortune.cloud-palette.com',
      color: 'from-purple-500/20 to-indigo-500/10',
      borderColor: 'border-purple-500/30',
      textColor: 'text-purple-300',
      badge: 'Fortune & Time Engine',
    },
    {
      id: 'tech',
      name: 'tech.cloud-palette.com',
      title: 'Tech & AI Trends Sub-App',
      description: 'クオンツ財務・市場・SNSトレンド。J-Quants v2 / Yahoo Finance 決算ビジュアライザー、IR分析、Xリサーチ',
      icon: TrendingUp,
      href: '/trends',
      externalUrl: 'https://tech.cloud-palette.com',
      color: 'from-emerald-500/20 to-teal-500/10',
      borderColor: 'border-emerald-500/30',
      textColor: 'text-emerald-300',
      badge: 'Tech & Finance Engine',
    },
    {
      id: 'brain',
      name: 'brain.cloud-palette.com',
      title: 'Katmer Brain & Spatial Sub-App',
      description: 'ナレッジベース・空間不動産インテリジェンス。Second Brain ドキュメント、港区賃貸物件、価格アービトラージ',
      icon: Database,
      href: '/knowledge',
      externalUrl: 'https://brain.cloud-palette.com',
      color: 'from-amber-500/20 to-yellow-500/10',
      borderColor: 'border-amber-500/30',
      textColor: 'text-amber-300',
      badge: 'Brain & Knowledge Engine',
    },
  ];

  return (
    <div className="w-full my-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h2 className="text-xl font-bold tracking-tight text-white">Subdomain App Launcher</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {subdomains.map((sub) => {
          const Icon = sub.icon;
          return (
            <Link
              key={sub.id}
              href={sub.href}
              className={`group p-6 rounded-3xl bg-gradient-to-br ${sub.color} border ${sub.borderColor} backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/10 ${sub.textColor}`}>
                    {sub.badge}
                  </span>
                  <ArrowUpRight className={`w-5 h-5 ${sub.textColor} opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all`} />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2.5 rounded-2xl bg-white/10 border border-white/10 ${sub.textColor}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{sub.title}</h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed font-light mb-4">
                  {sub.description}
                </p>
              </div>
              <div className="text-[11px] font-mono text-gray-400 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="truncate max-w-[200px]">{sub.name}</span>
                <span className="text-indigo-400 font-semibold group-hover:underline">Launch →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
