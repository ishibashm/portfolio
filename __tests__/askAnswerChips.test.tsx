import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnswerChips } from "@/app/ask/AnswerChips";
import { readSettingsSync, SETTINGS_KEY } from "@/lib/userSettings";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const origin = { name: "愛知県名古屋市中村区", lat: 35.1709, lon: 136.8815 };
it("選んだ出発地だけを保存し、保存の選択を次回も使う", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  const onOrigin = vi.fn();
  const props = {
    fields: ["origin"] as const,
    disabled: false,
    savedOrigin: origin,
    birthDateKnown: true,
    onSend: vi.fn(),
    onOrigin,
  };
  const { rerender } = render(
    <AnswerChips {...props} fields={[...props.fields]} />,
  );
  expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /登録地/ }));
  expect(screen.getByText("この出発地を保存しますか？")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  await waitFor(() => expect(onOrigin).toHaveBeenCalledWith(origin));
  expect(readSettingsSync()).toMatchObject({
    base_lat: origin.lat,
    base_lon: origin.lon,
    ask_origin_save_choice: "save",
  });
  rerender(<AnswerChips {...props} key="next" fields={[...props.fields]} />);
  fireEvent.click(screen.getByRole("button", { name: /登録地/ }));
  await waitFor(() => expect(onOrigin).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("この出発地を保存しますか？")).toBeNull();
});
it("今回だけでは出発地を書き換えず、条件は複数選択できる", async () => {
  const onOrigin = vi.fn();
  const onSend = vi.fn();
  render(
    <AnswerChips
      fields={["origin", "conditions", "birthYear"]}
      disabled={false}
      savedOrigin={origin}
      birthDateKnown={true}
      onSend={onSend}
      onOrigin={onOrigin}
    />,
  );
  expect(screen.queryByText("生まれ年は？")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /登録地/ }));
  fireEvent.click(screen.getByRole("button", { name: "今回だけ" }));
  await waitFor(() => expect(onOrigin).toHaveBeenCalledWith(origin));
  expect(readSettingsSync()).toEqual({ ask_origin_save_choice: "once" });
  fireEvent.click(screen.getByRole("button", { name: "家賃重視" }));
  fireEvent.click(screen.getByRole("button", { name: "暮らしやすさ" }));
  fireEvent.click(screen.getByRole("button", { name: "この条件で送る" }));
  expect(onSend).toHaveBeenLastCalledWith("条件は家賃重視・暮らしやすさです。");
  fireEvent.click(screen.getByRole("button", { name: "特になし" }));
  fireEvent.click(screen.getByRole("button", { name: "この条件で送る" }));
  expect(onSend).toHaveBeenLastCalledWith("条件は特にありません。");
});
it("生まれ年と日付を利用者の返答として送り、処理中はボタンを無効にする", () => {
  const onSend = vi.fn();
  const { rerender } = render(
    <AnswerChips
      fields={["birthYear", "period"]}
      disabled={false}
      birthDateKnown={false}
      onSend={onSend}
      onOrigin={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
  fireEvent.click(screen.getByRole("button", { name: "1988年" }));
  expect(onSend).toHaveBeenLastCalledWith("生まれ年は1988年です。");
  fireEvent.click(screen.getByRole("button", { name: "日付を選ぶ" }));
  fireEvent.change(screen.getByLabelText("相談する日付"), {
    target: { value: "2026-12-01" },
  });
  expect(onSend).toHaveBeenLastCalledWith("時期は2026-12-01ごろです。");
  rerender(
    <AnswerChips
      fields={["period"]}
      disabled={true}
      birthDateKnown={false}
      onSend={onSend}
      onOrigin={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "1〜3か月後" })).toBeDisabled();
});
