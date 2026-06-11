import { Direction, ActionIntent } from "../ephemerisEngine";

export interface EvaluationContext {
  targetDate: Date; // 評価対象の日時
  userBirthDate?: Date; // ユーザーの生年月日（バイオリズム・気学に必要）
  userKigakuStar?: number; // ユーザーの本命星（1〜9）
  userSunSign?: string; // ユーザーの太陽星座（例: 'Aries', 'Virgo'）
  actionType: "focus" | "creative" | "social" | "rest"; // 何のためのタイミングか
  latitude?: number; // ユーザーの緯度（太陽時間などに必要）
  longitude?: number; // ユーザーの経度
  useClassical?: boolean; // 暦基準モデルか
  targetDirection?: Direction; // 移動先の目標方位
  actionIntent?: ActionIntent; // アクションの意図
}

export interface TimingScorer {
  name: string;
  // そのタイミングで観測された物理・天体現象とその解説をそのまま返す（スコア化・ブラックボックス化の排除）
  observe(
    context: EvaluationContext,
  ): { phenomenon: string; detail: string } | null;
}
