import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/services/api", () => ({
  DEMO: false,
  request: vi.fn(),
  ApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
import { request } from "../src/services/api";
import { pages } from "../src/services/workspace";
const mock = vi.mocked(request);
beforeEach(() => mock.mockReset());
it("rejects an excessive total before requesting more pages", async () => {
  mock.mockResolvedValue({ total: 1_000_000, items: [] });
  await expect(pages("/items", "items")).rejects.toThrow("safe loading limit");
  expect(mock).toHaveBeenCalledTimes(1);
});
it("never presents a partially loaded workspace as complete", async () => {
  mock.mockResolvedValue({ total: 2, items: [{ id: "one" }] });
  await expect(pages("/items", "items")).rejects.toThrow("complete view");
});
it("loads ordinary paginated workspaces and preserves all records", async () => {
  mock
    .mockResolvedValueOnce({
      total: 101,
      items: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })),
    })
    .mockResolvedValueOnce({ total: 101, items: [{ id: "100" }] });
  expect(await pages("/items", "items")).toHaveLength(101);
  expect(mock).toHaveBeenCalledTimes(2);
});
