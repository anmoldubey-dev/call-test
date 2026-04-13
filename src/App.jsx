import { useState, useRef, useEffect } from 'react'
import './App.css'

const BACKEND = (import.meta.env.VITE_BACKEND_URL || 'https://anteriorly-digestional-laquita.ngrok-free.dev').replace(/\/$/, '')
const WS      = BACKEND.replace(/^https/, 'wss').replace(/^http/, 'ws')
const HEADERS  = { 'ngrok-skip-browser-warning': '1' }

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

const LANG_LABELS = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', pa: 'Punjabi',
  'en-in': 'English (Indian)', ar: 'Arabic', fr: 'French', de: 'German',
  es: 'Spanish', ru: 'Russian', zh: 'Chinese', ne: 'Nepali',
  or: 'Odia', as: 'Assamese', ur: 'Urdu', it: 'Italian', nl: 'Dutch', pt: 'Portuguese', pl: 'Polish',
}

export default function App() {
  const [voices,  setVoices]  = useState({})
  const [lang,    setLang]    = useState('en')
  const [voice,   setVoice]   = useState('')
  const [llm,     setLlm]     = useState('gemini')
  const [status,  setStatus]  = useState('idle')   // idle | connecting | active
  const [msgs,    setMsgs]    = useState([])
  const [agent,   setAgent]   = useState('Agent')
  const [error,   setError]   = useState('')

  const wsRef     = useRef(null)
  const ctxRef    = useRef(null)
  const procRef   = useRef(null)
  const streamRef = useRef(null)
  const chatRef   = useRef(null)
  const playingRef = useRef(false)
  const bgRef     = useRef(null)

  // Load voices
  useEffect(() => {
    fetch(`${BACKEND}/api/voices`, { headers: HEADERS })
      .then(r => r.json())
      .then(d => { setVoices(d); setVoice(d['en']?.[0]?.name || '') })
      .catch(() => setError('Cannot reach backend. Check ngrok is running.'))
  }, [])

  // Reset voice on lang change
  useEffect(() => { setVoice(voices[lang]?.[0]?.name || '') }, [lang])

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
  }, [msgs])

  const push = (role, text) =>
    setMsgs(m => [...m, { role, text, id: crypto.randomUUID() }])

  async function startCall() {
    setError('')
    setMsgs([])
    setStatus('connecting')

    const audioCtx = new AudioContext()
    ctxRef.current = audioCtx

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
      sock.send(JSON.stringify({ lang, llm, voice, phone: 'web-test' }))

      // Loop bg room audio through AudioContext (bypasses autoplay block)
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
      // ignore ping
    }

    sock.onclose = () => cleanup()
    sock.onerror = () => { setError('WebSocket error. Is ngrok running?'); cleanup() }
  }

  function cleanup() {
    try { procRef.current?.disconnect() } catch {}
    procRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    try { ctxRef.current?.close() } catch {}
    ctxRef.current = null
    try { bgRef.current?.stop() } catch {} bgRef.current = null
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

  const voiceList = voices[lang] || []
  const isIdle    = status === 'idle'

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-icon">🎙</span>
          <span className="brand-name">VoiceAI</span>
          <span className="brand-sub">Call Test</span>
        </div>
        <div className="status-pill" data-status={status}>
          <span className="dot" />
          {status === 'idle' ? 'Ready' : status === 'connecting' ? 'Connecting…' : `Live · ${agent}`}
        </div>
      </header>

      <div className="body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside>
          <p className="aside-title">Call Settings</p>

          <label className="field">
            <span>Language</span>
            <select value={lang} onChange={e => setLang(e.target.value)} disabled={!isIdle}>
              {Object.keys(voices).map(l => (
                <option key={l} value={l}>{LANG_LABELS[l] || l.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Voice</span>
            <select value={voice} onChange={e => setVoice(e.target.value)} disabled={!isIdle}>
              {voiceList.map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>LLM</span>
            <select value={llm} onChange={e => setLlm(e.target.value)} disabled={!isIdle}>
              <option value="gemini">Gemini (Cloud)</option>
              <option value="qwen">Qwen (Local GPU)</option>
            </select>
          </label>

          <div className="divider" />

          <div className="btn-group">
            {isIdle ? (
              <button className="btn btn-call" onClick={startCall}>
                <span>📞</span> Start Call
              </button>
            ) : (
              <>
                <button className="btn btn-end" onClick={endCall}>
                  <span>📵</span> End Call
                </button>
                <button className="btn btn-int" onClick={interrupt}
                  title="Interrupt AI while it's speaking">
                  <span>✋</span> Interrupt
                </button>
              </>
            )}
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="info-box">
            <p className="info-title">How it works</p>
            <p>Your mic streams live to the AI. Speak naturally — it listens, thinks, and replies in your chosen language.</p>
          </div>
        </aside>

        {/* ── Chat ────────────────────────────────────── */}
        <section className="chat" ref={chatRef}>
          {msgs.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>Your conversation will appear here</p>
              <p className="chat-empty-sub">Select a language and voice, then start a call</p>
            </div>
          ) : (
            msgs.map(m => (
              <div key={m.id} className={`bubble bubble-${m.role}`}>
                <span className="bubble-sender">{m.role === 'user' ? 'You' : agent}</span>
                <div className="bubble-text">{m.text}</div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
