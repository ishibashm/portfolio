import { EvaluationContext, TimingScorer } from './types';

export interface ScorerConfig {
  scorer: TimingScorer;
}

export interface OptimizationResult {
  details: { name: string; phenomenon: string; detail: string }[];
  recommendationText: string;
}

export class TimingOptimizer {
  private configs: ScorerConfig[] = [];

  addScorer(scorer: TimingScorer) {
    this.configs.push({ scorer });
  }

  evaluate(context: EvaluationContext): OptimizationResult {
    const details: { name: string; phenomenon: string; detail: string }[] = [];

    for (const { scorer } of this.configs) {
      const result = scorer.observe(context);
      if (result === null) continue;
      
      details.push({
        name: scorer.name,
        phenomenon: result.phenomenon,
        detail: result.detail
      });
    }

    const recommendationText = details
      .map(d => `- [${d.name}] ${d.phenomenon}: ${d.detail}`)
      .join('\n');

    return {
      details,
      recommendationText: recommendationText || "観測可能な特異なタイミング現象はありません。"
    };
  }
}
