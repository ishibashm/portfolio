import type { BubbleRect } from "./shirubeBubblePlace";

export function getDefaultActorSize(isMobile: boolean) {
  return isMobile ? { width: 41, height: 84 } : { width: 82, height: 168 };
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= 6;
}

export interface ShirubePosition {
  x: number;
  top: number;
}

export function placeDroppedShirube(
  position: ShirubePosition,
  size: { width: number; height: number },
  viewport: BubbleRect,
  blockers: readonly BubbleRect[],
): ShirubePosition {
  const clampX = (x: number) =>
    Math.max(viewport.left, Math.min(viewport.right - size.width, x));
  const clampY = (y: number) =>
    Math.max(viewport.top, Math.min(viewport.bottom - size.height, y));
  const x = clampX(position.x);
  const top = clampY(position.top);
  const xs = new Set([x]);
  const ys = new Set([top]);
  for (const blocker of blockers) {
    xs.add(clampX(blocker.left - size.width));
    xs.add(clampX(blocker.right));
    ys.add(clampY(blocker.top - size.height));
    ys.add(clampY(blocker.bottom));
  }

  // 操作要素の辺に沿う候補から、重なりの少なさとドロップ地点への近さで選ぶ。
  let best = { x, top };
  let bestOverlap = Infinity;
  let bestDistance = Infinity;
  for (const candidateX of xs) {
    for (const candidateY of ys) {
      const distance = (candidateX - x) ** 2 + (candidateY - top) ** 2;
      if (bestOverlap === 0 && distance >= bestDistance) continue;
      let overlap = 0;
      for (const blocker of blockers) {
        overlap +=
          Math.max(
            0,
            Math.min(candidateX + size.width, blocker.right) -
              Math.max(candidateX, blocker.left),
          ) *
          Math.max(
            0,
            Math.min(candidateY + size.height, blocker.bottom) -
              Math.max(candidateY, blocker.top),
          );
        if (overlap > bestOverlap) break;
      }
      if (overlap === 0 && distance === 0) return best;
      if (
        overlap < bestOverlap ||
        (overlap === bestOverlap && distance < bestDistance)
      ) {
        best = { x: candidateX, top: candidateY };
        bestOverlap = overlap;
        bestDistance = distance;
      }
    }
  }
  return best;
}
