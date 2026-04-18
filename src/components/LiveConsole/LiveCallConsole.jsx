import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Phone, Globe, Loader2 } from 'lucide-react';

import { useCall } from '../../context/CallContext';
// 🟢 BYPASS THE MIDDLEMAN: Seedha API import karenge taaki token raste mein drop na ho
import api from '../../services/api';

// 🟢 Asli Components Import kiye gaye hain
import LiveCallPanel from './LiveCallPanel';
import CrmSidebar from './CrmSidebar';
import AiAssistPanel from './AiAssistPanel';

// ======================== Live Call Console Orchestrator ========================
// LiveCallConsole -> The primary real-time telephony interface, orchestrating the 
// signaling lifecycle for browser-based calls, NLP-driven AI suggestions, and 
// synchronized CRM data presentation.
// ||
// ||
// ||
// Functions -> LiveCallConsole()-> Main functional entry point for the browser calling node:
// ||           |
// ||           |--- handleNewTranscript()-> [Action Trigger]: Ingests caller speech streams.
// ||           |    └── Sub-process: Executes debounced POST requests to the AI suggest engine.
// ||           |
// ||           |--- handleInitiateCall()-> [Action Trigger]: Executes WebRTC signaling handshake.
// ||           |    ├── Internal Call: api.post()-> Requests authorization token from the gateway.
// ||           |    ├── Logic Branch: Extraction logic for standard vs. intercepted Axios responses.
// ||           |    └── Logic Branch: Demo mode fallback for offline resilience.
// ||           |
// ||           └── (Conditional UI State Mapping):
// ||                ├── !isActive: Renders the Target Identity / Dialer interface.
// ||                └── isActive: Renders the triple-panel production dashboard.
// ||
// =================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

// Normalise origin — strip any trailing /api so we can always append it ourselves.
// VITE_API_URL may or may not include /api; we handle both cases.
const _ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880';
const AI_SUGGEST_URL = `${_ORIGIN}/api/ai-suggest`;

// Debounce delay (ms) — don't hammer AI on every word
const AI_DEBOUNCE_MS = 1200;

