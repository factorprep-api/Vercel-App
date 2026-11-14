import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, ArrowLeft, Check, Users, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabase';
import {
  fetchMessagingThreads, fetchThreadMessages, replyToThread,
  staffMessageAthlete, staffMessageMany, staffBroadcast, athleteMessageStaff,
  markThreadRead, fetchMessagingRoster, fetchMessagingStaff, countUnreadThreads
} from '../api';

// ==========================================
// MESSAGING HUB (v1.11.0) — header icon + slide-over panel.
// Staff (coach role): thread list, "New Message" (All athletes /
// multi-select / single), replies, read receipts on broadcast groups.
// Athlete: thread list with their staff, reply box, "New Message" picker.
// The unread check polls every 60s while the tab is visible — one
// RLS-scoped count query, deferred so it never competes with page load.
// ==========================================

export default function MessagingHub() {
  const { role, isLoading: authLoading } = useAuth();
  const isStaff = role === 'coach';

  const [userId, setUserId] = useState(null);
  const [available, setAvailable] = useState(true);   // false → DB not migrated
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const [threads, setThreads] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [view, setView] = useState('list');           // list | thread | compose
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // compose state
  const [composeMode, setComposeMode] = useState('all');   // all | select
  const [roster, setRoster] = useState([]);                 // staff picker
  const [staffList, setStaffList] = useState([]);           // athlete picker
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [composeError, setComposeError] = useState(null);
  const [composeSent, setComposeSent] = useState(null);

  // Unread polling — silent on transient failure; hides the icon if the
  // messaging tables aren't in the database yet.
  const refreshUnread = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const { threads: t, error } = await fetchMessagingThreads();
      if (error && /could not find|schema|does not exist/i.test(error)) {
        setAvailable(false);
        return;
      }
      if (error) return;
      setAvailable(true);
      setThreads(t);
      setUnread(countUnreadThreads(t, userId));
    } catch { /* silent */ }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setUserId(user ? user.id : null);
    })();
    return () => { cancelled = true; };
  }, [authLoading]);

  useEffect(() => {
    if (!userId) return undefined;
    const t1 = setTimeout(refreshUnread, 2500);
    const t2 = setInterval(refreshUnread, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') refreshUnread(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(t1); clearInterval(t2); document.removeEventListener('visibilitychange', onVis); };
  }, [userId, refreshUnread]);

  const openPanel = useCallback(async () => {
    setOpen(true);
    setView('list');
    setActiveThread(null);
    setListError(null);
    setListLoading(true);
    const { threads: t, error } = await fetchMessagingThreads();
    setListLoading(false);
    if (error && /could not find|schema|does not exist/i.test(error)) {
      setAvailable(false);
      setOpen(false);
      return;
    }
    if (error) { setListError(error); return; }
    setThreads(t);
    setUnread(countUnreadThreads(t, userId));
  }, [userId]);

  const openThread = useCallback(async (t) => {
    setActiveThread(t);
    setView('thread');
    setMsgLoading(true);
    const { messages: m, error } = await fetchThreadMessages(t.id);
    setMsgLoading(false);
    if (error) { setListError(error); return; }
    setMessages(m);
    markThreadRead(t.id);
    // Optimistically clear this thread's unread state in the local list.
    setThreads(prev => prev.map(x => x.id === t.id
      ? { ...x, myLastReadAt: new Date().toISOString() }
      : x));
    setUnread(u => Math.max(0, u - (t.lastMessageSenderId !== userId ? 1 : 0)));
  }, [userId]);

  const sendReply = useCallback(async () => {
    if (!replyText.trim() || sending || !activeThread) return;
    setSending(true);
    const { error } = await replyToThread(activeThread.id, replyText);
    setSending(false);
    if (error) { setListError(error); return; }
    setReplyText('');
    const { messages: m } = await fetchThreadMessages(activeThread.id);
    setMessages(m);
    refreshUnread();
  }, [replyText, sending, activeThread, refreshUnread]);

  const startCompose = useCallback(async () => {
    setView('compose');
    setComposeMode('all');
    setSelected(new Set());
    setSearch('');
    setBody('');
    setComposeError(null);
    setComposeSent(null);
    if (isStaff) {
      const { roster: r, error } = await fetchMessagingRoster();
      if (error) { setComposeError(error); return; }
      setRoster(r);
    } else {
      const { staff: s, error } = await fetchMessagingStaff();
      if (error) { setComposeError(error); return; }
      setStaffList(s);
    }
  }, [isStaff]);

  const sendCompose = useCallback(async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setComposeError(null);
    let result;
    if (isStaff) {
      if (composeMode === 'all') {
        result = await staffBroadcast(text);
      } else {
        const ids = [...selected];
        if (ids.length === 0) { setSending(false); setComposeError('Select at least one athlete.'); return; }
        result = ids.length === 1
          ? await staffMessageAthlete(ids[0], text)
          : await staffMessageMany(ids, text);
      }
    } else {
      if (selected.size !== 1) { setSending(false); setComposeError('Pick who this is going to.'); return; }
      result = await athleteMessageStaff([...selected][0], text);
    }
    setSending(false);
    if (result.error) { setComposeError(result.error); return; }
    const sentTo = (composeMode === 'all' && isStaff) ? `all ${result.sent || 0} athletes` : null;
    setComposeSent(sentTo || 'Message sent');
    setBody('');
    setSelected(new Set());
    refreshUnread();
  }, [body, sending, isStaff, composeMode, selected, refreshUnread]);

  if (authLoading || !available || !userId) return null;

  return (
    <>
      <button
        onClick={openPanel}
        aria-label={`Messages${unread ? ` (${unread} unread)` : ''}`}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          position: 'relative', padding: '6px', marginRight: '8px',
          display: 'flex', alignItems: 'center'
        }}
      >
        <MessageCircle size={24} color="white" strokeWidth={2.2} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 0,
            width: 11, height: 11, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #008ed3'
          }} />
        )}
      </button>
      {open && (
        <MessagesPanel
          isStaff={isStaff}
          userId={userId}
          view={view} setView={setView}
          threads={threads} listLoading={listLoading} listError={listError}
          activeThread={activeThread} messages={messages} msgLoading={msgLoading}
          replyText={replyText} setReplyText={setReplyText}
          sending={sending} sendReply={sendReply}
          openThread={openThread} startCompose={startCompose} onClose={() => setOpen(false)}
          composeMode={composeMode} setComposeMode={setComposeMode}
          roster={roster} staffList={staffList}
          selected={selected} setSelected={setSelected}
          search={search} setSearch={setSearch}
          body={body} setBody={setBody}
          composeError={composeError} composeSent={composeSent}
          sendCompose={sendCompose}
        />
      )}
    </>
  );
}

