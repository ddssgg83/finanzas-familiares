"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateStatus = () => {
      if (typeof navigator !== "undefined") {
        setIsOnline(navigator.onLine);
      }
    };

    updateStatus(); // estado inicial

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="w-full bg-yellow-100 text-yellow-900 text-center text-sm py-2 border-b border-yellow-300">
      Estás sin conexión. Los movimientos nuevos se guardarán en este dispositivo
      y se enviarán cuando vuelvas a tener internet.
    </div>
  );
}
