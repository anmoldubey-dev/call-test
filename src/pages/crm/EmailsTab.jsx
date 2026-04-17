import { useState, useEffect } from 'react';
import { Search, Send, X, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const BASE = api.defaults?.baseURL?.endsWith('/api') ? '' : '/api';

function ComposeModal({ onClose, defaultTo = '', threadId = null }) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    const payload = { to, subject, body };
    if (threadId) payload.thread_id = threadId;
    await api.post(`${BASE}/zoho/mail/send`, payload).catch(() => {});
    setSending(false);
    setSent(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8f0f8' }}>{threadId ? 'Reply' : 'Compose Email'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {[['To', to, setTo, 'recipient@example.com'], ['Subject', subject, setSubject, 'Subject…']].map(([label, val, setter, ph]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#5a7a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
            <input value={val} onChange={e => setter(e.target.value)} placeholder={ph}
              style={{ width: '100%', background: '#080c10', border: '1px solid #1e2d3d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e8f0f8', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}

        <div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Message</div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Write your message…"
            style={{ width: '100%', background: '#080c10', border: '1px solid #1e2d3d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e8f0f8', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>

        <button onClick={handleSend} disabled={sending || sent}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', background: sent ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)', border: `1px solid ${sent ? '#22c55e' : '#6366f1'}`, borderRadius: 8, color: sent ? '#22c55e' : '#818cf8', fontSize: 12, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>
          <Send size={13} /> {sent ? 'Sent!' : sending ? 'Sending…' : 'Send Email'}
        </button>
      </div>
    </div>
  );
}

export default function EmailsTab() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [compose, setCompose] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  const load = async (email = '') => {
    setLoading(true);
    const params = email ? `?contact_email=${encodeURIComponent(email)}` : '';
    const data = await api.get(`${BASE}/zoho/mail/threads${params}`).catch(() => []);
    setThreads(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (e) => {
    if (e.key === 'Enter') load(search.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f0f8' }}>Email Threads</div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>via Zoho Mail</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#5a7a9a' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearch}
              placeholder="Search by email…"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px 6px 28px', color: '#e8f0f8', fontSize: 11, width: 180, outline: 'none' }} />
          </div>
          <button onClick={() => load(search)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <RefreshCw size={11} />
          </button>
          <button onClick={() => setCompose(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Send size={12} /> Compose
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
        {/* Thread list */}
        <div style={{ width: 280, flexShrink: 0, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 11, color: '#5a7a9a' }}>Loading…</div>
          ) : threads.length === 0 ? (
            <div style={{ padding: 20, fontSize: 11, color: '#5a7a9a', textAlign: 'center' }}>
              No email threads.<br />
              <span style={{ fontSize: 10 }}>Search a contact email above.</span>
            </div>
          ) : threads.map((t, i) => (
            <div key={i} onClick={() => setSelected(t)}
              style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected?.thread_id === t.thread_id ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
              <div style={{ fontSize: 12, color: '#e8f0f8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || '(no subject)'}</div>
              <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>{t.from_address}</div>
              <div style={{ fontSize: 9, color: '#2d3748', marginTop: 2 }}>{t.date ? new Date(t.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
            </div>
          ))}
        </div>

        {/* Thread body */}
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 20 }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: '#5a7a9a' }}>
              Select a thread to view
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e8f0f8' }}>{selected.subject}</div>
                  <div style={{ fontSize: 11, color: '#5a7a9a', marginTop: 4 }}>From: {selected.from_address}</div>
                  <div style={{ fontSize: 10, color: '#2d3748', marginTop: 2 }}>{selected.date ? new Date(selected.date).toLocaleString() : ''}</div>
                </div>
                <button onClick={() => setReplyTo(selected)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
                  <Send size={11} /> Reply
                </button>
              </div>
              <div style={{ borderTop: '1px solid #1e2d3d', paddingTop: 16, fontSize: 13, color: '#c4cdd8', lineHeight: 1.7 }}>
                {selected.snippet || 'No preview available. Open in Zoho Mail to view the full thread.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {compose && <ComposeModal onClose={() => setCompose(false)} />}
      {replyTo && (
        <ComposeModal
          onClose={() => setReplyTo(null)}
          defaultTo={replyTo.from_address}
          threadId={replyTo.thread_id}
        />
      )}
    </div>
  );
}