// ==========================================
// MessagesPanel — full-screen sheet: list / thread / compose.
// ==========================================
function MessagesPanel({
  isStaff, userId, view, setView,
  threads, listLoading, listError,
  activeThread, messages, msgLoading,
  replyText, setReplyText, sending, sendReply,
  openThread, startCompose, onClose,
  composeMode, setComposeMode, roster, staffList,
  selected, setSelected, search, setSearch,
  body, setBody, composeError, composeSent, sendCompose
}) {
  const isUnread = (t) => t.lastMessageAt && t.lastMessageSenderId !== userId
    && (!t.myLastReadAt || new Date(t.lastMessageAt).getTime() > new Date(t.myLastReadAt).getTime());

  const fmtDate = (s) => new Date(s).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // For a broadcast group: how many athletes have read the last message.
  const groupReadInfo = (t) => {
    if (!isStaff || !t.broadcastGroup) return null;
    const group = threads.filter(x => x.broadcastGroup === t.broadcastGroup);
    const read = group.filter(x => x.myLastReadAt
      && new Date(x.myLastReadAt).getTime() >= new Date(t.lastMessageAt || 0).getTime()).length;
    return { total: group.length, read };
  };

  const filteredRoster = roster.filter(r =>
    !search.trim() || r.athlete_name.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredStaff = staffList.filter(s =>
    !search.trim() || (s.staff_name || '').toLowerCase().includes(search.trim().toLowerCase()));

  const headerTitle = view === 'list' ? 'Messages'
    : view === 'thread' ? (activeThread
      ? (isStaff ? activeThread.athleteName : activeThread.staffName) || 'Messages'
      : 'Messages')
    : 'New Message';

  const onBack = () => {
    if (view === 'thread') setView('list');
    else if (view === 'compose') setView('list');
    else onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: '#f8fafc',
      display: 'flex', flexDirection: 'column', fontFamily: '"Roboto Flex", sans-serif'
    }}>
      <header style={{
        background: '#008ed3', color: 'white', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <button onClick={onBack} aria-label="Back" style={{
          background: 'transparent', border: 'none', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: '4px'
        }}>
          {view === 'list' ? <X size={24} /> : <ArrowLeft size={24} />}
        </button>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, flex: 1 }}>{headerTitle}</h2>
        {view === 'list' && (
          <button onClick={startCompose} aria-label="New message" style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
            borderRadius: '20px', padding: '6px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600
          }}>
            <Plus size={16} /> New
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {/* ---------- LIST ---------- */}
        {view === 'list' && (
          listLoading ? <p style={{ color: '#666', textAlign: 'center', marginTop: '32px' }}>Loading messages…</p>
          : listError ? <p style={{ color: '#dc2626', textAlign: 'center', marginTop: '32px' }}>{listError}</p>
          : threads.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '48px', color: '#666' }}>
              <MessageCircle size={40} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <p style={{ margin: '4px 0', fontSize: '15px' }}>No messages yet</p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}>
                {isStaff ? 'Tap New to message one of your athletes.' : 'Messages with your coach will appear here.'}
              </p>
            </div>
          ) : threads.map(t => {
            const unread = isUnread(t);
            const reads = groupReadInfo(t);
            return (
              <div key={t.id} onClick={() => openThread(t)} style={{
                background: 'white', borderRadius: '10px', padding: '12px 14px',
                marginBottom: '10px', cursor: 'pointer', border: `1px solid ${unread ? '#008ed3' : '#e2e8f0'}`,
                boxShadow: unread ? '0 2px 8px rgba(0,142,211,0.18)' : '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: isStaff ? '#0ea5e9' : '#008ed3', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '14px'
                  }}>
                    {(isStaff ? t.athleteName : t.staffName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ fontSize: '15px', color: '#333' }}>
                        {isStaff ? t.athleteName : t.staffName || 'Coach'}
                      </strong>
                      {unread && <span style={{
                        width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0
                      }} />}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                      {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {t.lastMessageAt ? fmtDate(t.lastMessageAt) : ''}
                    </div>
                    {reads && (
                      <div style={{ fontSize: '12px', color: reads.read === reads.total ? '#16a34a' : '#f59e0b', marginTop: '2px' }}>
                        Read by {reads.read}/{reads.total} athletes
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* ---------- THREAD ---------- */}
        {view === 'thread' && activeThread && (
          msgLoading ? <p style={{ color: '#666', textAlign: 'center', marginTop: '32px' }}>Loading…</p>
          : (
            <>
              {messages.map(m => {
                const mine = m.sender_id === userId;
                return (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start',
                    marginBottom: '10px'
                  }}>
                    <div style={{
                      maxWidth: '78%', padding: '10px 14px', borderRadius: '14px',
                      background: mine ? '#008ed3' : 'white',
                      color: mine ? 'white' : '#333',
                      border: mine ? 'none' : '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                    }}>
                      <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '4px', textAlign: 'right' }}>
                        {fmtDate(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>No messages yet.</p>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <input
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                  placeholder="Type a reply…"
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '20px',
                    border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none',
                    background: 'white'
                  }}
                />
                <button onClick={sendReply} disabled={sending || !replyText.trim()} aria-label="Send reply" style={{
                  background: '#008ed3', border: 'none', color: 'white', borderRadius: '50%',
                  width: '42px', height: '42px', cursor: sending || !replyText.trim() ? 'default' : 'pointer',
                  opacity: sending || !replyText.trim() ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Send size={18} />
                </button>
              </div>
            </>
          )
        )}

        {/* ---------- COMPOSE ---------- */}
        {view === 'compose' && (
          <div>
            {isStaff && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button onClick={() => { setComposeMode('all'); setSelected(new Set()); }} style={{
                  flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${composeMode === 'all' ? '#008ed3' : '#cbd5e1'}`,
                  background: composeMode === 'all' ? '#e6f4fb' : 'white',
                  color: '#333', fontWeight: 600, fontSize: '13px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}>
                  <Users size={15} /> All athletes
                </button>
                <button onClick={() => setComposeMode('select')} style={{
                  flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${composeMode === 'select' ? '#008ed3' : '#cbd5e1'}`,
                  background: composeMode === 'select' ? '#e6f4fb' : 'white',
                  color: '#333', fontWeight: 600, fontSize: '13px'
                }}>
                  Choose athletes
                </button>
              </div>
            )}

            {/* recipient picker */}
            {(!isStaff || composeMode === 'select') && (
              <div style={{ marginBottom: '14px' }}>
                {isStaff && (
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search athletes…"
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px',
                      border: '1px solid #cbd5e1', fontSize: '14px', marginBottom: '8px',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
                <div style={{ maxHeight: '220px', overflowY: 'auto', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  {(isStaff ? filteredRoster : filteredStaff).length === 0 && (
                    <p style={{ color: '#888', textAlign: 'center', padding: '16px', fontSize: '13px' }}>
                      {isStaff ? 'No athletes found.' : 'No staff connected to you yet.'}
                    </p>
                  )}
                  {(isStaff ? filteredRoster : filteredStaff).map(p => {
                    const pid = isStaff ? p.athlete_id : p.staff_id;
                    const pname = isStaff ? p.athlete_name : p.staff_name;
                    const isSel = selected.has(pid);
                    return (
                      <div
                        key={pid}
                        onClick={() => {
                          if (isStaff) {
                            const next = new Set(selected);
                            if (next.has(pid)) next.delete(pid); else next.add(pid);
                            setSelected(next);
                          } else {
                            setSelected(new Set([pid]));
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#333' }}>
                          {pname || 'Unknown'}
                          {isStaff && p.is_own_coach === false && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>team athlete</span>
                          )}
                        </span>
                        {isSel && <Check size={18} color="#008ed3" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={5}
              maxLength={4000}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                border: '1px solid #cbd5e1', fontSize: '14px',
                resize: 'vertical', boxSizing: 'border-box'
              }}
            />
            {composeError && <p style={{ color: '#dc2626', fontSize: '13px', margin: '8px 0 0' }}>{composeError}</p>}
            {composeSent && <p style={{ color: '#16a34a', fontSize: '13px', margin: '8px 0 0' }}>{composeSent}</p>}
            <button
              onClick={sendCompose}
              disabled={sending || !body.trim()
                || (!isStaff && selected.size !== 1)
                || (isStaff && composeMode === 'select' && selected.size === 0)}
              style={{
                width: '100%', marginTop: '12px', padding: '13px', borderRadius: '12px',
                background: '#008ed3', color: 'white', border: 'none', fontWeight: 700,
                fontSize: '15px', cursor: 'pointer', opacity: sending ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              <Send size={17} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
