// ======================== AppShell ========================
// AppShell -> Root layout wrapper for authenticated users. Renders persistent Sidebar
//             and <Outlet /> for nested route content.
// ||
// ||
// ||
// Functions/Methods -> AppShell() -> Main layout component
// ||                 |
// ||                 |---> handleLogout() -> Call auth logout -> Redirect to /login
// ||                 |
// ||                 |---> Logic Flow -> Component render:
// ||                                  |
// ||                                  |--- useAuth()    -> Destructure user + logout
// ||                                  |--- useNavigate() -> For post-logout redirect
// ||                                  |--- Render GlobalStyles
// ||                                  |--- Render Sidebar -> Pass user + onLogout
// ||                                  |--- Render <Outlet /> -> Inject active child route
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import Sidebar from './Sidebar.jsx'
import GlobalStyles from '../components/dashboard/GlobalStyles.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// [Direct Call] Backend base URL — derived from WS URL when VITE_API_URL is empty
const _WS_BASE  = import.meta.env.VITE_WS_URL  || 'wss://anteriorly-digestional-laquita.ngrok-free.dev';
const _API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
                  || _WS_BASE.replace(/^wss/, 'https').replace(/^ws/, 'http');

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
export default function AppShell() {

  // ---------------------------------------------------------------
  // SECTION: STATE & HOOKS
  // ---------------------------------------------------------------
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // [Direct Call] Incoming call state — set when an incoming_direct_call WS event arrives
  const [incomingCall, setIncomingCall]   = useState(null); // { room, token, url, agent_name, agent_identity }
  // [Direct Call] Active call session — set when user accepts the call; renders LiveKit overlay
  const [activeDirectCall, setActiveDirectCall] = useState(null);
  const wsRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: EVENT HANDLERS
  // ---------------------------------------------------------------

  // handleLogout -> Clear auth state + redirect to login
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ---------------------------------------------------------------
  // [Direct Call] SECTION: PRESENCE HEARTBEAT
  // Fires immediately when the user dashboard loads and every 30s after.
  // This marks the user as "online" so agents can see they are reachable.
  // ---------------------------------------------------------------
  useEffect(() => {
    const email = user?.email;
    if (!email) return;

    const beat = () => {
      fetch(`${_API_BASE}/api/cc/user/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {});
    };

    beat(); // [Direct Call] Register online immediately on dashboard open
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------
  // [Direct Call] SECTION: WEBSOCKET — receive incoming call events
  // Connects to the event hub WS and listens for incoming_direct_call
  // events targeted at this user's email.
  // ---------------------------------------------------------------
  useEffect(() => {
    const email = user?.email;
    if (!email) return;

    let reconnectTimer;

    const connect = () => {
      const ws = new WebSocket(`${_WS_BASE}/api/cc/ws/events`);
      wsRef.current = ws;

      ws.onopen = () => {
        // [Direct Call] Register email so backend routes events to this connection
        ws.send(JSON.stringify({ type: 'user_register', email }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // [Direct Call] Show incoming call popup when agent calls this user
          if (msg.type === 'incoming_direct_call') {
            setIncomingCall({
              room:           msg.room,
              token:          msg.token,
              url:            msg.url,
              agent_name:     msg.agent_name,
              agent_identity: msg.agent_identity,
            });
          }
          // [Direct Call] Dismiss popup if agent cancelled
          if (msg.type === 'direct_call_cancelled') {
            setIncomingCall(null);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        // [Direct Call] Reconnect after 5s to maintain presence
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // [Direct Call] Accept incoming call — start LiveKit session in an overlay
  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    setActiveDirectCall(incomingCall); // [Direct Call] Store session → triggers LiveKit overlay
    setIncomingCall(null);
  }, [incomingCall]); // eslint-disable-line react-hooks/exhaustive-deps

  // [Direct Call] Decline incoming call — notify the agent via backend
  const handleDeclineCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await fetch(`${_API_BASE}/api/cc/outbound/direct-decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_identity: incomingCall.agent_identity,
          caller_email:   user?.email || '',
        }),
      });
    } catch (_) {}
    setIncomingCall(null);
  }, [incomingCall, user?.email]);

  // ---------------------------------------------------------------
  // SECTION: RENDER
  // ---------------------------------------------------------------
  return (
    <>
      <GlobalStyles />
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* ── Sidebar -> Fixed left nav with user info + logout ── */}
        <Sidebar user={user} onLogout={handleLogout} />

        {/* ── Main -> Outlet renders active child route ── */}
        <main style={{ marginLeft: 250, flex: 1 }}>
          <Outlet />
        </main>

        {/* [Direct Call] Active call overlay — shown after user accepts, renders LiveKit audio */}
        {activeDirectCall && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LiveKitRoom
              serverUrl={activeDirectCall.url}
              token={activeDirectCall.token}
              connect={true}
              audio={true}
              video={false}
            >
              <RoomAudioRenderer />
              {/* [Direct Call] Minimal active call UI */}
              <div style={{
                background: '#0e1419', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '20px', padding: '36px 32px', width: '320px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
              }}>
                <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '2px solid rgba(34,197,94,0.4)', animation: 'dcPing 1.5s ease-out infinite' }} />
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                    📞
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#22c55e', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>Connected</p>
                  <p style={{ color: '#e8f0f8', fontSize: '16px', fontWeight: 600, margin: 0 }}>{activeDirectCall.agent_name || 'Agent'}</p>
                </div>
                <button
                  onClick={() => setActiveDirectCall(null)}
                  style={{ padding: '13px 32px', borderRadius: '50px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none', background: '#ef4444', color: '#fff', boxShadow: '0 4px 14px rgba(239,68,68,0.35)' }}
                >
                  📵 End Call
                </button>
              </div>
            </LiveKitRoom>
          </div>
        )}

        {/* [Direct Call] Incoming call popup — global overlay, visible on any user page */}
        {incomingCall && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: '#0e1419', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '20px', padding: '36px 32px 28px', width: '340px',
              boxShadow: '0 0 60px rgba(34,197,94,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px',
            }}>
              {/* Animated ring */}
              <div style={{ position: 'relative', width: '84px', height: '84px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', width: '84px', height: '84px', borderRadius: '50%', border: '2px solid rgba(34,197,94,0.4)', animation: 'dcPing 1.5s ease-out infinite' }} />
                <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>
                  📞
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#22c55e', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>Incoming Call</p>
                <p style={{ color: '#e8f0f8', fontSize: '17px', fontWeight: 600, margin: '0 0 4px' }}>{incomingCall.agent_name || 'Agent'}</p>
                <p style={{ color: '#5a7a9a', fontSize: '12px', margin: 0 }}>is calling you</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  onClick={handleDeclineCall}
                  style={{ flex: 1, padding: '13px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                >
                  ✕ Decline
                </button>
                <button
                  onClick={handleAcceptCall}
                  style={{ flex: 1, padding: '13px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
                >
                  ✓ Accept
                </button>
              </div>
            </div>
            <style>{`@keyframes dcPing { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(1.7);opacity:0} }`}</style>
          </div>
        )}

      </div>
    </>
  )
}