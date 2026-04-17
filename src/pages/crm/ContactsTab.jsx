import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ExternalLink, Zap } from 'lucide-react';
import api from '../../services/api';

const BASE = api.defaults?.baseURL?.endsWith('/api') ? '' : '/api';
const SEGMENT_COLORS = {
  VIP:        { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  enterprise: { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
  standard:   { bg: 'rgba(100,100,100,0.1)', color: '#8899aa' },
};

function SegBadge({ seg }) {
  const c = SEGMENT_COLORS[seg] || SEGMENT_COLORS.standard;
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
      {seg || 'standard'}
    </span>
  );
}

function ContactDrawer({ contact, onClose }) {
  const [profile, setProfile] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get(`${BASE}/crm/contacts/${encodeURIComponent(contact.email)}`)
      .then(d => setProfile(d))
      .catch(() => {});
  }, [contact.email]);

  const handleSync = async () => {
    setSyncing(true);
    await api.get(`${BASE}/zoho/contacts/lookup?email=${encodeURIComponent(contact.email)}`).catch(() => {});
    const d = await api.get(`${BASE}/crm/contacts/${encodeURIComponent(contact.email)}`).catch(() => null);
    if (d) setProfile(d);
    setSyncing(false);
  };

  const handleCreate = async () => {
    await api.post(`${BASE}/zoho/contacts`, { name: contact.name, email: contact.email, phone: contact.phone, company: contact.company }).catch(() => {});
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, height: '100vh', background: '#0e1419', borderLeft: '1px solid #1e2d3d', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8f0f8' }}>{contact.name || '—'}</div>
            <div style={{ fontSize: 11, color: '#5a7a9a', marginTop: 2 }}>{contact.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSync} style={{ flex: 1, padding: '6px 0', fontSize: 11, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Zap size={12} /> {syncing ? 'Syncing…' : 'Sync Zoho'}
          </button>
          {!contact.zoho_contact_id && (
            <button onClick={handleCreate} style={{ flex: 1, padding: '6px 0', fontSize: 11, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', borderRadius: 8, cursor: 'pointer' }}>
              Create in Zoho
            </button>
          )}
        </div>

        {[['Email', contact.email], ['Phone', contact.phone || '—'], ['Company', contact.company || '—'], ['Segment', contact.segment || 'standard'], ['Zoho ID', contact.zoho_contact_id || 'Not synced'], ['Since', contact.created_at ? new Date(contact.created_at).toLocaleDateString() : '—']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e2d3d', paddingBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#5a7a9a' }}>{k}</span>
            <span style={{ fontSize: 11, color: '#e8f0f8', maxWidth: 220, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
          </div>
        ))}

        {profile?.sessions?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Call History</div>
            {profile.sessions.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #141c24' }}>
                <span style={{ fontSize: 11, color: '#8899aa' }}>{s.department} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</span>
                <span style={{ fontSize: 10, color: s.status === 'completed' || s.status === 'ended' ? '#22c55e' : '#f87171' }}>{s.status}</span>
              </div>
            ))}
          </div>
        )}

        {profile?.tickets?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Tickets</div>
            {profile.tickets.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #141c24' }}>
                <span style={{ fontSize: 11, color: '#e8f0f8', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                <span style={{ fontSize: 10, color: t.status === 'open' ? '#22c55e' : '#8899aa' }}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 200 });
    if (segment) params.set('segment', segment);
    const data = await api.get(`${BASE}/crm/contacts?${params}`).catch(() => []);
    setContacts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [segment]);

  useEffect(() => { load(); }, [load]);

  const filtered = contacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f0f8' }}>CRM Contacts</div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>{filtered.length} contacts</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#5a7a9a' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px 6px 28px', color: '#e8f0f8', fontSize: 11, width: 160, outline: 'none' }} />
          </div>
          <select value={segment} onChange={e => setSegment(e.target.value)}
            style={{ background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: 8, padding: '6px 10px', color: '#e8f0f8', fontSize: 11, outline: 'none' }}>
            <option value="">All Segments</option>
            <option value="standard">Standard</option>
            <option value="VIP">VIP</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {loading ? <div style={{ fontSize: 11, color: '#5a7a9a' }}>Loading…</div> : filtered.length === 0 ? (
        <div style={{ fontSize: 11, color: '#5a7a9a', textAlign: 'center', padding: '40px 0' }}>No contacts found</div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Name', 'Email', 'Phone', 'Company', 'Segment', 'Zoho', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 9, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => setSelected(c)}>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#e8f0f8', fontWeight: 500 }}>{c.name || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#8899aa' }}>{c.email}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#8899aa' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#8899aa' }}>{c.company || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><SegBadge seg={c.segment} /></td>
                  <td style={{ padding: '10px 14px' }}>
                    {c.zoho_contact_id
                      ? <span style={{ fontSize: 10, color: '#22c55e' }}>✓ Synced</span>
                      : <span style={{ fontSize: 10, color: '#5a7a9a' }}>Not synced</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); setSelected(c); }} style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '3px 9px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={10} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ContactDrawer contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