export default function LiveCallConsole() {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------
  const {
    livekitSession, startCall,
    setDialNumber, setLivekitSession, setBackendCallId
  } = useCall();

  const [isBusy, setIsBusy] = useState(false);
  const [targetUser, setTargetUser] = useState("");
  const [aiInsight, setAiInsight] = useState(null);
  // [Sentiment] Stores the most recent sentiment result to pass down to LiveCallPanel for per-line badge
  const [lastSentiment, setLastSentiment] = useState(null);
  const aiTimerRef = useRef(null);

  // CRM state — populated when call goes active
  const [crmData, setCrmData] = useState(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [currentTicket, setCurrentTicket] = useState(null);
  // Capture the call ID set during handleInitiateCall so useEffect can read it
  const [localCallId, setLocalCallId] = useState(null);

  // ---------------------------------------------------------------
  // SECTION: AI ASSISTANT LOGIC (DEBOUNCED)
  // ---------------------------------------------------------------

  // Action Trigger -> handleNewTranscript()-> Processes incoming caller speech for NLP analysis
  const handleNewTranscript = useCallback((text) => {
    if (!text?.trim()) return;
    // Debounce so rapid partial results don't fire many requests
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(AI_SUGGEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiInsight(data);
          // [Sentiment] Store latest sentiment so LiveCallPanel can badge the transcript line
          if (data.sentiment) setLastSentiment({ display: data.sentiment });
        }
      } catch (e) {
        console.warn('[AI Assist] fetch failed:', e);
      }
    }, AI_DEBOUNCE_MS);
  }, []);

  const isActive = !!livekitSession?.room;

  // ---------------------------------------------------------------
  // SECTION: CRM DATA FETCH — fires when call becomes active
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!isActive) return;
    setCrmData(null);
    setCurrentTicket(null);
    setCrmLoading(true);

    // For incoming customer calls localCallId is null — fall back to the LiveKit
    // room name which IS stored as room_id in cc_sessions so caller-profile finds it.
    const callId = (localCallId && !localCallId.startsWith('offline-'))
      ? localCallId
      : (livekitSession?.room || 'unknown');
    const base = api.defaults?.baseURL?.endsWith('/api') ? '' : '/api';

    api.get(`${base}/crm/caller-profile/${callId}`)
      .then(data => {
        setCrmData(data);
        setCrmLoading(false);
        // Create Desk ticket AFTER we have the caller email
        const email = data?.caller?.email || '';
        api.post(`${base}/zoho/desk/tickets`, {
          contact_email: email,
          subject: `Call – ${new Date().toLocaleDateString()}`,
          priority: 'medium',
          call_session_id: String(callId),
        }).then(t => setCurrentTicket(t)).catch(() => {});
      })
      .catch(() => setCrmLoading(false));
  }, [isActive, localCallId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------
  // SECTION: SIGNALING & CONNECTION ENGINE
  // ---------------------------------------------------------------

  // Action Trigger -> handleInitiateCall()-> Executes WebRTC negotiation and room initialization
  const handleInitiateCall = async () => {
    if (!targetUser) return alert("Please enter a name");

    setIsBusy(true);
    const generatedRoom = `room-${Date.now()}`;

    try {
      console.log("📡 Requesting token DIRECTLY from Backend...");

      // 🟢 THE ULTIMATE FIX: Direct API Call
      // Internal Call -> api.post()-> Requests signed WebRTC token via the direct API gateway
      const endpoint = api.defaults?.baseURL?.endsWith('/api') ? "/webrtc/token" : "/api/webrtc/token";
      const res = await api.post(endpoint, {
        participant_name: targetUser,
        room_name: generatedRoom,
        department: 'General'
      });

      console.log("🔥 DIRECT BACKEND RESPONSE:", res);

      // 🟢 THE MAGIC EXTRACTOR: Jo humne screenshot mein dekha, usko pakadne ka perfect tarika
      // Logic Branch -> Extraction logic: Normalizes inconsistent backend response shapes
      let finalData = {};
      if (res && res.token) {
        finalData = res; // Jab interceptor response.data return karta hai
      } else if (res && res.data && res.data.token) {
        finalData = res.data; // Standard Axios response
      } else {
        finalData = res.data || res || {};
      }

      const validToken = finalData.token || finalData.access_token || finalData.livekit_token;

      if (!validToken) {
        console.error("❌ Token missing in response data:", finalData);
        throw new Error("Missing Token in Backend Response");
      }

      console.log("✅ TOKEN FOUND:", validToken.substring(0, 15) + "...");

      setDialNumber(targetUser);
      const resolvedCallId = finalData.call_id || `call-${Date.now()}`;
      setBackendCallId(resolvedCallId);
      setLocalCallId(resolvedCallId);

      // Injecting real token into the global CallContext
      setLivekitSession({
        token: validToken,
        room: finalData.room_name || generatedRoom,
        url: finalData.livekit_url || LIVEKIT_URL,
        agentName: "AI Assistant"
      });

      console.log("✅ Token injected. Triggering WebRTC UI...");
      startCall();

    } catch (err) {
      console.error("❌ Backend Connection Failed:", err);

      // 🌟 DEMO FALLBACK: Keeps UI alive even if backend fails
      // Logic Branch -> Fallback mode: Triggers demo session for offline UI verification
      setDialNumber(targetUser);
      const offlineId = `offline-${Date.now()}`;
      setBackendCallId(offlineId);
      setLocalCallId(offlineId);
      setLivekitSession({
        token: "demo-token", // This forces LiveCallPanel into demo mode
        room: generatedRoom,
        url: LIVEKIT_URL,
        agentName: "AI Assistant (Offline)"
      });
      startCall();
    } finally {
      setIsBusy(false);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (!isActive) {
    return (
      <div className="h-full flex items-center justify-center bg-[#080c10] p-6">
        <div className="w-[450px] bg-[#0e1419] border border-[#1e2d3d] rounded-2xl p-10 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
              <Globe size={20} className="text-[#6366f1]" /> Browser Call
            </h2>
            <p className="text-xs text-[#5a7a9a] mt-2">SR Comsoft AI Gateway</p>
          </div>

          <div className="space-y-6">
            <div className="bg-[#080c10] border border-[#1e2d3d] rounded-xl p-4">
              <label className="text-[10px] font-bold text-[#5a7a9a] uppercase mb-2 block tracking-widest">Target Identity</label>
              <input
                className="w-full bg-transparent text-lg text-[#818cf8] outline-none placeholder:text-[#1e2d3d]"
                placeholder="Enter Name (e.g. Rahul)"
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
              />
            </div>

            <button
              disabled={isBusy}
              onClick={handleInitiateCall}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${isBusy ? 'bg-[#1e2d3d] text-[#5a7a9a]' : 'bg-[#6366f1] text-white hover:bg-[#4f46e5] shadow-lg shadow-[#6366f1]/20'
                }`}
            >
              {isBusy ? <Loader2 className="animate-spin" size={20} /> : <Phone size={20} />}
              {isBusy ? "NEGOTIATING..." : "START CONVERSATION"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 overflow-hidden p-2">

      <div className="w-[320px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
        <CrmSidebar
          isLoading={crmLoading}
          customer={crmData ? {
            name:    crmData.caller?.name || targetUser || 'Guest Caller',
            phone:   crmData.caller?.phone || '',
            email:   crmData.caller?.email || '',
            tier:    crmData.contact?.segment || 'standard',
            company: crmData.contact?.company || '',
            zoho_contact_id: crmData.contact?.zoho_contact_id,
            business: {
              total_spent: '—',
              pending:  crmData.stats?.open_tickets ?? 0,
              resolved: crmData.stats?.resolved_tickets ?? 0,
            },
            history: (crmData.sessions || []).map(s => ({
              subject:   `${s.department || 'General'} · ${s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}`,
              status:    ['ended','completed','abandoned'].includes(s.status) ? 'Resolved' : 'Active',
              duration:  s.call_duration,
              sentiment: s.sentiment,
            })),
            stats:          crmData.stats,
            current_ticket: currentTicket || crmData.current_ticket,
          } : {
            name:     targetUser || 'Guest Caller',
            phone:    '',
            email:    '',
            tier:     'standard',
            business: { total_spent: '—', pending: 0, resolved: 0 },
            history:  [],
          }}
        />
        <AiAssistPanel aiInsight={aiInsight} />
      </div>

      <div className="flex-1 bg-[#0e1419] border border-[#1e2d3d] rounded-xl p-4 overflow-hidden">
        {/* [Sentiment] lastSentiment passed for per-line transcript badge */}
        <LiveCallPanel onNewCallerText={handleNewTranscript} lastSentiment={lastSentiment} />
      </div>

    </div>
  );
}