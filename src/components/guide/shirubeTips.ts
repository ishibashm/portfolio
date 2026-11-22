/**
 * 案内役「しるべ」の自動ガイド辞書・対象探索・頻度制御（純粋ロジック）。
 *
 * - すべての案内文は 40 文字以内のやわらかい日本語。
 * - 実在ルート（src/app 配下）に前方一致で対応付ける。
 * - ページ側を書き換えなくても動くよう、`[data-shirube-tip]` → CSS セレクタ →
 *   見出しテキスト一致 → `main h1` の順に対象要素を探す。
 */

export type ShirubeTipTrigger =
  | "enter"
  | "scroll"
  | "idle"
  | "result"
  | "empty";

export interface ShirubeTipLink {
  href: string;
  label: string;
}

export interface ShirubeTipTargetSpec {
  /** `[data-shirube-tip="<tipId>"]` を最優先で探すための ID */
  tipId?: string;
  /** CSS セレクタによる探索 */
  selector?: string;
  /** 見出しテキストの部分一致（例: 「先に結論」） */
  headingText?: string;
  /** 何も見つからないとき最初の `main h1` へフォールバックするか（既定 true） */
  allowH1Fallback?: boolean;
}

export interface ShirubeTip {
  id: string;
  /** 40 文字以内のやさしい日本語 */
  text: string;
  target?: string | ShirubeTipTargetSpec;
  link?: ShirubeTipLink;
  /** 404 など複数リンクを出したいときの補助リンク一覧 */
  links?: readonly ShirubeTipLink[];
  when?: ShirubeTipTrigger;
}

/* --------------------------------------------------------------------------
 * ルート別の案内辞書（すべて実在ルートのみ）
 * ------------------------------------------------------------------------ */

const HOME_TIPS: readonly ShirubeTip[] = [
  {
    id: "home-annai",
    text: "迷ったら『しるべに案内してもらう』からどうぞ",
    link: { href: "/annai", label: "しるべに案内してもらう" },
    when: "enter",
  },
  {
    id: "home-today",
    text: "今日すぐ使える吉方位も確認できますよ",
    link: { href: "/houi/today", label: "今日の吉方位と時間" },
    when: "scroll",
  },
  {
    id: "home-profile",
    text: "生年月日を登録すると毎回すぐ見られます",
    link: { href: "/profile", label: "生年月日と場所を登録" },
    when: "idle",
  },
];

const HOUI_TODAY_TIPS: readonly ShirubeTip[] = [
  {
    id: "today-lucky",
    text: "今日いちばん良い方位はここに出ています",
    target: {
      tipId: "today-lucky",
      selector: "[data-verdict], [data-shirube-result]",
      headingText: "今日の吉方位",
    },
    when: "enter",
  },
  {
    id: "today-result",
    text: "結果が出ましたね。吉の方位からどうぞ",
    target: {
      tipId: "today-result",
      selector: "[data-shirube-result], [data-verdict]",
      allowH1Fallback: false,
    },
    when: "result",
  },
  {
    id: "today-hours",
    text: "時間帯ごとの吉方位も下にありますよ",
    target: { tipId: "today-hours", headingText: "時間帯" },
    when: "idle",
  },
  {
    id: "today-calendar",
    text: "引越しの日取りも続けて見られますよ",
    link: { href: "/calendar", label: "引越しの日取りを選ぶ" },
    when: "scroll",
  },
];

const CALENDAR_TIPS: readonly ShirubeTip[] = [
  {
    id: "calendar-enter",
    text: "気になる日を押すと方位と暦が見えます",
    when: "enter",
  },
  {
    id: "calendar-reloc",
    text: "引越しできる日の一覧とも見比べられます",
    link: { href: "/houi/relocation-calendar", label: "引越しできる日の一覧" },
    when: "idle",
  },
];

const RELOCATION_CALENDAR_TIPS: readonly ShirubeTip[] = [
  {
    id: "reloc-cal-enter",
    text: "三盤がそろう日から候補をしぼれますよ",
    when: "enter",
  },
  {
    id: "reloc-cal-idle",
    text: "日ごとの詳しい暦もカレンダーで見られます",
    link: { href: "/calendar", label: "引越しの日取りを選ぶ" },
    when: "idle",
  },
];

const TIMING_TIPS: readonly ShirubeTip[] = [
  {
    id: "timing-enter",
    text: "色が濃い時期ほど動きやすい目安です",
    when: "enter",
  },
  {
    id: "timing-idle",
    text: "具体的な日付は日取りカレンダーで選べます",
    link: { href: "/calendar", label: "引越しの日取りを選ぶ" },
    when: "idle",
  },
];

