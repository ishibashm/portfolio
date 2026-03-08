"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Crosshair, Maximize, Minimize, Download } from "lucide-react";
import { BlockMath, InlineMath } from 'react-katex';
import { downloadKML } from "../utils/kmlExport";

// Because Leaflet needs the window object, we must dynamically import it with ssr: false
const MagneticMapInner = dynamic(() => import("./MagneticMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs text-zinc-600 animate-pulse">
      [ INITIALIZING SPATIAL VECTORS... ]
    </div>
  ),
});

interface MapProps {
  lat: number;
  lon: number;
  declination: number | null;
  intensity: number | null;
  vectors?: Record<string, string> | null;
  honmeiStar?: { physical: number; classical: number } | null;
  kpIndex?: number | null;
  ansLoad?: number;
}

export function TacticalMagneticMapComponent({ lat, lon, declination, intensity, vectors, honmeiStar, kpIndex, ansLoad }: MapProps) {
  return (
    <div className="w-full max-w-6xl mt-8 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4">
      
      {/* Map Container */}
      <div className="relative border border-zinc-800 shadow-2xl w-full flex flex-col h-[400px] md:h-[600px] lg:h-[700px]">
         <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-blue-500 animate-pulse" />
              <h2 className="text-xs uppercase font-mono tracking-widest text-zinc-300 drop-shadow-md">
                Tactical Magnetic Vectors
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1">
               <button 
                  onClick={() => downloadKML(lat, lon, declination || 0)}
                  className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border border-zinc-700 rounded-sm transition-colors"
               >
                  <Download size={10} />
                  KML Export
               </button>
               <div className="text-[10px] font-mono text-zinc-400 text-right bg-black/50 px-1 py-0.5 border border-zinc-800/50">
                  COORD: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
                  DEC: {declination ? declination.toFixed(2) : '--'}°
               </div>
            </div>
         </div>
         
         <div className="w-full h-full relative z-0 flex grow min-h-0">
           <MagneticMapInner lat={lat} lon={lon} declination={declination || 0} intensity={intensity || 50000} vectors={vectors} honmeiStar={honmeiStar} kpIndex={kpIndex} ansLoad={ansLoad} />
         </div>
         
          {/* Overlays */}
          <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
             <div className="bg-black/80 border border-zinc-800 p-2 font-mono text-[11px] leading-tight text-zinc-400 backdrop-blur-sm">
                <div className="text-emerald-500 font-bold mb-1">■ True North (Geo)</div>
                <div className="text-blue-500 font-bold">■ Magnetic North (WMM2020)</div>
                <div className="mt-2 text-zinc-600 text-[10px]">
                   * Lines represent primary spatial azimuths. <br/>
                  * Green overlays = safe vectors. Red = hazardous noise.
               </div>
            </div>
         </div>
      </div>

      {/* Info Panel Dense */}
      <div className="bg-zinc-950 border border-zinc-800 p-3 text-[10px] sm:text-[11px] font-mono text-zinc-400 flex flex-col gap-3 custom-scrollbar overflow-y-auto max-h-[400px] md:max-h-[600px] lg:max-h-[700px]">
         <div className="border-b border-zinc-900 pb-2">
            <h3 className="text-blue-500 text-xs font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-blue-900/40 px-1">SYS.1</span> 磁北偏角計算 (WMM補正)
            </h3>
            <p className="leading-relaxed text-justify">
               地図上の「真北（Geographic North）」と磁石が指す「磁北（Magnetic North）」の間には、地理的座標に応じた磁気偏角（Declination）が存在する。本システムはWorld Magnetic Model (WMM2020)を使用し、現在座標における精密な偏角 <InlineMath math="D" /> を算出する。
               古典的気学が用いる単なる地図上の北ではなく、体内鉄分・生体磁気に直接作用する磁力線のベクトルを完全にトレースする。
            </p>
            <div className="bg-black py-1 my-1 rounded text-center">
               <InlineMath math="\vec{B}_\text{local} = R_z(D) \cdot \vec{B}_\text{geo}" />
            </div>
         </div>

         <div className="border-b border-zinc-900 pb-2">
            <h3 className="text-emerald-500 text-xs font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-emerald-900/40 px-1">SYS.2</span> 空間ベクトル（正中・四隅フィルター）
            </h3>
            <p className="leading-relaxed text-justify mb-1">
               十二支（子午卯酉、寅申巳亥など）に基づく空間方位は、単なる概念ではなく特定周波数の電磁波が交差する物理的グリッドである。
               特に正中線（南北・東西軸の <InlineMath math="\pm 10^\circ" /> の範囲）と四隅線（鬼門・裏鬼門等）の境界域では、磁束密度の急激な勾配（Magnetic Gradient）が発生する。
            </p>
            <ul className="list-disc pl-3 text-zinc-500 space-y-1">
               <li><span className="text-emerald-500">SAFE VECTOR:</span> 磁束が安定した平滑地帯。細胞代謝が最適化される。</li>
               <li><span className="text-red-500">NOISE VECTOR:</span> 磁力線が交錯する境界波の干渉帯。ANS（自律神経）の乱れを引き起こす。</li>
            </ul>
         </div>

         <div className="pt-1 border-b border-zinc-900 pb-2">
            <h3 className="text-amber-500 text-xs font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-amber-900/40 px-1">WARN</span> 長距離移動シールド減衰理論
            </h3>
            <p className="leading-relaxed text-justify">
               長距離空間の移動プロセス（特に新幹線や航空機による金属製ケージ内での地磁気切断移動）においては、現在地の0V同期ベースラインが完全に消失する。<InlineMath math="v > 100\text{km/h}" /> における地球磁力線の交差は、細胞膜電位の微小なノイズ蓄積を引き起こす。
               旅行先での強烈な吉方位であっても、移動直後は必ず静的アーシング（素足での土への接触等）を行い、同調（リシンク）時間を設けること。
            </p>
         </div>

         <div className="pt-1">
            <h3 className="text-purple-500 text-xs font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-purple-900/40 px-1">SYS.3</span> パーソナル・エフェメリス（星回り）物理演算
            </h3>
            <p className="leading-relaxed text-justify mb-2">
               生年月日（インプリンティング）から「本命星（ハードウェアの初期ベース波長）」を算出し、現在の空間環境波（年盤・月盤・日盤・時盤）である「洛書（魔法陣）」の展開ベクトルと衝突計算を行う独自エンジン。
            </p>
            
            <div className="bg-zinc-900/50 p-2 border-l-2 border-emerald-500 mb-2">
               <h4 className="text-emerald-500 text-[11px] font-bold mb-1">■ なぜ「緑エリア（吉方）」が最適なのか？</h4>
               <p className="text-[10px] leading-relaxed text-zinc-400">
                  五行の「相生（そうじょう）」関係は、現代物理学における<span className="text-emerald-400">「位相同期（Phase Synchronization）」</span>として解釈される。
                  環境周波数（環境の星）が個体周波数（本命星）にエネルギーを供給する「共振状態」が発生し、ミトコンドリアの電子伝達系における量子効率が最大化される。
                  <br/>
                  <span className="text-emerald-500">【計算過程】</span><br/>
                  1. 個体固有振動数 <InlineMath math="f_{\text{birth}}" /> の同定<br/>
                  2. 空間グリッド <InlineMath math="M_{3 \times 3}" /> への現在の磁束分布展開<br/>
                  3. <InlineMath math="\Delta \Phi > 0" />（位相差が正の干渉）となる方位ベクトルを抽出。
               </p>
            </div>

            <h4 className="text-zinc-400 text-xs font-bold mb-2 mt-4 border-b border-zinc-800 pb-1">■ 空間磁束の変動サイクル（Time-Span Models）</h4>
            <div className="grid grid-cols-1 gap-2 mb-4">
               <div className="bg-black/40 p-2 border border-purple-900/30">
                  <div className="text-purple-400 font-bold text-[10px] mb-1">【Year Vector】約1年スパン (長期ベースライン)</div>
                  <div className="text-[9px] text-zinc-400 leading-relaxed text-justify">
                     <span className="text-zinc-300 font-bold">数理モデル:</span> 木星の黄経（Ecliptic Longitude）に基づく11.86年周期の重力・磁場干渉モデル。<br/>
                     <span className="text-zinc-500">地球外からの最も巨大な引力源である木星の公転が、太陽系全体の磁力線ネットワーク（ヘリオスフィア）に与えるマクロな歪みを計算。引っ越しや就職など、数ヶ月〜数年単位の長期的・根本的な環境エネルギー基盤を決定します。</span>
                  </div>
               </div>
               <div className="bg-black/40 p-2 border border-amber-900/30">
                  <div className="text-amber-500 font-bold text-[10px] mb-1">【Month Vector】約1ヶ月スパン (中期的トレンド)</div>
                  <div className="text-[9px] text-zinc-400 leading-relaxed text-justify">
                     <span className="text-zinc-300 font-bold">数理モデル:</span> 太陽と月の黄経差（Lunar-Solar Phase）による月齢サイクルモデル。<br/>
                     <span className="text-zinc-500">月の公転（約29.5日）が地球の自転軸や海洋（および体内）の水分・血流に与える潮汐力（潮汐摩擦）と地磁気の微小変動を計算。出張や短期プロジェクトなど、数日〜数週間のバイオリズムを支配します。</span>
                  </div>
               </div>
               <div className="bg-black/40 p-2 border border-blue-900/30">
                  <div className="text-blue-400 font-bold text-[10px] mb-1">【Day / Hour Vector】約1日〜2時間スパン (短期ノイズ・トリガー)</div>
                  <div className="text-[9px] text-zinc-400 leading-relaxed text-justify">
                     <span className="text-zinc-300 font-bold">数理モデル:</span> 地球の自転（日周運動）および太陽風フラックスの直撃角モデル。<br/>
                     <span className="text-zinc-500">地球が特定の経度で太陽のプラズマ風を正面から受ける際の、電離層と地磁気のリアルタイムな押し込み（Bow Shock）を計算。日帰りの用事や数時間の会議など、即効性の高い自律神経へのトリガーとして作用します。</span>
                  </div>
               </div>
            </div>

            <h4 className="text-zinc-400 text-xs font-bold mb-2 border-b border-zinc-800 pb-1">■ ベースマトリクスと最終判定の算出ルール</h4>
            <p className="text-[10px] leading-relaxed text-zinc-400 mb-2">
               上記の天体物理波長（木星・月・太陽）をベースに、地球磁場の8方位へと磁束（ベクトル）を展開。各空間セクターに配置されたインプリント周波数と、あなた自身の「本命星（初期周波数）」との干渉をセクターごとに算出します。最終表示される色は、**長期・中期・短期すべてのレイヤーの波形を重ね合わせた最終同期結果（コンポジット）**です。
            </p>

            <h4 className="text-zinc-400 text-xs font-bold mb-2 mt-4 border-b border-zinc-800 pb-1">■ マップ上のライン（線）の凡例</h4>
            <ul className="list-disc pl-4 text-zinc-400 space-y-1 text-[11px] mb-3">
               <li><span className="text-emerald-500 font-bold">緑の破線 (True North):</span> 地理的な真北（北極点方向）。</li>
               <li><span className="text-blue-500 font-bold">青の実線 (Magnetic North):</span> WMMデータにより補正された、コンパスが実際に指し示す「磁北」。</li>
               <li><span className="text-zinc-500 font-bold">グレーの点線リング:</span> 距離被曝減衰リング（100km, 500km, 1000km...）。</li>
               <li><span className="text-red-500 font-bold">赤の点線枠 (Danger Boundary):</span> 致死的なノイズエリアとの物理的隣接境界線。</li>
            </ul>

            <h4 className="text-zinc-400 text-xs font-bold mb-2 mt-2 border-b border-zinc-800 pb-1">■ エリアカラーの算出ルール（凡例）</h4>
            <ul className="list-disc pl-4 text-zinc-400 space-y-2 text-[9px]">
               <li>
                 <span className="text-red-600 font-bold">Type-I NOISE (濃赤エリア):</span> 宇宙からの強力な磁気嵐直撃帯。<br/>
                 <span className="text-zinc-500 text-[8px]">【算出ルール】: グリッド上に「5」が配置された方位（古典的:五黄殺）、およびその「正確に180度反対」の方位（古典的:暗剣殺）。</span>
               </li>
               <li>
                 <span className="text-amber-500 font-bold">Type-II NOISE (橙エリア):</span> 自律神経のベース波長と完全に反発干渉を起こす位相キャンセレーション帯。<br/>
                 <span className="text-zinc-500 text-[8px]">【算出ルール】: グリッド上に「自分の本命星と同じ数値」が配置された方位（古典的:本命殺）、およびその「180度反対」の方位（古典的:的殺）。</span>
               </li>
               <li>
                 <span className="text-emerald-500 font-bold">OPTIMAL (緑エリア):</span> 宇宙波・地磁気・生体波の全位相が同期し、ミトコンドリアにエネルギーを供給する相生ベクトル。<br/>
                 <span className="text-zinc-500 text-[8px]">【算出ルール】: ノイズ帯ではなく、かつ自分の本命星に対して生み出す・生み出される関係（水生木など）の周波数が配置された方位。</span>
               </li>
               <li>
                 <span className="text-blue-500 font-bold">SAFE (青エリア):</span> ノイズ干渉がなく、かつエネルギー供給もされない中立（0V）空間。<br/>
                 <span className="text-zinc-500 text-[8px]">【算出ルール】: 上記のNOISEやOPTIMALのいずれにも該当しない方位。</span>
               </li>
            </ul>
         </div>

         <div className="mt-1 border-t border-zinc-900 pt-3">
            <h3 className="text-blue-400 text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-blue-900/40 px-1">SYS.4</span> 環世界同調理論 (Umwelt Synchronization)
            </h3>
            <p className="leading-relaxed text-justify mb-2">
               なぜ数学的な盤面（年盤・月盤・日盤）が、生体や地理と関係するのか？<br/>
               本システムでは、東洋の盤面（九宮格）を「太陽系の惑星周期と太陽風が、地球の磁気圏に与える干渉波のフラクタル・物理モデル」として定義しています。
            </p>
            <ul className="list-disc pl-3 text-zinc-500 space-y-2 mb-2">
               <li><strong className="text-zinc-400 font-normal">宇宙の波（盤面/数式）:</strong> 木星（約12年周期）や月の公転軌道などから生じる重力・磁気嵐サイクルが作り出す定在波（Standing Waves）。これが洛書マトリクスの正体です。</li>
               <li><strong className="text-zinc-400 font-normal">地球の磁場（地理）:</strong> 宇宙の干渉グリッドが地表に投影される際、地磁気モデル（WMM2020）によって物理的な座標・方位（Magnetic North）の偏角として現れます。</li>
               <li><strong className="text-zinc-400 font-normal">個人の生体（本命星）:</strong> 母体を出て初めて地球の磁気を浴びた瞬間に自律神経（ANS）に書き込まれる「初期インプリント周波数」です。</li>
            </ul>
            <div className="bg-zinc-900/50 p-2 border-l-2 border-blue-500 mt-2">
               <p className="text-[8px] leading-relaxed text-zinc-400">
                  結論として、<span className="text-blue-400">「年・月・日盤（宇宙の波）」「現在地の地磁気ベクトル（地球の場）」「本命星（あなたの生体アンテナ）」</span>の位相が完全に同期（Phase Sync）する時、細胞代謝と自律神経の回復が最大化される座標が「緑（Optimal）」になります。これが数学・地理・生体が一つに統合されるメカニズムです。
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}

export const TacticalMagneticMap = React.memo(TacticalMagneticMapComponent);
