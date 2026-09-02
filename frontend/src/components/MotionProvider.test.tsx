import { render, screen, waitFor } from "@testing-library/react";
import { m } from "framer-motion";
import { describe, expect, it } from "vitest";
import { MotionProvider } from "./MotionProvider";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("MotionProvider", () => {
  it("子要素を描画する", () => {
    render(
      <MotionProvider>
        <span>child content</span>
      </MotionProvider>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("reduced-motion 要求時は transform tween をスキップし終了値を即適用する", async () => {
    setReducedMotion(true);
    render(
      <MotionProvider>
        <m.div
          data-testid="box"
          animate={{ x: 100 }}
          transition={{ duration: 10 }}
        />
      </MotionProvider>,
    );
    // reducedMotion="user" を MotionConfig が設定しているため、reduce 要求下では
    // framer-motion は transform tween をスキップし終了値 (translateX(100px)) を
    // 即適用する。MotionProvider で包まない場合 framer-motion の既定は
    // reducedMotion="never" となり、10s tween は waitFor の既定タイムアウト内に
    // 終了値へ到達しない。よってこのアサートは provider 由来の挙動の discriminator。
    await waitFor(() =>
      expect(screen.getByTestId("box").style.transform).toContain("100px"),
    );
  });
});
