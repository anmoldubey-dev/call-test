import { useState, useRef, useEffect } from 'react'
import './App.css'

const BACKEND = (import.meta.env.VITE_BACKEND_URL || 'https://anteriorly-digestional-laquita.ngrok-free.dev').replace(/\/$/, '')
const WS      = BACKEND.replace(/^https/, 'wss').replace(/^http/, 'ws')
const HEADERS  = { 'ngrok-skip-browser-warning': '1' }

// ── Audio helpers ──────────────────────────────────────────────

function downsample(buf, from, to) {
  if (from === to) return buf
  const ratio = from / to
  const out   = new Float32Array(Math.round(buf.length / ratio))
  for (let i = 0; i < out.length; i++) out[i] = buf[Math.floor(i * ratio)]
  return out
}

async function playWav(b64, ctx) {
  if (!b64 || !ctx || ctx.state === 'closed') return
  try {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const decoded = await ctx.decodeAudioData(arr.buffer)
    const src = ctx.createBufferSource()
    src.buffer = decoded
    src.connect(ctx.destination)
    src.start()
    await new Promise(r => { src.onended = r })
  } catch (e) { console.warn('[Audio]', e) }
}

async function playWavBlob(blob, ctx) {
  if (!blob || !ctx || ctx.state === 'closed') return
  try {
    const buf     = await blob.arrayBuffer()
    const decoded = await ctx.decodeAudioData(buf)
    const src     = ctx.createBufferSource()
    src.buffer    = decoded
    src.connect(ctx.destination)
    src.start()
    await new Promise(r => { src.onended = r })
  } catch (e) { console.warn('[Audio blob]', e) }
}

// ── Language labels ────────────────────────────────────────────
const LANG_LABELS = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', pa: 'Punjabi',
  'en-in': 'English (Indian)', ar: 'Arabic', fr: 'French', de: 'German',
  es: 'Spanish', ru: 'Russian', zh: 'Chinese', ne: 'Nepali',
  or: 'Odia', as: 'Assamese', ur: 'Urdu', it: 'Italian', nl: 'Dutch', pt: 'Portuguese', pl: 'Polish',
}

// ── IVR Routing Step ───────────────────────────────────────────
// Shows routing screen before the actual call:
// 1. Plays IVR greeting
// 2. Listens to user (browser Web Speech API)
// 3. Calls /ivr/classify → gets lang + voice + LLM
// 4. Triggers startCall with routing params

