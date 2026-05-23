import type { Page } from "@playwright/test";

type ImageSearchItem = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
};

export async function mockExtractFromUrl(
  page: Page,
  options: { status: number; body: Record<string, unknown> },
): Promise<void> {
  await page.route("**/api/extract-from-url", (route) =>
    route.fulfill({
      status: options.status,
      contentType: "application/json",
      body: JSON.stringify(options.body),
    }),
  );
}

export async function mockImageSearch(
  page: Page,
  options: { status?: number; items: ImageSearchItem[] },
): Promise<void> {
  await page.route("**/api/image-search**", (route) =>
    route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify({ items: options.items }),
    }),
  );
}

export const STUB_IMAGES: ImageSearchItem[] = [
  {
    imageUrl: "https://picsum.photos/seed/e2e1/400/400",
    thumbnailUrl: "https://picsum.photos/seed/e2e1/80/80",
    title: "Mock Image 1",
  },
  {
    imageUrl: "https://picsum.photos/seed/e2e2/400/400",
    thumbnailUrl: "https://picsum.photos/seed/e2e2/80/80",
    title: "Mock Image 2",
  },
];
