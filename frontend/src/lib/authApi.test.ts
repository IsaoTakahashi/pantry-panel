import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  createGroup,
  createInvitation,
  fetchMyGroup,
} from "./authApi";

afterEach(() => {
  vi.restoreAllMocks();
});

const token = "test-access-token";

describe("fetchMyGroup", () => {
  it("200 のとき GroupInfo を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ groupId: "g1", name: "我が家", role: "owner" }),
        { status: 200 },
      ),
    );
    const result = await fetchMyGroup(token);
    expect(result).toEqual({ groupId: "g1", name: "我が家", role: "owner" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/groups/me"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
  });

  it("403 のとき null を返す（グループ未所属）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );
    const result = await fetchMyGroup(token);
    expect(result).toBeNull();
  });

  it("401 のとき throw する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    await expect(fetchMyGroup(token)).rejects.toThrow("HTTP 401");
  });
});

describe("createGroup", () => {
  it("201 のとき Group を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "g1", name: "我が家", createdAt: "2026-01-01" }),
        { status: 201 },
      ),
    );
    const result = await createGroup("我が家", token);
    expect(result.name).toBe("我が家");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/groups"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("409 のとき throw する（既にグループ所属）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 409 }),
    );
    await expect(createGroup("家", token)).rejects.toThrow("HTTP 409");
  });
});

describe("createInvitation", () => {
  it("201 のとき InvitationResponse を返す", async () => {
    const inv = {
      token: "tok-1",
      groupId: "g1",
      createdBy: "u1",
      expiresAt: "2026-05-24T00:00:00Z",
      useCount: 0,
      createdAt: "2026-05-17T00:00:00Z",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(inv), { status: 201 }),
    );
    const result = await createInvitation(token);
    expect(result.token).toBe("tok-1");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("acceptInvitation", () => {
  it("200 のとき GroupInfo を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ groupId: "g1", name: "我が家", role: "member" }),
        { status: 200 },
      ),
    );
    const result = await acceptInvitation("inv-token", token);
    expect(result.role).toBe("member");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations/inv-token/accept"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("404 のとき throw する（招待が見つからない）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    await expect(acceptInvitation("bad-token", token)).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("410 のとき throw する（招待期限切れ）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 410 }),
    );
    await expect(acceptInvitation("expired-token", token)).rejects.toThrow(
      "HTTP 410",
    );
  });
});