function IvrStep({ lang, onRouted, onSkip, audioCtxRef }) {
  const [phase, setPhase]     = useState('idle')   // idle|greeting|listening|classifying|done
  const [transcript, setTx]   = useState('')
  const [routing, setRouting] = useState(null)
  const [error, setError]     = useState('')
  const recogRef = useRef(null)

  const playGreeting = async () => {
    setPhase('greeting')
    setError('')
    try {
      // Ensure AudioContext is running
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
      const res = await fetch(`${BACKEND}/ivr/greeting?lang=${lang}`, { headers: HEADERS })
      if (res.ok) {
        const blob = await res.blob()
        await playWavBlob(blob, audioCtxRef.current)
      }
    } catch (e) {
      console.warn('[IVR] greeting failed:', e)
    }
    startListening()
  }

  const startListening = () => {
    setPhase('listening')
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      // No Web Speech API — auto-classify with just lang hint
      classify('(no transcript — browser speech API unavailable)')
      return
    }
    const r = new SR()
    r.lang = lang
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = e => {
      const text = e.results[0][0].transcript
      setTx(text)
      classify(text)
    }
    r.onerror = () => classify('(speech recognition error)')
    r.onend   = () => { if (phase === 'listening') classify(transcript || '(no speech)') }
    recogRef.current = r
    r.start()
    // Auto-timeout after 8 seconds
    setTimeout(() => {
      try { r.stop() } catch {}
    }, 8000)
  }

  const classify = async (text) => {
    setPhase('classifying')
    try {
      const res = await fetch(`${BACKEND}/ivr/classify`, {
        method:  'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript: text, hint_lang: lang, session_id: crypto.randomUUID() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRouting(data)
      setPhase('done')
      // Proceed to call after 1.5s
      setTimeout(() => onRouted(data), 1500)
    } catch (e) {
      setError(`Routing failed: ${e.message}. Using manual settings.`)
      setTimeout(() => onSkip(), 2000)
    }
  }

  return (
    <div className="ivr-panel">
      <div className="ivr-title">🎙 AI Routing</div>

      {phase === 'idle' && (
        <>
          <p className="ivr-desc">
            Our IVR will detect your language and connect you to the right AI agent automatically.
          </p>
          <button className="btn btn-ivr" onClick={playGreeting}>
            Start IVR Flow
          </button>
          <button className="btn btn-skip" onClick={onSkip}>
            Skip → Manual Settings
          </button>
        </>
      )}

      {phase === 'greeting' && (
        <div className="ivr-status">
          <div className="pulse-dot" />
          Playing greeting…
        </div>
      )}

      {phase === 'listening' && (
        <div className="ivr-status listening">
          <div className="pulse-dot red" />
          Listening… speak your issue
          {transcript && <div className="ivr-tx">{transcript}</div>}
        </div>
      )}

      {phase === 'classifying' && (
        <div className="ivr-status">
          <div className="pulse-dot orange" />
          Analyzing &amp; routing…
          {transcript && <div className="ivr-tx">"{transcript}"</div>}
        </div>
      )}

      {phase === 'done' && routing && (
        <div className="ivr-result">
          <div className="ivr-result-title">✅ Routed</div>
          <div className="ivr-result-row"><span>Language</span><strong>{LANG_LABELS[routing.lang] ?? routing.lang}</strong></div>
          <div className="ivr-result-row"><span>Department</span><strong>{routing.department}</strong></div>
          <div className="ivr-result-row"><span>AI Agent</span><strong>{routing.voice || routing.lang}</strong></div>
          <div className="ivr-result-row"><span>LLM</span><strong>{routing.llm}</strong></div>
          <div className="ivr-result-row"><span>Rule</span><strong>{routing.rule_name}</strong></div>
          <div className="ivr-connecting">Connecting to AI agent…</div>
        </div>
      )}

      {error && <div className="ivr-error">{error}</div>}
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const [voices,   setVoices]   = useState({})
  const [lang,     setLang]     = useState('en')
  const [voice,    setVoice]    = useState('')
  const [llm,      setLlm]      = useState('ollama')
  const [status,   setStatus]   = useState('idle')    // idle|email|ivr|connecting|active|queued
  const [msgs,     setMsgs]     = useState([])
  const [agent,    setAgent]    = useState('Agent')
  const [error,    setError]    = useState('')
  const [routing,  setRouting]  = useState(null)
  const [email,    setEmail]    = useState('')
  const [emailErr, setEmailErr] = useState('')

  const wsRef      = useRef(null)
  const ctxRef     = useRef(null)
  const procRef    = useRef(null)
  const streamRef  = useRef(null)
  const chatRef    = useRef(null)
  const playingRef = useRef(false)
  const bgRef      = useRef(null)

  // Load voices
  useEffect(() => {
    fetch(`${BACKEND}/api/voices`, { headers: HEADERS })
      .then(r => r.json())
      .then(d => { setVoices(d); setVoice(d['en']?.[0]?.name || '') })
      .catch(() => setError('Cannot reach backend. Check ngrok/backend is running.'))
  }, [])

  // Reset voice on lang change
  useEffect(() => { setVoice(voices[lang]?.[0]?.name || '') }, [lang, voices])

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
  }, [msgs])

  const push = (role, text) =>
    setMsgs(m => [...m, { role, text, id: crypto.randomUUID() }])

  // ── Ensure AudioContext exists ────────────────────────────────
  const ensureCtx = () => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }

  // ── Step 1: open email capture screen ────────────────────────
  function beginFlow() {
    setError(''); setEmailErr(''); setMsgs([]); setRouting(null)
    setStatus('email')
  }

  // ── Step 2: validate email → request-call → IVR or queue ─────
  async function submitEmail() {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setEmailErr('Enter a valid email address'); return
    }
    setEmailErr('')
    ensureCtx()
    // Hit /ivr/request-call with selected lang + email
    try {
      const res = await fetch(`${BACKEND}/ivr/request-call`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, email }),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        // Slot acquired — store routed voice, go to IVR listening
        setRouting({ voice: data.voice, session_id: data.session_id, lang })
        setStatus('ivr')
      } else {
        // Queued or full — show message
        setStatus('queued')
        setRouting({ email_sent: data.email_sent, queued: data.queued })
      }
    } catch {
      setError('Backend unreachable. Check ngrok/backend.')
      setStatus('idle')
    }
  }

  // ── IVR routed → open WebSocket ──────────────────────────────
  async function onIvrRouted(routingData) {
    const merged = { ...routing, ...routingData }
    setRouting(merged)
    const resolvedLang  = merged.lang  || lang
    const resolvedVoice = merged.voice || routingData.voice || (voices[resolvedLang]?.[0]?.name || '')
    await startCall(resolvedLang, resolvedVoice, llm)
  }

  async function onIvrSkip() {
    // Direct call with already-acquired voice slot
    const resolvedVoice = routing?.voice || (voices[lang]?.[0]?.name || '')
    await startCall(lang, resolvedVoice, llm)
  }

  // ── Open WebSocket call ───────────────────────────────────────
  async function startCall(callLang, callVoice, callLlm) {
    setError('')
    setStatus('connecting')

    const audioCtx = ensureCtx()

    let mic
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    } catch {
      setStatus('idle')
      setError('Microphone access denied.')
      audioCtx.close()
      return
    }
    streamRef.current = mic

    const sock = new WebSocket(`${WS}/ws/call`)
    wsRef.current = sock

    sock.onopen = () => {
      sock.send(JSON.stringify({
        lang:  callLang  || lang,
        llm:   callLlm   || llm,
        voice: callVoice || voice,
        phone: 'web-test',
      }))

      // Background room audio
      fetch(`${BACKEND}/assets/call_centre_room.wav`, { headers: HEADERS })
        .then(r => r.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
          if (audioCtx.state === 'closed') return
          const gain = audioCtx.createGain()
          gain.gain.value = 0.18
          gain.connect(audioCtx.destination)
          const loop = () => {
            if (audioCtx.state === 'closed') return
            const src = audioCtx.createBufferSource()
            src.buffer = decoded
            src.connect(gain)
            src.onended = loop
            src.start()
            bgRef.current = src
          }
          loop()
        }).catch(() => {})

      // Mic → WebSocket
      const src       = audioCtx.createMediaStreamSource(mic)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      procRef.current = processor
      processor.onaudioprocess = e => {
        if (sock.readyState !== WebSocket.OPEN) return
        const pcm = downsample(e.inputBuffer.getChannelData(0), audioCtx.sampleRate, 16000)
        sock.send(pcm.buffer)
      }
      src.connect(processor)
      processor.connect(audioCtx.destination)
      setStatus('active')
    }

    sock.onmessage = async e => {
      if (typeof e.data !== 'string') return
      const msg = JSON.parse(e.data)
      if (msg.type === 'greeting') {
        setAgent(msg.agent_name || 'Agent')
        push('agent', msg.text)
        playingRef.current = true
        await playWav(msg.audio, audioCtx)
        playingRef.current = false
      } else if (msg.type === 'transcript') {
        push('user', msg.text)
      } else if (msg.type === 'response') {
        push('agent', msg.text)
        playingRef.current = true
        await playWav(msg.audio, audioCtx)
        playingRef.current = false
      }
    }

    sock.onclose = () => cleanup()
    sock.onerror = () => { setError('WebSocket error. Is backend running?'); cleanup() }
  }

  function cleanup() {
    try { procRef.current?.disconnect() } catch {}
    procRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    try { ctxRef.current?.close() } catch {}
    ctxRef.current = null
    try { bgRef.current?.stop() } catch {}
    bgRef.current = null
    wsRef.current = null
    playingRef.current = false
    setStatus('idle')
  }

  function endCall() {
    try { wsRef.current?.send(JSON.stringify({ type: 'end' })) } catch {}
    wsRef.current?.close()
    cleanup()
  }

  function interrupt() {
    try { wsRef.current?.send(JSON.stringify({ type: 'interrupt' })) } catch {}
  }

  const isIdle = status === 'idle'
  const isIvr  = status === 'ivr'

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-icon">🎙</span>
          <span className="brand-name">VoiceAI</span>
          <span className="brand-sub">Call Test</span>
        </div>
        <div className="status-pill" data-status={isIvr || status === 'email' ? 'connecting' : status}>
          <span className="dot" />
          {isIdle ? 'Ready'
            : status === 'email' ? 'Enter Email'
            : isIvr  ? 'IVR Routing…'
            : status === 'queued' ? 'All Agents Busy'
            : status === 'connecting' ? 'Connecting…'
            : `Live · ${agent}`}
        </div>
      </header>

      <div className="body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside>
          <p className="aside-title">Call Settings</p>

          {routing && status === 'active' && (
            <div className="routing-badge">
              <div className="routing-badge-title">🔀 Routed</div>
              {routing.voice && <div className="routing-badge-row"><span>Voice:</span><strong>{routing.voice}</strong></div>}
              {routing.rule_name && <div className="routing-badge-row"><span>Rule:</span><strong>{routing.rule_name}</strong></div>}
            </div>
          )}

          <label className="field">
            <span>Preferred Language</span>
            <select value={lang} onChange={e => setLang(e.target.value)} disabled={!isIdle}>
              {Object.keys(voices).length > 0
                ? Object.keys(voices).map(l => (
                    <option key={l} value={l}>{LANG_LABELS[l] || l.toUpperCase()}</option>
                  ))
                : <option value="en">English</option>}
            </select>
          </label>

          <div className="divider" />

          <div className="btn-group">
            {isIdle && (
              <button className="btn btn-call" onClick={beginFlow}>
                <span>📞</span> Start Call
              </button>
            )}
            {status === 'active' && (
              <>
                <button className="btn btn-end" onClick={endCall}><span>📵</span> End Call</button>
                <button className="btn btn-int" onClick={interrupt}><span>✋</span> Interrupt</button>
              </>
            )}
            {status === 'connecting' && (
              <button className="btn btn-end" onClick={() => { wsRef.current?.close(); cleanup() }}>Cancel</button>
            )}
            {status === 'queued' && (
              <button className="btn btn-skip" onClick={() => setStatus('idle')}>← Back</button>
            )}
          </div>

          {error && <p className="error-msg">{error}</p>}
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <section className="chat" ref={chatRef}>

          {/* Email capture screen */}
          {status === 'email' && (
            <div className="ivr-panel">
              <div className="ivr-title">Before We Connect</div>
              <p className="ivr-desc">Enter your email so we can reach you if all agents are busy.</p>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitEmail()}
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.9rem', width: 280, outline: 'none' }}
              />
              {emailErr && <p style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{emailErr}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ivr" onClick={submitEmail}>Continue →</button>
                <button className="btn-skip" onClick={() => setStatus('idle')}>Cancel</button>
              </div>
            </div>
          )}

          {/* Queue / all-busy screen */}
          {status === 'queued' && (
            <div className="ivr-panel">
              <div className="ivr-title" style={{ color: 'var(--amber)' }}>All Agents Busy</div>
              <p className="ivr-desc">All our AI agents are currently handling calls. Please try again shortly.</p>
              {routing?.email_sent && (
                <p style={{ color: 'var(--green)', fontSize: '0.85rem' }}>
                  ✅ A sorry-we-missed-you email has been sent to <strong>{email}</strong>
                </p>
              )}
              {routing?.queued && (
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Your request has been queued.</p>
              )}
            </div>
          )}

          {/* IVR routing overlay */}
          {isIvr && (
            <IvrStep lang={lang} onRouted={onIvrRouted} onSkip={onIvrSkip} audioCtxRef={ctxRef} />
          )}

          {/* Chat messages */}
          {!isIvr && status !== 'email' && status !== 'queued' && msgs.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>Your conversation will appear here</p>
              <p className="chat-empty-sub">Select language → Start Call → speak naturally</p>
            </div>
          )}

          {!isIvr && msgs.map(m => (
            <div key={m.id} className={`bubble bubble-${m.role}`}>
              <span className="bubble-sender">{m.role === 'user' ? 'You' : agent}</span>
              <div className="bubble-text">{m.text}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
