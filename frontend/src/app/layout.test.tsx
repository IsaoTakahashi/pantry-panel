import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreconnectLinks } from "@/components/PreconnectLinks";

// React 19 hoists <link> elements to document.head; query from there.
// RTL's cleanup() unmounts the component and React 19 removes hoisted links automatically.
function getHintLinks() {
  return document.head.querySelectorAll(
    'link[rel="preconnect"], link[rel="dns-prefetch"]',
  );
}

describe("PreconnectLinks", () => {
  describe("両方の環境変数が設定されている場合", () => {
    it("API と Supabase の preconnect / dns-prefetch が合計 4 つ出力される", () => {
      render(
        <PreconnectLinks
          apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws"
          supabaseUrl="https://example.supabase.co"
        />,
      );
      expect(getHintLinks()).toHaveLength(4);
    });

    it("API URL の preconnect リンクが存在する", () => {
      render(
        <PreconnectLinks
          apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws"
          supabaseUrl="https://example.supabase.co"
        />,
      );
      const preconnects = document.head.querySelectorAll(
        'link[rel="preconnect"]',
      );
      const hrefs = Array.from(preconnects).map((l) => l.getAttribute("href"));
      expect(hrefs).toContain(
        "https://api.example.lambda-url.ap-northeast-1.on.aws",
      );
    });

    it("Supabase URL の dns-prefetch リンクが存在する", () => {
      render(
        <PreconnectLinks
          apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws"
          supabaseUrl="https://example.supabase.co"
        />,
      );
      const dnsPrefetches = document.head.querySelectorAll(
        'link[rel="dns-prefetch"]',
      );
      const hrefs = Array.from(dnsPrefetches).map((l) =>
        l.getAttribute("href"),
      );
      expect(hrefs).toContain("https://example.supabase.co");
    });
  });

  describe("API URL のみ設定されている場合", () => {
    it("API の 2 タグのみ出力され Supabase のタグは含まれない", () => {
      render(
        <PreconnectLinks apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws" />,
      );
      const links = getHintLinks();
      expect(links).toHaveLength(2);
      const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
      expect(hrefs.every((h) => h?.includes("api.example"))).toBe(true);
    });
  });

  describe("環境変数が未設定の場合", () => {
    it("リソースヒントタグが出力されない", () => {
      render(<PreconnectLinks />);
      expect(getHintLinks()).toHaveLength(0);
    });
  });

  describe("crossOrigin 属性", () => {
    it("preconnect リンクに crossOrigin='anonymous' が付いている", () => {
      render(
        <PreconnectLinks
          apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws"
          supabaseUrl="https://example.supabase.co"
        />,
      );
      const preconnects = document.head.querySelectorAll(
        'link[rel="preconnect"]',
      );
      for (const link of preconnects) {
        expect(link.getAttribute("crossorigin")).toBe("anonymous");
      }
    });

    it("dns-prefetch リンクには crossOrigin が付かない", () => {
      render(
        <PreconnectLinks apiUrl="https://api.example.lambda-url.ap-northeast-1.on.aws" />,
      );
      const dnsPrefetches = document.head.querySelectorAll(
        'link[rel="dns-prefetch"]',
      );
      for (const link of dnsPrefetches) {
        expect(link.getAttribute("crossorigin")).toBeNull();
      }
    });
  });
});
