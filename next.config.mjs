// next.config.mjs
import createNextPWA from '@ducanh2912/next-pwa';

const withPWA = createNextPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  disable: process.env.NODE_ENV === 'development', // en dev no registra SW
  workboxOptions: {
    runtimeCaching: [
      // Estáticos: cache-first
      {
        urlPattern: ({ request }) =>
          ['style', 'script', 'image', 'font'].includes(request.destination),
        handler: 'CacheFirst',
        options: { cacheName: 'static-v1' },
      },
      // Supabase/REST: network-first (datos frescos)
      {
        urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
        handler: 'NetworkFirst',
        options: { cacheName: 'api-v1' },
      },
    ],
  },
});

export default withPWA({
  images: { unoptimized: true },
  experimental: {
    // (opcional) pequeñas optimizaciones
    optimizePackageImports: ['react'],
  },
});
