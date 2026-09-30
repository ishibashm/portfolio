"use client";

/**
 * 三盤の方位盤の立体（three.js）。**描くだけ。**判定も角度も持たない。
 *
 * - 扇形・九星・呼び名・段階は threeBoardModel（API の判定をそのまま写した
 *   もの）から描く。盤面の角度と座標の対応は threeBoardCanvas
 * - 押した点の方位は threeBoardModel.directionOfPoint（判定と同じ境目）
 *
 * 見た目（利用者の依頼「精度は両方で」の質感の側）:
 * - 下から年盤・月盤・日盤。上ほど小さい真鍮の円盤を重ね、縁は面取り
 * - 盤面は漆の地に扇形を塗り、金の線で境目と文字を彫る
 * - 金属の映り込みは RoomEnvironment（外部の画像を読まない）
 * - 三盤とも吉（段階 S）の方位は、3 枚を貫く光の柱にする
 * - 台座に方位角の目盛り（5 度刻み）と、方位ごとの段階の輪
 *
 * 重さ: three.js はこの部品と一緒に、画面に入ったときだけ読み込む
 * （ThreeBoardStack が next/dynamic で読む）。
 */

import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  FrontSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  Vector2,
  type BufferGeometry,
  type Material,
} from "three";
import {
  STAR_NAMES,
  directionOfPoint,
  type BoardDisc,
  type DirectionColumn,
  type ThreeBoardModel,
} from "@/lib/threeBoardModel";
import {
  canvasAngleOfBearing,
  canvasPointOfBearing,
  type BoardOrientation,
} from "@/lib/threeBoardCanvas";
import type { CompassDirection } from "@/utils/directionGeo";
import { createStage } from "@/lib/threeStage";

/** 盤の半径（下から年・月・日）。上ほど小さくして、下の盤の縁も見える */
const RADII = [2.7, 2.3, 1.9];
const THICK = 0.16;
const BEVEL = 0.035;
const BASE_R = 3.25;
const TEX = 2048;
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';

/** 真鍮の色（下から年・月・日。上ほど明るい） */
const BRASS = [0x8a6a3b, 0xa98545, 0xc7a35c];
const GOLD = "#e3c27a";
const FILL = {
  good: ["#065f46", "#10b981"],
  neutral: ["#3f3a36", "#6b635c"],
  bad: ["#7f1d1d", "#dc2626"],
} as const;

/** 光の柱の濃さ（奥にあるとき）。手前に回ると 1/4 まで薄める */
const PILLAR_OPACITY = 0.16;

export interface ThreeBoardSceneProps {
  model: ThreeBoardModel;
  selected: CompassDirection | null;
  onSelect: (d: CompassDirection) => void;
  /** 盤を離して見せるか（重ねるか） */
  spread: boolean;
  /** 南を上にするときは、北側から見下ろす（文字は正立のまま） */
  orientation: BoardOrientation;
  reducedMotion: boolean;
}

/**
 * 文字を置く。位置は方位に縛られたまま、字だけを見る側へ向ける。南を上に
 * すると盤を北側から見るので、字をその場で 180 度回して正立させる
 * （扇形の位置は動かさない。動かすと方位が変わる）。
 */
function uprightText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  flip: boolean,
) {
  if (!flip) {
    g.fillText(text, x, y);
    return;
  }
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI);
  g.fillText(text, 0, 0);
  g.restore();
}

