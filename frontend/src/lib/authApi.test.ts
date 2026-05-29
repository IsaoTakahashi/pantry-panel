import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroup,
  createInvitation,
  fetchMyGroups,
  updateGroupName,
} from "./authApi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchMyGroups", () => {
  it("成功時にグループ一覧を返す", async () => {
    const groups = [{ groupId: "g1", name: "我が家", role: "owner" }];
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(groups), { status: 200 }),
    );
    const result = await fetchMyGroups("token");
    expect(result).toEqual(groups);
  });

  it("404 のとき空配列を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    expect(await fetchMyGroups("token")).toEqual([]);
  });

  it("403 のとき空配列を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );
    expect(await fetchMyGroups("token")).toEqual([]);
  });
});

describe("createGroup", () => {
  it("POST を送信して作成されたグループを返す", async () => {
    const created = {
      id: "g1",
      name: "我が家",
      createdAt: "2024-01-01T00:00:00Z",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(created), { status: 201 }),
    );
    const result = await createGroup("我が家", "token");
    expect(result).toEqual(created);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/groups"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("updateGroupName", () => {
  it("X-Active-Group-ID ヘッダー付きで PATCH を送信する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await updateGroupName("g1", "新名前", "token", "g1");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain("/api/groups/g1");
    expect(call[1]?.method).toBe("PATCH");
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers["X-Active-Group-ID"]).toBe("g1");
  });

  it("エラーレスポンス時に throw する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );
    await expect(updateGroupName("g1", "名前", "token", "g1")).rejects.toThrow(
      "HTTP 403",
    );
  });
});

describe("createInvitation", () => {
  it("X-Active-Group-ID ヘッダーを送信する", async () => {
    const inv = {
      token: "t1",
      groupId: "g1",
      createdBy: "u1",
      expiresAt: "",
      useCount: 0,
      createdAt: "",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(inv), { status: 201 }),
    );
    await createInvitation("token", "g1");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers["X-Active-Group-ID"]).toBe("g1");
  });
});
