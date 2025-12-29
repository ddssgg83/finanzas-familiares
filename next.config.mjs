// next.config.mjs
import createNextPWA from "@ducanh2912/next-pwa";

const withPWA = createNextPWA({
  dest: "public",
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DISABLE_PWA === "1",

  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,

  workboxOptions: {
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,

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
      // ✅ Next static chunks (works in localhost + prod)
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

      // icons
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

      // public assets png/svg
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

      // Supabase SOLO GET
      {
        urlPattern:
          /^https:\/\/[^/]+\.supabase\.co\/(rest\/v1|storage\/v1)\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

export default withPWA({
  reactStrictMode: true,
});
