'use client';
import { useEffect, useState } from 'react';
import { Workbox } from 'workbox-window';

export default function PWAUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || 'serviceWorker' in navigator === false) return;

    if (process.env.NODE_ENV === 'development') return; // no SW en dev

    // Vercel + next-pwa registran automáticamente el SW en /sw.js
    const wb = new Workbox('/sw.js');

    wb.addEventListener('waiting', () => {
      wb.messageSkipWaiting();
    });

    wb.addEventListener('controlling', () => {
      window.location.reload();
    });

    wb.register().then((reg) => {
      if (reg && reg.waiting) setWaiting(reg.waiting);
    });

  }, []);

  if (!waiting) return null;
  // No mostramos UI extra: forzamos reload automático arriba
  return null;
}
