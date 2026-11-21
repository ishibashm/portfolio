/**
 * 部品分け（カットアウト）で歩くちびしるべ。
 *
 * - 素材は public/guide/walk/ の 3 枚（奥の足・手前の足・胴体）。
 *   3 枚とも同じキャンバス寸法なので、重ねるだけで位置が合う。
 * - 足は袴の裾に隠れた付け根を軸に、CSS の transform だけで交互に振る。
 *   付け根より上は袴の内側まで足を伸ばしてあるので、振っても隙間が出ない。
 * - 元絵は右向き。左向きは親で scaleX(-1) する。
 * - アニメーションは ShirubeWanderer.css の no-preference の中だけで動く。
 *   それ以外（reduced-motion・JS 前）は足をそろえた静止の立ち姿。
 */

export const SHIRUBE_WALK_ASSET_DIR = "/guide/walk";

/** 素材キャンバスの縦横比（幅 / 高さ）。517 × 1063 の原寸から。 */
export const SHIRUBE_WALK_ASPECT = 517 / 1063;

export const SHIRUBE_WALK_PARTS = ["leg-far", "leg-near", "body"] as const;
export type ShirubeWalkPart = (typeof SHIRUBE_WALK_PARTS)[number];

/** 表示幅（CSS の --shirube-h × 縦横比）に合わせた sizes。 */
const SIZES = "(min-width: 640px) 59px, 30px";

function srcSet(part: ShirubeWalkPart, ext: "webp" | "png") {
  return [
    `${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-128.${ext} 62w`,
    `${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-240.${ext} 117w`,
  ].join(", ");
}

export function ShirubeWalkRig() {
  return (
    <span className="shirube-rig" data-testid="shirube-walk-rig">
      <span className="shirube-rig-bob">
        {SHIRUBE_WALK_PARTS.map((part) => (
          <picture
            key={part}
            className={`shirube-rig-part shirube-rig-${part}`}
            data-part={part}
          >
            <source
              type="image/webp"
              srcSet={srcSet(part, "webp")}
              sizes={SIZES}
            />
            <img
              src={`${SHIRUBE_WALK_ASSET_DIR}/shirube-walk-${part}-240.png`}
              srcSet={srcSet(part, "png")}
              sizes={SIZES}
              width={117}
              height={240}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </picture>
        ))}
      </span>
    </span>
  );
}

export default ShirubeWalkRig;
