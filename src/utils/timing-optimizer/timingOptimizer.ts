import { EvaluationContext, TimingScorer } from './types';

export interface ScorerConfig {
  scorer: TimingScorer;
  weight: number; 
}

export interface OptimizationResult {
  finalScore: number;     
  isOptimal: boolean; 
  details: { name: string; score: number; reason: string }[];
  recommendationText: string;
}

export class TimingOptimizer {
  private configs: ScorerConfig[] = [];

  addScorer(scorer: TimingScorer, weight: number = 1.0) {
    this.configs.push({ scorer, weight });
  }

  evaluate(context: EvaluationContext): OptimizationResult {
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const details: { name: string; score: number; reason: string }[] = [];

    for (const { scorer, weight } of this.configs) {
      const result = scorer.score(context);
      
      totalWeightedScore += (result.value * weight);
      totalWeight += weight;
      
      details.push({
        name: scorer.name,
        score: result.value,
        reason: result.reason
      });
    }

    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0.5;

    // 特徴的な理由（高スコアまたは低スコア）をピックアップしてテキスト化
    const recommendationText = details
      .filter(d => d.score >= 0.7 || d.score <= 0.3) 
      .map(d => `- [${d.name}]: ${d.reason}`)
      .join('\n');

    return {
      finalScore,     
      isOptimal: finalScore >= 0.75, // しきい値
      details,
      recommendationText: recommendationText || "特筆すべき強力なタイミング要因はありません。標準的な状態です。"
    };
  }
}