/** 盤面の絵。扇形・金の境目・九星・呼び名・中宮 */
function paintDisc(disc: BoardDisc, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  const h = TEX / 2;
  const R = h * 0.985;
  const inner = h * 0.3;

  // 漆の地
  const bg = g.createRadialGradient(h, h, 0, h, h, h);
  bg.addColorStop(0, "#2a211c");
  bg.addColorStop(1, "#120d0a");
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);

  for (const s of disc.sectors) {
    const a0 = canvasAngleOfBearing(s.startDeg);
    const a1 = canvasAngleOfBearing(s.endDeg);
    const [c0, c1] = FILL[s.kind];
    const grad = g.createRadialGradient(h, h, inner, h, h, R);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.beginPath();
    g.arc(h, h, R * 0.955, a0, a1);
    g.arc(h, h, inner, a1, a0, true);
    g.closePath();
    g.fillStyle = grad;
    g.globalAlpha = 0.92;
    g.fill();
    g.globalAlpha = 1;

    // 文字は手前から読める向き。扇形の真ん中に置く
    const mid = (s.startDeg + s.endDeg) / 2;
    /* 扇形の幅（30〜60 度）に合わせて字を小さくする。狭い扇形で隣へ
       はみ出さないように */
    const scale = Math.min(1, (s.endDeg - s.startDeg) / 45);
    const [sx, sy] = canvasPointOfBearing(mid, 0.74, TEX);
    const [lx, ly] = canvasPointOfBearing(mid, 0.53, TEX);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fdf6e3";
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 8;
    g.font = `700 ${Math.round(TEX * 0.05 * (0.75 + 0.25 * scale))}px ${FONT}`;
    uprightText(g, STAR_NAMES[s.star] ?? String(s.star), sx, sy, flip);
    g.font = `800 ${Math.round(TEX * 0.036 * (0.7 + 0.3 * scale))}px ${FONT}`;
    g.fillStyle = s.kind === "neutral" ? "#e7e5e4" : "#fffbeb";
    uprightText(g, s.badge, lx, ly, flip);
    g.shadowBlur = 0;
  }

  // 金の境目（彫り: 暗い線の上に金の線）
  for (const s of disc.sectors) {
    const a = canvasAngleOfBearing(s.startDeg);
    for (const [color, w, off] of [
      ["rgba(0,0,0,0.55)", 10, 3],
      [GOLD, 5, 0],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(h + Math.cos(a) * inner + off, h + Math.sin(a) * inner + off);
      g.lineTo(
        h + Math.cos(a) * R * 0.955 + off,
        h + Math.sin(a) * R * 0.955 + off,
      );
      g.stroke();
    }
  }
  for (const r of [inner, R * 0.955, R]) {
    g.strokeStyle = GOLD;
    g.lineWidth = r === R ? 14 : 6;
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }

  // 中宮
  const hub = g.createRadialGradient(h, h - inner * 0.3, 0, h, h, inner);
  hub.addColorStop(0, "#3b2f26");
  hub.addColorStop(1, "#16110d");
  g.fillStyle = hub;
  g.beginPath();
  g.arc(h, h, inner - 4, 0, Math.PI * 2);
  g.fill();
  // 中宮の字は、見る側から読める向きに中心ごと回す
  g.save();
  if (flip) {
    g.translate(h, h);
    g.rotate(Math.PI);
    g.translate(-h, -h);
  }
  g.fillStyle = GOLD;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(TEX * 0.034)}px ${FONT}`;
  g.fillText(disc.name, h, h - inner * 0.42);
  g.font = `700 ${Math.round(TEX * 0.058)}px ${FONT}`;
  g.fillStyle = "#fdf6e3";
  g.fillText(
    STAR_NAMES[disc.center] ?? String(disc.center),
    h,
    h + inner * 0.08,
  );
  g.font = `600 ${Math.round(TEX * 0.026)}px ${FONT}`;
  g.fillStyle = GOLD;
  g.fillText("中宮", h, h + inner * 0.55);
  g.restore();
  return c;
}

/** 台座の絵。方位角の目盛り・方位名・方位ごとの段階の輪 */
function paintBase(
  columns: DirectionColumn[],
  flip: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  const h = TEX / 2;
  const R = h * 0.985;

  const wood = g.createRadialGradient(h, h, 0, h, h, h);
  wood.addColorStop(0, "#4a3426");
  wood.addColorStop(1, "#24170f");
  g.fillStyle = wood;
  g.fillRect(0, 0, TEX, TEX);

  // 段階の輪（最終の判定。三盤を合わせた答え）
  const band0 = R * 0.84;
  const band1 = R * 0.93;
  for (const col of columns) {
    g.beginPath();
    g.arc(
      h,
      h,
      band1,
      canvasAngleOfBearing(col.startDeg),
      canvasAngleOfBearing(col.endDeg),
    );
    g.arc(
      h,
      h,
      band0,
      canvasAngleOfBearing(col.endDeg),
      canvasAngleOfBearing(col.startDeg),
      true,
    );
    g.closePath();
    g.fillStyle = col.color;
    g.fill();
    const mid = (col.startDeg + col.endDeg) / 2;
    const [tx, ty] = canvasPointOfBearing(mid, 0.885, TEX);
    g.fillStyle = "#0c0a09";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 ${Math.round(TEX * 0.03)}px ${FONT}`;
    uprightText(g, col.tier ?? "", tx, ty, flip);
    const [nx, ny] = canvasPointOfBearing(mid, 0.965, TEX);
    g.fillStyle = "#fdf6e3";
    g.font = `700 ${Math.round(TEX * 0.026)}px ${FONT}`;
    uprightText(g, col.label, nx, ny, flip);
  }
  // 境目
  for (const col of columns) {
    const a = canvasAngleOfBearing(col.startDeg);
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * band0, h + Math.sin(a) * band0);
    g.lineTo(h + Math.cos(a) * R, h + Math.sin(a) * R);
    g.stroke();
  }
  // 目盛り: 5 度ごと、15 度ごとに長く、30 度ごとに数字
  for (let deg = 0; deg < 360; deg += 5) {
    const a = canvasAngleOfBearing(deg);
    const long = deg % 15 === 0;
    const r0 = band0 - (long ? 34 : 18);
    g.strokeStyle = GOLD;
    g.lineWidth = long ? 5 : 3;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
    g.lineTo(h + Math.cos(a) * band0, h + Math.sin(a) * band0);
    g.stroke();
    if (deg % 30 === 0) {
      const [x, y] = canvasPointOfBearing(deg, (band0 - 70) / h, TEX);
      g.fillStyle = GOLD;
      g.font = `600 ${Math.round(TEX * 0.019)}px ${FONT}`;
      uprightText(g, `${deg}°`, x, y, flip);
    }
  }
  for (const r of [band0, band1, R]) {
    g.strokeStyle = GOLD;
    g.lineWidth = r === R ? 12 : 5;
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }
  return c;
}

