'use client';
import { useEffect, useState } from 'react';

export default function SwUpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setShow(true);
          }
        });
      });
    });
  }, []);

  const reload = () => window.location.reload();

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] rounded-xl bg-black text-white px-4 py-3 shadow-lg flex items-center gap-3">
      <span>Hay una actualización disponible</span>
      <button onClick={reload} className="rounded-md bg-white/10 px-3 py-1 hover:bg-white/20">
        Actualizar
      </button>
    </div>
  );
}
