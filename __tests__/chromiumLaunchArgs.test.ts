import { expect, it } from "vitest";
import { chromiumLaunchArgs } from "@/lib/chromiumLaunchArgs";

it("単一プロセスを除き、no-zygote とその他の引数を保持する", () => {
  expect(
    chromiumLaunchArgs([
      "--single-process",
      "--no-zygote",
      "--in-process-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--single-process",
    ]),
  ).toEqual([
    "--no-zygote",
    "--in-process-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ]);
});

it("空の引数に共有メモリと GPU の無効化を追加する", () => {
  expect(chromiumLaunchArgs([])).toEqual([
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ]);
});

it("追加する引数を重複させず、繰り返し適用しても結果が変わらない", () => {
  const args = [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ];
  const result = chromiumLaunchArgs(args);
  expect(result).toEqual(["--disable-gpu", "--disable-dev-shm-usage"]);
  expect(chromiumLaunchArgs(result)).toEqual(result);
});

it("入力配列を変更せず、新しい配列を返す", () => {
  const args = ["--single-process", "--no-zygote"];
  Object.freeze(args);
  const result = chromiumLaunchArgs(args);
  expect(args).toEqual(["--single-process", "--no-zygote"]);
  expect(result).not.toBe(args);
});
