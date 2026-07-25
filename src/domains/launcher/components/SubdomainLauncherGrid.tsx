import React from 'react';
import Link from 'next/link';
import { Compass, Database, TrendingUp, ArrowUpRight, Sparkles, Heart } from 'lucide-react';

export const SubdomainLauncherGrid: React.FC = () => {
  const subdomains = [
    {
      id: 'fortune',
      name: 'fortune.cloud-palette.com',
      title: 'Fortune & Healing',
      subtitle: '時空・暦・バイオダイナミクス',
      description: 'AIタロット・オーラメッセージ・SolarTimeClock・九星気学・吉方位移転エンジン',
      icon: Compass,
      href: '/metaphysical',
      color: 'bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-purple-500/10',
      borderColor: 'border-rose-200/80 hover:border-rose-300',
      shadowColor: 'shadow-rose-100/60 hover:shadow-rose-200/80',
      badgeBg: 'bg-rose-100/80 text-rose-600 border-rose-200/60',
      iconBg: 'bg-rose-500 text-white shadow-rose-200',
      badge: 'Fortune & Healing',
    },
    {
      id: 'tech',
      name: 'tech.cloud-palette.com',
      title: 'Tech & Trends',
      subtitle: 'クオンツ財務・市場・SNSトレンド',
      description: 'J-Quants v2 / Yahoo Finance 決算ビジュアライザー、IR分析、AI動向＆Xリサーチ',
      icon: TrendingUp,
      href: '/trends',
      color: 'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10',
      borderColor: 'border-emerald-200/80 hover:border-emerald-300',
      shadowColor: 'shadow-emerald-100/60 hover:shadow-emerald-200/80',
      badgeBg: 'bg-emerald-100/80 text-emerald-700 border-emerald-200/60',
      iconBg: 'bg-emerald-600 text-white shadow-emerald-200',
      badge: 'Tech & Trends',
    },
    {
      id: 'brain',
      name: 'brain.cloud-palette.com',
      title: 'Katmer Brain & Real Estate',
      subtitle: 'ナレッジベース・空間不動産分析',
      description: 'Second Brain ドキュメントノート、港区賃貸物件アービトラージ、地価所得マトリクス',
      icon: Database,
      href: '/knowledge',
      color: 'bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10',
      borderColor: 'border-amber-200/80 hover:border-amber-300',
      shadowColor: 'shadow-amber-100/60 hover:shadow-amber-200/80',
      badgeBg: 'bg-amber-100/80 text-amber-800 border-amber-200/60',
      iconBg: 'bg-amber-500 text-white shadow-amber-200',
      badge: 'Brain & Real Estate',
    },
  ];

  return (
    <div className="w-full my-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-rose-100 text-rose-500">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-stone-900 font-serif">アプリポータル</h2>
            <p className="text-xs text-stone-500">サブドメイン別に心地よく整理された機能へアクセス</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-500 bg-white/80 px-3 py-1.5 rounded-full border border-stone-200/60 shadow-sm">
          <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
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
              className={`group p-6 rounded-3xl bg-white/90 backdrop-blur-xl ${sub.color} border ${sub.borderColor} shadow-lg ${sub.shadowColor} transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] flex flex-col justify-between relative overflow-hidden`}
            >
              {/* Background Accent Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-transform duration-500" />

              <div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <span className={`text-[11px] font-semibold tracking-wide px-3 py-1 rounded-full border ${sub.badgeBg}`}>
                    {sub.badge}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-stone-100/80 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-colors text-stone-500 shadow-sm">
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>

                <div className="flex items-center gap-3.5 mb-3 relative z-10">
                  <div className={`p-3 rounded-2xl ${sub.iconBg} shadow-md`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-stone-900 tracking-tight font-serif group-hover:text-rose-600 transition-colors">
                      {sub.title}
                    </h3>
                    <p className="text-[11px] font-medium text-stone-400">{sub.subtitle}</p>
                  </div>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed mb-5 font-normal relative z-10">
                  {sub.description}
                </p>
              </div>

              <div className="text-[11px] font-mono text-stone-400 flex items-center justify-between border-t border-stone-100 pt-3.5 relative z-10">
                <span className="truncate max-w-[200px] text-stone-500 font-medium">{sub.name}</span>
                <span className="text-rose-500 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
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
