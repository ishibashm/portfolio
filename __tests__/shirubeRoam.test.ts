import { describe, expect, it } from "vitest";
import {
  findPerches,
  pickPerchLandingX,
  type Perch,
  type PerchCandidate,
} from "@/components/guide/shirubePerch";
import {
  createInitialWanderState,
  createSeededRandom,
  evaluateHopPosition,
  getWanderBounds,
  getWanderConfig,
  planHopToPerch,
  reconcilePerch,
  startPointingToward,
  stepWanderState,
  type RoamContext,
  type WanderState,
} from "@/components/guide/shirubeWanderLogic";
import {
  ALL_ROUTE_TIP_SETS,
  canShowAutoTip,
  createTipRateLimitState,
  DEFAULT_TIPS,
  getTipsForRoute,
  NOT_FOUND_TIPS,
  recordAutoTipShown,
  resolveTipTarget,
} from "@/components/guide/shirubeTips";

function makeCandidate(
  id: string,
  left: number,
  top: number,
  width: number,
  height = 80,
  extra: Partial<PerchCandidate> = {},
): PerchCandidate {
  return {
    id,
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    visible: true,
    ...extra,
  };
}

describe("findPerches", () => {
  it("最下端の床を常に含み、サイズ・ビューポート・回避対象で候補を絞り込む", () => {
    const viewport = { width: 1200, height: 800 };
    const candidates: PerchCandidate[] = [
      // 有効な要素床
      makeCandidate("ok-card", 100, 320, 400),
      // 幅が小さすぎる（< 120px）
      makeCandidate("too-narrow", 100, 450, 90),
      // 上端に近すぎる（< actorHeight 120 + 16 = 136）
      makeCandidate("too-high", 100, 100, 300),
      // 非表示
      makeCandidate("hidden", 100, 500, 300, 60, { visible: false }),
      // ステージ自身・data-shirube-avoid・主要 CTA・フォーカス中入力
      makeCandidate("stage", 100, 520, 300, 60, { insideStage: true }),
      makeCandidate("avoid", 100, 540, 300, 60, { insideAvoid: true }),
      makeCandidate("cta", 100, 560, 300, 60, { isPrimaryCta: true }),
      makeCandidate("focused", 100, 580, 300, 60, { isFocusedInput: true }),
      // avoidRects と重なる位置にある候補
      makeCandidate("blocked", 700, 400, 260),
    ];

    const perches = findPerches(candidates, viewport, {
      actorHeight: 120,
      actorWidth: 59,
      bottomLiftPx: 40,
      avoidRects: [{ left: 720, right: 900, top: 320, bottom: 410 }],
    });

    expect(perches[0]).toMatchObject({
      id: "bottom",
      kind: "bottom",
      top: 760,
    });
    expect(perches.map((p) => p.id)).toEqual(["bottom", "ok-card"]);
  });

  it("PC は最大 12 か所、スマホ（< 640px）は幅 200px 以上のみ＆最大 4 か所に制限する", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(`c-${i}`, 20, 160 + i * 28, i % 2 === 0 ? 160 : 280),
    );

    const desktop = findPerches(many, { width: 1280, height: 900 });
    expect(desktop.length).toBeLessThanOrEqual(12);
    expect(desktop[0].kind).toBe("bottom");

    const mobileCandidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate(`m-${i}`, 16, 100 + i * 50, i < 3 ? 160 : 260),
    );
    const mobile = findPerches(mobileCandidates, { width: 375, height: 700 });
    expect(mobile.length).toBeLessThanOrEqual(4);
    for (const p of mobile) {
      if (p.kind === "element") {
        expect(p.right - p.left).toBeGreaterThanOrEqual(200);
      }
    }
  });

  it("要素の床では本文を避けるため左右 20% の端寄りに着地先を選ぶ", () => {
    const elementPerch: Perch = {
      id: "card-1",
      left: 100,
      right: 600,
      top: 350,
      kind: "element",
    };
    const leftX = pickPerchLandingX(elementPerch, 59, () => 0.5, "left");
    const rightX = pickPerchLandingX(elementPerch, 59, () => 0.5, "right");
    expect(leftX).toBeLessThan(210);
    expect(rightX).toBeGreaterThan(440);
  });
});

