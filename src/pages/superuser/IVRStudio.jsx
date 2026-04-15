// IVRStudio — Superuser broadcast & email campaign hub
// Wraps BroadcastPanel which talks to /api/webrtc/broadcast/* and /api/email/*

import BroadcastPanel from '../../components/IVR/BroadcastPanel.jsx';

export default function IVRStudio() {
  return <BroadcastPanel />;
}
