export * from './types';
export * from './timingOptimizer';
export * from './scorers/timeOfDayScorer';
export * from './scorers/freshStartScorer';
export * from './scorers/kigakuScorer';
export * from './scorers/westernAstrologyScorer';

// ---------------------------------------------------------
// ファクトリー/連携基盤の例: ユーザーの設定に応じたオプティマイザの生成
// ---------------------------------------------------------
import { TimingOptimizer } from './timingOptimizer';
import { TimeOfDayScorer } from './scorers/timeOfDayScorer';
import { FreshStartScorer } from './scorers/freshStartScorer';
import { KigakuScorer } from './scorers/kigakuScorer';
import { WesternAstrologyScorer } from './scorers/westernAstrologyScorer';

interface OptimizerPreferences {
    usePsychology: boolean;
    useEasternAstrology: boolean;
    useWesternAstrology: boolean;
}

export function createPersonalizedOptimizer(prefs: OptimizerPreferences): TimingOptimizer {
    const optimizer = new TimingOptimizer();

    // デフォルト（サーカディアンリズム）は常に有効（ベースライン）
    optimizer.addScorer(new TimeOfDayScorer());

    // ユーザーの好みに応じてスコアラーをプラグイン
    if (prefs.usePsychology) {
        optimizer.addScorer(new FreshStartScorer());
    }
    
    if (prefs.useEasternAstrology) {
        optimizer.addScorer(new KigakuScorer()); 
    }
    
    if (prefs.useWesternAstrology) {
        optimizer.addScorer(new WesternAstrologyScorer());
    }

    return optimizer;
}