const ANNAI_TIPS: readonly ShirubeTip[] = [
  {
    id: "annai-enter",
    text: "知りたいことを選ぶと順番にご案内します",
    when: "enter",
  },
  {
    id: "annai-idle",
    text: "生年月日を登録しておくとさらに便利です",
    link: { href: "/profile", label: "生年月日と場所を登録" },
    when: "idle",
  },
];

const GUIDE_TIPS: readonly ShirubeTip[] = [
  {
    id: "guide-enter",
    text: "はじめての方は上から読むとわかりやすいです",
    when: "enter",
  },
  {
    id: "guide-idle",
    text: "今日の吉方位から試してみませんか",
    link: { href: "/houi/today", label: "今日の吉方位と時間" },
    when: "idle",
  },
];

const PROFILE_TIPS: readonly ShirubeTip[] = [
  {
    id: "profile-enter",
    text: "生年月日と場所を入れると毎回手間いらずです",
    when: "enter",
  },
  {
    id: "profile-idle",
    text: "登録できたら今日の吉方位を見てみましょう",
    link: { href: "/houi/today", label: "今日の吉方位と時間" },
    when: "idle",
  },
];

const BLOG_ARTICLE_TIPS: readonly ShirubeTip[] = [
  {
    id: "blog-conclusion",
    text: "急ぐときは『先に結論』だけでも大丈夫です",
    target: { tipId: "blog-conclusion", headingText: "先に結論" },
    when: "enter",
  },
  {
    id: "video",
    text: "動画でも見られます",
    target: {
      tipId: "video",
      selector: 'iframe[src*="youtube"]',
      allowH1Fallback: false,
    },
    when: "scroll",
  },
  {
    id: "blog-houi",
    text: "気になった方位は一覧でも確かめられます",
    link: { href: "/houi", label: "本命星と吉方位を調べる" },
    when: "idle",
  },
];

const BLOG_LIST_TIPS: readonly ShirubeTip[] = [
  {
    id: "blog-list-enter",
    text: "気になるテーマの記事からどうぞ",
    when: "enter",
  },
  {
    id: "blog-list-idle",
    text: "迷ったら案内ページから探すのもおすすめです",
    link: { href: "/annai", label: "しるべに案内してもらう" },
    when: "idle",
  },
];

const HOUI_TOP_TIPS: readonly ShirubeTip[] = [
  {
    id: "houi-enter",
    text: "生まれ年から本命星と今年の吉方位が見えます",
    when: "enter",
  },
  {
    id: "houi-today",
    text: "今日の吉方位や時間帯もすぐ見られますよ",
    link: { href: "/houi/today", label: "今日の吉方位と時間" },
    when: "idle",
  },
];

const CANDIDATES_TIPS: readonly ShirubeTip[] = [
  {
    id: "candidates-enter",
    text: "保存した候補を並べて見比べられますよ",
    when: "enter",
  },
  {
    id: "candidates-empty",
    text: "まだ候補がありません。方位から探しますか",
    target: {
      tipId: "candidates-empty",
      selector: "[data-empty-state]",
      allowH1Fallback: false,
    },
    link: { href: "/houi", label: "本命星と吉方位を調べる" },
    when: "empty",
  },
  {
    id: "candidates-idle",
    text: "時期が決まったら日取りも見てみましょう",
    link: { href: "/calendar", label: "引越しの日取りを選ぶ" },
    when: "idle",
  },
];

export const NOT_FOUND_TIPS: readonly ShirubeTip[] = [
  {
    id: "not-found",
    text: "ページが見つかりませんでした。こちらからどうぞ",
    links: [
      { href: "/", label: "トップページへ" },
      { href: "/annai", label: "しるべに案内してもらう" },
    ],
    when: "enter",
  },
];

export const DEFAULT_TIPS: readonly ShirubeTip[] = [
  {
    id: "default-annai",
    text: "迷ったら『しるべに案内してもらう』からどうぞ",
    link: { href: "/annai", label: "しるべに案内してもらう" },
    when: "enter",
  },
  {
    id: "default-guide",
    text: "使い方ガイドで全体の流れも確認できます",
    link: { href: "/guide", label: "使い方ガイド" },
    when: "idle",
  },
];

/** どのページでも使える動的トリガー用の共通チップ */
export const FORM_NEXT_INPUT_TIP: ShirubeTip = {
  id: "form-required",
  text: "次はここを入力してください",
  target: {
    selector:
      "main input[required]:not([disabled]), main select[required]:not([disabled]), main textarea[required]:not([disabled])",
    allowH1Fallback: false,
  },
  when: "idle",
};

export const GENERIC_RESULT_TIP: ShirubeTip = {
  id: "result-appeared",
  text: "結果が出ましたね。内容を見てみましょう",
  target: {
    selector: "[data-shirube-result], [data-verdict]",
    allowH1Fallback: false,
  },
  when: "result",
};

