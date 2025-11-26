import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finanzas Familiares",
    short_name: "Finanzas",
    description:
      "App para controlar los ingresos y gastos familiares, con soporte offline.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0ea5e9",
    theme_color: "#0ea5e9",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
