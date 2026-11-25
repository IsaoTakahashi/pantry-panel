// アクティブグループIDをブラウザ cookie にも保存する（D1）。サーバー側
// （layout.tsx, stock-items/page.tsx）が localStorage を読めないため、
// SSR で正しい初期グループを選ぶには cookie が必要。グループIDは秘密情報
// ではない（認可は引き続きAPI側がアクセストークン+groupIdで検証する）ため
// httpOnly にはしない — クライアントJSが書き込む必要がある。
export const ACTIVE_GROUP_COOKIE_NAME = "pantry-panel-active-group";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function setActiveGroupCookie(groupId: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: getActiveGroupCookie must read synchronously, which the async Cookie Store API cannot do
  document.cookie = `${ACTIVE_GROUP_COOKIE_NAME}=${encodeURIComponent(groupId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

export function getActiveGroupCookie(): string | undefined {
  const prefix = `${ACTIVE_GROUP_COOKIE_NAME}=`;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(prefix.length));
}

export function clearActiveGroupCookie(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: kept on document.cookie to match setActiveGroupCookie
  document.cookie = `${ACTIVE_GROUP_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
