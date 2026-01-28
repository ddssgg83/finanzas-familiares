// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RINDAY",
    short_name: "RINDAY",
    description: "Finanzas familiares para tener claridad, control y tranquilidad.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#5B5FFF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
