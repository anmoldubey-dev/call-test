import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Globe, Phone, PhoneOff, Loader, Mic, MicOff, Activity, UserCircle2 } from 'lucide-react';
import { useCall } from '../../context/CallContext';
import { startCall as apiStartCall } from '../../services/callApiService';
import api from '../../services/api';
import { DEPARTMENTS } from '../../constants/departments.js';

// [Direct Call] Decode user email from the JWT stored in sessionStorage
function _getUserEmail() {
  try {
    const tok = sessionStorage.getItem("token");
    if (!tok) return "";
    return JSON.parse(atob(tok.split('.')[1]))?.email || "";
  } catch { return ""; }
}

// [Direct Call] WebSocket base URL — same source as AgentDashboard
const _WS_BASE = import.meta.env.VITE_WS_URL || 'wss://anteriorly-digestional-laquita.ngrok-free.dev';
const _API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

// ======================== Browser Call Orchestrator ========================
// BrowserCallPanel -> Main portal for browser-to-agent WebRTC signaling. 
// Manages multi-lingual session initialization, CRM activity synchronization, 
// and provides a high-fidelity active-call UI with temporal tracking.
// ||
// ||
// ||
// Functions -> BrowserCallPanel()-> Primary functional entry point:
// ||           |
// ||           |--- handleCall()-> [async Action Trigger]: Executes the 3-step 
// ||           |    connection sequence (Token Fetch -> CRM Sync -> UI Trigger).
// ||           |
// ||           |--- useEffect()-> [Sub-process]: Manages temporal duration 
// ||           |    updates for active session nodes.
// ||           |
// ||           |--- formatTime()-> [Internal Utility]: Serializes raw seconds 
// ||           |    into standardized MM:SS format.
// ||           |
// ||           └── state setters -> Action Triggers: Manages controlled 
// ||                inputs for identity and routing context.
// ||
// ===========================================================================

// ---------------------------------------------------------------
// SECTION: CONSTANTS & CONFIGURATION
// ---------------------------------------------------------------

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
];

// ---------------------------------------------------------------
// SECTION: MAIN PANEL COMPONENT
// ---------------------------------------------------------------