/** 面取りした円盤の側面（旋盤で回す断面） */
function discBody(r: number): LatheGeometry {
  const t = THICK / 2;
  const pts = [
    new Vector2(0, -t),
    new Vector2(r - BEVEL, -t),
    new Vector2(r, -t + BEVEL),
    new Vector2(r, t - BEVEL),
    new Vector2(r - BEVEL, t),
    new Vector2(0.001, t),
  ];
  return new LatheGeometry(pts, 160);
}

/** 扇形の柱（段階 S の光・選んだ方位の枠） */
function wedgePrism(
  col: DirectionColumn,
  r0: number,
  r1: number,
  height: number,
): ExtrudeGeometry {
  /* Shape は xy 平面。あとで x 軸まわりに −90 度寝かせるので、
     方位角 b の向きは (sin b, cos b)（+y が北＝盤の −z になる） */
  const shape = new Shape();
  const steps = 32;
  const pt = (b: number, r: number) => {
    const rad = (b * Math.PI) / 180;
    return [Math.sin(rad) * r, Math.cos(rad) * r] as const;
  };
  const [sx, sy] = pt(col.startDeg, r0);
  shape.moveTo(sx, sy);
  for (let i = 0; i <= steps; i++) {
    const b = col.startDeg + ((col.endDeg - col.startDeg) * i) / steps;
    shape.lineTo(...pt(b, r1));
  }
  for (let i = steps; i >= 0; i--) {
    const b = col.startDeg + ((col.endDeg - col.startDeg) * i) / steps;
    shape.lineTo(...pt(b, r0));
  }
  const geo = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export default function ThreeBoardScene({
  model,
  selected,
  onSelect,
  spread,
  orientation,
  reducedMotion,
}: ThreeBoardSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const spreadRef = useRef(spread);
  const selectedRef = useRef(selected);
  /* 場面は 1 度だけ組む。組むときに読む初期値は ref で渡し、中身と選択の
     差し替えは下の effect で行う */
  const modelRef = useRef(model);
  const motionRef = useRef(reducedMotion);
  const orientationRef = useRef(orientation);
  const apiRef = useRef<{
    rebuild: (m: ThreeBoardModel) => void;
    select: (d: CompassDirection | null) => void;
    orient: (o: BoardOrientation) => void;
  } | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    spreadRef.current = spread;
  }, [spread]);

  // 場面を 1 度だけ組む
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // 北を上なら南側（+z）から、南を上なら北側（−z）から見下ろす
    const side = () => (orientationRef.current === "south" ? -1 : 1);
    const stage = createStage(host, {
      fov: 32,
      camera: [0, 8.3, 10.7 * side()],
      target: [0, 0.2, 0],
      minDistance: 7,
      maxDistance: 20,
      maxPolarAngle: 1.3,
      autoRotate: !motionRef.current,
      sunOffset: [4.5, 9, 5.5],
      shadowExtent: 5,
    });
    const { scene, camera, controls, pool } = stage;

    const world = new Group();
    scene.add(world);

    let discGroups: Group[] = [];
    let faces: Mesh[] = [];
    let selectionLines: LineSegments[] = [];
    let pillars: Mesh[] = [];
    let current: ThreeBoardModel = modelRef.current;
    const texture = (canvas: HTMLCanvasElement) => pool.texture(canvas);
    const keep = <T extends BufferGeometry | Material>(x: T): T => pool.keep(x);

    const gapOf = () => (spreadRef.current ? 1.2 : 0.24);
    const baseY = -0.5;

    function rebuild(m: ThreeBoardModel) {
      current = m;
      world.clear();
      pool.clear();
      discGroups = [];
      faces = [];
      selectionLines = [];
      pillars = [];

      // 台座
      const base = new Group();
      const baseBody = new Mesh(
        keep(discBody(BASE_R)),
        keep(
          new MeshPhysicalMaterial({
            color: 0x3a2618,
            roughness: 0.62,
            metalness: 0.05,
            clearcoat: 0.25,
          }),
        ),
      );
      baseBody.receiveShadow = true;
      base.add(baseBody);
      const baseFace = new Mesh(
        keep(new CircleGeometry(BASE_R - BEVEL, 192)),
        keep(
          new MeshStandardMaterial({
            map: texture(paintBase(m.columns, side() < 0)),
            roughness: 0.6,
            metalness: 0,
            envMapIntensity: 0.35,
          }),
        ),
      );
      baseFace.rotation.x = -Math.PI / 2;
      baseFace.position.y = THICK / 2 + 0.002;
      baseFace.receiveShadow = true;
      base.add(baseFace);
      base.position.y = baseY;
      world.add(base);

      m.discs.forEach((disc, i) => {
        const r = RADII[i];
        const grp = new Group();
        const body = new Mesh(
          keep(discBody(r)),
          keep(
            new MeshPhysicalMaterial({
              color: new Color(BRASS[i]),
              metalness: 1,
              roughness: 0.3,
              clearcoat: 0.45,
              clearcoatRoughness: 0.2,
            }),
          ),
        );
        body.castShadow = true;
        body.receiveShadow = true;
        grp.add(body);
        const face = new Mesh(
          keep(new CircleGeometry(r - BEVEL - 0.02, 192)),
          keep(
            new MeshPhysicalMaterial({
              map: texture(paintDisc(disc, side() < 0)),
              roughness: 0.5,
              metalness: 0,
              clearcoat: 0.35,
              clearcoatRoughness: 0.25,
              /* 映り込みを弱める。強いと扇形の色が白く飛ぶ */
              envMapIntensity: 0.3,
            }),
          ),
        );
        face.rotation.x = -Math.PI / 2;
        face.position.y = THICK / 2 + 0.002;
        face.receiveShadow = true;
        face.userData.disc = i;
        grp.add(face);
        faces.push(face);
        grp.position.y = baseY + 0.3 + i * gapOf();
        grp.userData.index = i;
        world.add(grp);
        discGroups.push(grp);
      });

      // 三盤とも吉の方位は、3 枚を貫く光の柱
      for (const col of m.columns.filter((c) => c.aligned)) {
        /* 柱ごとに材を分ける。手前に回ってきた柱は薄くする（盤の上に
           重なって光が足され、盤が白く飛ぶため）。濃さは毎フレーム決める */
        const mat = keep(
          new MeshBasicMaterial({
            color: 0x6ee7b7,
            transparent: true,
            opacity: PILLAR_OPACITY,
            depthWrite: false,
            blending: AdditiveBlending,
            side: FrontSide,
          }),
        );
        const pillar = new Mesh(
          keep(wedgePrism(col, 0.55, RADII[2] * 0.97, 1)),
          mat,
        );
        const mid = (((col.startDeg + col.endDeg) / 2) * Math.PI) / 180;
        // 柱の向き（盤の上の x, z。北が −z）
        pillar.userData.dir = [Math.sin(mid), -Math.cos(mid)];
        pillar.position.y = baseY + 0.2;
        world.add(pillar);
        pillars.push(pillar);
      }
      select(selectedRef.current);
    }

    function select(d: CompassDirection | null) {
      selectedRef.current = d;
      for (const l of selectionLines) world.remove(l);
      selectionLines = [];
      if (!d) return;
      const col = current.columns.find((c) => c.direction === d);
      if (!col) return;
      const mat = keep(
        new LineBasicMaterial({
          color: 0xfff7d6,
          transparent: true,
          opacity: 0.95,
        }),
      );
      discGroups.forEach((grp, i) => {
        const edges = new LineSegments(
          keep(
            new EdgesGeometry(
              keep(wedgePrism(col, RADII[i] * 0.3, RADII[i] * 0.95, 0.02)),
            ),
          ),
          mat,
        );
        edges.position.y = THICK / 2 + 0.004;
        grp.add(edges);
        selectionLines.push(edges);
      });
    }

    /* 向きを変える。見下ろす角度と距離はそのままに、見る側だけを南北で
       入れ替え、字を描き直す。回っていたら止める（選んだ向きで止まる） */
    function orient(o: BoardOrientation) {
      if (orientationRef.current === o) return;
      orientationRef.current = o;
      const off = camera.position.clone().sub(controls.target);
      const flat = Math.hypot(off.x, off.z);
      camera.position.set(
        controls.target.x,
        controls.target.y + off.y,
        controls.target.z + flat * side(),
      );
      controls.autoRotate = false;
      controls.update();
      rebuild(current);
    }

    apiRef.current = { rebuild, select, orient };
    rebuild(modelRef.current);

    // 押した点の方位（判定と同じ境目で決める）
    stage.onPick(
      () => faces,
      (hit) => {
        const local = hit.object.worldToLocal(hit.point.clone());
        /* 上面は x 軸まわりに −90 度寝かせてあるので、円の (x, y) が
           盤の (x, −z)。directionOfPoint は盤の (x, z) を受ける */
        onSelectRef.current(
          directionOfPoint(local.x, -local.y, current.mapping),
        );
      },
    );

    stage.onFrame(({ vx, vz }) => {
      // 離す／重ねるを滑らかに
      for (const grp of discGroups) {
        const target = baseY + 0.3 + grp.userData.index * gapOf();
        grp.position.y +=
          (target - grp.position.y) * (motionRef.current ? 1 : 0.12);
      }
      // 光の柱は台座から一番上の盤の少し上まで
      const top = discGroups[discGroups.length - 1];
      if (top) {
        for (const p of pillars) {
          p.scale.y = top.position.y + THICK / 2 + 0.3 - p.position.y;
          const [dx, dz] = p.userData.dir as [number, number];
          const front = Math.max(0, dx * vx + dz * vz);
          (p.material as MeshBasicMaterial).opacity =
            PILLAR_OPACITY * (1 - 0.75 * front);
        }
        // 見る先は盤の束の中ほど。離すと束が上へ伸びるので一緒に上げる
        const mid = (baseY + top.position.y) / 2 - 0.35;
        controls.target.y +=
          (mid - controls.target.y) * (motionRef.current ? 1 : 0.12);
      }
    });

    return () => {
      stage.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    modelRef.current = model;
    apiRef.current?.rebuild(model);
  }, [model]);
  useEffect(() => {
    apiRef.current?.select(selected);
  }, [selected]);
  useEffect(() => {
    apiRef.current?.orient(orientation);
  }, [orientation]);

  return (
    <div
      ref={hostRef}
      className="h-[420px] w-full cursor-pointer md:h-[520px]"
      role="img"
      aria-label="年盤・月盤・日盤を重ねた立体の方位盤。扇形を押すとその方位の三盤の内訳を下に出します"
    />
  );
}