describe("自由移動の状態遷移（ホップ・着地・床消失・指さし）", () => {
  const bottomPerch: Perch = {
    id: "bottom",
    left: 16,
    right: 984,
    top: 800,
    kind: "bottom",
  };
  const cardPerch: Perch = {
    id: "card-1",
    left: 120,
    right: 620,
    top: 420,
    kind: "element",
  };

  it("放物線ホップは 450〜700ms・頂点は高い床より 40〜90px 上を通り、着地後に遷移する", () => {
    const hop = planHopToPerch(700, 800, cardPerch, 160, 120);
    expect(hop.durationMs).toBeGreaterThanOrEqual(450);
    expect(hop.durationMs).toBeLessThanOrEqual(700);
    expect(hop.apexY).toBeLessThanOrEqual(420 - 40);
    expect(hop.apexY).toBeGreaterThanOrEqual(420 - 90);

    const mid = evaluateHopPosition({ ...hop, elapsedMs: hop.durationMs / 2 });
    expect(mid.y).toBeCloseTo(hop.apexY, 1);

    const bounds = getWanderBounds(1000, 59, 16);
    const config = getWanderConfig(1000);
    const roam: RoamContext = {
      perches: [bottomPerch, cardPerch],
      actorWidth: 59,
      actorHeight: 120,
      viewportHeight: 800,
    };

    let state: WanderState = {
      ...createInitialWanderState(bounds, config, createSeededRandom(1), 800),
      phase: "hopping",
      hop,
    };
    for (let i = 0; i < 30 && state.phase === "hopping"; i += 1) {
      state = stepWanderState(
        state,
        40,
        bounds,
        config,
        createSeededRandom(2),
        roam,
      );
    }

    expect(state.phase).toBe("paused");
    expect(state.perchId).toBe("card-1");
    expect(state.x).toBe(160);
    expect(state.y).toBe(420);
    expect(state.hop).toBeNull();
  });

  it("乗っていた床が消えると最寄りの可視床（最下端フォールバック）へ飛び降りる", () => {
    const bounds = getWanderBounds(1000, 59, 16);
    const config = getWanderConfig(1000);
    const standingOnCard = {
      ...createInitialWanderState(bounds, config, () => 0.3, 420),
      x: 200,
      y: 420,
      perchId: "card-1",
      phase: "paused" as const,
      remainingMs: 3000,
    };

    // card-1 がスクロールアウトし bottom だけが残った状態
    const roam: RoamContext = {
      perches: [bottomPerch],
      actorWidth: 59,
      actorHeight: 120,
      viewportHeight: 800,
    };
    let next = reconcilePerch(standingOnCard, roam, () => 0.5);
    expect(next.phase).toBe("hopping");
    expect(next.hop?.toPerchId).toBe("bottom");

    for (let i = 0; i < 30 && next.phase === "hopping"; i += 1) {
      next = stepWanderState(next, 40, bounds, config, () => 0.5, roam);
    }
    expect(next.perchId).toBe("bottom");
    expect(next.y).toBe(800);
  });

  it("要素の床に上限（maxPerchStayMs）を超えて留まり続けると別床へ移る", () => {
    const bounds = getWanderBounds(1000, 59, 16);
    const config = getWanderConfig(1000);
    const roam: RoamContext = {
      perches: [bottomPerch, cardPerch],
      actorWidth: 59,
      actorHeight: 120,
      viewportHeight: 800,
    };

    const longStay = {
      ...createInitialWanderState(bounds, config, () => 0.2, 420),
      x: 140,
      y: 420,
      perchId: "card-1",
      perchElapsedMs: config.maxPerchStayMs + 100,
      phase: "paused" as const,
      remainingMs: 2000,
    };

    const next = stepWanderState(
      longStay,
      200,
      bounds,
      config,
      () => 0.4,
      roam,
    );
    expect(next.phase).toBe("hopping");
    expect(next.hop?.toPerchId).toBe("bottom");
  });

  it("startPointingToward は対象近くの床へ移動してから pointing へ入る", () => {
    const bounds = getWanderBounds(1000, 59, 16);
    const config = getWanderConfig(1000);
    const roam: RoamContext = {
      perches: [bottomPerch, cardPerch],
      actorWidth: 59,
      actorHeight: 120,
      viewportHeight: 800,
    };

    let state = {
      ...createInitialWanderState(bounds, config, () => 0.3, 800),
      x: 300,
    };
    state = startPointingToward(
      state,
      { left: 260, right: 520, top: 340, bottom: 420 },
      roam,
      5000,
    );
    expect(state.phase).toBe("hopping");
    expect(state.hop?.afterPhase).toBe("pointing");

    for (let i = 0; i < 30 && state.phase === "hopping"; i += 1) {
      state = stepWanderState(state, 40, bounds, config, () => 0.5, roam);
    }
    expect(state.phase).toBe("pointing");
    expect(state.perchId).toBe("card-1");
  });

  it("同じ床で離れているときは跳ばずに、その場で対象の方を向いて指さす", () => {
    const bounds = getWanderBounds(1000, 59, 16);
    const config = getWanderConfig(1000);
    const roam: RoamContext = {
      perches: [bottomPerch],
      actorWidth: 59,
      actorHeight: 120,
      viewportHeight: 800,
    };
    const state = {
      ...createInitialWanderState(bounds, config, () => 0.3, 800),
      x: 900,
    };
    const next = startPointingToward(
      state,
      { left: 100, right: 300, top: 500, bottom: 600 },
      roam,
      5000,
    );
    expect(next.phase).toBe("pointing");
    expect(next.hop).toBeNull();
    expect(next.x).toBe(900);
    expect(next.facing).toBe("left");
  });
});

