import { useState, useEffect, useCallback, useRef } from 'react';

// Same pattern as api.js — empty VITE_API_URL becomes relative /api/...
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '') + '/api';
const POLL_INTERVAL = 4000;

export function useActiveCalls() {
  const [activeCalls,  setActiveCalls]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedCall, setSelectedCall] = useState(null);
  const pollRef = useRef(null);

  const fetchAll = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`${API_BASE}/calls/active`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveCalls(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message ?? 'Backend unavailable');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(() => fetchAll(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchAll]);

  // ── Actions ───────────────────────────────────────────────────────────────
  
  const H = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

  const handleTransfer = useCallback(async (callId, toDepartment, toAgentId) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/transfer`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ to_department: toDepartment, to_agent_id: toAgentId })
      });
      const updated = await res.json();
      setActiveCalls(prev => prev.map(c => c.id === callId ? updated : c));
      return updated;
    } catch (_) {}
  }, []);

  const handleEndCall = useCallback(async (callId) => {
    try {
      await fetch(`${API_BASE}/calls/${callId}/end`, { method: 'POST', headers: H });
      setActiveCalls(prev => prev.filter(c => c.id !== callId));
      if (selectedCall?.id === callId) setSelectedCall(null);
    } catch (_) {}
  }, [selectedCall]);

  const handleTakeover = useCallback(async (callId) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/takeover`, { method: 'POST', headers: H });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch (_) {
      alert('Could not takeover call. Check backend logs.');
    }
  }, []);

  const refresh = useCallback(() => fetchAll(), [fetchAll]);

  return {
    activeCalls,
    loading,
    error,
    selectedCall,
    setSelectedCall,
    refresh,
    handleTransfer,
    handleEndCall,
    handleTakeover,
    wsConnected: true,
  };
}