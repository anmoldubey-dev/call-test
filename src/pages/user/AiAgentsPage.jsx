import { useState, useEffect } from 'react'

const LS_KEY = 'ai_agents_enabled'
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const ADMIN_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || 'http://localhost:5173'

export default function AiAgentsPage() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(LS_KEY) === 'true')
  const [showIframe, setShowIframe] = useState(false)

  const toggle = () => {
    const next = !enabled
    localStorage.setItem(LS_KEY, String(next))
    setEnabled(next)
    if (!next) setShowIframe(false)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px', borderBottom: '1px solid var(--bdr)', flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🤖 AI Agent Dashboard</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--txt2)' }}>
            {enabled
              ? 'AI agents are active — handling overflow calls when humans are busy.'
              : 'Enable AI agents to handle calls when all human agents are busy.'}
          </p>
        </div>
        <button
          onClick={toggle}
          style={{
            padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.2s',
            background: enabled ? 'rgba(34,197,94,0.15)' : 'var(--pur)',
            color:      enabled ? 'var(--grn)' : '#fff',
            border:     enabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent',
          }}
        >
          {enabled ? '✓ AI Agents Enabled' : '⚡ Enable AI Agents'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--txt2)' }}>
            <div style={{ fontSize: 52 }}>🤖</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>AI Agents are Disabled</div>
            <p style={{ fontSize: 14, maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
              When enabled, AI agents handle inbound calls when all human agents are busy.
              Callers go through IVR language detection, then get routed to the right AI agent.
            </p>
            <button onClick={toggle} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--pur)', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
              ⚡ Enable AI Agents
            </button>
          </div>
        ) : (
          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Status card */}
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--grn)', boxShadow: '0 0 8px var(--grn)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>AI Agents Active</div>
                <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 3 }}>
                  Overflow calls routed to AI when all human agents are busy. Language auto-detected via IVR.
                </div>
              </div>
            </div>

            {/* How it works */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>How it works</div>
              {[
                ['1', 'User clicks "Call Agent Now"', 'Backend rings available human agents in the selected department'],
                ['2', 'No agents available', 'If all human agents are busy or offline, caller waits up to 20 seconds'],
                ['3', 'AI takes over', 'IVR plays a greeting, detects caller language via speech, routes to matching AI voice'],
                ['4', 'AI handles the call', 'LiveKit AI agent joins the room and converses with the caller'],
              ].map(([n, title, desc]) => (
                <div key={n} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pur)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{n}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin console link — only shown locally */}
            {IS_LOCAL ? (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Admin Console</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 3 }}>Configure AI agents, voices, routing rules</div>
                </div>
                <button
                  onClick={() => setShowIframe(p => !p)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
                >
                  {showIframe ? 'Close Console' : 'Open Console'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 14, padding: '16px 24px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#eab308' }}>Admin Console</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4 }}>
                  Admin console runs locally (port 5173) and is only accessible when running on your machine.
                  Start it with <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>npm run dev</code> inside the <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>admin-console</code> folder.
                </div>
              </div>
            )}

            {showIframe && IS_LOCAL && (
              <iframe
                src={ADMIN_URL}
                title="AI Agent Admin Console"
                style={{ width: '100%', height: 600, border: '1px solid var(--bdr)', borderRadius: 14 }}
                allow="microphone"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
