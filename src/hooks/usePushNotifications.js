import { useEffect } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(email) {
  useEffect(() => {
    if (!email || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const register = async () => {
      try {
        // 1. Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js');

        // 2. Ask for notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // 3. Fetch VAPID public key from backend
        const res        = await fetch(`${API_BASE}/api/webrtc/push/vapid-public-key`);
        const { publicKey } = await res.json();

        // 4. Subscribe to push
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // 5. Save subscription to backend linked to this email
        await fetch(`${API_BASE}/api/webrtc/push/subscribe`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, subscription: subscription.toJSON() }),
        });

        console.log('[Push] Subscribed for', email);
      } catch (e) {
        console.warn('[Push] Registration failed:', e.message);
      }
    };

    register();
  }, [email]);
}