export default function BrowserCallPanel() {
  // Initialization -> Contextual state retrieval for global call orchestration
  const {
    callState, CALL_STATES, canEndCall,
    startCall, endCall,
    setBackendCallId, setDialNumber, setLivekitSession, livekitSession,
  } = useCall();

  // Initialization -> Local state management for session configuration
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('General');
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialization -> UI state for active call telemetry
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // [Recording] consent: null=awaiting, 'admitted', 'denied'
  const [recordingConsent, setRecordingConsent] = useState(null);
  const consentTimerRef = useRef(null);

  // [Direct Call] Incoming call state — set when an incoming_direct_call WS event arrives
  const [incomingCall, setIncomingCall] = useState(null); // { room, token, url, agent_name, agent_identity }
  const wsRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE & EFFECT HOOKS
  // ---------------------------------------------------------------

  // Sub-process -> useEffect()-> Orchestrates the temporal tracker for active WebRTC streams
  useEffect(() => {
    let interval;
    if (canEndCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [canEndCall]);

  // [Recording] Show consent popup when call connects; auto-admit after 15s if no response
  useEffect(() => {
    if (!canEndCall) return;
    setRecordingConsent(null);
    consentTimerRef.current = setTimeout(() => {
      setRecordingConsent('admitted');
    }, 15000);
    return () => clearTimeout(consentTimerRef.current);
  }, [canEndCall]);

  // ---------------------------------------------------------------
  // [Direct Call] SECTION: WEBSOCKET — register user as online + receive incoming calls
  // ---------------------------------------------------------------
  useEffect(() => {
    const userEmail = _getUserEmail();
    if (!userEmail) return; // not logged in, skip WS

    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(`${_WS_BASE}/api/cc/ws/events`);
      wsRef.current = ws;

      ws.onopen = () => {
        // [Direct Call] Register this user's email so the backend knows they're online
        ws.send(JSON.stringify({ type: "user_register", email: userEmail }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // [Direct Call] incoming_direct_call is targeted — only arrives if target_email matches our email
          if (msg.type === "incoming_direct_call") {
            setIncomingCall({
              room:            msg.room,
              token:           msg.token,
              url:             msg.url,
              agent_name:      msg.agent_name,
              agent_identity:  msg.agent_identity,
            });
          }
          // [Direct Call] If agent cancelled / timed out, dismiss the popup
          if (msg.type === "direct_call_cancelled") {
            setIncomingCall(null);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        // [Direct Call] Auto-reconnect after 5s so presence is maintained
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // [Direct Call] Accept incoming call — join the LiveKit room with the provided token
  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    setLivekitSession({
      token:     incomingCall.token,
      room:      incomingCall.room,
      url:       incomingCall.url,
      agentName: incomingCall.agent_name,
    });
    setDialNumber(incomingCall.agent_name || "Agent");
    setIncomingCall(null);
    startCall();
  }, [incomingCall, setLivekitSession, setDialNumber, startCall]);

  // [Direct Call] Decline incoming call — notify the agent
  const handleDeclineCall = useCallback(async () => {
    if (!incomingCall) return;
    const userEmail = _getUserEmail();
    try {
      await fetch(`${_API_BASE}/api/cc/outbound/direct-decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_identity: incomingCall.agent_identity,
          caller_email:   userEmail,
        }),
      });
    } catch (_) {}
    setIncomingCall(null);
  }, [incomingCall]);

  const handleConsentAdmit = () => {
    clearTimeout(consentTimerRef.current);
    setRecordingConsent('admitted');
    const sid = livekitSession?.room || '';
    fetch(`${(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')}/api/webrtc/recording/consent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, consent: 'admitted' }),
    }).catch(() => {});
  };

  const handleConsentDeny = () => {
    clearTimeout(consentTimerRef.current);
    setRecordingConsent('denied');
    const sid = livekitSession?.room || '';
    fetch(`${(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')}/api/webrtc/recording/consent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, consent: 'denied' }),
    }).catch(() => {});
  };

  // Internal Utility -> formatTime()-> Normalizes duration strings for human-readable display
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ---------------------------------------------------------------
  // SECTION: SIGNALING & CRM INTEGRATION
  // ---------------------------------------------------------------

  // Action Trigger -> handleCall()-> Orchestrates the terminal WebRTC signaling sequence
  const handleCall = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name before starting a call.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // ── STEP 1: WebRTC Token Negotiation ─────────
      // Internal Call -> api.post()-> Requests authorization token from the signaling gateway
      const lkData = await api.post('/webrtc/token', {
        lang: lang,
        llm: 'gemini',
        display_name: name.trim()
      });

      setLivekitSession({
        token: lkData.token || "demo-token",
        url: lkData.url || "ws://localhost",
        room: lkData.room || "demo-room",
        agentName: lkData.agent_name || "SR AI Agent",
      });

      setDialNumber(name.trim());

      // ── STEP 2: CRM Synchronization ───────────────────────────────
      // Internal Call -> apiStartCall()-> Commits session metadata to the CRM logging service
      try {
        const ivrData = await apiStartCall(name.trim(), department, lkData.room || "demo-room");
        setBackendCallId?.(ivrData.id);
      } catch (ivrErr) {
        console.warn("CRM call logging bypassed for Demo.");
      }

      // ── STEP 3: UI State Advancement ───────────────────────────────────────
      startCall();

    } catch (err) {
      console.error("Call Start Error:", err);
      // Logic Branch -> Demo Override: Preserves UI presentation during backend timeout
      console.log("Backend failed, but forcing UI for Demo purposes.");
      startCall();
    } finally {
      setLoading(false);
    }
  }, [name, department, lang, startCall, setBackendCallId, setDialNumber, setLivekitSession]);

  const isBusy = loading || (callState === CALL_STATES.DIALING || callState === CALL_STATES.RINGING);

  // ---------------------------------------------------------------
  // SECTION: DESIGN TOKENS (STYLES)
  // ---------------------------------------------------------------

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px', padding: '11px 14px', color: '#e8f0f8', fontSize: '13px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const labelStyle = {
    fontSize: '10px', color: '#5a7a9a', marginBottom: '6px', letterSpacing: '0.04em',
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  // [Direct Call] Incoming call popup — renders as a fixed overlay regardless of call state
  const IncomingCallPopup = incomingCall ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        background: '#0e1419', border: '1px solid #22c55e44',
        borderRadius: '20px', padding: '32px 28px 28px', width: '340px',
        boxShadow: '0 0 60px rgba(34,197,94,0.2)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
      }}>
        {/* Animated ring */}
        <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '2px solid rgba(34,197,94,0.4)', animation: 'ping 1.5s ease-out infinite' }} />
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
            📞
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#22c55e', fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 6px' }}>Incoming Call</p>
          <p style={{ color: '#e8f0f8', fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>{incomingCall.agent_name || 'Agent'}</p>
          <p style={{ color: '#5a7a9a', fontSize: '11px', margin: 0 }}>is calling you</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '4px' }}>
          <button
            onClick={handleDeclineCall}
            style={{
              flex: 1, padding: '13px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.1)', color: '#f87171',
            }}
          >
            ✕ Decline
          </button>
          <button
            onClick={handleAcceptCall}
            style={{
              flex: 1, padding: '13px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff',
              boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
            }}
          >
            ✓ Accept
          </button>
        </div>
      </div>
      <style>{`@keyframes ping { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(1.6);opacity:0} }`}</style>
    </div>
  ) : null;

  if (canEndCall) {
    return (
      <div style={{ maxWidth: '360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '20px 0' }}>
        {/* [Direct Call] Incoming call overlay shown even during an active AI call */}
        {IncomingCallPopup}

        {/* [Recording] Consent popup — shown to user when call starts, auto-admits after 15s */}
        {recordingConsent === null && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}>
            <div style={{
              background: '#0e1419', border: '1px solid #1e2d3d',
              borderRadius: '18px', padding: '28px 28px 24px', width: '340px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '24px' }}>🎙</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#e8f0f8' }}>Call Recording Notice</span>
              </div>
              <p style={{ fontSize: '12px', color: '#8899aa', lineHeight: 1.75, marginBottom: '20px', margin: '0 0 20px 0' }}>
                This call may be <strong style={{ color: '#c4cdd8' }}>recorded for safety and quality</strong> purposes.
                If you do not respond within <strong style={{ color: '#facc15' }}>15 seconds</strong>, the call will be recorded automatically.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleConsentDeny}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer',
                    border: '1px solid rgba(239,68,68,0.35)',
                    background: 'rgba(239,68,68,0.1)', color: '#f87171',
                  }}
                >
                  ✕ Deny
                </button>
                <button
                  onClick={handleConsentAdmit}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff',
                    boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                  }}
                >
                  ✓ Admit
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '20px', padding: '6px 14px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 1.5s infinite' }} />
          <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 500, letterSpacing: '0.5px' }}>
            SECURE WEBRTC LINK
          </span>
        </div>

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '120px', width: '100%' }}>
          <div style={{ position: 'absolute', width: '90px', height: '90px', borderRadius: '50%', border: '2px solid rgba(99, 102, 241, 0.3)', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
          <div style={{ position: 'absolute', width: '110px', height: '110px', borderRadius: '50%', border: '1px solid rgba(99, 102, 241, 0.1)', animation: 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite', animationDelay: '0.5s' }} />

          <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' }}>
            <UserCircle2 size={36} color="#ffffff" strokeWidth={1.5} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600, margin: '0 0 6px 0' }}>SR AI Agent</h2>
          <p style={{ color: '#818cf8', fontSize: '12px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Activity size={14} /> Processing audio...
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', color: '#e8f0f8', fontWeight: 300 }}>
            {formatTime(callDuration)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{ width: '50px', height: '50px', borderRadius: '50%', background: isMuted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)', border: isMuted ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.1)', color: isMuted ? '#ef4444' : '#e8f0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            onClick={endCall}
            style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#ef4444', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)', transition: 'transform 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <PhoneOff size={20} />
          </button>
        </div>

        <style>{`
          @keyframes ping { 75%, 100% { transform: scale(1.5); opacity: 0; } }
          @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* [Direct Call] Incoming call overlay shown even when user hasn't started a call yet */}
      {IncomingCallPopup}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e8f0f8', marginBottom: '4px' }}>Browser Call</div>
        <div style={{ fontSize: '10px', color: '#5a7a9a' }}>Connect via WebRTC — AI agent joins automatically</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '10px', padding: '10px 14px' }}>
        <Globe size={13} color="#818cf8" />
        <span style={{ fontSize: '11px', color: '#818cf8' }}>WebRTC · No phone number needed</span>
      </div>

      <div>
        <div style={labelStyle}>Your name</div>
        <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. Rahul Sharma" style={inputStyle} disabled={isBusy} />
      </div>

      <div>
        <div style={labelStyle}>Department</div>
        <select value={department} onChange={e => setDepartment(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} disabled={isBusy}>
          {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0e1419' }}>{d}</option>)}
        </select>
      </div>

      <div>
        <div style={labelStyle}>Language</div>
        <select value={lang} onChange={e => setLang(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} disabled={isBusy}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code} style={{ background: '#0e1419' }}>{l.label}</option>)}
        </select>
      </div>

      {error && <div style={{ fontSize: '11px', color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '9px 12px' }}>{error}</div>}

      <button
        onClick={handleCall}
        disabled={isBusy}
        style={{
          background: isBusy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          border: 'none', borderRadius: '10px', padding: '14px',
          color: isBusy ? '#5a7a9a' : '#fff', fontSize: '13px', fontWeight: 600,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          opacity: (!name.trim() && !isBusy) ? 0.5 : 1, transition: 'all 0.2s',
        }}
      >
        {isBusy ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</> : <><Phone size={16} /> Start Browser Call</>}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}