describe("shirubeTips（ルート一致・対象解決・頻度制限・文章ルール）", () => {
  it("pathname に応じて適切な案内セットを返す（/blog/[slug], 未知ルート, 404）", () => {
    const blogArticle = getTipsForRoute("/blog/moving-direction-basics");
    expect(blogArticle.some((t) => t.id === "blog-conclusion")).toBe(true);
    expect(blogArticle.some((t) => t.id === "video")).toBe(true);

    const blogList = getTipsForRoute("/blog");
    expect(blogList.some((t) => t.id === "blog-list-enter")).toBe(true);

    const today = getTipsForRoute("/houi/today");
    expect(today.some((t) => t.id === "today-lucky")).toBe(true);

    expect(getTipsForRoute("/unknown/route")).toBe(DEFAULT_TIPS);
    expect(getTipsForRoute("/anything", { is404: true })).toBe(NOT_FOUND_TIPS);
    expect(getTipsForRoute("/404")).toBe(NOT_FOUND_TIPS);
  });

  it("すべての案内文は 40 文字以内で禁止語「Cloud Paletteでは」を含まない", () => {
    for (const tips of Object.values(ALL_ROUTE_TIP_SETS)) {
      for (const tip of tips) {
        expect(tip.text.length).toBeLessThanOrEqual(40);
        expect(tip.text).not.toContain("Cloud Paletteでは");
      }
    }
  });

  it("resolveTipTarget は data-shirube-tip を最優先し、見出しテキスト・main h1 へフォールバックする", () => {
    document.body.innerHTML = `
      <main>
        <h1>ページの主見出し</h1>
        <h2 id="concl">先に結論：南東が吉</h2>
        <div id="explicit" data-shirube-tip="custom-id">明示ターゲット</div>
      </main>
    `;

    // 1. data-shirube-tip 最優先
    const explicit = resolveTipTarget(
      { tipId: "custom-id", headingText: "先に結論" },
      document,
    );
    expect(explicit?.id).toBe("explicit");

    // 2. 見出しテキスト一致フォールバック
    const byHeading = resolveTipTarget(
      {
        tipId: "missing-attr",
        selector: ".not-found",
        headingText: "先に結論",
      },
      document,
    );
    expect(byHeading?.id).toBe("concl");

    // 3. 見つからなければ main h1 へフォールバック
    const byH1 = resolveTipTarget(
      { selector: ".not-found", headingText: "存在しない見出し" },
      document,
    );
    expect(byH1?.tagName).toBe("H1");

    // 4. allowH1Fallback: false なら null
    const strictNull = resolveTipTarget(
      { selector: 'iframe[src*="youtube"]', allowH1Fallback: false },
      document,
    );
    expect(strictNull).toBeNull();

    document.body.innerHTML = "";
  });

  it("頻度制限: 45 秒間隔・1 ページ最大 6 回・入力フォーカス中は抑止・同一 ID 重複抑止", () => {
    let state = createTipRateLimitState();
    const cfg = { minIntervalMs: 45_000, maxPerPageView: 6 };

    // 入力フォーカス中は不可
    expect(
      canShowAutoTip(state, 10_000, cfg, { inputFocused: true, tipId: "a" }),
    ).toBe(false);
    // 通常は許可
    expect(canShowAutoTip(state, 10_000, cfg, { tipId: "a" })).toBe(true);
    state = recordAutoTipShown(state, 10_000, "a");

    // 45 秒未満は不可
    expect(canShowAutoTip(state, 54_999, cfg, { tipId: "b" })).toBe(false);
    // 45 秒経過で別 ID は許可、同一 ID は不可
    expect(canShowAutoTip(state, 55_000, cfg, { tipId: "a" })).toBe(false);
    expect(canShowAutoTip(state, 55_000, cfg, { tipId: "b" })).toBe(true);

    // 合計 6 回到達したら以降は不可
    let t = 55_000;
    for (const id of ["b", "c", "d", "e", "f"]) {
      state = recordAutoTipShown(state, t, id);
      t += 50_000;
    }
    expect(state.autoCount).toBe(6);
    expect(canShowAutoTip(state, t + 100_000, cfg, { tipId: "g" })).toBe(false);
  });
});

