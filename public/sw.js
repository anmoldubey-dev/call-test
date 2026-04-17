// Service Worker — handles Web Push notifications for conference invites

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); } catch { return; }

  const { title, body, icon, data, actions } = payload;

  event.waitUntil(
    self.registration.showNotification(title || 'Conference Invite', {
      body:    body    || 'You have been invited to a call',
      icon:    icon    || '/favicon.ico',
      badge:   '/favicon.ico',
      data:    data    || {},
      actions: actions || [
        { action: 'accept',  title: 'Join Call' },
        { action: 'decline', title: 'Decline'   },
      ],
      requireInteraction: true,   // stays on screen until user acts
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'decline') return;

  // 'accept' or clicking the notification body — open the join page
  const url = event.notification.data?.url;
  if (!url) return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Focus existing tab if already open
      for (const win of wins) {
        if (win.url === url && 'focus' in win) return win.focus();
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
