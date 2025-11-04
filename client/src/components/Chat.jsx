import React, { useState, useEffect } from 'react';


export default function Chat({ messages, onlineUsers, typing, onSend, onTyping }) {
const [text, setText] = useState('');


useEffect(() => {
const t = setTimeout(() => onTyping(false), 700);
return () => clearTimeout(t);
}, [text]);

useEffect(() => {
    const classes = {
        '.chat': 'flex h-screen bg-gray-100 text-gray-800',
        '.sidebar': 'w-64 bg-white p-4 border-r border-gray-200 flex-shrink-0',
        '.sidebar h4': 'mb-3 text-lg font-semibold',
        '.sidebar ul': 'space-y-2',
        '.sidebar li': 'text-sm text-gray-700',
        '.messages': 'flex-1 p-4 overflow-y-auto space-y-3',
        '.msg': 'p-3 rounded-lg bg-white shadow',
        '.typing': 'text-sm italic text-gray-500 mt-2',
        'footer': 'flex items-center p-3 border-t border-gray-200 bg-white sticky bottom-0',
        'footer input': 'flex-1 p-2 border border-gray-300 rounded-md mr-2 focus:outline-none focus:ring-2 focus:ring-blue-200',
        'footer button': 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md'
    };

    Object.entries(classes).forEach(([sel, cls]) => {
        document.querySelectorAll(sel).forEach(el => {
            cls.split(' ').forEach(c => { if (!el.classList.contains(c)) el.classList.add(c); });
        });
    });
}, []);

useEffect(() => {
    const el = document.querySelector('.messages');
    if (el) el.scrollTop = el.scrollHeight;
}, [messages]);
return (
<div className="chat">
<aside className="sidebar">
<h4>Online</h4>
<ul>{onlineUsers.map((u, i) => <li key={i}>{u.username}</li>)}</ul>
</aside>
<section className="messages">
{messages.map((m, i) => (
<div key={i} className="msg"><b>{m.from}</b>: {m.text} <small>{new Date(m.ts).toLocaleTimeString()}</small></div>
))}
{typing.length > 0 && <div className="typing">Someone is typing...</div>}
</section>
<footer>
<input value={text} onChange={(e) => { setText(e.target.value); onTyping(true); }} />
<button onClick={() => { onSend(text); setText(''); }}>Send</button>
</footer>
</div>
);
}