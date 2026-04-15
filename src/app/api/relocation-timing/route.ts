import { NextResponse } from 'next/server';
import { getKyuseiBoard, getKyusei } from '@/utils/kigaku';

export async function GET() {
  // 2026年（一白水星中宮）の盤面を取得
  const centerStar = getKyusei(1); // 一白水星
  const board = getKyuseiBoard(centerStar);

  // 本命星（例：六白金星）との相性などを用いた計算をモック
  // 実際は timingOptimizer などを呼ぶ
  
  const optimizedResult = {
    bestDirection: "South-Southeast",
    score: 92,
    timing: "2026-04-10T14:00:00+09:00",
    reason: "2026年の年盤において一白水星が中宮に入り、南南東（South-Southeast）が最大の吉方位となります。さらに計算エンジンの結果、4月10日 14:00 が生体磁場（Solar Time）と最も同期する最適なタイミングです。",
    kyuseiBoard: board
  };

  return NextResponse.json(optimizedResult);
}