import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useDataChannel, useRoomContext } from '@livekit/components-react';
import { Phone, PhoneOff, Loader2, UserCheck, Mic } from 'lucide-react';
import { DEPARTMENTS } from '../../constants/departments.js';

// ======================== User Browser Call Orchestrator ========================
// UserBrowserCall -> Client-side terminal for browser-based support sessions.
// Manages the user lifecycle from routing initiation to live WebRTC audio streams,
// featuring automated ASR transcription, queue IVR language routing, and AI fallback.
// =================================================================================

// ---------------------------------------------------------------
// SECTION: ATOMIC SUB-COMPONENTS (SIGNALING & TRANSCRIPTION)
// ---------------------------------------------------------------

function CallerTranscriptSender({ enabled }) {
    const room = useRoomContext();
    useEffect(() => {
        if (!enabled || !room) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';
        recognition.onresult = (event) => {
            const text = event.results[event.results.length - 1][0].transcript.trim();
            if (!text || !room.localParticipant) return;
            try {
                const payload = new TextEncoder().encode(JSON.stringify({ text }));
                room.localParticipant.publishData(payload, { reliable: true, topic: 'transcript' });
            } catch (e) { console.warn('[CallerTranscript] publish failed:', e); }
        };
        recognition.onend = () => { try { recognition.start(); } catch (_) { } };
        try { recognition.start(); } catch (_) { }
        return () => { recognition.onend = null; recognition.abort(); };
    }, [enabled, room]);
    return null;
}

