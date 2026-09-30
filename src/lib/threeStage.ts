/**
 * three.js の舞台。**立体の部品が共通に持つ土台だけ。**何を描くかは持たない。
 *
 * 三盤の方位盤・八宅の間取り・羅盤・地球儀が同じものを要る。部品ごとに
 * 写すと、片方で直した不具合がもう片方に残る（地図の部品で 4 件起きた。
 * CLAUDE.md 3 節）。実際にこの舞台で直したものがすでに 2 つある:
 *
 * - 映り込みの部屋（RoomEnvironment）は前後左右が非対称で、固定すると
 *   ある側から見たときだけ面が白く曇る。**光と部屋を見る側について回す**
 *   （三盤の方位盤の「南を上」で見つけた。#1603）
 * - 画面の外では描かない、`IntersectionObserver` が無い環境でも落ちない
 *
 * 読み込み: three.js を値として引くので、使う部品は next/dynamic で
 * 画面に入ってから読むこと。
 */

import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Intersection,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Vec3 = [number, number, number];

export interface StageOptions {
  fov: number;
  /** 見る位置と見る先 */
  camera: Vec3;
  target: Vec3;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  /** 動きを減らす設定なら false を渡す */
  autoRotate: boolean;
  autoRotateSpeed?: number;
  /** 光の位置。見る側が +z（南）にいるときの、見る先からのずれ */
  sunOffset: Vec3;
  /** 影を受ける範囲（半幅） */
  shadowExtent: number;
  exposure?: number;
}

export interface FrameView {
  /** 見る側の水平の向き（見る先から見る位置へ。長さ 1） */
  vx: number;
  vz: number;
}

/**
 * 見る側の向きに合わせて光を回す。az は見る位置の水平の向き
 * （+z から +x へ回る角。atan2(vx, vz)）。az = 0 のときに offset そのもの。
 */
export function rotateAboutY(offset: Vec3, az: number): Vec3 {
  const [x, y, z] = offset;
  return [
    x * Math.cos(az) + z * Math.sin(az),
    y,
    -x * Math.sin(az) + z * Math.cos(az),
  ];
}

/** 作ったものを積んでおき、作り直すときと片付けるときにまとめて捨てる */
export class DisposablePool {
  private items: (BufferGeometry | Material | Texture)[] = [];
  constructor(private anisotropy = 1) {}

  keep<T extends BufferGeometry | Material | Texture>(x: T): T {
    this.items.push(x);
    return x;
  }

  texture(canvas: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    return this.keep(t);
  }

  clear() {
    for (const x of this.items) x.dispose();
    this.items = [];
  }
}

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  sun: DirectionalLight;
  pool: DisposablePool;
  /** 毎フレーム、光を回したあと・描く前に呼ぶ */
  onFrame: (fn: (view: FrameView) => void) => void;
  /**
   * 押した所の当たり。ドラッグ（6px を超える移動）は回す操作なので拾わない。
   * 当たったら自動回転を止める
   */
  onPick: (targets: () => Object3D[], fn: (hit: Intersection) => void) => void;
  dispose: () => void;
}

export function createStage(host: HTMLElement, opts: StageOptions): Stage {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new PerspectiveCamera(opts.fov, 1, 0.1, 200);
  camera.position.set(...opts.camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...opts.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = opts.minDistance;
  controls.maxDistance = opts.maxDistance;
  controls.maxPolarAngle = opts.maxPolarAngle;
  controls.autoRotate = opts.autoRotate;
  controls.autoRotateSpeed = opts.autoRotateSpeed ?? 0.45;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });

  scene.add(new HemisphereLight(0xfff4e0, 0x2a1d14, 0.55));
  const sun = new DirectionalLight(0xfff1d6, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const e = opts.shadowExtent;
  sun.shadow.camera.left = -e;
  sun.shadow.camera.right = e;
  sun.shadow.camera.top = e;
  sun.shadow.camera.bottom = -e;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const pool = new DisposablePool(renderer.capabilities.getMaxAnisotropy());

  const frames: ((view: FrameView) => void)[] = [];
  const onFrame = (fn: (view: FrameView) => void) => {
    frames.push(fn);
  };

  const ray = new Raycaster();
  const ndc = new Vector2();
  const pickers: [() => Object3D[], (hit: Intersection) => void][] = [];
  let down: [number, number] | null = null;
  const onDown = (ev: PointerEvent) => {
    down = [ev.clientX, ev.clientY];
  };
  const onUp = (ev: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]);
    down = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    for (const [targets, fn] of pickers) {
      const hit = ray.intersectObjects(targets(), false)[0];
      if (hit) {
        controls.autoRotate = false;
        fn(hit);
        return;
      }
    }
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // 画面の外にあるときは描かない（電池を食わない）
  let visible = true;
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
        });
  io?.observe(host);

  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const len = Math.hypot(dx, dz) || 1;
    const az = Math.atan2(dx, dz);
    /* 光と映り込みの部屋は見る側について回る。部屋は前後左右が非対称で、
       固定するとある側から見たときだけ面が白く曇る */
    scene.environmentRotation.y = az;
    const [sx, sy, sz] = rotateAboutY(opts.sunOffset, az);
    sun.position.set(
      controls.target.x + sx,
      controls.target.y + sy,
      controls.target.z + sz,
    );
    sun.target.position.copy(controls.target);
    sun.target.updateMatrixWorld();
    for (const fn of frames) fn({ vx: dx / len, vz: dz / len });
    controls.update();
    renderer.render(scene, camera);
  });

  const dispose = () => {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    io?.disconnect();
    renderer.domElement.removeEventListener("pointerdown", onDown);
    renderer.domElement.removeEventListener("pointerup", onUp);
    controls.dispose();
    pool.clear();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    sun,
    pool,
    onFrame,
    onPick: (targets, fn) => {
      pickers.push([targets, fn]);
    },
    dispose,
  };
}