describe("気ままな飛び移りは近くの床だけ", () => {
  it("near を渡すと横に遠すぎる床は選ばない", async () => {
    const { pickHopTargetPerch } =
      await import("@/components/guide/shirubeWanderLogic");
    const perches = [
      { id: "bottom", left: 0, right: 1200, top: 800, kind: "bottom" as const },
      {
        id: "far",
        left: 1000,
        right: 1200,
        top: 500,
        kind: "element" as const,
      },
      { id: "near", left: 200, right: 500, top: 600, kind: "element" as const },
    ];
    for (const r of [0, 0.5, 0.99]) {
      expect(
        pickHopTargetPerch(perches, "bottom", null, () => r, { x: 300, y: 800 })
          ?.id,
      ).toBe("near");
    }
    expect(
      pickHopTargetPerch(perches.slice(0, 2), "bottom", null, () => 0.5, {
        x: 100,
        y: 800,
      }),
    ).toBeNull();
  });
});

describe("タップの案内は見えている所を優先", () => {
  it("isRelevant に合う案内を順番の中から選び、無ければ順番どおり", async () => {
    const { chooseTipForTap } = await import("@/components/guide/shirubeTips");
    const tips = [
      { id: "a", text: "A" },
      { id: "b", text: "B", target: "#b" },
      { id: "c", text: "C", target: "#c" },
    ];
    const r1 = chooseTipForTap(tips, 0, (t) => t.id === "c");
    expect(r1.tip.id).toBe("c");
    expect(r1.nextIndex).toBe(0);
    const r2 = chooseTipForTap(tips, 1, () => false);
    expect(r2.tip.id).toBe("b");
    expect(r2.nextIndex).toBe(2);
  });
});

