type GroupInfo = {
  groupId: string;
  name: string;
  role: "owner" | "member";
};

type GroupResponse = GroupInfo;

type GroupCreateResponse = {
  id: string;
  name: string;
  createdAt: string;
};

type InvitationResponse = {
  token: string;
  groupId: string;
  createdBy: string;
  expiresAt: string;
  useCount: number;
  createdAt: string;
};

export type {
  GroupCreateResponse,
  GroupInfo,
  GroupResponse,
  InvitationResponse,
};
