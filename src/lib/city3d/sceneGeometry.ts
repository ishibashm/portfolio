import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  ExtrudeGeometry,
  Shape,
  Path,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  Line,
  LineSegments,
  Plane,
  ShapeGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  Sprite,
  SpriteMaterial,
  DoubleSide,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Stage } from "@/lib/threeStage";
import type { Point } from "./geo";
import type { CityData } from "./features";
import { MOUNTAINS, polar, wedgePoints } from "./model";
import type { ViewProps } from "@/components/city3d/CityPlan";
export function shape(rings: Point[][]): Shape {
  const s = new Shape(rings[0].map((p) => new Vector2(p.x, -p.z)));
  s.holes = rings
    .slice(1)
    .map((r) => new Path(r.map((p) => new Vector2(p.x, -p.z))));
  return s;
}
export function buildingsGeometry(data: CityData): BufferGeometry | null {
  const geometries = data.buildings.map((b) => {
    const g = new ExtrudeGeometry(shape(b.rings), {
      depth: b.height,
      bevelEnabled: false,
    });
    g.rotateX(-Math.PI / 2);
    return g;
  });
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  return merged;
}
export function addGroundContext(stage: Stage, data: CityData, radius: number) {
  const clippingPlanes = Array.from({ length: 32 }, (_, i) => {
    const a = (i * Math.PI) / 16;
    return new Plane(new Vector3(-Math.cos(a), 0, -Math.sin(a)), radius);
  });
  stage.renderer.localClippingEnabled = true;
  // 道路一本ごとの描画要求を避け、種別ごとに線分をまとめる。
  for (const [lines, color] of [
    [data.roads, "#d6d3d1"],
    [data.rails, "#78716c"],
  ] as const) {
    const vertices: number[] = [];
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        vertices.push(
          line[i - 1].x,
          0.1,
          line[i - 1].z,
          line[i].x,
          0.1,
          line[i].z,
        );
      }
    const g = stage.pool.keep(new BufferGeometry());
    g.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    stage.scene.add(
      new LineSegments(
        g,
        stage.pool.keep(new LineBasicMaterial({ color, clippingPlanes })),
      ),
    );
  }
  const parts = data.water
    .filter((r) => r.length >= 3)
    .map((r) => new ShapeGeometry(shape([r])).toNonIndexed());
  if (parts.length) {
    const geometry = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    if (geometry) {
      geometry.rotateX(-Math.PI / 2);
      stage.scene.add(
        new Mesh(
          stage.pool.keep(geometry),
          stage.pool.keep(
            new MeshBasicMaterial({ color: "#b7d9e6", clippingPlanes }),
          ),
        ),
      );
    }
  }
}
export function addLine(
  stage: Stage,
  points: Point[],
  color: string,
  y = 0.5,
  dashed = false,
) {
  const geometry = stage.pool.keep(
    new BufferGeometry().setFromPoints(
      points.map((p) => new Vector3(p.x, y, p.z)),
    ),
  );
  const material = stage.pool.keep(
    dashed
      ? new LineDashedMaterial({
          color,
          dashSize: 5,
          gapSize: 5,
          transparent: true,
          opacity: 0.4,
        })
      : new LineBasicMaterial({ color }),
  );
  const line = new Line(geometry, material);
  line.computeLineDistances();
  stage.scene.add(line);
}
export function label(stage: Stage, text: string, p: Point, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, text.length * 34 + 24);
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#fafaf9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#292524";
  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, 44);
  const sprite = new Sprite(
    stage.pool.keep(
      new SpriteMaterial({
        map: stage.pool.texture(canvas),
        depthTest: false,
        toneMapped: false,
      }),
    ),
  );
  sprite.position.set(p.x, 8, p.z);
  sprite.scale.set(size, (size * canvas.height) / canvas.width, 1);
  stage.scene.add(sprite);
}
export function addOverlay(
  stage: Stage,
  { radius: r, wedges, compass }: ViewProps,
) {
  for (const w of wedges) {
    const ps = wedgePoints(w.start, w.end, r);
    if (w.color) {
      const vertices: number[] = [];
      for (let i = 1; i < ps.length - 1; i++)
        vertices.push(
          0,
          0.3,
          0,
          ps[i].x,
          0.3,
          ps[i].z,
          ps[i + 1].x,
          0.3,
          ps[i + 1].z,
        );
      const g = stage.pool.keep(new BufferGeometry());
      const attr = new Float32Array(vertices);
      // 三角形は表裏のどちらからも見える。建物の陰でも方位線を読み取れる。
      g.setAttribute("position", new Float32BufferAttribute(attr, 3));
      stage.scene.add(
        new Mesh(
          g,
          stage.pool.keep(
            new MeshBasicMaterial({
              color: w.color,
              opacity: 0.23,
              transparent: true,
              depthWrite: false,
              side: DoubleSide,
            }),
          ),
        ),
      );
    }
    addLine(
      stage,
      [polar(w.start, r), { x: 0, z: 0 }, polar(w.end, r)],
      "#78716c",
    );
    label(
      stage,
      `${w.label}：${w.status}`,
      polar((w.start + w.end) / 2, r * 1.27),
      r * 0.45,
    );
  }
  for (let i = 0; i < 24; i++) {
    const a = i * 15 - 7.5;
    addLine(stage, [polar(a, r), polar(a, r * 1.13)], "#a8a29e");
    label(stage, MOUNTAINS[i], polar(i * 15, r * 1.065), r * 0.07);
  }
  for (const size of [r, r * 1.13])
    addLine(
      stage,
      Array.from({ length: 121 }, (_, i) => polar(i * 3, size)),
      "#a8a29e",
    );
  if (compass.declinationKnown) {
    for (const s of compass.sectors)
      addLine(
        stage,
        [{ x: 0, z: 0 }, polar(s.magStartDeg, r)],
        "#64748b",
        0.6,
        true,
      );
    addLine(
      stage,
      [{ x: 0, z: 0 }, polar(compass.needleDeg, r * 0.5)],
      "#b45309",
      1,
    );
    label(stage, "磁北", polar(compass.needleDeg, r * 0.55), r * 0.16);
  }
  addLine(stage, [{ x: 0, z: 0 }, polar(0, r * 0.7)], "#334155", 1);
  addLine(
    stage,
    [
      { x: -6, z: -r * 0.65 },
      { x: 0, z: -r * 0.7 },
      { x: 6, z: -r * 0.65 },
    ],
    "#334155",
    1,
  );
  label(stage, "真北", polar(0, r * 0.76), r * 0.16);
}
