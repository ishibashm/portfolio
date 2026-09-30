import { describe, expect, it } from "vitest";
import { BufferGeometry, MeshBasicMaterial } from "three";
import { DisposablePool, rotateAboutY } from "@/lib/threeStage";

/**
 * 立体の部品が共通に持つ舞台（lib/threeStage）。
 *
 * 光は見る側について回す。固定すると、映り込みの部屋が非対称なために
 * ある側から見たときだけ面が白く曇る（三盤の方位盤の「南を上」で起きた）。
 */

describe("光を見る側について回す", () => {
  const offset: [number, number, number] = [4.5, 9, 5.5];

  it("南（+z）から見ているときは、ずれそのもの", () => {
    const [x, y, z] = rotateAboutY(offset, 0);
    expect(x).toBeCloseTo(4.5, 12);
    expect(y).toBe(9);
    expect(z).toBeCloseTo(5.5, 12);
  });

  it("北（−z）から見ると、前後左右が入れ替わる", () => {
    const [x, y, z] = rotateAboutY(offset, Math.PI);
    expect(x).toBeCloseTo(-4.5, 12);
    expect(y).toBe(9);
    expect(z).toBeCloseTo(-5.5, 12);
  });

  it("どこから見ても、見る側と光の水平の角度は同じ", () => {
    const angle = (az: number) => {
      const [x, , z] = rotateAboutY(offset, az);
      // 見る側の向き (sin az, cos az) と光の向きのなす角
      const cam = [Math.sin(az), Math.cos(az)];
      const len = Math.hypot(x, z);
      return Math.acos((x * cam[0] + z * cam[1]) / len);
    };
    const base = angle(0);
    for (let az = -Math.PI; az <= Math.PI; az += Math.PI / 12) {
      expect(angle(az)).toBeCloseTo(base, 10);
    }
  });
});

describe("作ったものの片付け", () => {
  it("clear で積んだものを全部捨て、空に戻る", () => {
    const pool = new DisposablePool();
    const geo = pool.keep(new BufferGeometry());
    const mat = pool.keep(new MeshBasicMaterial());
    let disposed = 0;
    geo.addEventListener("dispose", () => disposed++);
    mat.addEventListener("dispose", () => disposed++);
    pool.clear();
    expect(disposed).toBe(2);
    pool.clear();
    expect(disposed).toBe(2);
  });
});
