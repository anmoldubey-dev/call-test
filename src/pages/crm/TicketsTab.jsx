import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';

const BASE = api.defaults?.baseURL?.endsWith('/api') ? '' : '/api';

const STATUS_STYLE = {
  open:     { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  closed:   { bg: 'rgba(100,100,100,0.1)', color: '#8899aa' },
  resolved: { bg: 'rgba(100,100,100,0.1)', color: '#8899aa' },
  on_hold:  { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
  pending:  { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
};

const PRIORITY_STYLE = {
  urgent: { color: '#f87171' },
  high:   { color: '#f97316' },
  medium: { color: '#eab308' },
  low:    { color: '#8899aa' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.open;
  return <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{status}</span>;
}

function NoteRow({ note }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #141c24' }}>
      <span style={{ fontSize: 10, color: '#818cf8', minWidth: 80 }}>{note.agent_id}</span>
      <span style={{ fontSize: 11, color: '#c4cdd8', flex: 1 }}>{note.note_text}</span>
      <span style={{ fontSize: 9, color: '#5a7a9a', whiteSpace: 'nowrap' }}>{note.created_at ? new Date(note.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
    </div>
  );
}

function TicketRow({ ticket }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = async () => {
    if (notes !== null) return;
    const data = await api.get(`${BASE}/crm/tickets/${ticket.id}/notes`).catch(() => []);
    setNotes(Array.isArray(data) ? data : []);
  };

  const toggle = () => { setOpen(o => !o); if (!open) loadNotes(); };

  const saveNote = async (e) => {
    if (e.key !== 'Enter' || !noteText.trim() || saving) return;
    setSaving(true);
    const n = await api.post(`${BASE}/crm/tickets/${ticket.id}/notes`, { note_text: noteText.trim() }).catch(() => null);
    if (n) { setNotes(prev => [...(prev || []), n]); setNoteText(''); }
    if (ticket.zoho_ticket_id) {
      await api.post(`${BASE}/zoho/desk/tickets/${ticket.zoho_ticket_id}/notes`, { note_text: noteText.trim(), agent_id: 'agent' }).catch(() => {});
    }
    setSaving(false);
  };

  const pr = PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium;

  return (
    <>
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={toggle}>
        <td style={{ padding: '10px 14px' }}>
          <button style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', padding: 0 }}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </td>
        <td style={{ padding: '10px 14px', fontSize: 11, color: '#e8f0f8', maxWidth: 260 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject || '—'}</div>
          {ticket.zoho_ticket_id && <div style={{ fontSize: 9, color: '#5a7a9a', fontFamily: 'monospace' }}>#{ticket.zoho_ticket_id}</div>}
        </td>
        <td style={{ padding: '10px 14px', fontSize: 11, color: '#8899aa' }}>{ticket.contact_email}</td>
        <td style={{ padding: '10px 14px' }}><StatusBadge status={ticket.status} /></td>
        <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: pr.color }}>{ticket.priority}</td>
        <td style={{ padding: '10px 14px', fontSize: 10, color: '#5a7a9a' }}>
          {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: '0 14px 14px 36px', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ borderLeft: '2px solid #1e2d3d', paddingLeft: 12, paddingTop: 8 }}>
              {notes === null ? (
                <div style={{ fontSize: 11, color: '#5a7a9a' }}>Loading notes…</div>
              ) : notes.length === 0 ? (
                <div style={{ fontSize: 11, color: '#5a7a9a', marginBottom: 8 }}>No notes yet.</div>
              ) : (
                <div style={{ marginBottom: 10 }}>{notes.map((n, i) => <NoteRow key={i} note={n} />)}</div>
              )}
              <input
                value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={saveNote}
                placeholder={saving ? 'Saving…' : 'Add a note… (Enter to save)'}
                style={{ width: '100%', background: '#080c10', border: '1px solid #1e2d3d', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#e8f0f8', outline: 'none' }}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function TicketsTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 200 });
    if (filterStatus)   params.set('status', filterStatus);
    if (filterPriority) params.set('priority', filterPriority);
    const data = await api.get(`${BASE}/crm/tickets?${params}`).catch(() => []);
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterStatus, filterPriority]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f0f8' }}>Support Tickets</div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>{tickets.length} tickets</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['filterStatus', filterStatus, setFilterStatus, [['', 'All Status'], ['open', 'Open'], ['closed', 'Closed'], ['on_hold', 'On Hold'], ['pending', 'Pending']]],
            ['filterPriority', filterPriority, setFilterPriority, [['', 'All Priority'], ['urgent', 'Urgent'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]]
          ].map(([key, val, setter, opts]) => (
            <select key={key} value={val} onChange={e => setter(e.target.value)}
              style={{ background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: 8, padding: '6px 10px', color: '#e8f0f8', fontSize: 11, outline: 'none' }}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {loading ? <div style={{ fontSize: 11, color: '#5a7a9a' }}>Loading…</div> : tickets.length === 0 ? (
        <div style={{ fontSize: 11, color: '#5a7a9a', textAlign: 'center', padding: '40px 0' }}>No tickets found</div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['', 'Subject', 'Contact', 'Status', 'Priority', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 9, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
