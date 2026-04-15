import React, { useState, useEffect, useRef } from 'react';
import { Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ======================== Outbound Call Notification Orchestrator ========================
// OutboundCallNotification -> Real-time signaling node that subscribes to the project's 
// event hub to facilitate outbound callback requests and agent-to-user reconciliation.
// ||
// ||
// ||
// Functions -> OutboundCallNotification()-> Primary orchestrator for outbound signals:
// ||           |
// ||           |--- connect()-> [Sub-process]: Establishes persistent WebSocket tunnel.
// ||           |    └── onmessage handler: Logic Branch -> Dispatches callback/accept/cancel events.
// ||           |
// ||           |--- Timer Effect -> [Sub-process]: Executes 500ms polling for notification pruning.
// ||           |
// ||           |--- handleAccept()-> [Action Trigger]: Internal Call -> Commits agent to the call room.
// ||           |
// ||           |--- submitDecline()-> [Action Trigger]: Internal Call -> Dispatches snooze/reason signal.
// ||           |
// ||           └── (Lifecycle Helpers):
// ||                ├── stopRing()-> Resets local audio stream.
// ||                └── removeNotification()-> UI Cleanup logic.
// ||
// =========================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || '';
const WS_BASE = import.meta.env.VITE_WS_URL || API_BASE.replace(/^http/, 'ws');

export default function OutboundCallNotification({ onAccept, isOnCall = false }) {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------
  const { user } = useAuth();
  const agentEmail = user?.email || user?.id || '';
  const agentDept  = (() => { try { return JSON.parse(sessionStorage.getItem('user') || '{}').department || ''; } catch { return ''; } })();

  const [notifications, setNotifications] = useState([]);
  const [snooze, setSnooze] = useState(null); // { endsAt, minutes }
  const wsRef = useRef(null);
  const audioRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: SIGNALING & LIFECYCLE (WEBSOCKET)
  // ---------------------------------------------------------------

  // Initialization -> connect()-> Subscribes to the central event stream for outbound requests
  useEffect(() => {
    if (!agentEmail) return;

    let isMounted = true;
    let reconnectTimer = null;

    const connect = () => {
      // Sub-process -> connect()-> Manages the signaling bridge and duplicate socket prevention
      if (!isMounted) return;
      if (wsRef.current && wsRef.current.readyState < 2) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      wsRef.current = new WebSocket(`${WS_BASE}/api/cc/ws/events`);

      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          // Logic Branch -> outbound_callback: Show if same department (or no dept filter)
          if (msg.type === 'outbound_callback' && (!agentDept || !msg.department || msg.department === agentDept)) {
            setNotifications(prev => {
              if (prev.some(n => n.outbound_id === msg.outbound_id)) return prev;
              if (audioRef.current) audioRef.current.play().catch(() => { });
              return [...prev, {
                outbound_id: msg.outbound_id,
                user_email: msg.user_email,
                department: msg.department,
                expiresAt: Date.now() + (msg.countdown || 20) * 1000,
                declining: false,
                declineReason: '',
                accepting: false,
              }];
            });

          }
          // Logic Branch -> outbound_accepted: Silently removes request handled by another node
          else if (msg.type === 'outbound_accepted') {
            setNotifications(prev => prev.filter(n => n.outbound_id !== msg.outbound_id));

          }
          // Logic Branch -> outbound_cancelled: Cleans up UI after server-side expiration
          else if (msg.type === 'outbound_cancelled') {
            setNotifications(prev =>
              prev.filter(n => n.user_email !== msg.user_email)
            );
          }
        } catch { /* malformed signaling frame */ }
      };

      wsRef.current.onclose = () => {
        if (isMounted) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [agentEmail]);

  // ---------------------------------------------------------------
  // SECTION: TEMPORAL MANAGEMENT (COUNTDOWN)
  // ---------------------------------------------------------------

  // Sub-process -> Timer Loop: Prune expired tokens; auto-accept if not declined
  useEffect(() => {
    if (notifications.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => {
        const expired = prev.filter(n => n.expiresAt <= now && !n.declining && !n.accepting);
        expired.forEach(n => handleAccept(n.outbound_id));
        const next = prev.filter(n => n.expiresAt > now);
        if (next.length < prev.length && audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [notifications.length]);

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE UTILITIES
  // ---------------------------------------------------------------

  // Internal Call -> stopRing()-> Terminates the local notification audio stream
  const stopRing = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  // Internal Call -> removeNotification()-> Purges a specific session ID from the local view
  const removeNotification = (outbound_id) => {
    setNotifications(prev => {
      const next = prev.filter(n => n.outbound_id !== outbound_id);
      if (next.length === 0) stopRing();
      return next;
    });
  };

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS (RPC LAYER)
  // ---------------------------------------------------------------

  // Action Trigger -> handleAccept()-> Commits the agent to the outbound media room
  const handleAccept = async (outbound_id) => {
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, accepting: true } : n)
    );
    try {
      const res = await fetch(`${API_BASE}/api/cc/outbound/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outbound_id, agent_identity: agentEmail }),
      });
      const data = await res.json();

      if (data.already_handled) {
        removeNotification(outbound_id);
        return;
      }

      if (data.token && data.room) {
        removeNotification(outbound_id);
        stopRing();
        onAccept && onAccept({
          token: data.token,
          room: data.room,
          url: data.url,
          outbound_id: data.outbound_id,
        });
      }
    } catch (e) {
      console.error('[OutboundCallNotification] Accept failed:', e);
      setNotifications(prev =>
        prev.map(n => n.outbound_id === outbound_id ? { ...n, accepting: false } : n)
      );
    }
  };

  // Action Trigger -> startDecline()-> Transitions the UI to the reason-entry state
  const startDecline = (outbound_id) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declining: true } : n)
    );

  const cancelDecline = (outbound_id) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declining: false, declineReason: '' } : n)
    );

  const setReason = (outbound_id, value) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declineReason: value } : n)
    );

  const setSnoozeMin = (outbound_id, value) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, snoozeMinutes: value } : n)
    );

  // Action Trigger -> submitDecline()-> Commits a snooze request with metadata to the backend
  const submitDecline = async (outbound_id, reason, snoozeMinutes) => {
    try {
      await fetch(`${API_BASE}/api/cc/outbound/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outbound_id,
          agent_identity: agentEmail,
          reason: reason || 'Snoozed',
          snooze_minutes: snoozeMinutes || 5,
        }),
      });
    } catch (e) {
      console.error('[OutboundCallNotification] Decline failed:', e);
    }
    removeNotification(outbound_id);
    setSnooze({ endsAt: Date.now() + (snoozeMinutes || 5) * 60_000, minutes: snoozeMinutes || 5 });
  };

  const handleResume = async () => {
    setSnooze(null);
    try {
      await fetch(`${API_BASE}/api/cc/outbound/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_identity: agentEmail }),
      });
    } catch (e) {
      console.error('[OutboundCallNotification] Resume failed:', e);
    }
  };

  // Clear snooze when timer expires
  React.useEffect(() => {
    if (!snooze) return;
    const remaining = snooze.endsAt - Date.now();
    if (remaining <= 0) { setSnooze(null); return; }
    const t = setTimeout(() => setSnooze(null), remaining);
    return () => clearTimeout(t);
  }, [snooze]);

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if ((notifications.length === 0 && !snooze) || isOnCall) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 30, right: 30, zIndex: 9998,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <audio ref={audioRef} src="/ringtone.mp3" loop />

      {snooze && (
        <div style={{
          background: '#0f172a', border: '1px solid #334155',
          padding: 16, borderRadius: 14, color: 'white', width: 340,
        }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>
            Outbound snoozed for {snooze.minutes}min — resumes in{' '}
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>
              {Math.max(0, Math.ceil((snooze.endsAt - Date.now()) / 60_000))}m
            </span>
          </div>
          <button
            onClick={handleResume}
            style={{
              width: '100%', padding: '9px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Resume Now
          </button>
        </div>
      )}

      {notifications.map(n => {
        const secs = Math.max(0, Math.ceil((n.expiresAt - Date.now()) / 1000));
        return (
          <div key={n.outbound_id} style={{
            background: '#0f172a',
            border: '1px solid #f59e0b',
            padding: 20, borderRadius: 14, color: 'white', width: 340,
            boxShadow: '0 0 28px rgba(245,158,11,0.25)',
          }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                background: '#f59e0b', padding: 10, borderRadius: '50%',
                display: 'flex', flexShrink: 0, animation: 'outboundPulse 1.5s infinite',
              }}>
                <Phone size={18} color="white" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Callback Request</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.user_email}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {n.department}
                </div>
              </div>
              <div style={{
                fontSize: 13, color: secs <= 5 ? '#ef4444' : '#f59e0b',
                fontWeight: 700,
                background: secs <= 5 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                padding: '4px 8px', borderRadius: 6, flexShrink: 0,
              }}>
                {secs}s
              </div>
            </div>

            {!n.declining ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => startDecline(n.outbound_id)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                    color: '#ef4444', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Decline
                </button>
                <button
                  onClick={() => handleAccept(n.outbound_id)}
                  disabled={n.accepting}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                    cursor: n.accepting ? 'not-allowed' : 'pointer',
                    background: n.accepting
                      ? '#374151'
                      : 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: 'white', fontSize: 13, fontWeight: 700,
                  }}
                >
                  {n.accepting ? 'Connecting…' : 'Call Back'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Snooze for:</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[2, 5, 10].map(m => (
                    <button
                      key={m}
                      onClick={() => setSnoozeMin(n.outbound_id, m)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        background: (n.snoozeMinutes || 5) === m ? '#f59e0b' : 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.35)',
                        color: (n.snoozeMinutes || 5) === m ? '#0f172a' : '#f59e0b',
                      }}
                    >{m}m</button>
                  ))}
                </div>
                <textarea
                  value={n.declineReason}
                  onChange={e => setReason(n.outbound_id, e.target.value)}
                  placeholder="Reason (optional)…"
                  rows={2}
                  style={{
                    width: '100%', background: '#1e293b',
                    border: '1px solid #334155', borderRadius: 8,
                    padding: '8px 10px', color: '#e2e8f0', fontSize: 13,
                    resize: 'none', boxSizing: 'border-box',
                    marginBottom: 8, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => cancelDecline(n.outbound_id)}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(100,116,139,0.1)', border: '1px solid #334155',
                      color: '#94a3b8', fontSize: 13,
                    }}
                  >Back</button>
                  <button
                    onClick={() => submitDecline(n.outbound_id, n.declineReason, n.snoozeMinutes || 5)}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                      background: '#ef4444', border: '1px solid rgba(239,68,68,0.35)',
                      color: 'white', fontSize: 13, fontWeight: 700,
                    }}
                  >Snooze {n.snoozeMinutes || 5}m</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes outboundPulse {
          0%   { box-shadow: 0 0 0 0   rgba(245,158,11,0.7); }
          70%  { box-shadow: 0 0 0 14px rgba(245,158,11,0);   }
          100% { box-shadow: 0 0 0 0   rgba(245,158,11,0);   }
        }
      `}</style>
    </div>
  );
}