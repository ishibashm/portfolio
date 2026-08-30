import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFatalWatchError,
  useWatchedPosition,
  watchErrorMessage,
  type GeolocationLike,
} from "@/lib/useWatchedPosition";

/**
 * 現在地の購読。ここで固定したいのは 4 つ。
 *
 * 1. **既定では購読しない。**開いた瞬間に位置情報の許可を聞かない
 * 2. 移動したら位置が**更新される**（Google マップのような追従の土台）
 * 3. **拒否されたら二度と聞き直さない。**ボタンを押すたびにダイアログが
 *    出るのは迷惑なので、denied で打ち切る
 * 4. 圏外やタイムアウトは**打ち切らない。**トンネルを抜ければ戻るので、
 *    直前の位置を残したまま購読を続ける
 */

type SuccessCb = (p: GeolocationPosition) => void;
type ErrorCb = (e: GeolocationPositionError) => void;

function fakeGeolocation() {
  const state = {
    success: null as SuccessCb | null,
    error: null as ErrorCb | null,
    watchCalls: 0,
    clearCalls: 0,
  };
  const api: GeolocationLike = {
    watchPosition(onSuccess, onError) {
      state.watchCalls++;
      state.success = onSuccess;
      state.error = onError;
      return 1;
    },
    clearWatch() {
      state.clearCalls++;
    },
  };
  return { api, state };
}

function position(
  lat: number,
  lon: number,
  extra: Partial<GeolocationCoordinates> = {},
): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      ...extra,
    },
    timestamp: 1_800_000_000_000,
  } as GeolocationPosition;
}

function failure(code: number): GeolocationPositionError {
  return {
    code,
    message: "",
    PERMISSION_DENIED: 1,
  } as GeolocationPositionError;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWatchedPosition", () => {
  it("enabled が false のあいだは購読しない（勝手に許可を聞かない）", () => {
    const { api, state } = fakeGeolocation();
    const { result } = renderHook(() => useWatchedPosition(false, api));
    expect(state.watchCalls).toBe(0);
    expect(result.current.status).toBe("idle");
    expect(result.current.position).toBeNull();
  });

  it("移動したら位置が更新される", () => {
    const { api, state } = fakeGeolocation();
    const { result } = renderHook(() => useWatchedPosition(true, api));
    expect(state.watchCalls).toBe(1);
    expect(result.current.status).toBe("locating");

    act(() => state.success!(position(35.0, 135.0)));
    expect(result.current.status).toBe("watching");
    expect(result.current.position).toMatchObject({ lat: 35.0, lon: 135.0 });

    act(() => state.success!(position(35.001, 135.002)));
    expect(result.current.position).toMatchObject({
      lat: 35.001,
      lon: 135.002,
    });
  });

  it("向きは数のときだけ持つ（止まっていると NaN で来る）", () => {
    const { api, state } = fakeGeolocation();
    const { result } = renderHook(() => useWatchedPosition(true, api));

    act(() => state.success!(position(35, 135, { heading: NaN })));
    expect(result.current.position!.headingDeg).toBeNull();

    act(() => state.success!(position(35, 135, { heading: 90 })));
    expect(result.current.position!.headingDeg).toBe(90);
  });

  it("拒否されたら購読を切り、enabled を立て直しても聞き直さない", () => {
    const { api, state } = fakeGeolocation();
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useWatchedPosition(on, api),
      { initialProps: { on: true } },
    );

    act(() => state.error!(failure(1)));
    expect(result.current.status).toBe("denied");
    expect(state.clearCalls).toBeGreaterThan(0);

    const before = state.watchCalls;
    rerender({ on: false });
    rerender({ on: true });
    expect(state.watchCalls).toBe(before);
  });

  it("圏外やタイムアウトでは打ち切らず、直前の位置を残す", () => {
    const { api, state } = fakeGeolocation();
    const { result } = renderHook(() => useWatchedPosition(true, api));

    act(() => state.success!(position(35, 135)));
    act(() => state.error!(failure(3)));

    expect(result.current.status).toBe("watching");
    expect(result.current.position).toMatchObject({ lat: 35 });
    expect(result.current.message).toContain("時間がかかっています");
  });

  it("片付けで購読を止める", () => {
    const { api, state } = fakeGeolocation();
    const { unmount } = renderHook(() => useWatchedPosition(true, api));
    unmount();
    expect(state.clearCalls).toBe(1);
  });
});

describe("watchErrorMessage / isFatalWatchError", () => {
  it("拒否だけが打ち切りの理由", () => {
    expect(isFatalWatchError(1)).toBe(true);
    expect(isFatalWatchError(2)).toBe(false);
    expect(isFatalWatchError(3)).toBe(false);
  });

  it("種類ごとに違う案内を返す", () => {
    expect(watchErrorMessage(1)).toContain("許可");
    expect(watchErrorMessage(2)).toContain("測定できません");
    expect(watchErrorMessage(3)).toContain("時間がかかっています");
    expect(watchErrorMessage(99)).toContain("取得できませんでした");
  });
});
