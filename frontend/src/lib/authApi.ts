import type {
  GroupCreateResponse,
  GroupInfo,
  InvitationResponse,
} from "@/types/group";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function authHeaders(accessToken: string, activeGroupId?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (activeGroupId) headers["X-Active-Group-ID"] = activeGroupId;
  return headers;
}

async function fetchMyGroups(accessToken: string): Promise<GroupInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/groups/me`, {
    headers: authHeaders(accessToken),
  });
  if (response.status === 403 || response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createGroup(
  name: string,
  accessToken: string,
): Promise<GroupCreateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/groups`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateGroupName(
  groupId: string,
  name: string,
  accessToken: string,
  activeGroupId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken, activeGroupId),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function createInvitation(
  accessToken: string,
  activeGroupId: string,
): Promise<InvitationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/invitations`, {
    method: "POST",
    headers: authHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function acceptInvitation(
  inviteToken: string,
  accessToken: string,
): Promise<GroupInfo[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/invitations/${inviteToken}/accept`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export {
  acceptInvitation,
  createGroup,
  createInvitation,
  fetchMyGroups,
  updateGroupName,
};
