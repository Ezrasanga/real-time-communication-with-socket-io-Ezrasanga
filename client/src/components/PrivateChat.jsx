import React, { useState, useEffect } from 'react';


export default function PrivateChat({ socketId, user, messages = [], onSendPrivate }) {
// `socketId` is the recipient socket id; `user` is the recipient username
const [text, setText] = useState('');
const [localMessages, setLocalMessages] = useState([]);


useEffect(() => {
// filter private messages for this chat if messages array contains mixed messages
const filtered = messages.filter((m) => m.type === 'private' && ((m.fromSocketId === socketId) || (m.toSocketId === socketId)));
setLocalMessages(filtered);
}, [messages, socketId]);


const send = () => {
if (!text) return;
const payload = { text, ts: Date.now(), from: 'me', type: 'private' };
onSendPrivate(socketId, payload);
// optimistic UI update
setLocalMessages((s) => [...s, { ...payload, toSocketId: socketId }]);
setText('');
};


return (
<div className="private-chat">
<header>Chat with {user || socketId}</header>
<div className="msgs">
{localMessages.map((m, i) => (
<div key={i} className={`msg ${m.from === 'me' ? 'mine' : 'theirs'}`}>
<b>{m.from}</b>: {m.text} <small>{new Date(m.ts).toLocaleTimeString()}</small>
</div>
))}
</div>
<footer>
<input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a private message" />
<button onClick={send}>Send</button>
</footer>
</div>
);
}