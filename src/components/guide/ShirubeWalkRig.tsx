/**
 * 部品分け（カットアウト）で歩くちびしるべ。
 *
 * - 横向き: public/guide/walk/ の 3 枚（奥の足・手前の足・胴体）。
 *   3 枚とも同じキャンバス寸法なので、重ねるだけで位置が合う。
 *   足は袴の裾に隠れた付け根を軸に、CSS の transform だけで交互に振る。
 * - 正面: 胴体と、手を振る手首から先の 2 枚。立ち止まったときにときどき
 *   正面を向いて手を振る（data-state="greeting"）、または静かにひと休みする
 *   （data-state="sitting"）。
 * - 指さし（data-state="pointing"）: 公式の指さし立ち絵
 *   （/guide/shirube-pointing-{96,240,480}.{avif,webp}）を対象側へ向けて表示する。
 * - 元絵は右向き。左向きは親で scaleX(-1) し、正面だけは反転を打ち消す。
 * - アニメーションは ShirubeWanderer.css の no-preference の中だけで動く。
 *   それ以外（reduced-motion・JS 前）は正面の静止ポーズ。
 */

import { guideSrcSet } from "@/components/guide/GuideCharacter";

export const SHIRUBE_WALK_ASSET_DIR = "/guide/walk";

/** 横向き素材キャンバスの縦横比（幅 / 高さ）。517 × 1063 の原寸から。 */
export const SHIRUBE_WALK_ASPECT = 517 / 1063;

export const SHIRUBE_WALK_PARTS = ["leg-far", "leg-near", "body"] as const;
export const SHIRUBE_FRONT_PARTS = ["front-body", "front-hand"] as const;
export type ShirubeWalkPart =
  | (typeof SHIRUBE_WALK_PARTS)[number]
  | (typeof SHIRUBE_FRONT_PARTS)[number];

/** 表示幅（CSS の --shirube-h × 縦横比）に合わせた sizes。 */
const SIZES = "(min-width: 640px) 59px, 30px";
const POINTING_SIZES = "(min-width: 640px) 98px, 50px";

/** 素材の 128px / 240px 版の横幅（px）。横向き 517、正面 533 の原寸から。 */
const WIDTHS: Record<ShirubeWalkPart, [number, number]> = {
  "leg-far": [62, 117],
  "leg-near": [62, 117],
  body: [62, 117],
  "front-body": [64, 120],
  "front-hand": [64, 120],
};

function srcSet(part: ShirubeWalkPart, ext: "webp" | "png") {
  const [w128, w240] = WIDTHS[part];
  return [
    `${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-128.${ext} ${w128}w`,
    `${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-240.${ext} ${w240}w`,
  ].join(", ");
}

function Part({ part }: { part: ShirubeWalkPart }) {
  return (
    <picture
      className={`shirube-rig-part shirube-rig-${part}`}
      data-part={part}
    >
      <source type="image/webp" srcSet={srcSet(part, "webp")} sizes={SIZES} />
      <img
        src={`${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-240.png`}
        srcSet={srcSet(part, "png")}
        sizes={SIZES}
        width={WIDTHS[part][1]}
        height={240}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}

export function ShirubeWalkRig() {
  return (
    <span className="shirube-rig" data-testid="shirube-walk-rig">
      <span className="shirube-rig-side" data-testid="shirube-rig-side">
        <span className="shirube-rig-bob">
          {SHIRUBE_WALK_PARTS.map((part) => (
            <Part key={part} part={part} />
          ))}
        </span>
      </span>
      <span className="shirube-rig-front" data-testid="shirube-rig-front">
        <span className="shirube-rig-front-hop">
          <span className="shirube-rig-front-breath">
            {SHIRUBE_FRONT_PARTS.map((part) => (
              <Part key={part} part={part} />
            ))}
          </span>
        </span>
      </span>
      <span className="shirube-rig-pointing" data-testid="shirube-rig-pointing">
        <picture className="shirube-rig-pointing-pic">
          <source
            type="image/avif"
            srcSet={guideSrcSet("pointing", "avif")}
            sizes={POINTING_SIZES}
          />
          <source
            type="image/webp"
            srcSet={guideSrcSet("pointing", "webp")}
            sizes={POINTING_SIZES}
          />
          <img
            src="/guide/shirube-pointing-240.webp"
            width={240}
            height={296}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </picture>
      </span>
    </span>
  );
}

export default ShirubeWalkRig;
