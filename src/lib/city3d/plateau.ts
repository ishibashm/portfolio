import { Matrix4, Plane, Vector3, Mesh, Sphere, type Material } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  groundHeight,
  lookupPlateau,
  parseReverseGeocoder,
  type PlateauEntry,
} from "./parsers";
import type { Location } from "./geo";
import type { Stage } from "@/lib/threeStage";
/**
 * 地点が PLATEAU の対象市区町村かを確かめる。**建物のタイルはまだ取らない。**
 *
 * 1 枚の b3dm が 1〜10MB あり（属性の表が大きい。名古屋駅の周り 650m で
 * 実測 27 枚・約 108MB）、黙って読み込むと利用者の通信量を大きく使う。
 * ここでは逆ジオコーダ（数百バイト）と同梱の索引だけを見て、読むかどうかは
 * 画面のボタンで利用者に選んでもらう。
 */
export async function findPlateau(
  origin: Location,
  signal: AbortSignal,
): Promise<PlateauEntry | null> {
  const response = await fetch(
    `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${origin.lat}&lon=${origin.lon}`,
    { signal },
  );
  if (!response.ok) return null;
  const code = parseReverseGeocoder(await response.json());
  const index = (await import("@/data/plateauBldgTilesets.json")).default;
  return lookupPlateau(index, { ward_code: code });
}

export async function startPlateau(
  stage: Stage,
  origin: Location,
  entry: PlateauEntry,
  signal: AbortSignal,
  onState: (state: string) => void,
  hideBuildings: (hide: boolean) => void,
): Promise<() => void> {
  let dispose = () => {};
  try {
    const res = await fetch(entry.url, { signal });
    if (!res.ok) throw new Error();
    const height = groundHeight(await res.json(), origin);
    const [{ TilesRenderer }, { GLTFExtensionsPlugin }] = await Promise.all([
      import("3d-tiles-renderer"),
      import("3d-tiles-renderer/plugins"),
    ]);
    signal.throwIfAborted();
    const tiles = new TilesRenderer(entry.url);
    const draco = new DRACOLoader().setDecoderPath("/draco/gltf/");
    tiles.registerPlugin(
      new GLTFExtensionsPlugin({ dracoLoader: draco, rtc: true }),
    );
    const frame = tiles.ellipsoid
      .getEastNorthUpFrame(
        (origin.lat * Math.PI) / 180,
        (origin.lon * Math.PI) / 180,
        height,
        new Matrix4(),
      )
      .invert();
    tiles.group.matrix.copy(
      new Matrix4().makeRotationX(-Math.PI / 2).multiply(frame),
    );
    tiles.group.matrixAutoUpdate = false;
    const area = new Sphere(
      new Vector3().setFromMatrixPosition(frame.clone().invert()),
      450,
    );
    tiles.registerPlugin({
      name: "CITY_RADIUS",
      // 見えているだけの遠方タイルを取りに行かない。境界を跨ぐタイルは残す。
      calculateTileViewError(
        tile: {
          engineData?: {
            boundingVolume?: { intersectsSphere: (sphere: Sphere) => boolean };
          };
        },
        target: { inView: boolean },
      ) {
        const bounds = tile.engineData?.boundingVolume;
        if (!bounds) return false;
        target.inView = bounds.intersectsSphere(area);
        return true;
      },
    });
    tiles.errorTarget = 24;
    tiles.fetchOptions = { signal };
    tiles.setCamera(stage.camera);
    stage.scene.add(tiles.group);
    // 周辺だけを残し、遠方の都市全体を描かない。
    const planes = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8;
      return new Plane(new Vector3(-Math.cos(a), 0, -Math.sin(a)), 450);
    });
    stage.renderer.localClippingEnabled = true;
    let active = true,
      shown = false;
    const timeout = setTimeout(() => fail(), 20000);
    const fail = () => {
      if (!active) return;
      dispose();
      hideBuildings(false);
      onState("PLATEAUを読み込めないため、目安の高さで表示しています。");
    };
    dispose = () => {
      if (!active) return;
      active = false;
      clearTimeout(timeout);
      tiles.group.removeFromParent();
      tiles.dispose();
      draco.dispose();
    };
    tiles.addEventListener("load-model", ({ scene }) => {
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          const ms: Material[] = Array.isArray(o.material)
            ? o.material
            : [o.material];
          for (const m of ms) {
            m.clippingPlanes = planes;
            m.needsUpdate = true;
          }
        }
      });
    });
    tiles.addEventListener("tile-visibility-change", ({ visible }) => {
      if (visible && !shown && active) {
        shown = true;
        clearTimeout(timeout);
        hideBuildings(true);
        onState(`PLATEAU（${entry.year}年）`);
      }
    });
    tiles.addEventListener("load-error", fail);
    stage.onFrame(() => {
      if (active) {
        try {
          tiles.setResolutionFromRenderer(stage.camera, stage.renderer);
          tiles.update();
        } catch {
          fail();
        }
      }
    });
    signal.addEventListener("abort", dispose, { once: true });
    return dispose;
  } catch {
    dispose();
    if (!signal.aborted)
      onState("PLATEAUを読み込めないため、目安の高さで表示しています。");
    return () => {};
  }
}
