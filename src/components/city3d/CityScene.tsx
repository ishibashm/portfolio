"use client";
import { useEffect, useRef } from "react";
import {
  Color,
  CircleGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { createStage, type Stage } from "@/lib/threeStage";
import {
  addGroundContext,
  addOverlay,
  buildingsGeometry,
} from "@/lib/city3d/sceneGeometry";
import type { ViewProps } from "./CityPlan";
import type { Location } from "@/lib/city3d/geo";
import type { PlateauEntry } from "@/lib/city3d/parsers";
interface Props extends ViewProps {
  origin: Location;
  /** 利用者が PLATEAU を選んだときだけ渡す。null なら目安の高さのまま */
  plateau: PlateauEntry | null;
  mobile: boolean;
  onPlateau: (state: string) => void;
  onUnavailable: () => void;
}
export default function CityScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    stageRef = useRef<Stage | null>(null),
    buildingsRef = useRef<Mesh | null>(null);
  const {
    data,
    radius,
    wedges,
    compass,
    origin,
    plateau,
    mobile,
    onPlateau,
    onUnavailable,
  } = props;
  useEffect(() => {
    if (!host.current) return;
    let stage: Stage;
    try {
      stage = createStage(host.current, {
        fov: 45,
        camera: [0, radius * 1.55, radius * 1.85],
        target: [0, 0, 0],
        minDistance: 80,
        maxDistance: radius * 10,
        maxPolarAngle: Math.PI / 2 - 0.08,
        autoRotate: false,
        sunOffset: [100, 500, 200],
        shadowExtent: radius,
      });
    } catch {
      onUnavailable();
      return;
    }
    stageRef.current = stage;
    const { scene, pool, renderer, camera } = stage;
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    stage.controls.enableDamping = !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const fit = 1 / Math.min(1, camera.aspect / 1.2);
    camera.position.set(0, radius * 2 * fit, radius * 2.4 * fit);
    camera.far = 15000;
    camera.updateProjectionMatrix();
    scene.background = new Color("#fafaf9");
    const ground = new Mesh(
      pool.keep(new CircleGeometry(radius, 96)),
      pool.keep(new MeshStandardMaterial({ color: "#f0ede5" })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    scene.add(ground);
    const geometry = buildingsGeometry(data);
    const buildings = geometry
      ? new Mesh(
          pool.keep(geometry),
          pool.keep(
            new MeshStandardMaterial({ color: "#bcb2a7", roughness: 0.9 }),
          ),
        )
      : null;
    if (buildings) scene.add(buildings);
    buildingsRef.current = buildings;
    addGroundContext(stage, data, radius);
    addOverlay(stage, { data, radius, wedges, compass });
    const pin = new Mesh(
      pool.keep(new SphereGeometry(4)),
      pool.keep(new MeshStandardMaterial({ color: "#9f1239" })),
    );
    pin.position.y = 5;
    scene.add(pin);
    const canvas = renderer.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      stage.dispose();
      stageRef.current = null;
    };
  }, [data, radius, wedges, compass, origin, mobile, onUnavailable]);
  /*
    PLATEAU は利用者が選んだときだけ読む（plateau.ts の findPlateau の註）。
    舞台を作り直したとき（上の effect が走り直したとき）も読み直すよう、
    同じ依存を持たせる。宣言順に走るので、ここでは舞台が既にある。
  */
  useEffect(() => {
    const stage = stageRef.current;
    onPlateau("");
    if (!stage || !plateau || mobile) return;
    if (!(stage.renderer.getContext() instanceof WebGL2RenderingContext))
      return;
    const abort = new AbortController();
    let disposePlateau = () => {};
    onPlateau("PLATEAUの建物を読み込んでいます。");
    void import("@/lib/city3d/plateau")
      .then((m) =>
        abort.signal.aborted
          ? undefined
          : m.startPlateau(
              stage,
              origin,
              plateau,
              abort.signal,
              onPlateau,
              (hide) => {
                if (buildingsRef.current) buildingsRef.current.visible = !hide;
              },
            ),
      )
      .then((dispose) => {
        if (dispose) {
          if (abort.signal.aborted) dispose();
          else disposePlateau = dispose;
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          onPlateau("PLATEAUを読み込めないため、目安の高さで表示しています。");
      });
    return () => {
      abort.abort();
      disposePlateau();
      if (buildingsRef.current) buildingsRef.current.visible = true;
    };
  }, [plateau, data, radius, wedges, compass, origin, mobile, onPlateau]);
  return (
    <div>
      <button
        type="button"
        className="m-3 rounded border border-stone-400 px-4 py-2 text-sm"
        onClick={() => {
          const s = stageRef.current;
          if (s) {
            s.camera.position.set(
              0,
              (radius * 3.6) / Math.min(1, s.camera.aspect),
              0.001,
            );
            s.camera.up.set(0, 1, 0);
            s.controls.target.set(0, 0, 0);
            s.controls.update();
          }
        }}
      >
        真上から（北が上）
      </button>
      <div
        ref={host}
        role="img"
        aria-label="街と方位の立体図。ドラッグで回転、スクロールで拡大できます。"
        className="h-[65vh] min-h-[420px] w-full"
      />
    </div>
  );
}
