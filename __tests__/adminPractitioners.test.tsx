import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import AdminPractitionersPage from "@/app/admin/practitioners/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const row = {
  id: "a1",
  display_name: "相談室",
  email: "applicant@example.com",
  headline: "ご相談",
  area: "オンライン",
  specialties: ["引越し"],
  profile: "申請本文",
  website_url: null,
  status: "pending",
};
it("lists an application and moves it through approve and hide", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ success: true, data: [row] }))
    .mockImplementation(() =>
      Promise.resolve(Response.json({ success: true })),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<AdminPractitionersPage />);
  expect(await screen.findByText("applicant@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "承認する" }));
  await screen.findByText("公開中に変更しました。");
  expect(
    within(screen.getByRole("region", { name: "公開中" })).getByText("相談室"),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/practitioners",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ id: "a1", status: "approved" }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "非公開にする" }));
  await screen.findByText("非公開に変更しました。");
  expect(
    within(screen.getByRole("region", { name: "非公開" })).getByText("相談室"),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/practitioners",
    expect.objectContaining({
      body: JSON.stringify({ id: "a1", status: "hidden" }),
    }),
  );
});
it("shows access denial without applicant details", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: false, error: "Forbidden" }, { status: 403 }),
      ),
  );
  render(<AdminPractitionersPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  expect(screen.queryByText("applicant@example.com")).not.toBeInTheDocument();
});
it("keeps the current status when an update fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, data: [row] }))
      .mockResolvedValue(
        Response.json(
          { success: false, error: "更新できませんでした。" },
          { status: 500 },
        ),
      ),
  );
  render(<AdminPractitionersPage />);
  await screen.findByText("相談室");
  fireEvent.click(screen.getByRole("button", { name: "承認する" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "更新できませんでした。",
  );
  expect(
    within(screen.getByRole("region", { name: "承認待ち" })).getByText(
      "相談室",
    ),
  ).toBeInTheDocument();
});
