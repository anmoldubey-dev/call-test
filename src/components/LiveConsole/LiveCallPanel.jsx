import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

import ParticipantTile from './ParticipantTile.jsx';
import { useCall } from '../../context/CallContext.js';
import { useCallTimer } from '../../hooks/useCallTimer.js';
import api from '../../services/api.js';

// ======================== Live Call Panel Orchestrator ========================
// LiveCallPanel -> High-fidelity call interface managing real-time WebRTC streams, 
// automated speech recognition (ASR), and complex session state transitions 
// including departmental transfers and multi-party conference bridging.
// ||
// ||
// ||
// Functions -> LiveCallPanel()-> Root container for active session management:
// ||           |
// ||           |--- MEDIA SIGNALING (LiveKit):
// ||           |    ├── useEffect()-> [async Internal Call]: Room signaling & media track orchestration.
// ||           |    └── refreshParticipants()-> Logic Branch: Synchronizes remote participant registry.
// ||           |
// ||           |--- SPEECH PROCESSING (ASR):
// ||           |    └── useEffect()-> [Sub-process]: Manages Web Speech Recognition lifecycle & interim results.
// ||           |
// ||           |--- SESSION CONTROLS:
// ||           |    ├── handleEndCall()-> [Action Trigger]: Executes graceful signaling & media termination.
// ||           |    ├── handleTransfer()-> [Action Trigger]: Internal Call -> Dispatches departmental handoff.
// ||           |    └── handleInvite()-> [Action Trigger]: Initiates external agent conference bridging.
// ||           |
// ||           └── UI HELPERS:
// ||                ├── addLog()-> Sub-process: Maintains sequential temporal event registry.
// ||                └── Sync Effects: Manages stable references for async callback safety.
// ||
// ==============================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

