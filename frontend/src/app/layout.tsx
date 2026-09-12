import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { MotionProvider } from "@/components/MotionProvider";
import { PreconnectLinks } from "@/components/PreconnectLinks";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AuthProvider } from "@/contexts/AuthContext";
import { getServerAuthBootstrap } from "@/lib/serverAuthBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pantry Panel",
  description: "家庭の食品・日用品の在庫管理",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
};

// Cache Components (next.config.ts の `cacheComponents: true`) 下では、
// `cookies()`/`headers()` の読み取りは `<Suspense>` 境界の内側にあるか、
// セグメントが `instant = false` で明示的に opt out していなければ
// prerendering 時にビルドが失敗する。
// `RootLayout` は `getServerAuthBootstrap()`（`headers()`/`cookies()` を読む）を
// 直接 await しているため、後者を選ぶ。
// なぜ [stream]（Suspense + `use()`）ではなく [block] なのか:
// 本ブランチの設計目標（design.md D2/D3）は「JS実行前の初期HTMLに商品データが
// 含まれること」であり、`e2e/ssr-stock-items.spec.ts` が
// `javaScriptEnabled: false` でそれを検証している。streaming パターンは
// 認証済みコンテンツを fallback の裏に回し、クライアント側のインライン
// スクリプトで差し替えるため、JS無効下では永久に差し替わらず設計目標を
// 満たせない。`instant = false` はデータ解決までレスポンスをブロックし、
// 初回レスポンスで完全な実データHTMLを返す。
// 注意: ルートレイアウトへの `false` はアプリ全体の static shell 検証を
// 無効化する（instant.md）。これは design.md の Task 10 追記が記録した
// 「`RootLayout` が全ルートを完全動的にする」trade-off と同じ範囲であり、
// 新たに広がるものではない。
export const instant = false;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { initialAuthenticated, initialGroupId } =
    await getServerAuthBootstrap();

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <PreconnectLinks
          apiUrl={process.env.NEXT_PUBLIC_API_BASE_URL}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <ChunkLoadRecovery />
        <MotionProvider>
          <AuthProvider
            initialAuthenticated={initialAuthenticated}
            initialGroupId={initialGroupId}
          >
            {children}
          </AuthProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
