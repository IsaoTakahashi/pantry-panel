import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PreconnectLinks } from "@/components/PreconnectLinks";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AuthProvider } from "@/contexts/AuthContext";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
