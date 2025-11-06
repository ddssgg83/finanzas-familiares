// next.config.mjs
import createNextPWA from '@ducanh2912/next-pwa';

/**
 * ⚙️ PWA config:
 * - Genera el service worker en /public
 * - Se desactiva en desarrollo (solo corre en build/start o Vercel)
 * - runtimeCaching para estáticos, imágenes y Supabase GETs
 */
const withPWA = createNextPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    // Tiempo máximo de SW: 24h
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
    runtimeCaching: [
      // 1) Archivos estáticos de Next (_next/)
      {
        urlPattern: /^https:\/\/.+\/_next\/static\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'next-static', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } }
      },
      // 2) Imágenes optimizadas de Next
      {
        urlPattern: /^https:\/\/.+\/_next\/image\?url=.*/i,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'next-image', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } }
      },
      // 3) Íconos y assets del public/
      {
        urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/icons/'),
        handler: 'CacheFirst',
        options: { cacheName: 'app-icons', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 } }
      },
      {
        urlPattern: ({ url }) => url.origin === self.location.origin && (url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')),
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'public-assets', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } }
      },
      // 4) Supabase REST/Storage (solo GET se cachea)
      {
        urlPattern: /^https:\/\/[^/]+\.supabase\.co\/(rest\/v1|storage\/v1)\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api',
          networkTimeoutSeconds: 3, // si tarda, cae al caché
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
          cacheableResponse: { statuses: [0, 200] }
        }
      },
    ],
  },
});

export default withPWA({
  // Tu config normal de Next
  reactStrictMode: true,
  experimental: {
    // opcional
  }
});
