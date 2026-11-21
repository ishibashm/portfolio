/**
 * しるべの吹き出しを置く場所を選ぶ（純粋関数）。
 *
 * - 候補は「上（中央・左寄せ・右寄せ）」「横（左・右）」「下」。
 * - ボタン・リンク・入力欄（blockers）に重ならず、画面内に収まる最初の候補を選ぶ。
 * - どこも重なるときは重なりが一番小さい候補を返し、`safe: false` にする。
 *   自動の案内はそのとき出さない（タップされたときだけ出す）。
 */

export interface BubbleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BubbleAnchor {
  /** しるべの左端 x と足元 y（ビューポート座標） */
  x: number;
  y: number;
  actorWidth: number;
  actorHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** 本文が始まる x（固定サイドバーの右端） */
  minLeft?: number;
}

export interface BubblePlacement {
  left: number;
  top: number;
  width: number;
  placement: "above" | "below" | "left" | "right";
  safe: boolean;
}

export const BUBBLE_MARGIN = 8;

export function bubbleSize(
  viewportWidth: number,
  text: string,
  linkCount: number,
): { width: number; height: number } {
  const isMobile = viewportWidth < 640;
  const width = isMobile ? 180 : 220;
  // 1 行あたりの文字数（13〜14px の文字で、左右の余白を除いた幅）
  const perLine = isMobile ? 11 : 14;
  const lines = Math.max(1, Math.ceil(text.length / perLine));
  const height = 34 + lines * 20 + linkCount * 26;
  return { width, height };
}

function overlapArea(a: BubbleRect, b: BubbleRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export function chooseBubblePlacement(
  anchor: BubbleAnchor,
  size: { width: number; height: number },
  blockers: readonly BubbleRect[],
): BubblePlacement {
  const m = BUBBLE_MARGIN;
  const { width: w, height: h } = size;
  const minLeft = (anchor.minLeft ?? 0) + m;
  const maxLeft = anchor.viewportWidth - w - m;
  const clampX = (x: number) => Math.max(minLeft, Math.min(maxLeft, x));
  const actorTop = anchor.y - anchor.actorHeight;
  const cx = anchor.x + anchor.actorWidth / 2;

  const raw: {
    left: number;
    top: number;
    placement: BubblePlacement["placement"];
  }[] = [
    { left: clampX(cx - w / 2), top: actorTop - h - m, placement: "above" },
    {
      left: clampX(anchor.x + anchor.actorWidth - w),
      top: actorTop - h - m,
      placement: "above",
    },
    { left: clampX(anchor.x), top: actorTop - h - m, placement: "above" },
    {
      left: anchor.x + anchor.actorWidth + m,
      top: actorTop,
      placement: "right",
    },
    { left: anchor.x - w - m, top: actorTop, placement: "left" },
    { left: clampX(cx - w / 2), top: anchor.y + m, placement: "below" },
  ];

  let best: BubblePlacement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of raw) {
    const r = {
      left: c.left,
      top: c.top,
      right: c.left + w,
      bottom: c.top + h,
    };
    const inside =
      r.left >= minLeft - 0.5 &&
      r.right <= anchor.viewportWidth - m + 0.5 &&
      r.top >= m &&
      r.bottom <= anchor.viewportHeight - m;
    if (!inside) continue;
    const overlap = blockers.reduce((acc, b) => acc + overlapArea(r, b), 0);
    if (overlap === 0) {
      return {
        left: c.left,
        top: c.top,
        width: w,
        placement: c.placement,
        safe: true,
      };
    }
    if (overlap < bestScore) {
      bestScore = overlap;
      best = {
        left: c.left,
        top: c.top,
        width: w,
        placement: c.placement,
        safe: false,
      };
    }
  }
  if (best) return best;
  // どの候補も画面に収まらない（とても狭い画面）: 上に置いて画面内へ寄せる
  return {
    left: clampX(cx - w / 2),
    top: Math.max(m, Math.min(anchor.viewportHeight - h - m, actorTop - h - m)),
    width: w,
    placement: "above",
    safe: false,
  };
}

/** 吹き出しが重なってはいけない物（押せる物と入力欄）の矩形を集める（DOM）。 */
export function collectBubbleBlockers(
  doc: Document = document,
  win: Window = window,
): BubbleRect[] {
  const out: BubbleRect[] = [];
  doc
    .querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"]), [data-shirube-avoid]',
    )
    .forEach((el) => {
      if (el.closest(".shirube-wander-stage")) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.bottom < 0 || r.top > win.innerHeight) return;
      if (r.right < 0 || r.left > win.innerWidth) return;
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
  return out;
}
