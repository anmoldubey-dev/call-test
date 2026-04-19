// ======================== Superuser Overview Page ========================
import GlobalStyles from "../components/dashboard/GlobalStyles";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// ✅ CORRECTED IMPORTS
import ActiveCallsPanel from "../components/IVR/ActiveCallsPanel";
import HistoryPanel from "../components/IVR/HistoryPanel";
import BroadcastPanel from "../components/IVR/BroadcastPanel";
import QueueWaitTimesPanel from "../components/superuser/QueueWaitTimesPanel";
import LiveCallConsole from "../components/LiveConsole/LiveCallConsole";
import { useCall } from "../context/CallContext";
import { usePushNotifications } from "../hooks/usePushNotifications";

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function SuperuserPage() {
  const navigate = useNavigate();

  const [activeView, setActiveView] = useState("overview");
  const [confInvite, setConfInvite] = useState(null);

  const { setLivekitSession, startCall, livekitSession } = useCall();

  const _suEmail = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}").email || ""; } catch { return ""; } })();
  usePushNotifications(_suEmail);

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    navigate("/login");
  };

  // Listen for conference_invite events from the event hub
  useEffect(() => {
    const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const myIdentity = stored.email || "";
    if (!myIdentity) return;

    const WS_BASE = import.meta.env.VITE_WS_URL || 'wss://anteriorly-digestional-laquita.ngrok-free.dev';
    let ws;
    let isMounted = true;
    let reconnectTimer = null;

    const connect = () => {
      if (!isMounted) return;
      ws = new WebSocket(`${WS_BASE}/api/ws/events`);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (
            msg.type === "conference_invite" &&
            msg.data?.room_name &&
            (msg.assigned_agent === myIdentity || !msg.assigned_agent)
          ) {
            setConfInvite(msg.data);
          }
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => { if (isMounted) reconnectTimer = setTimeout(connect, 3000); };
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, []);

  return (
    <>
      <GlobalStyles />

      {/* Conference invite popup */}
      {confInvite && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "#0e1419", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 20, padding: "30px", width: 340, textAlign: "center", boxShadow: "0 0 40px rgba(34,197,94,0.15)" }}>
            <div style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto", fontSize: 28, position: "relative" }}>
              <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid #22c55e", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
              🎙
            </div>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 6px 0" }}>Conference Invite</h2>
            <p style={{ color: "#4ade80", fontSize: 13, margin: "0 0 6px 0", fontWeight: 600 }}>{confInvite.inviter_name || "An agent"}</p>
            <p style={{ color: "#5a7a9a", fontSize: 12, margin: "0 0 22px 0" }}>is inviting you to join an active call</p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              <button onClick={() => setConfInvite(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>Decline</button>
              <button
                onClick={async () => {
                  const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
                  const agentId = stored.email || stored.id || "superuser";
                  const roomName = confInvite.room_name;
                  setConfInvite(null);
                  try {
                    const res = await fetch(`${API_BASE}/api/webrtc/livekit/token?room=${roomName}&identity=${encodeURIComponent(agentId)}&name=${encodeURIComponent(stored.name || "Superuser")}`);
                    const tokenData = await res.json();
                    if (!tokenData.token) throw new Error("No token");
                    setLivekitSession({
                      url: tokenData.livekit_url || import.meta.env.VITE_LIVEKIT_URL || "wss://voice-ai-nv6qlh0d.livekit.cloud",
                      token: tokenData.token,
                      room: roomName,
                    });
                    setActiveView("live_console");
                    startCall();
                  } catch (e) {
                    console.error("Conference join failed:", e);
                  }
                }}
                style={{ flex: 1, padding: 11, borderRadius: 10, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >Join Call</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes ping { 75%, 100% { transform: scale(1.5); opacity: 0; } }`}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside style={{
          position: "fixed", left: 0, top: 0,
          height: "100vh", width: 240,
          background: "var(--bg2)",
          borderRight: "1px solid var(--bdr)",
          display: "flex", flexDirection: "column",
          zIndex: 100,
        }}>
          {/* Logo */}
          <div style={{ padding: "22px 18px 17px", borderBottom: "1px solid var(--bdr)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "linear-gradient(135deg, var(--pur), var(--acc))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0,
              }}>
                SR
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, color: "var(--txt)" }}>
                SR<br />
                <span style={{ color: "var(--txt2)", fontWeight: 500 }}>Comsoft Ai</span>
              </span>
            </div>
          </div>

          {/* Superuser badge */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--bdr)" }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "1px",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: 20,
              background: "rgba(124,92,255,0.12)", color: "var(--pur2)",
              border: "1px solid var(--bdr2)",
            }}>
              Superuser
            </span>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: 'auto' }}>
            
            <div style={{ fontSize: '10px', color: 'var(--txt2)', padding: '10px 12px 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Main Menu</div>
            
            {[
              { label: "Overview",  icon: "◈", id: "overview", action: () => setActiveView("overview") },
              { label: "Dashboard", icon: "⬡", id: "dashboard", action: () => navigate("/superuser/dashboard") },
              { label: "Agents",    icon: "◉", id: "agents", action: () => navigate("/superuser/agents") },
              { label: "Analytics", icon: "↗", id: "analytics", action: () => navigate("/superuser/analytics") },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 9, width: "100%",
                  border: `1px solid ${activeView === item.id ? "var(--bdr2)" : "transparent"}`,
                  background: activeView === item.id ? "var(--purl)" : "transparent",
                  color: activeView === item.id ? "var(--pur2)" : "var(--txt2)",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 13.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "var(--purl)";
                    e.currentTarget.style.color = "var(--txt)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--txt2)";
                  }
                }}
              >
                <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div style={{ fontSize: '10px', color: 'var(--txt2)', padding: '16px 12px 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Live Monitoring</div>
            
            {/* ✅ NAYA: Live Console added to Sidebar */}
            {[
              { label: "Live Console", icon: "🖥️", id: "live_console" },
              { label: "Live Calls",   icon: "📞", id: "live_calls" },
              { label: "Call History", icon: "📜", id: "history" },
              { label: "Broadcast",    icon: "📻", id: "broadcast" },
              { label: "Scheduling",     icon: "🗓️", id: "scheduling",     action: () => navigate("/superuser/scheduling") },
              { label: "Business Hours", icon: "🕐", id: "business-hours", action: () => navigate("/superuser/business-hours") },
              { label: "Queue Wait Times", icon: "⏱", id: "queue_wait_times" },
              { label: "CRM",            icon: "👥", id: "crm",            action: () => navigate("/superuser/crm") },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => item.action ? item.action() : setActiveView(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 9, width: "100%",
                  border: `1px solid ${activeView === item.id ? "var(--bdr2)" : "transparent"}`,
                  background: activeView === item.id ? "rgba(14,165,233,0.1)" : "transparent",
                  color: activeView === item.id ? "#0ea5e9" : "var(--txt2)",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 13.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "var(--purl)";
                    e.currentTarget.style.color = "var(--txt)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--txt2)";
                  }
                }}
              >
                <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <div style={{ padding: "14px 10px", borderTop: "1px solid var(--bdr)" }}>
            <button
              onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 9, width: "100%",
                border: "1px solid transparent",
                background: "transparent", color: "var(--red)",
                fontFamily: "'Syne', sans-serif",
                fontSize: 13.5, fontWeight: 500,
                cursor: "pointer", textAlign: "left",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,71,87,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>⎋</span>
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────── */}
        <main style={{ marginLeft: 240, flex: 1, padding: "38px 44px" }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 30, fontWeight: 800 }}>Superuser Panel</h1>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px",
                textTransform: "uppercase", padding: "3px 10px", borderRadius: 20,
                background: "rgba(124,92,255,0.12)", color: "var(--pur2)",
                border: "1px solid var(--bdr2)",
              }}>
                Superuser
              </span>
            </div>
            <p style={{ fontSize: 14, color: "var(--txt2)" }}>
              Team overview — monitor agents, calls, and performance.
            </p>
          </div>

          {/* DYNAMIC RENDERING: activeView ke hisaab se component dikhayenge */}
          
          {activeView === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[
                { icon: "⬡", title: "Go to Dashboard", desc: "Full 3D analytics dashboard", action: () => navigate("/superuser/dashboard") },
                { icon: "◉", title: "View Agents",      desc: "All agents allocated to your team", action: () => navigate("/superuser/agents") },
                { icon: "↗", title: "Call Analytics",   desc: "Deep dive into call data", action: () => navigate("/superuser/analytics") },
                // ✅ NAYA: Shortcuts for new tools including Live Console
                { icon: "🖥️", title: "Live Console", desc: "Takeover & assist agents", action: () => setActiveView("live_console") },
                { icon: "📞", title: "Live Calls",   desc: "Monitor active agent calls", action: () => setActiveView("live_calls") },
                { icon: "📜", title: "Call History", desc: "Review past conversations", action: () => setActiveView("history") },
                { icon: "📻", title: "Broadcast",      desc: "Send audio messages to team", action: () => setActiveView("broadcast") },
                { icon: "🕐", title: "Business Hours", desc: "Set working hours & holidays", action: () => navigate("/superuser/business-hours") },
                { icon: "⏱", title: "Queue Wait Times", desc: "Configure wait time per queue position", action: () => setActiveView("queue_wait_times") },
              ].map((card) => (
                <div
                  key={card.title}
                  onClick={card.action}
                  style={{
                    background: "var(--card)", border: "1px solid var(--bdr)",
                    borderRadius: 16, padding: 24, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--card-h)";
                    e.currentTarget.style.borderColor = "var(--bdr2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--card)";
                    e.currentTarget.style.borderColor = "var(--bdr)";
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: "var(--purl)", border: "1px solid var(--bdr2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "var(--pur2)", marginBottom: 14,
                  }}>
                    {card.icon}
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>{card.title}</p>
                  <p style={{ fontSize: 13, color: "var(--txt2)" }}>{card.desc}</p>
                </div>
              ))}
            </div>
          )}

          {activeView === "live_console" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', border: '1px solid var(--bdr)', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
              <LiveCallConsole />
            </div>
          )}

          {activeView === "live_calls" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <ActiveCallsPanel />
            </div>
          )}

          {activeView === "history" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <HistoryPanel showDateFilter={false} />
            </div>
          )}

          {activeView === "broadcast" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <BroadcastPanel />
            </div>
          )}

          {activeView === "queue_wait_times" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '30px', border: '1px solid var(--bdr)' }}>
              <QueueWaitTimesPanel />
            </div>
          )}

        </main>
      </div>
    </>
  );
}