describe("固定サイドバーの上には立たない", () => {
  it("contentLeftPx より左を床にしない", async () => {
    const { findPerches } = await import("@/components/guide/shirubePerch");
    const perches = findPerches(
      [
        {
          id: "card",
          left: 100,
          right: 700,
          top: 400,
          bottom: 600,
          width: 600,
          height: 200,
        },
      ],
      { width: 1280, height: 800 },
      { contentLeftPx: 256 },
    );
    for (const p of perches) expect(p.left).toBeGreaterThanOrEqual(256 + 16);
  });
});

describe("カードの上が空いている所だけに立つ", () => {
  it("freeSpans の区間だけを床にし、狭すぎる区間や空きの無いカードは使わない", async () => {
    const { findPerches } = await import("@/components/guide/shirubePerch");
    const base = { top: 400, bottom: 600, width: 600, height: 200 };
    const perches = findPerches(
      [
        {
          id: "a",
          left: 100,
          right: 700,
          ...base,
          freeSpans: [
            [100, 160],
            [500, 700],
          ],
        },
        { id: "b", left: 100, right: 700, ...base, top: 520, freeSpans: [] },
      ],
      { width: 1280, height: 800 },
      { actorWidth: 59, actorHeight: 120 },
    );
    const el = perches.filter((p) => p.kind === "element");
    expect(el).toHaveLength(1);
    expect(el[0].left).toBe(500);
    expect(el[0].right).toBe(700);
  });

  it("spansFromSamples は連続した空きを区間にまとめる", async () => {
    const { spansFromSamples } =
      await import("@/components/guide/shirubePerch");
    expect(
      spansFromSamples(
        [10, 24, 38, 52, 66],
        [true, true, false, true, true],
        14,
      ),
    ).toEqual([
      [3, 31],
      [45, 73],
    ]);
  });
});

describe("吹き出しはボタンやリンクに重ねない", () => {
  const anchor = {
    x: 200,
    y: 500,
    actorWidth: 30,
    actorHeight: 60,
    viewportWidth: 390,
    viewportHeight: 760,
  };
  it("上がボタンでふさがっていれば横か下に置く", async () => {
    const { chooseBubblePlacement } =
      await import("@/components/guide/shirubeBubblePlace");
    const size = { width: 180, height: 80 };
    const free = chooseBubblePlacement(anchor, size, []);
    expect(free.placement).toBe("above");
    expect(free.safe).toBe(true);
    const blocked = chooseBubblePlacement(anchor, size, [
      { left: 0, top: 300, right: 390, bottom: 440 },
    ]);
    expect(blocked.placement).not.toBe("above");
    expect(blocked.safe).toBe(true);
  });
  it("どこに置いても重なるときは safe: false（自動の案内は出さない）", async () => {
    const { chooseBubblePlacement } =
      await import("@/components/guide/shirubeBubblePlace");
    const r = chooseBubblePlacement(anchor, { width: 180, height: 80 }, [
      { left: 0, top: 0, right: 390, bottom: 760 },
    ]);
    expect(r.safe).toBe(false);
  });
});

describe("結果への反応は頻度の制限より優先", () => {
  it("直前に別の案内が出ていても結果の反応は出せる。ただし 10 秒は空ける", async () => {
    const { canShowAutoTip, recordAutoTipShown, createTipRateLimitState } =
      await import("@/components/guide/shirubeTips");
    const s = recordAutoTipShown(createTipRateLimitState(), 0, "enter-tip");
    expect(canShowAutoTip(s, 3_000, undefined, { tipId: "r" })).toBe(false);
    expect(
      canShowAutoTip(s, 3_000, undefined, { tipId: "r", priority: true }),
    ).toBe(false);
    expect(
      canShowAutoTip(s, 11_000, undefined, { tipId: "r", priority: true }),
    ).toBe(true);
    expect(canShowAutoTip(s, 11_000, undefined, { tipId: "r" })).toBe(false);
  });
});

