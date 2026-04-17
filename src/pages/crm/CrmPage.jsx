import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Ticket, Mail, ArrowLeft } from 'lucide-react';
import ContactsTab from './ContactsTab';
import TicketsTab from './TicketsTab';
import EmailsTab from './EmailsTab';

const TABS = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'tickets',  label: 'Tickets',  icon: Ticket },
  { id: 'emails',   label: 'Emails',   icon: Mail },
];

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState('contacts');
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080c10', color: '#e8f0f8', fontFamily: 'inherit' }}>

      {/* ── Left nav ── */}
      <aside style={{ width: 200, minWidth: 200, background: '#080c10', borderRight: '1px solid #141c24', display: 'flex', flexDirection: 'column', padding: '20px 12px' }}>

        <button onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: 12, marginBottom: 24, padding: '6px 0' }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontSize: 10, fontWeight: 800, color: '#2d3748', letterSpacing: '0.15em', marginBottom: 12, padding: '0 12px' }}>CRM</div>

        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 4, background: active ? 'rgba(99,102,241,0.1)' : 'transparent', color: active ? '#818cf8' : '#5a7a9a' }}>
              <Icon size={15} style={{ color: active ? '#818cf8' : '#5a7a9a' }} />
              {label}
            </button>
          );
        })}

        <div style={{ marginTop: 'auto', padding: '16px 12px 0', borderTop: '1px solid #141c24' }}>
          <div style={{ fontSize: 9, color: '#2d3748', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Powered by</div>
          <div style={{ fontSize: 11, color: '#5a7a9a', marginTop: 4 }}>Zoho CRM · Desk · Mail</div>
        </div>
      </aside>

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e8f0f8', margin: 0 }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h1>
          <p style={{ fontSize: 11, color: '#5a7a9a', marginTop: 4 }}>
            {activeTab === 'contacts' && 'All CRM contacts synced with Zoho CRM'}
            {activeTab === 'tickets'  && 'Support tickets from Zoho Desk'}
            {activeTab === 'emails'   && 'Email threads via Zoho Mail'}
          </p>
        </div>

        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'tickets'  && <TicketsTab />}
        {activeTab === 'emails'   && <EmailsTab />}
      </main>
    </div>
  );
}
