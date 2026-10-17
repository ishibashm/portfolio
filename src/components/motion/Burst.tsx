/**
 * 一瞬だけ金の線が弾ける（motion-prompt の「バースト」#003 に倣う）。
 * 飾り（aria-hidden）。親は position: relative にする。
 * 動きを減らす設定では表示しない（CSS で display: none）。
 * もう一度鳴らすときは key を変えて描き直す。
 */
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function Burst() {
  return (
    <span
      aria-hidden="true"
      className="motion-burst"
      data-testid="motion-burst"
    >
      {ANGLES.map((a) => (
        <span key={a} style={{ ["--a" as string]: `${a}deg` }} />
      ))}
    </span>
  );
}