describe("ムーンウォークしない・基本はその場で足踏み", () => {
  const perches = [
    { id: "bottom", left: 16, right: 1264, top: 800, kind: "bottom" as const },
    { id: "card-a", left: 300, right: 700, top: 420, kind: "element" as const },
    {
      id: "card-b",
      left: 640,
      right: 1000,
      top: 560,
      kind: "element" as const,
    },
  ];
  const roam = {
    perches,
    actorWidth: 59,
    actorHeight: 120,
    viewportHeight: 800,
  };

  async function simulate(seed: number, seconds: number, dtMs: number) {
    const L = await import("@/components/guide/shirubeWanderLogic");
    const random = L.createSeededRandom(seed);
    const bounds = L.getWanderBounds(1280, 59, 16);
    const config = L.getWanderConfig(1280);
    let s = L.startStepping(
      L.createInitialWanderState(bounds, config, random, 800),
      bounds,
      config,
      random,
    );
    const frames: { x: number; facing: string; phase: string }[] = [
      { x: s.x, facing: s.facing, phase: s.phase },
    ];
    for (let t = 0; t < seconds * 1000; t += dtMs) {
      s = L.stepWanderState(s, dtMs, bounds, config, random, roam);
      frames.push({ x: s.x, facing: s.facing, phase: s.phase });
    }
    return frames;
  }

  it("動いているコマでは、向きが必ず進む向きと一致する（歩き・足踏み・飛び移り）", async () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      for (const dt of [16, 50, 100]) {
        const f = await simulate(seed, 180, dt);
        for (let i = 1; i < f.length; i += 1) {
          const dx = f[i].x - f[i - 1].x;
          if (Math.abs(dx) < 0.01) continue;
          if (!["walking", "stepping", "hopping"].includes(f[i].phase))
            continue;
          const dir = dx > 0 ? "right" : "left";
          expect({
            seed,
            dt,
            i,
            phase: f[i].phase,
            facing: f[i].facing,
          }).toEqual({
            seed,
            dt,
            i,
            phase: f[i].phase,
            facing: dir,
          });
        }
      }
    }
  });

  it("ほとんどの時間はその場（足踏み・立ち止まり・正面）で、移動はときどき", async () => {
    for (const seed of [3, 11, 77]) {
      const f = await simulate(seed, 300, 50);
      const moving = f.filter(
        (x) => x.phase === "walking" || x.phase === "hopping",
      ).length;
      const stepping = f.filter((x) => x.phase === "stepping").length;
      expect(moving / f.length).toBeLessThan(0.3);
      expect(stepping / f.length).toBeGreaterThan(0.25);
      // 移動（歩き出し・飛び移り）の回数は 5 分で数回〜20 回程度
      let starts = 0;
      for (let i = 1; i < f.length; i += 1) {
        const m = (p: string) => p === "walking" || p === "hopping";
        if (m(f[i].phase) && !m(f[i - 1].phase)) starts += 1;
      }
      expect(starts).toBeGreaterThanOrEqual(3);
      expect(starts).toBeLessThanOrEqual(24);
    }
  });

  it("足踏み中のにじり寄りは数 px だけで、向いている側へだけ", async () => {
    const L = await import("@/components/guide/shirubeWanderLogic");
    const bounds = { minX: 16, maxX: 1200 };
    const config = L.getWanderConfig(1280);
    for (let k = 0; k < 50; k += 1) {
      const r = L.createSeededRandom(k);
      const base = L.createInitialWanderState(bounds, config, r, 800);
      const s = L.startStepping(base, bounds, config, r);
      const dx = s.targetX - s.x;
      expect(Math.abs(dx)).toBeLessThanOrEqual(config.maxStepDriftPx);
      if (dx !== 0) expect(dx > 0 ? "right" : "left").toBe(s.facing);
    }
  });
});