export const GENERIC_EMPTY_TIP: ShirubeTip = {
  id: "empty-state",
  text: "まだ項目がありません。案内から探せます",
  target: {
    selector: "[data-empty-state]",
    allowH1Fallback: false,
  },
  link: { href: "/annai", label: "しるべに案内してもらう" },
  when: "empty",
};

/** すべての辞書エントリ（テスト検証用にも公開） */
export const ALL_ROUTE_TIP_SETS: Record<string, readonly ShirubeTip[]> = {
  "/": HOME_TIPS,
  "/houi/today": HOUI_TODAY_TIPS,
  "/calendar": CALENDAR_TIPS,
  "/houi/relocation-calendar": RELOCATION_CALENDAR_TIPS,
  "/relocation/timing": TIMING_TIPS,
  "/annai": ANNAI_TIPS,
  "/guide": GUIDE_TIPS,
  "/profile": PROFILE_TIPS,
  "/blog/[slug]": BLOG_ARTICLE_TIPS,
  "/blog": BLOG_LIST_TIPS,
  "/houi": HOUI_TOP_TIPS,
  "/relocation/candidates": CANDIDATES_TIPS,
  "/404": NOT_FOUND_TIPS,
  default: DEFAULT_TIPS,
};

function normalizePathname(raw: string): string {
  const withoutQuery = raw.split(/[?#]/)[0] ?? "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || "/";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * pathname から該当ページの案内一覧を返す（純粋関数）。
 */
export function getTipsForRoute(
  pathname: string,
  options: { is404?: boolean } = {},
): readonly ShirubeTip[] {
  const p = normalizePathname(pathname);
  if (options.is404 || p === "/404") return NOT_FOUND_TIPS;

  if (p === "/") return HOME_TIPS;
  if (matchesPrefix(p, "/houi/today")) return HOUI_TODAY_TIPS;
  if (matchesPrefix(p, "/houi/relocation-calendar")) {
    return RELOCATION_CALENDAR_TIPS;
  }
  if (matchesPrefix(p, "/relocation/timing")) return TIMING_TIPS;
  if (matchesPrefix(p, "/relocation/candidates")) return CANDIDATES_TIPS;
  if (matchesPrefix(p, "/calendar")) return CALENDAR_TIPS;
  if (matchesPrefix(p, "/annai")) return ANNAI_TIPS;
  if (matchesPrefix(p, "/guide")) return GUIDE_TIPS;
  if (matchesPrefix(p, "/profile")) return PROFILE_TIPS;
  if (/^\/blog\/[^/]+/.test(p)) return BLOG_ARTICLE_TIPS;
  if (p === "/blog") return BLOG_LIST_TIPS;
  if (matchesPrefix(p, "/houi")) return HOUI_TOP_TIPS;

  return DEFAULT_TIPS;
}

/* --------------------------------------------------------------------------
 * 対象要素の解決（resolveTipTarget）
 * ------------------------------------------------------------------------ */

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 案内チップの指さし先要素を DOM から解決する。
 * 優先順:
 *   1. `[data-shirube-tip="<tipId>"]`
 *   2. `spec.selector`（または文字列セレクタ）
 *   3. `spec.headingText` を含む見出し（main h1/h2/h3 → h1/h2/h3）
 *   4. 最初の `main h1`（`allowH1Fallback !== false` のとき）
 */
export function resolveTipTarget(
  spec: ShirubeTipTargetSpec | string | undefined,
  doc: Document = document,
  tipId?: string,
): Element | null {
  const normalized: ShirubeTipTargetSpec =
    typeof spec === "string" ? { selector: spec } : (spec ?? {});

  const effectiveTipId = normalized.tipId ?? tipId;
  if (effectiveTipId) {
    const byAttr = doc.querySelector(
      `[data-shirube-tip="${escapeAttrValue(effectiveTipId)}"]`,
    );
    if (byAttr) return byAttr;
  }

  if (normalized.selector) {
    try {
      const bySel = doc.querySelector(normalized.selector);
      if (bySel) return bySel;
    } catch {
      // 無効セレクタは無視して次へ
    }
  }

  if (normalized.headingText) {
    const headings = doc.querySelectorAll(
      "main h1, main h2, main h3, h1, h2, h3",
    );
    for (const h of headings) {
      if (h.textContent?.includes(normalized.headingText)) {
        return h;
      }
    }
  }

  if (normalized.allowH1Fallback !== false) {
    return doc.querySelector("main h1");
  }

  return null;
}

/** 要素が現在のビューポート内に少しでも見えているか（自動スクロールはしない）。 */
export function isElementInViewport(
  el: Element,
  win: Window = window,
): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return (
    r.bottom > 0 &&
    r.top < win.innerHeight &&
    r.right > 0 &&
    r.left < win.innerWidth
  );
}

/** 画面内に見えている未入力の必須入力欄を 1 つ返す。 */
export function findEmptyRequiredInput(
  doc: Document = document,
  win: Window = window,
): HTMLElement | null {
  const fields = doc.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(
    "main input[required]:not([disabled]), main select[required]:not([disabled]), main textarea[required]:not([disabled])",
  );
  for (const field of fields) {
    if (field === doc.activeElement) continue;
    if (field instanceof HTMLInputElement && field.type === "hidden") continue;
    if (
      field instanceof HTMLInputElement &&
      (field.type === "checkbox" || field.type === "radio")
    ) {
      if (field.checked) continue;
    } else if (field.value.trim().length > 0) {
      continue;
    }
    if (!isElementInViewport(field, win)) continue;
    return field;
  }
  return null;
}

/* --------------------------------------------------------------------------
 * 自動表示の頻度制御（純粋関数）
 * ------------------------------------------------------------------------ */

export interface TipRateLimitState {
  lastAutoShownAt: number | null;
  autoCount: number;
  shownIds: readonly string[];
}

export interface TipRateLimitConfig {
  /** 自動表示の最小間隔（ms）。既定 45 秒 */
  minIntervalMs: number;
  /** 1 ページ表示あたりの自動表示上限。既定 6 回 */
  maxPerPageView: number;
  /** 結果（吉凶）への反応など優先の案内の最小間隔（ms）。既定 10 秒 */
  priorityMinIntervalMs?: number;
}

export const DEFAULT_TIP_RATE_LIMIT: TipRateLimitConfig = {
  minIntervalMs: 45_000,
  maxPerPageView: 6,
  priorityMinIntervalMs: 10_000,
};

export function createTipRateLimitState(): TipRateLimitState {
  return {
    lastAutoShownAt: null,
    autoCount: 0,
    shownIds: [],
  };
}

export function canShowAutoTip(
  state: TipRateLimitState,
  nowMs: number,
  config: TipRateLimitConfig = DEFAULT_TIP_RATE_LIMIT,
  options: { inputFocused?: boolean; tipId?: string; priority?: boolean } = {},
): boolean {
  if (options.inputFocused) return false;
  // 優先の案内（結果が出た直後の反応）は、通常の間隔や回数の上限を待たずに出す。
  // それでも続けざまにならないよう、最低 priorityMinIntervalMs は空ける。
  const minInterval = options.priority
    ? (config.priorityMinIntervalMs ??
      DEFAULT_TIP_RATE_LIMIT.priorityMinIntervalMs ??
      10_000)
    : config.minIntervalMs;
  if (!options.priority && state.autoCount >= config.maxPerPageView) {
    return false;
  }
  if (
    state.lastAutoShownAt !== null &&
    nowMs - state.lastAutoShownAt < minInterval
  ) {
    return false;
  }
  if (
    options.tipId &&
    !options.priority &&
    state.shownIds.includes(options.tipId)
  ) {
    return false;
  }
  return true;
}

export function recordAutoTipShown(
  state: TipRateLimitState,
  nowMs: number,
  tipId: string,
): TipRateLimitState {
  return {
    lastAutoShownAt: nowMs,
    autoCount: state.autoCount + 1,
    shownIds: state.shownIds.includes(tipId)
      ? state.shownIds
      : [...state.shownIds, tipId],
  };
}

export function chooseTipForTrigger(
  tips: readonly ShirubeTip[],
  trigger: ShirubeTipTrigger,
  shownIds: readonly string[],
): ShirubeTip | null {
  const matching = tips.filter(
    (t) => t.when === trigger && !shownIds.includes(t.id),
  );
  if (matching.length > 0) return matching[0];
  return null;
}

/**
 * タップ時の案内を選ぶ。押すたびに順番に回し、`isRelevant` を渡すと
 * 「今まさに画面に見えている所の案内」を優先する（見つからなければ順番どおり）。
 */
export function chooseTipForTap(
  tips: readonly ShirubeTip[],
  cursorIndex: number,
  isRelevant?: (tip: ShirubeTip) => boolean,
): { tip: ShirubeTip; nextIndex: number } {
  const pool = tips.length > 0 ? tips : DEFAULT_TIPS;
  const idx = ((cursorIndex % pool.length) + pool.length) % pool.length;
  if (isRelevant) {
    for (let k = 0; k < pool.length; k += 1) {
      const j = (idx + k) % pool.length;
      if (isRelevant(pool[j])) {
        return { tip: pool[j], nextIndex: (j + 1) % pool.length };
      }
    }
  }
  return {
    tip: pool[idx],
    nextIndex: (idx + 1) % pool.length,
  };
}
