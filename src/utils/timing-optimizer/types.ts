export interface EvaluationContext {
  targetDate: Date;           // 評価対象の日時
  userBirthDate?: Date;       // ユーザーの生年月日（バイオリズム・気学に必要）
  userKigakuStar?: number;    // ユーザーの本命星（1〜9）
  userSunSign?: string;       // ユーザーの太陽星座（例: 'Aries', 'Virgo'）
  actionType: 'focus' | 'creative' | 'social' | 'rest'; // 何のためのタイミングか
  latitude?: number;          // ユーザーの緯度（太陽時間などに必要）
  longitude?: number;         // ユーザーの経度
}

export interface TimingScorer {
  name: string;
  // そのタイミングがどれだけ適しているか（0.0〜1.0）と、その理由を返す
  score(context: EvaluationContext): { value: number; reason: string };
}