// Normalise: strip trailing /api (if present) then always append /api ourselves.
const API_BASE = ((import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')) + '/api';

const DEPARTMENTS = ['General', 'Sales', 'Support', 'Billing', 'Technical'];

async function _saveTranscript(sessionId, speaker, text) {
  if (!sessionId || !text?.trim()) return;
  try {
    await fetch(`${API_BASE}/webrtc/transcript/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, speaker, text }),
    });
  } catch (_) { /* non-fatal */ }
}

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT DEFINITION
// ---------------------------------------------------------------

// [Sentiment] Badge style map for per-line sentiment indicators
const SENTIMENT_BADGE = {
  HAPPY:   { bg: '#22c55e22', color: '#22c55e', icon: '😊' },
  ANGRY:   { bg: '#f8717122', color: '#f87171', icon: '😠' },
  NEUTRAL: { bg: '#94a3b822', color: '#94a3b8', icon: '😐' },
};

// [Sentiment] Accepts lastSentiment prop — { display: "HAPPY"|"ANGRY"|"NEUTRAL" } — from LiveCallConsole
export default function LiveCallPanel({ onNewCallerText, lastSentiment }) {
  // Initialization -> Contextual state retrieval for call orchestration
  const {
    callState, CALL_STATES,
    isMuted, isHeld,
    toggleMute, toggleHold, endCall,
    setCallState,
    backendCallId,
    livekitSession,
  } = useCall();

  const timer = useCallTimer();

  // ---------------------------------------------------------------
  // SECTION: UI & MODAL STATE MANAGEMENT
  // ---------------------------------------------------------------

  // State Management -> Modal toggles and transactional form states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDept, setTransferDept] = useState('General');
  const [transferType, setTransferType] = useState('cold');
  const [transferring, setTransferring] = useState(false);
  const [transferDone, setTransferDone] = useState(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [joinLink, setJoinLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // ---------------------------------------------------------------
  // SECTION: MEDIA & SIGNALING REFS
  // ---------------------------------------------------------------

  // Initialization -> Refs for persistent signaling and hardware track access
  const roomRef = useRef(null);
  const connectedRef = useRef(false);
  const recognitionRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [localTrack, setLocalTrack] = useState(null);
  const [remoteTracks, setRemoteTracks] = useState({});
  const [logs, setLogs] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [queuePos, setQueuePos] = useState(livekitSession?.queuePosition ?? null);
  const [manualText, setManualText] = useState('');
  const [srStatus, setSrStatus] = useState('idle'); // 'idle' | 'active' | 'error'
  const [interimText, setInterimText] = useState('');    // live in-progress words

  // [Recording] consent: null=awaiting, 'admitted', 'denied'
  const [recordingConsent, setRecordingConsent] = useState(null);
  const mediaRecorderRef    = useRef(null);
  const recordingChunksRef  = useRef([]);
  const consentTimerRef     = useRef(null);   // auto-record timer if no response

  // ---------------------------------------------------------------
  // SECTION: STABLE REFERENCE SYNC
  // ---------------------------------------------------------------

  // Sub-process -> onNewCallerTextRef: Maintains stable callback pointer for async data channels
  const onNewCallerTextRef = useRef(onNewCallerText);
  useEffect(() => { onNewCallerTextRef.current = onNewCallerText; }, [onNewCallerText]);

  // [Sentiment] When lastSentiment changes, attach it to the most recent non-system transcript entry
  useEffect(() => {
    if (!lastSentiment?.display) return;
    setTranscript(prev => {
      if (!prev.length) return prev;
      const lastIdx = [...prev].reverse().findIndex(t => t.speaker !== 'system');
      if (lastIdx === -1) return prev;
      const realIdx = prev.length - 1 - lastIdx;
      const updated = [...prev];
      updated[realIdx] = { ...updated[realIdx], sentimentDisplay: lastSentiment.display };
      return updated;
    });
  }, [lastSentiment]);

  // Stable ref for handleEndCall so ParticipantDisconnected never captures a stale closure
  const handleEndCallRef = useRef(null);

  // Sub-process -> isMutedRef: Prevents stale closure capture in speech recognition results
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Internal Utility -> addLog()-> Commits a temporal event entry to the session log
  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 20));
  }, []);

  // Logic Branch -> refreshParticipants()-> Synchronizes React state with LiveKit participant registry
  const refreshParticipants = useCallback((room) => {
    if (!room) return;
    const remotes = Array.from(room.remoteParticipants?.values() ?? []);
    setParticipants([room.localParticipant, ...remotes]);
  }, []);

  // ---------------------------------------------------------------
  // SECTION: WEBRTC MEDIA LIFECYCLE (LIVEKIT)
  // ---------------------------------------------------------------

  // Initialization -> useEffect(): Orchestrates the persistent WebRTC connection hub
  useEffect(() => {
    if (!livekitSession?.token || !livekitSession?.room) return;
    if (connectedRef.current) return;
    connectedRef.current = true;

    let isMounted = true;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    room.on(RoomEvent.ParticipantConnected, (p) => {
      addLog(`✦ ${p.name || p.identity} joined`);
      refreshParticipants(room);
      setTranscript(prev => [...prev, { speaker: 'system', text: `${p.name || p.identity} joined` }]);
    });

    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      addLog(`✕ ${p.name || p.identity} left`);
      setRemoteTracks(prev => { const u = { ...prev }; delete u[p.identity]; return u; });
      refreshParticipants(room);
      // End call if no remote participants remain (other side hung up)
      if (connectedRef.current && room.remoteParticipants.size === 0) {
        handleEndCallRef.current?.();
      }
    });

    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Audio) {
        setLocalTrack(pub.track);
        addLog('🎙 Microphone live');
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        addLog(`🔊 Audio from ${participant.name || participant.identity}`);
        const el = track.attach();
        el.autoplay = true;
        document.body.appendChild(el);
        setRemoteTracks(prev => ({ ...prev, [participant.identity]: track }));
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
    });

    // Sub-process -> DataReceived Handler: Ingests real-time caller transcription from data channel
    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== 'transcript') return;
      try {
        const { text } = JSON.parse(new TextDecoder().decode(payload));
        if (!text?.trim()) return;
        setTranscript(prev => [...prev, { speaker: 'caller', text: text.trim() }]);
        onNewCallerTextRef.current?.(text.trim());
        _saveTranscript(livekitSession.room, 'caller', text.trim());
      } catch (_) { }
    });

    room.on(RoomEvent.Connected, () => {
      addLog('✔ Connected to room: ' + livekitSession.room);
      setConnected(true);
      setCallState(CALL_STATES.CONNECTED);
      refreshParticipants(room);
    });

    room.on(RoomEvent.Disconnected, () => {
      addLog('Disconnected');
      setConnected(false);
      connectedRef.current = false;
    });

    (async () => {
      // Logic Branch -> Demo Session Path: Simulates connection for UI validation
      if (livekitSession.token === 'demo-token') {
        setConnected(true);
        setCallState(CALL_STATES.CONNECTED);
        return;
      }
      try {
        addLog(`Connecting to room: ${livekitSession.room}…`);
        await room.connect(livekitSession.url || 'ws://127.0.0.1:7880', livekitSession.token);
        if (!isMounted) { room.disconnect(); return; }
        setConnected(true);
        setCallState(CALL_STATES.CONNECTED);
        refreshParticipants(room);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        if (isMounted) addLog(`✕ Connection error: ${e.message}`);
      }
    })();

    return () => {
      isMounted = false;
      room.disconnect();
      connectedRef.current = false;
    };
  }, [livekitSession?.token, livekitSession?.room]);

  // Sub-process -> hardware sync: Maps local mute state to active LiveKit tracks
  useEffect(() => {
    if (!roomRef.current) return;
    // On hold: silence the mic regardless of mute toggle; on resume: respect mute state
    roomRef.current.localParticipant?.setMicrophoneEnabled(!isMuted && !isHeld).catch(() => { });
  }, [isMuted, isHeld]);

  // Sub-process -> hold audio sync: Mute/unmute remote audio elements when hold state changes
  useEffect(() => {
    // Find all audio elements attached by LiveKit and toggle their mute
    const audioEls = document.querySelectorAll('audio[autoplay]');
    audioEls.forEach(el => { el.muted = isHeld; });
    if (isHeld) {
      addLog('⏸ Call placed on hold');
    } else if (connected) {
      addLog('▶ Call resumed');
    }
  }, [isHeld]);

  // ---------------------------------------------------------------
  // SECTION: SPEECH RECOGNITION (BROWSER ASR)
  // ---------------------------------------------------------------

  const sessionToken = livekitSession?.token;

  // Initialization -> useEffect(): Orchestrates the Web Speech API lifecycle for agent transcription
  useEffect(() => {
    if (!sessionToken) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      addLog('⚠ SpeechRecognition not supported in this browser');
      setSrStatus('error');
      return;
    }

    const startTimer = setTimeout(() => {
      addLog('🎤 Starting speech recognition…');

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      let active = true;
      let fatalError = false;

      recognition.onstart = () => {
        setSrStatus('active');
        addLog('✔ Speech recognition active — speak now');
      };

      // Sub-process -> onresult Handler: Processes real-time audio segments into text nodes
      recognition.onresult = (event) => {
        const results = Array.from(event.results);
        const lastResult = results[results.length - 1];
        const text = lastResult[0].transcript.trim();
        if (!text) return;

        if (lastResult.isFinal) {
          setInterimText('');
          if (!isMutedRef.current) {
            setTranscript(prev => [...prev, { speaker: 'agent', text }]);
            onNewCallerTextRef.current?.(text);
            _saveTranscript(livekitSession?.room, 'agent', text);
          }
        } else {
          setInterimText(text);
        }
      };

      recognition.onerror = (e) => {
        addLog(`⚠ Speech error: ${e.error}`);
        if (['not-allowed', 'audio-capture', 'service-not-allowed'].includes(e.error)) {
          fatalError = true;
          active = false;
          setSrStatus('error');
          setInterimText('');
        }
      };

      recognition.onend = () => {
        setInterimText('');
        if (active && !fatalError) {
          try { recognition.start(); } catch (_) { }
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (err) {
        addLog(`⚠ Could not start recognition: ${err.message}`);
        setSrStatus('error');
      }
    }, 800);

    return () => {
      clearTimeout(startTimer);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setSrStatus('idle');
      setInterimText('');
    };
  }, [sessionToken]);

  // ---------------------------------------------------------------
  // SECTION: CALL RECORDING
  // ---------------------------------------------------------------

  // [Recording] Start capturing mic audio via MediaRecorder
  const _startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recordingChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      mr.start(1000); // collect chunks every 1s
      mediaRecorderRef.current = mr;
    } catch (e) {
      console.warn('[Recording] MediaRecorder start failed:', e);
    }
  };

  // [Recording] Stop and upload blob to backend
  const _stopAndUpload = (sessionId, consent) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return;
    mr.onstop = async () => {
      try {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) return; // skip empty / near-empty recordings
        const form = new FormData();
        form.append('file', blob, `${sessionId}.webm`);
        await fetch(
          `${API_BASE}/webrtc/recording/upload?session_id=${encodeURIComponent(sessionId)}&consent=${consent}`,
          { method: 'POST', body: form },
        );
      } catch (e) {
        console.warn('[Recording] upload failed:', e);
      }
      // stop all mic tracks
      mr.stream?.getTracks().forEach(t => t.stop());
    };
    mr.stop();
  };

  // [Recording] Show consent popup when call connects; auto-admit after 15s if no response
  useEffect(() => {
    if (!connected) return;
    setRecordingConsent(null); // reset on each new connection
    // auto-record after 15s if agent doesn't respond
    consentTimerRef.current = setTimeout(async () => {
      setRecordingConsent('admitted');
      await _startRecording();
    }, 15000);
    return () => clearTimeout(consentTimerRef.current);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // [Recording] Handle Admit click
  const handleConsentAdmit = async () => {
    clearTimeout(consentTimerRef.current);
    setRecordingConsent('admitted');
    await _startRecording();
  };

  // [Recording] Handle Deny click — save consent to backend, no recording
  const handleConsentDeny = async () => {
    clearTimeout(consentTimerRef.current);
    setRecordingConsent('denied');
    const sid = livekitSession?.room || backendCallId || '';
    try {
      await fetch(`${API_BASE}/webrtc/recording/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, consent: 'denied' }),
      });
    } catch (_) {}
  };

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS
  // ---------------------------------------------------------------

  // Action Trigger -> handleEndCall()-> Terminates signaling room and backend call session
  // Keep ref fresh so room event listeners always call the latest version
  const handleEndCall = handleEndCallRef.current = async () => {
    // [Recording] stop and upload before disconnecting
    const sid = livekitSession?.room || backendCallId || '';
    if (mediaRecorderRef.current?.state !== 'inactive') {
      _stopAndUpload(sid, 'admitted');
    }
    connectedRef.current = false;
    roomRef.current?.disconnect();
    if (backendCallId) {
      try { await fetch(`${API_BASE}/calls/${backendCallId}/end`, { method: 'POST' }); } catch (_) { }
    }
    // Also notify CC backend to set agent status back to 'online' (enables outbound callbacks)
    try {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
      const agentIdentity = stored.email || '';
      if (agentIdentity) {
        await fetch(`${API_BASE}/cc/agent/end-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: livekitSession?.room || backendCallId || '', agent_identity: agentIdentity }),
        });
      }
    } catch (_) { }
    endCall();
  };

  // Action Trigger -> handleTransfer()-> Executes departmental call handoff via API gateway
  const handleTransfer = async () => {
    if (transferring) return;
    setTransferring(true);
    setTransferDone(null);

    const callId = backendCallId || livekitSession?.room || '';
    const stored = (() => { try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const agentIdentity = stored.email || '';

    try {
      await fetch(`${API_BASE}/cc/calls/${callId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: transferDept, transfer_type: transferType, agent_identity: agentIdentity }),
      });
    } catch (_) { }

    setCallState(CALL_STATES.TRANSFERRING);

    const successMsg = `Call transferred to ${transferDept} (${transferType})`;
    setTransferDone({ success: true, msg: successMsg });
    addLog(`↷ ${successMsg}`);
    setTranscript(prev => [...prev, { speaker: 'system', text: successMsg }]);
    setTransferring(false);

    if (transferType === 'cold') {
      // Cold transfer: agent leaves immediately after handing off
      setTimeout(async () => {
        setShowTransferModal(false);
        setTransferDone(null);
        await handleEndCallRef.current?.();
      }, 1800);
    } else {
      // Warm transfer: agent stays until new agent joins, then can manually end
      setTimeout(() => { setShowTransferModal(false); setTransferDone(null); }, 2000);
    }
  };

  const local = roomRef.current?.localParticipant;
  const ROOM_LABEL = livekitSession?.room || '…';

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%' }}>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>{ROOM_LABEL}</div>
            <div style={{ fontSize: '10px', color: '#5a7a9a', marginTop: '2px' }}>
              {queuePos != null ? `Queue position: ${queuePos}` : connected ? `Live · ${timer}` : 'Connecting…'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? '#22c55e' : '#5a7a9a',
              boxShadow: connected ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
              animation: connected ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: '10px', color: connected ? '#22c55e' : '#5a7a9a' }}>
              {connected ? 'Connected' : 'Connecting'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {local && <ParticipantTile participant={local} audioTrack={localTrack} isMuted={isMuted} />}
          {participants.filter(p => p !== local).map(p => (
            <ParticipantTile key={p.identity} participant={p} audioTrack={remoteTracks[p.identity] || null} isMuted={false} />
          ))}
          {participants.length <= 1 && (
            <div style={{ padding: '20px 24px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', color: '#5a7a9a', fontSize: '11px' }}>
              {connected ? 'Waiting for caller to connect…' : 'Connecting to room…'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>

          <button onClick={toggleMute} style={{
            background: isMuted ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
            color: isMuted ? '#f87171' : '#8899aa',
            border: `1px solid ${isMuted ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '8px', padding: '7px 14px', fontSize: '11px', cursor: 'pointer',
          }}>
            {isMuted ? '🔇 Unmute' : '🎙 Mute'}
          </button>

          <button onClick={async () => {
            toggleHold();
            // Notify backend for logging (non-fatal)
            try {
              await fetch(`${API_BASE}/webrtc/calls/hold`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: livekitSession?.room || backendCallId || '', action: isHeld ? 'resume' : 'hold' }),
              });
            } catch (_) {}
          }} style={{
            background: isHeld ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.04)',
            color: isHeld ? '#facc15' : '#8899aa',
            border: `1px solid ${isHeld ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '8px', padding: '7px 14px', fontSize: '11px', cursor: 'pointer',
          }}>
            {isHeld ? '▶ Resume' : '⏸ Hold'}
          </button>

          <button onClick={() => { setShowTransferModal(true); setTransferDone(null); }} style={{
            background: 'rgba(99,102,241,0.10)', color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.22)',
            borderRadius: '8px', padding: '7px 14px', fontSize: '11px', cursor: 'pointer',
          }}>
            ↷ Transfer
          </button>

          <button onClick={() => { setShowInviteModal(true); setInviteError(''); }} style={{
            background: 'rgba(34,197,94,0.08)', color: '#4ade80',
            border: '1px solid rgba(34,197,94,0.20)',
            borderRadius: '8px', padding: '7px 14px', fontSize: '11px', cursor: 'pointer',
          }}>
            + Add to Call
          </button>

          <button onClick={handleEndCall} style={{
            background: 'rgba(239,68,68,0.12)', color: '#f87171',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '8px', padding: '7px 14px', fontSize: '11px', cursor: 'pointer',
            marginLeft: 'auto',
          }}>
            ✕ End Call
          </button>
        </div>

        {showTransferModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: '14px', padding: '24px', width: '320px' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>Transfer Call</span>
                <button onClick={() => setShowTransferModal(false)} style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              <label style={{ fontSize: '10px', color: '#5a7a9a', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Department</label>
              <select
                value={transferDept}
                onChange={e => setTransferDept(e.target.value)}
                style={{ width: '100%', background: '#080c10', border: '1px solid #1e2d3d', borderRadius: '8px', padding: '8px 10px', color: '#e2e8f0', fontSize: '12px', marginBottom: '14px', outline: 'none' }}
              >
                {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#080c10' }}>{d}</option>)}
              </select>

              <label style={{ fontSize: '10px', color: '#5a7a9a', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Transfer Type</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                {['cold', 'warm'].map(t => (
                  <button key={t} onClick={() => setTransferType(t)} style={{
                    flex: 1, padding: '7px', borderRadius: '7px', fontSize: '11px', cursor: 'pointer',
                    background: transferType === t ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                    color: transferType === t ? '#818cf8' : '#5a7a9a',
                    border: `1px solid ${transferType === t ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    fontWeight: transferType === t ? 600 : 400,
                  }}>
                    {t === 'cold' ? '❄ Cold' : '♨ Warm'}
                  </button>
                ))}
              </div>

              {transferDone && (
                <div style={{
                  padding: '8px 12px', borderRadius: '8px', fontSize: '11px', marginBottom: '12px',
                  background: transferDone.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                  color: transferDone.success ? '#4ade80' : '#f87171',
                  border: `1px solid ${transferDone.success ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  {transferDone.success ? '✓ ' : '✕ '}{transferDone.msg}
                </div>
              )}

              <button
                onClick={handleTransfer}
                disabled={transferring}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: transferring ? 'not-allowed' : 'pointer',
                  background: transferring ? 'rgba(255,255,255,0.04)' : '#6366f1',
                  color: transferring ? '#5a7a9a' : 'white',
                  border: 'none',
                }}
              >
                {transferring ? 'Transferring…' : '↷ Confirm Transfer'}
              </button>
            </div>
          </div>
        )}

        {showInviteModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: '14px', padding: '24px', width: '340px' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>Add to Call</span>
                <button onClick={() => { setShowInviteModal(false); setJoinLink(''); setLinkCopied(false); }} style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              {!joinLink ? (
                <>
                  <p style={{ fontSize: '12px', color: '#5a7a9a', marginBottom: '18px' }}>
                    Generate a link and send it to anyone — they can join the call directly, no login required.
                  </p>
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/conference/${encodeURIComponent(ROOM_LABEL)}/join`;
                      setJoinLink(link);
                    }}
                    style={{ width: '100%', padding: '11px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.30)' }}
                  >
                    🔗 Generate Join Link
                  </button>
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: '#818cf8', marginBottom: '8px', fontWeight: 600 }}>📎 Share this link:</div>
                    <div style={{ fontSize: '11px', color: '#c4cdd8', wordBreak: 'break-all', background: '#080c10', borderRadius: '6px', padding: '8px 10px', border: '1px solid #1e2d3d', marginBottom: '10px', lineHeight: 1.6 }}>
                      {joinLink}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(joinLink).then(() => {
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 3000);
                        });
                      }}
                      style={{ width: '100%', padding: '9px', borderRadius: '7px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: linkCopied ? 'rgba(34,197,94,0.18)' : '#6366f1', color: linkCopied ? '#4ade80' : '#fff', border: 'none', transition: 'all 0.2s' }}
                    >
                      {linkCopied ? '✓ Copied to clipboard!' : 'Copy Link'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#5a7a9a', textAlign: 'center', margin: 0 }}>
                    Anyone who opens this link can join the call.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5a7a9a' }}>
              Live Transcript
            </div>
            <div style={{
              fontSize: '9px', padding: '2px 7px', borderRadius: '5px',
              background: srStatus === 'active' ? 'rgba(34,197,94,0.1)' : srStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
              color: srStatus === 'active' ? '#4ade80' : srStatus === 'error' ? '#f87171' : '#5a7a9a',
              border: `1px solid ${srStatus === 'active' ? 'rgba(34,197,94,0.2)' : srStatus === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              {srStatus === 'active' ? '● mic' : srStatus === 'error' ? '⚠ mic off' : '○ mic'}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '8px' }}>
            {transcript.length === 0 && !interimText ? (
              <div style={{ fontSize: '11px', color: '#3a4a5a' }}>
                {connected ? 'Speak to see transcript…' : 'Waiting for conversation…'}
              </div>
            ) : (
              <>
                {transcript.map((t, i) => {
                  const isAgent = t.speaker === 'agent';
                  const isCaller = t.speaker === 'caller';
                  const isSystem = t.speaker === 'system';
                  const labelColor = isAgent ? '#22c55e' : isCaller ? '#00e5ff' : '#3a4a5a';
                  const label = isAgent ? 'Agent' : isCaller ? 'Caller' : 'sys';
                  const bgColor = isAgent ? 'rgba(34,197,94,0.07)' : isCaller ? 'rgba(0,229,255,0.06)' : 'transparent';
                  const borderClr = isAgent ? 'rgba(34,197,94,0.18)' : isCaller ? 'rgba(0,229,255,0.15)' : 'none';
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', minWidth: '44px', textAlign: 'right', paddingTop: '2px', fontWeight: 600, color: labelColor }}>
                        {label}
                      </span>
                      <div style={{
                        background: bgColor,
                        border: isSystem ? 'none' : `1px solid ${borderClr}`,
                        borderRadius: '8px', padding: '6px 10px', fontSize: '10px',
                        color: isSystem ? '#3a4a5a' : '#c4cdd8', lineHeight: 1.5,
                      }}>
                        {t.text}
                        {/* [Sentiment] Per-line sentiment badge — shown on caller and agent lines */}
                        {!isSystem && t.sentimentDisplay && (() => {
                          const b = SENTIMENT_BADGE[t.sentimentDisplay] || SENTIMENT_BADGE.NEUTRAL;
                          return (
                            <span style={{
                              display: 'inline-block', marginLeft: 7,
                              fontSize: 9, padding: '1px 6px', borderRadius: 4,
                              background: b.bg, color: b.color, fontWeight: 700,
                              letterSpacing: '0.04em', verticalAlign: 'middle',
                            }}>
                              {b.icon} {t.sentimentDisplay}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
                {interimText && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', opacity: 0.6 }}>
                    <span style={{ fontSize: '10px', minWidth: '44px', textAlign: 'right', paddingTop: '2px', fontWeight: 600, color: '#22c55e' }}>
                      Agent
                    </span>
                    <div style={{
                      background: 'rgba(34,197,94,0.04)',
                      border: '1px dashed rgba(34,197,94,0.25)',
                      borderRadius: '8px', padding: '6px 10px', fontSize: '10px',
                      color: '#8aa', lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      {interimText}…
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
            <input
              type="text"
              placeholder="Type to add transcript…"
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && manualText.trim()) {
                  const text = manualText.trim();
                  setTranscript(prev => [...prev, { speaker: 'agent', text }]);
                  onNewCallerTextRef.current?.(text);
                  setManualText('');
                }
              }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px', padding: '5px 8px', color: '#c4cdd8', fontSize: '10px', outline: 'none',
              }}
            />
            <button
              onClick={() => {
                if (!manualText.trim()) return;
                const text = manualText.trim();
                setTranscript(prev => [...prev, { speaker: 'agent', text }]);
                onNewCallerTextRef.current?.(text);
                setManualText('');
              }}
              style={{
                background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.25)', borderRadius: '6px',
                padding: '5px 10px', fontSize: '10px', cursor: 'pointer',
              }}
            >
              ↵
            </button>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px', maxHeight: '140px', overflowY: 'auto' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5a7a9a', marginBottom: '8px' }}>
            Event Log
          </div>
          {logs.length === 0 ? (
            <div style={{ fontSize: '10px', color: '#3a4a5a' }}>No events yet</div>
          ) : (
            logs.map((l, i) => <div key={i} style={{ fontSize: '10px', color: '#5a7a9a', lineHeight: 1.8 }}>{l}</div>)
          )}
        </div>
      </div>

    </div>
  );
}