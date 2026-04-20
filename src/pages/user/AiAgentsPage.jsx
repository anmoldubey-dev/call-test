import { useState, useEffect } from 'react'

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_AI       = 'ai_agents_enabled'
const LS_TL       = 'translation_layer_config'

const IS_LOCAL  = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const ADMIN_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || 'http://localhost:5173'
const API_BASE  = import.meta.env.VITE_API_URL || ''

// Supported language pairs for translation
const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'mr', label: 'Marathi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'ar', label: 'Arabic' },
]

// ── Tab: AI Agents ────────────────────────────────────────────────────────────
function AiAgentsTab() {
  const [enabled,    setEnabled]    = useState(() => localStorage.getItem(LS_AI) === 'true')
  const [showIframe, setShowIframe] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/cc/admin/config/get?key=ai_agents_enabled`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.value != null) {
          const v = d.value === 'true'
          localStorage.setItem(LS_AI, String(v))
          setEnabled(v)
        }
      }).catch(() => {})
  }, [])

  const toggle = () => {
    const next = !enabled
    localStorage.setItem(LS_AI, String(next))
    setEnabled(next)
    if (!next) setShowIframe(false)
    fetch(`${API_BASE}/api/cc/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ai_agents_enabled', value: String(next) }),
    }).catch(() => {})
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Sub-header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt2)' }}>
          {enabled
            ? 'AI agents are active — handling overflow calls when humans are busy.'
            : 'Enable AI agents to handle calls when all human agents are busy.'}
        </p>
        <button
          onClick={toggle}
          style={{ padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.2s', background: enabled ? 'rgba(34,197,94,0.15)' : 'var(--pur)', color: enabled ? 'var(--grn)' : '#fff', border: enabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent' }}
        >
          {enabled ? '✓ AI Agents Enabled' : '⚡ Enable AI Agents'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {!enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 360, gap: 16, color: 'var(--txt2)' }}>
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
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--grn)', boxShadow: '0 0 8px var(--grn)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>AI Agents Active</div>
                <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 3 }}>
                  Overflow calls routed to AI when all human agents are busy. Language auto-detected via IVR.
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>How it works</div>
              {[
                ['1', 'User clicks "Call Agent Now"',  'Backend rings available human agents in the selected department'],
                ['2', 'No agents available',            'If all human agents are busy or offline, caller waits up to 20 seconds'],
                ['3', 'AI takes over',                  'IVR plays a greeting, detects caller language via speech, routes to matching AI voice'],
                ['4', 'AI handles the call',            'LiveKit AI agent joins the room and converses with the caller'],
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

            {IS_LOCAL ? (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Admin Console</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 3 }}>Configure AI agents, voices, routing rules</div>
                </div>
                <button onClick={() => setShowIframe(p => !p)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  {showIframe ? 'Close Console' : 'Open Console'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 14, padding: '16px 24px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#eab308' }}>Admin Console</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4 }}>
                  Admin console runs locally (port 5173) and is only accessible when running on your machine. Start it with <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>npm run dev</code> inside the <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>admin-console</code> folder.
                </div>
              </div>
            )}

            {showIframe && IS_LOCAL && (
              <iframe src={ADMIN_URL} title="AI Agent Admin Console" style={{ width: '100%', height: 600, border: '1px solid var(--bdr)', borderRadius: 14 }} allow="microphone" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Translation Layer ────────────────────────────────────────────────────
function TranslationTab() {
  const defaultCfg = { enabled: false, from_lang: 'en', to_lang: 'hi', voice_gender: 'female' }
  const [cfg, setCfg] = useState(() => {
    try { return { ...defaultCfg, ...JSON.parse(localStorage.getItem(LS_TL) || '{}') } }
    catch { return defaultCfg }
  })
  const [saved, setSaved] = useState(false)

  const update = (key, value) => setCfg(prev => ({ ...prev, [key]: value }))

  const save = () => {
    const next = { ...cfg }
    // Prevent same-language no-op
    if (next.from_lang === next.to_lang) next.enabled = false
    localStorage.setItem(LS_TL, JSON.stringify(next))
    setCfg(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fromLabel = LANG_OPTIONS.find(l => l.code === cfg.from_lang)?.label || cfg.from_lang
  const toLabel   = LANG_OPTIONS.find(l => l.code === cfg.to_lang)?.label   || cfg.to_lang
  const samelang  = cfg.from_lang === cfg.to_lang

  const sel = (val, onChange) => (
    <select
      value={val}
      onChange={e => onChange(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 160 }}
    >
      {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>

      {/* Enable toggle */}
      <div style={{ background: 'var(--bg2)', border: `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.3)' : 'var(--bdr)'}`, borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Translation Layer</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 4 }}>
              When enabled, all call audio is silently translated — neither side hears the other's raw voice.
            </div>
          </div>
          <button
            onClick={() => update('enabled', !cfg.enabled)}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.2s', background: cfg.enabled ? 'rgba(34,197,94,0.15)' : 'var(--pur)', color: cfg.enabled ? 'var(--grn)' : '#fff', border: cfg.enabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent' }}
          >
            {cfg.enabled ? '✓ Enabled' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Language pair */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Language Pair</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your language (you speak)</div>
            {sel(cfg.from_lang, v => update('from_lang', v))}
          </div>

          <div style={{ fontSize: 22, color: 'var(--txt2)', paddingTop: 18 }}>⇄</div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Agent language (they speak)</div>
            {sel(cfg.to_lang, v => update('to_lang', v))}
          </div>
        </div>

        {samelang && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, fontSize: 12, color: '#eab308' }}>
            Both languages are the same — translation layer will be inactive even if enabled.
          </div>
        )}

        {!samelang && cfg.enabled && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--grn)' }}>
            You speak <strong>{fromLabel}</strong> → AI thinks in <strong>{toLabel}</strong> → you hear <strong>{fromLabel}</strong>
          </div>
        )}
      </div>

      {/* Voice gender */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Agent Voice Gender</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>
          Selects the Parler TTS / Indic TTS voice used to speak the translated agent response back to you.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {['female', 'male'].map(g => (
            <button
              key={g}
              onClick={() => update('voice_gender', g)}
              style={{
                padding: '10px 24px', borderRadius: 10, border: '1px solid', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.18s',
                background: cfg.voice_gender === g ? 'var(--purl)' : 'transparent',
                color:      cfg.voice_gender === g ? 'var(--pur2)' : 'var(--txt2)',
                borderColor: cfg.voice_gender === g ? 'var(--bdr2)' : 'var(--bdr)',
              }}
            >
              {g === 'female' ? '♀ Female' : '♂ Male'}
            </button>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>How the Translation Layer Works</div>
        {[
          ['1', 'You speak',          `Your mic is captured and transcribed in ${fromLabel}`],
          ['2', 'Translate → agent',  `Translated to ${toLabel} — the agent hears your voice in their language`],
          ['3', 'Agent responds',     `The human agent speaks in ${toLabel}`],
          ['4', 'Translate → you',    `Agent speech is translated back to ${fromLabel}`],
          ['5', 'You hear',           `Translated response is played in ${fromLabel} — you never hear the raw ${toLabel}`],
        ].map(([n, title, desc]) => (
          <div key={n} style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(124,58,237,0.12)', color: 'var(--pur2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, border: '1px solid var(--bdr2)' }}>{n}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={save}
          style={{ padding: '11px 28px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--pur)', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', transition: 'all 0.2s' }}
        >
          Save Settings
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--grn)', fontWeight: 600 }}>✓ Saved — takes effect on next call</span>}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AiAgentsPage() {
  const [tab, setTab] = useState('agents')

  const TABS = [
    { id: 'agents',      label: '🤖 AI Agents' },
    { id: 'translation', label: '🌐 Translation Layer' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Page header */}
      <div style={{ padding: '18px 28px 0', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 700 }}>AI Agents</h2>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 18px', borderRadius: '8px 8px 0 0',
                border: '1px solid', borderBottom: 'none',
                cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                transition: 'all 0.15s',
                background:   tab === t.id ? 'var(--bg)'   : 'var(--bg2)',
                color:        tab === t.id ? 'var(--pur2)' : 'var(--txt2)',
                borderColor:  tab === t.id ? 'var(--bdr2)' : 'transparent',
                position: 'relative', bottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'agents'      && <AiAgentsTab />}
        {tab === 'translation' && <TranslationTab />}
      </div>
    </div>
  )
}
