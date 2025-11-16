import React, { useState, useRef, useEffect } from 'react';

export default function ChatWindow({
  messages = [],
  onSend,
  onTyping,
  typing = {},
  currentUser,
  sendReaction,
  onDeleteMessage,
  onEditMessage,
  roomName
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const messagesRef = useRef();
  const textareaRef = useRef();

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [text]);

  useEffect(() => {
    try {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value?.length || 0;
        textareaRef.current.setSelectionRange(len, len);
      }
    } catch (e) { /* ignore */ }
  }, [roomName]);

  const submit = (e) => {
    e && e.preventDefault();
    const val = text.trim();
    if (!val) return;
    onSend && onSend(val);
    setText('');
  };

  const EMOJIS = ['👍','❤️','😂','🎉','😮','🔥','😢','👏'];

  // group consecutive messages from same sender within 2 minutes
  const grouped = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = grouped.length ? grouped[grouped.length - 1] : null;
    const sameSender = prev && prev.sender === (m.from || m.sender);
    const prevTs = prev ? prev.lastTs : 0;
    const nowTs = new Date(m.timestamp || m.createdAt || Date.now()).getTime();
    if (sameSender && (nowTs - prevTs) <= 2 * 60 * 1000) {
      prev.items.push(m);
      prev.lastTs = nowTs;
    } else {
      grouped.push({ sender: m.from || m.sender || 'Unknown', items: [m], lastTs: nowTs });
    }
  }

  const formatTime = (ts) => {
    try { return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:18 }}># {roomName || 'Conversation'}</div>
          <div className="kicker">Messages are real-time — enjoy</div>
        </div>
        <div className="kicker">Active • {messages?.length || 0}</div>
      </div>

      <div ref={messagesRef} className="messages" style={{ overflowY: 'auto' }}>
        {grouped.length === 0 && <div className="system-note">No messages yet — start the conversation</div>}

        {grouped.map((group, gi) => {
          const isOwnGroup = group.sender === currentUser;
          return (
            <div key={gi} className={`msg-group ${isOwnGroup ? 'right' : 'left'}`} style={{ marginBottom: 12 }}>
              <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                {!isOwnGroup && <div className="avatar remote">{String(group.sender || '').slice(0,1).toUpperCase()}</div>}
                <div style={{ flex:1 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--muted)' }}>{group.sender}</div>

                  {group.items.map((m, mi) => {
                    const messageId = m._id || m.id || `${gi}-${mi}`;
                    const time = formatTime(m.timestamp || m.createdAt);
                    return (
                      <div key={messageId} className={`bubble msg-bubble-grouped ${isOwnGroup ? 'own' : ''}`} title={time} style={{ position:'relative', marginBottom: 8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ marginBottom:6 }}>{m.content}</div>
                            <div className="meta" style={{ fontSize:11, color:'var(--muted)' }}>{time}{m.private ? ' • private' : ''}</div>
                          </div>

                          <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:8 }}>
                            <div style={{ display:'flex', gap:6 }}>
                              {(m.reactions || []).map((r) => (
                                <div key={r.emoji} className="reaction-pill">{r.emoji} <span className="reaction-count">{r.count}</span></div>
                              ))}
                            </div>

                            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                              <button className="btn-ghost small" onClick={() => sendReaction && sendReaction(messageId, '👍', currentUser)}>👍</button>
                              <button className="btn-ghost small" onClick={() => setOpenMenuFor(openMenuFor === messageId ? null : messageId)}>⋯</button>
                            </div>
                          </div>
                        </div>

                        {openMenuFor === messageId && (
                          <div className="message-menu">
                            <button className="btn-ghost small" onClick={() => { setOpenMenuFor(null); onDeleteMessage && onDeleteMessage(messageId); }}>Delete</button>
                            <button className="btn-ghost small" onClick={() => { setOpenMenuFor(null); onEditMessage && onEditMessage(messageId); }}>Edit</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isOwnGroup && <div className="avatar own">{String(group.sender || '').slice(0,1).toUpperCase()}</div>}
              </div>
            </div>
          );
        })}

        {Object.values(typing).filter(Boolean).length > 0 && (
          <div style={{ marginTop: 6 }} className="typing">
            <div className="dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
            <div style={{ marginLeft:8 }}>{Object.values(typing).map(t => t.from).join(', ')} typing…</div>
          </div>
        )}
      </div>

      <div>
        <form onSubmit={submit} className="composer" style={{ alignItems: 'center' }}>
          <div className="textbox" style={{ position:'relative', display:'flex', alignItems:'center', gap:8 }}>
            <button type="button" className="btn-ghost" onClick={() => setEmojiOpen(!emojiOpen)} aria-label="Emoji">😊</button>

            {emojiOpen && (
              <div className="emoji-popover">
                {EMOJIS.map((em) => (
                  <button key={em} className="btn-ghost small" type="button" onClick={() => { setText((t) => t + em); setEmojiOpen(false); textareaRef.current?.focus(); }}>{em}</button>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); onTyping && onTyping(true); }}
              placeholder="Write a message..."
              rows={1}
              aria-label="Message"
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '10px', borderRadius: 10, background: 'transparent' }}
            />
          </div>

          <button type="submit" className="send-btn">Send</button>
        </form>
      </div>
    </div>
  );
}