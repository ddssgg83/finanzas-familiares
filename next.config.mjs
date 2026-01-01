// next.config.mjs
import createNextPWA from "@ducanh2912/next-pwa";

const withPWA = createNextPWA({
  dest: "public",

  // ✅ Dev OFF (no estorba)
  // ✅ Prod ON salvo que tú lo apagues con env var
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DISABLE_PWA === "1",

  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,

  // ✅ útil para salir del offline “atorado”
  reloadOnOnline: true,

  workboxOptions: {
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,

    // ✅ fallback de navegación cuando no hay red
    navigateFallback: "/offline",

    navigateFallbackDenylist: [
      /^\/api\//,
      /^\/_next\//,
      /^\/manifest\.webmanifest(\?.*)?$/,
      /^\/sw\.js$/,
      /^\/workbox-.*\.js$/,
      /^\/favicon\.ico$/,
      /^\/icons\//,
    ],

    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,

    runtimeCaching: [
      // Next static chunks
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/_next/static/"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/_next/image"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "next-image",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },

      // ✅ manifest (para instalación estable)
      {
        urlPattern: ({ url }) =>
          url.origin === self.location.origin &&
          url.pathname === "/manifest.webmanifest",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "manifest",
          expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },

      // icons folder
      {
        urlPattern: ({ url }) =>
          url.origin === self.location.origin &&
          url.pathname.startsWith("/icons/"),
        handler: "CacheFirst",
        options: {
          cacheName: "app-icons",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },

      // public png/svg (incluye apple-touch-icon.png)
      {
        urlPattern: ({ url }) =>
          url.origin === self.location.origin &&
          (url.pathname.endsWith(".png") || url.pathname.endsWith(".svg")),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "public-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },

      // ✅ Supabase: NO cache (evita datos privados en SW cache)
      {
        urlPattern:
          /^https:\/\/[^/]+\.supabase\.co\/(rest\/v1|storage\/v1)\/.*/i,
        handler: "NetworkOnly",
        options: { cacheName: "supabase-bypass" },
      },
    ],
  },
});

export default withPWA({
  reactStrictMode: true,
});
