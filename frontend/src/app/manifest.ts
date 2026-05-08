import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pantry Panel",
    short_name: "Pantry Panel",
    description: "家庭の食品・日用品の在庫管理",
    start_url: "/stock-items",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#00d1b2",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
