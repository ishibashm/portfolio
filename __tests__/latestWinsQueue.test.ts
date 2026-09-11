import { describe, expect, it } from "vitest";
import { createLatestWinsQueue } from "@/lib/latestWinsQueue";

/** 外から resolve / reject できる約束。走査の途中を再現する。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** マイクロタスクを流す。.then の連鎖が進むのを待つ */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("latestWinsQueue（走査は 1 本ずつ・待つのは最新の 1 つだけ）", () => {
  it("空いていれば、すぐ走らせる", async () => {
    const q = createLatestWinsQueue();
    const d = deferred();
    let started = 0;
    q.request(() => {
      started++;
      return d.promise;
    });
    await flush();
    expect(started).toBe(1);
    expect(q.busy).toBe(true);
    d.resolve();
    await flush();
    expect(q.busy).toBe(false);
  });

  it("走っている間の要求は、終わってから走る（同時には走らない）", async () => {
    const q = createLatestWinsQueue();
    const first = deferred();
    const order: string[] = [];
    q.request(() => {
      order.push("first");
      return first.promise;
    });
    await flush();
    q.request(async () => {
      order.push("second");
    });
    await flush();
    /* 1 本目が終わるまで 2 本目は走らない。これが本番で 2 本重なって
       25〜40 秒になっていた形の逆 */
    expect(order).toEqual(["first"]);
    expect(q.hasPending).toBe(true);
    first.resolve();
    await flush();
    expect(order).toEqual(["first", "second"]);
    expect(q.hasPending).toBe(false);
    expect(q.busy).toBe(false);
  });

  it("走っている間に 3 つ来たら、最新の 1 つだけ走る", async () => {
    const q = createLatestWinsQueue();
    const first = deferred();
    const order: string[] = [];
    q.request(() => {
      order.push("first");
      return first.promise;
    });
    await flush();
    q.request(async () => {
      order.push("a");
    });
    q.request(async () => {
      order.push("b");
    });
    q.request(async () => {
      order.push("c");
    });
    first.resolve();
    await flush();
    expect(order).toEqual(["first", "c"]);
  });

  it("走らせた関数が失敗しても列は空く（次が走る）", async () => {
    const q = createLatestWinsQueue();
    const first = deferred();
    const order: string[] = [];
    q.request(() => {
      order.push("first");
      return first.promise;
    });
    await flush();
    q.request(async () => {
      order.push("second");
    });
    first.reject(new Error("boom"));
    await flush();
    expect(order).toEqual(["first", "second"]);
    expect(q.busy).toBe(false);
  });

  it("取っておいた要求は、走らせる時点の関数を呼ぶ（最新の条件で走る）", async () => {
    /* 呼ぶ側は request(() => ref.current(...)) の形で渡す。取っておいた
       関数が走るのは 1 本目の後なので、その時点の ref.current が呼ばれる */
    const q = createLatestWinsQueue();
    const first = deferred();
    const ref = { current: async () => "old" };
    let seen = "";
    q.request(() => first.promise);
    await flush();
    q.request(async () => {
      seen = await ref.current();
    });
    ref.current = async () => "new";
    first.resolve();
    await flush();
    expect(seen).toBe("new");
  });
});
