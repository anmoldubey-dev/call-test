import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import { Users, Loader2, PhoneCall, PhoneOff, Mic, MicOff } from 'lucide-react';

const API_BASE      = import.meta.env.VITE_API_URL || '';
const LIVEKIT_URL   = import.meta.env.VITE_LIVEKIT_URL || 'wss://voice-ai-nv6qlh0d.livekit.cloud';

// Monitors participant count and shows who's in the call
function RoomMonitor({ onEnded }) {
  const participants = useRemoteParticipants();
  const room         = useRoomContext();
  const seenRef      = useRef(false);

  useEffect(() => {
    if (participants.length > 0) seenRef.current = true;
    if (seenRef.current && participants.length === 0) {
      room.disconnect();
      onEnded();
    }
  }, [participants]);

  return (
    <div style={{ marginTop: 16, fontSize: 12, color: '#5a7a9a', textAlign: 'center' }}>
      {participants.length > 0
        ? `${participants.length} other${participants.length > 1 ? 's' : ''} in call`
        : 'Waiting for others to join…'}
    </div>
  );
}

export default function ConferenceJoin() {
  const { roomName }       = useParams();
  const [searchParams]     = useSearchParams();

  const tokenFromUrl       = searchParams.get('token');
  const livekitUrlFromUrl  = searchParams.get('url') || LIVEKIT_URL;

  const [name, setName]         = useState('');
  const [token, setToken]       = useState(tokenFromUrl || null);
  const [livekitUrl, setLivekitUrl] = useState(livekitUrlFromUrl);
  const [joined, setJoined]     = useState(false);
  const [ended, setEnded]       = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [muted, setMuted]       = useState(false);

  // If no token in URL, fetch one from backend using the name entered
  const fetchToken = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    setError('');
    setLoading(true);
    try {
      const identity = encodeURIComponent(`guest-${name.trim().replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`);
      const res = await fetch(
        `${API_BASE}/api/webrtc/livekit/token?room=${encodeURIComponent(roomName)}&identity=${identity}&name=${encodeURIComponent(name.trim())}`
      );
      if (!res.ok) throw new Error('Could not get call token');
      const data = await res.json();
      setToken(data.token);
      if (data.livekit_url) setLivekitUrl(data.livekit_url);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (ended) {
    return (
      <div style={page}>
        <div style={card}>
          <PhoneOff size={48} color="#5a7a9a" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
          <h2 style={{ color: '#fff', margin: '0 0 8px', textAlign: 'center' }}>Call Ended</h2>
          <p style={{ color: '#5a7a9a', textAlign: 'center', fontSize: 13 }}>The conference call has ended.</p>
        </div>
      </div>
    );
  }

  // Step 1: no token yet — show name entry form
  if (!token) {
    return (
      <div style={page}>
        <div style={card}>
          <div style={iconWrap}>
            <Users size={28} color="#6366f1" />
          </div>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>
            Join Conference Call
          </h2>
          <p style={{ color: '#5a7a9a', fontSize: 12, margin: '0 0 24px', textAlign: 'center' }}>
            Room: <span style={{ color: '#818cf8' }}>{roomName}</span>
          </p>

          <label style={label}>Your Name</label>
          <input
            type="text"
            placeholder="e.g. Rahul Sharma"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && fetchToken()}
            style={input}
            autoFocus
          />

          {error && <div style={errBox}>{error}</div>}

          <button onClick={fetchToken} disabled={loading} style={btn(loading)}>
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <PhoneCall size={16} />}
            {loading ? 'Connecting…' : 'Join Call'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Step 2: have token but haven't clicked Join yet
  if (!joined) {
    return (
      <div style={page}>
        <div style={card}>
          <div style={iconWrap}>
            <PhoneCall size={28} color="#22c55e" />
          </div>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>
            Ready to Join
          </h2>
          <p style={{ color: '#5a7a9a', fontSize: 12, margin: '0 0 24px', textAlign: 'center' }}>
            Room: <span style={{ color: '#818cf8' }}>{roomName}</span>
          </p>
          <button onClick={() => setJoined(true)} style={btn(false, '#22c55e')}>
            <PhoneCall size={16} /> Join Conference Call
          </button>
        </div>
      </div>
    );
  }

  // Step 3: joined — show live call UI
  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Conference Call</h2>
            <p style={{ color: '#5a7a9a', fontSize: 11, margin: '2px 0 0' }}>{roomName}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)', display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: '#22c55e' }}>Live</span>
          </div>
        </div>

        <LiveKitRoom
          video={false}
          audio={!muted}
          token={token}
          serverUrl={livekitUrl}
          connect={true}
          onDisconnected={() => setEnded(true)}
        >
          <RoomAudioRenderer />
          <RoomMonitor onEnded={() => setEnded(true)} />
        </LiveKitRoom>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={() => setMuted(m => !m)}
            style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: muted ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)', color: muted ? '#ef4444' : '#e2e8f0', border: muted ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.1)' }}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
            {muted ? 'Unmute' : 'Mute'}
          </button>

          <button
            onClick={() => setEnded(true)}
            style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <PhoneOff size={16} /> Leave Call
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const page = { display: 'flex', height: '100vh', background: '#080c10', alignItems: 'center', justifyContent: 'center' };
const card = { width: 380, background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: 20, padding: '32px 28px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' };
const iconWrap = { width: 60, height: 60, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' };
const label = { display: 'block', fontSize: 10, color: '#5a7a9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' };
const input = { width: '100%', background: '#080c10', border: '1px solid #1e2d3d', borderRadius: 10, padding: '11px 14px', color: '#e2e8f0', fontSize: 13, marginBottom: 16, outline: 'none', boxSizing: 'border-box' };
const errBox = { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 };
const btn = (disabled, color = '#6366f1') => ({
  width: '100%', padding: '13px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: disabled ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${color}, ${color}cc)`,
  color: disabled ? '#5a7a9a' : '#fff',
});