function QueueTTSReceiver() {
    useDataChannel("tts_queue_audio", (msg) => {
        try {
            const wavBlob = new Blob([msg.payload], { type: "audio/wav" });
            const url = URL.createObjectURL(wavBlob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play().catch(() => { URL.revokeObjectURL(url); });
        } catch (e) { console.warn("[QueueTTS] audio play failed:", e); }
    });
    useDataChannel("tts_queue_text", (msg) => {
        try {
            const { text } = JSON.parse(new TextDecoder().decode(msg.payload));
            if (!text || !window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = 0.95; utt.volume = 1.0;
            window.speechSynthesis.speak(utt);
        } catch (e) { console.warn("[QueueTTS] speech synthesis failed:", e); }
    });
    return null;
}

function CallStatusWatcher({ onAgentJoined }) {
    const remoteParticipants = useRemoteParticipants();
    const hasTriggered = useRef(false);
    useEffect(() => {
        if (remoteParticipants.length > 0 && !hasTriggered.current) {
            hasTriggered.current = true;
            onAgentJoined();
        }
    }, [remoteParticipants, onAgentJoined]);
    return null;
}

// ---------------------------------------------------------------
// SECTION: CONSTANTS
// ---------------------------------------------------------------
// All supported AI voice languages (matches backend voice registry)
const AI_LANGS = [
    { code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi (हिंदी)' },
    { code: 'mr', label: 'Marathi (मराठी)' }, { code: 'ta', label: 'Tamil (தமிழ்)' },
    { code: 'te', label: 'Telugu (తెలుగు)' }, { code: 'ml', label: 'Malayalam (മലയാളം)' },
    { code: 'bn', label: 'Bengali (বাংলা)' }, { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
    { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' }, { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'ur', label: 'Urdu (اردو)' }, { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' }, { code: 'es', label: 'Spanish' },
    { code: 'ar', label: 'Arabic (عربي)' }, { code: 'zh', label: 'Chinese (中文)' },
    { code: 'ru', label: 'Russian' }, { code: 'ne', label: 'Nepali (नेपाली)' },
];

// Detect language from transcript — tries spoken name first, then Unicode script
const detectLangFromText = (text) => {
    const t = text.toLowerCase();
    // Spoken language name matching (works when Chrome returns English phonetics)
    if (/hindi|हिंदी|hind[ie]/.test(t)) return 'hi';
    if (/marathi|मराठी/.test(t)) return 'mr';
    if (/tamil|தமிழ்/.test(t)) return 'ta';
    if (/telugu|తెలుగు/.test(t)) return 'te';
    if (/malayalam|മലയാളം/.test(t)) return 'ml';
    if (/bengali|বাংলা|bangla/.test(t)) return 'bn';
    if (/gujarati|ગુજરાતી/.test(t)) return 'gu';
    if (/kannada|ಕನ್ನಡ/.test(t)) return 'kn';
    if (/punjabi|ਪੰਜਾਬੀ/.test(t)) return 'pa';
    if (/urdu|اردو/.test(t)) return 'ur';
    if (/arabic|عربي/.test(t)) return 'ar';
    if (/french|français/.test(t)) return 'fr';
    if (/german|deutsch/.test(t)) return 'de';
    if (/spanish|español/.test(t)) return 'es';
    if (/chinese|中文|mandarin/.test(t)) return 'zh';
    if (/russian|русский/.test(t)) return 'ru';
    if (/nepali|नेपाली/.test(t)) return 'ne';
    if (/english/.test(t)) return 'en';
    // Unicode script fallback (when Chrome returns native script)
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    return 'en';
};

// ---------------------------------------------------------------
// SECTION: MAIN USER-INTERFACE COMPONENT
// ---------------------------------------------------------------

export default function UserBrowserCall({ userName = "Guest User", userEmail = "guest" }) {
    // idle → connecting → waiting (in queue, IVR plays) → active (agent/AI connected)
    // lang_pick: no agents at all, show language selector (voice + buttons)
    const [callState, setCallState] = useState("idle");
    const [noAgents, setNoAgents] = useState(false);
    const [connectionDetails, setConnectionDetails] = useState(null);
    const [department, setDepartment] = useState("General");
    const [activeCallId, setActiveCallId] = useState(null);
    const [aiListening, setAiListening] = useState(false);
    const langRecRef = useRef(null);
    // Ref so ASR callback always calls latest _startAiCall (avoids stale closure)
    const startAiCallRef = useRef(null);
    // Prevents handleEndCall from firing when LiveKitRoom remounts during room switch
    const isSwitchingRoomRef = useRef(false);

    const API_BASE = import.meta.env.VITE_API_URL || '';
    const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('ai_agents_enabled') === 'true');
    const toggleAi = () => {
        const next = !aiEnabled;
        localStorage.setItem('ai_agents_enabled', String(next));
        setAiEnabled(next);
    };

    // ---------------------------------------------------------------
    // AI LANGUAGE DETECTION
    // ---------------------------------------------------------------

    const _stopLangDetection = () => {
        setAiListening(false);
        if (langRecRef.current) {
            langRecRef.current.onend = null;
            langRecRef.current.abort();
            langRecRef.current = null;
        }
    };

    // Starts ASR for language detection — backend TTS prompt handled by queue_engine
    const _startLangDetection = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = 'en-IN'; // en-IN gives best results for Indian languages + English names
        langRecRef.current = rec;
        rec.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            const code = detectLangFromText(transcript);
            _stopLangDetection();
            startAiCallRef.current?.(code);
        };
        rec.onend = () => { if (langRecRef.current) try { rec.start(); } catch (_) { } };
        try { rec.start(); setAiListening(true); } catch (_) { }
    };

    // Connect to AI agent with chosen language
    // On success: cancel original queue call, switch to AI room
    // On AI busy: if in queue room → stay in queue (human may answer); if no room → restart ASR
    const _startAiCall = async (lang = 'en') => {
        _stopLangDetection();
        try {
            const res = await fetch(`${API_BASE}/livekit/token?lang=${lang}&llm=ollama`);
            if (!res.ok) throw new Error('AI busy');
            const data = await res.json();
            // Cancel original queue call before switching to AI room
            if (activeCallId) {
                fetch(`${API_BASE}/api/webrtc/calls/cancel/${activeCallId}`, { method: 'POST' }).catch(() => {});
                setActiveCallId(null);
            }
            setNoAgents(false);
            isSwitchingRoomRef.current = true;
            setConnectionDetails({ wsUrl: data.url, token: data.token, room: data.room });
            setCallState("active");
            setTimeout(() => { isSwitchingRoomRef.current = false; }, 5000);
        } catch (e) {
            console.warn("[AI] Agent busy, staying in queue");
            // If in a room already → human agent may pick up, restart ASR so user can retry
            if (connectionDetails) {
                _startLangDetection();
            } else {
                // No room (no_agents path) → notify and restart ASR
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    const utt = new SpeechSynthesisUtterance("AI assistant is busy. Please wait or say a language to retry.");
                    window.speechSynthesis.speak(utt);
                }
                _startLangDetection();
            }
        }
    };

    // Keep ref pointing to latest _startAiCall so ASR callback avoids stale closure
    useEffect(() => { startAiCallRef.current = _startAiCall; });

    // While in queue with a room + AI enabled → play IVR prompt after 4s (let queue TTS settle)
    useEffect(() => {
        if (callState !== "waiting" || !connectionDetails) return;
        if (localStorage.getItem('ai_agents_enabled') !== 'true') return;
        const t = setTimeout(() => _startLangDetection(), 4000);
        return () => { clearTimeout(t); _stopLangDetection(); };
    }, [callState, connectionDetails]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup on unmount
    useEffect(() => () => _stopLangDetection(), []);

    // ---------------------------------------------------------------
    // CALL LIFECYCLE
    // ---------------------------------------------------------------

    const startCall = async () => {
        setCallState("connecting");
        try {
            const initRes = await fetch(`${API_BASE}/api/webrtc/calls/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caller_name: userName, call_type: 'browser', department, user_email: userEmail }),
            });
            const initData = await initRes.json();
            setActiveCallId(initData.call_id);

            const aiOn = localStorage.getItem('ai_agents_enabled') === 'true';
            if (initData.status === 'no_agents') {
                if (!aiOn) {
                    setCallState("idle");
                    alert("No agents are currently available. Please try again later.");
                    return;
                }
                setNoAgents(true); // flag so UI shows "no agents / AI mode"
                // Fall through — still join room so backend TTS reaches user
            }

            const tokenRes = await fetch(`${API_BASE}/api/webrtc/livekit/token?room=${initData.room_name}&identity=user-${Date.now()}&name=${encodeURIComponent(userName)}`);
            const tokenData = await tokenRes.json();
            setConnectionDetails({
                wsUrl: tokenData.livekit_url || import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880',
                token: tokenData.token,
                room: initData.room_name,
            });
            setCallState("waiting");
            // Language IVR will auto-start via useEffect above (after 4s)
        } catch (err) {
            console.error("Call failed", err);
            setCallState("idle");
            alert("Failed to connect to the call server.");
        }
    };

    const handleEndCall = async () => {
        if (isSwitchingRoomRef.current) return; // ignore disconnect fired by room switch remount
        _stopLangDetection();
        setNoAgents(false);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if ((callState === "waiting" || callState === "lang_pick") && activeCallId) {
            try { await fetch(`${API_BASE}/api/webrtc/calls/cancel/${activeCallId}`, { method: 'POST' }); } catch { }
        }
        setActiveCallId(null);
        setCallState("idle");
        setConnectionDetails(null);
    };

    // ---------------------------------------------------------------
    // SECTION: PRIMARY RENDER (JSX)
    // ---------------------------------------------------------------

    // lang_pick: no agents online, AI enabled — speak any language, or tap to select
    if (callState === "lang_pick") {
        return (
            <div style={{ padding: 20, background: '#0e1419', borderRadius: 12, border: '1px solid #6366f1', color: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <Mic size={18} color={aiListening ? '#22c55e' : '#6366f1'} style={{ flexShrink: 0 }} />
                    <h3 style={{ margin: 0, fontSize: '16px' }}>
                        {aiListening ? '🎙 Listening — speak now' : 'Choose Language'}
                    </h3>
                </div>
                <p style={{ fontSize: 12, color: '#5a7a9a', marginBottom: 12 }}>
                    Speak in your language — we'll detect it. Or tap below.
                </p>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {AI_LANGS.map(lang => (
                        <button key={lang.code} onClick={() => _startAiCall(lang.code)}
                            style={{ padding: '9px 6px', background: '#1e1e2e', color: '#e2e8f0', border: '1px solid #2d2d4e', borderRadius: 7, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>
                            {lang.label}
                        </button>
                    ))}
                </div>
                <button onClick={handleEndCall}
                    style={{ width: '100%', padding: '9px', background: 'transparent', color: '#5a7a9a', border: '1px solid #1e2d3d', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                    Cancel
                </button>
            </div>
        );
    }

    if ((callState === "waiting" || callState === "active") && connectionDetails) {
        return (
            <div style={{ padding: 20, borderRadius: 12, border: '1px solid #22c55e', background: '#080c10', textAlign: 'center', color: 'white', boxShadow: '0 0 15px rgba(34,197,94,0.1)' }}>
                <LiveKitRoom key={connectionDetails.room} video={false} audio={true} token={connectionDetails.token}
                    serverUrl={connectionDetails.wsUrl} connect={true} onDisconnected={handleEndCall}>
                    <RoomAudioRenderer />
                    <QueueTTSReceiver />
                    <CallerTranscriptSender enabled={callState === "active"} />
                    <CallStatusWatcher onAgentJoined={() => { _stopLangDetection(); setCallState("active"); }} />

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        {callState === "waiting" ? (
                            <>
                                <div style={{ background: noAgents ? '#6366f1' : '#22c55e', padding: 12, borderRadius: '50%', animation: 'pulse 2s infinite' }}>
                                    <Phone size={24} color="white" />
                                </div>
                                <h3 style={{ color: noAgents ? '#6366f1' : '#22c55e', margin: 0 }}>
                                    {noAgents ? 'AI Assistant' : 'Waiting for Agent'}
                                </h3>
                                {aiListening
                                    ? <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>🎙 Speak now — we'll detect your language</p>
                                    : <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                                        {noAgents ? 'No agents online. AI will assist you.' : 'Connecting to next available agent…'}
                                      </p>
                                }
                                {aiListening && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, width: '100%', marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                                        {AI_LANGS.map(lang => (
                                            <button key={lang.code} onClick={() => { _stopLangDetection(); startAiCallRef.current?.(lang.code); }}
                                                style={{ padding: '7px 4px', background: '#1e1e2e', color: '#e2e8f0', border: '1px solid #2d2d4e', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                                                {lang.label.split(' ')[0]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ background: '#3b82f6', padding: 12, borderRadius: '50%' }}>
                                    <UserCheck size={24} color="white" />
                                </div>
                                <h3 style={{ color: '#3b82f6', margin: 0 }}>Connected to Agent</h3>
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Speak now, they can hear you!</p>
                            </>
                        )}
                        <button onClick={handleEndCall}
                            style={{ padding: '10px 20px', background: '#ef4444', color: 'white', borderRadius: 8, border: 'none', marginTop: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                            <PhoneOff size={16} /> End Call
                        </button>
                    </div>
                </LiveKitRoom>
                <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }`}</style>
            </div>
        );
    }

    const selectStyle = {
        width: '100%', background: '#0d1621', border: '1px solid #1e2d3d',
        borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13,
        marginBottom: 14, cursor: 'pointer', outline: 'none',
    };

    return (
        <div style={{ padding: 24, background: '#0e1419', borderRadius: 12, border: '1px solid #1e2d3d', color: 'white' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>Live Support</h3>
            <p style={{ fontSize: 13, color: '#5a7a9a', marginBottom: 18 }}>Connect instantly with our next available agent.</p>
            <label style={{ fontSize: 10, color: '#5a7a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Department
            </label>
            <select value={department} onChange={e => setDepartment(e.target.value)}
                disabled={callState === 'connecting'} style={selectStyle}>
                {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0d1621' }}>{d}</option>)}
            </select>
            <button onClick={startCall} disabled={callState === 'connecting'}
                style={{
                    background: callState === 'connecting' ? '#1e2d3d' : '#6366f1',
                    color: callState === 'connecting' ? '#5a7a9a' : 'white',
                    border: 'none', padding: '12px 24px', borderRadius: 8,
                    cursor: callState === 'connecting' ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                {callState === 'connecting' ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Phone size={18} />}
                {callState === 'connecting' ? 'Connecting...' : 'Call Agent Now'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ fontSize: 11, color: '#334155' }}>AI Agent Fallback</span>
                <button onClick={toggleAi} style={{
                    padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: aiEnabled ? '#6366f1' : '#1e2d3d', color: aiEnabled ? 'white' : '#5a7a9a',
                }}>
                    {aiEnabled ? 'ON' : 'OFF'}
                </button>
            </div>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
