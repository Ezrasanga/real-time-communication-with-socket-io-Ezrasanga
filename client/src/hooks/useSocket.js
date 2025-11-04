import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';


export default function useSocket({ url, username }) {
const socketRef = useRef();
const [connected, setConnected] = useState(false);
const [messages, setMessages] = useState([]);
const [onlineUsers, setOnlineUsers] = useState([]);
const [typing, setTyping] = useState([]);


useEffect(() => {
  const socketUrl = url || process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
  console.log('useSocket connecting to:', socketUrl); // <-- confirm URL in browser console

  socketRef.current = io(
    socketUrl,
    { 
      autoConnect: true,
      withCredentials: true,
      // try polling first so failures to upgrade don't immediately blow up
      transports: ['polling', 'websocket']
    }
  );

  console.log('socket client opts:', socketRef.current.io?.opts);


socketRef.current.on('connect', () => setConnected(true));


socketRef.current.on('message', (m) => setMessages((s) => [...s, m]));
socketRef.current.on('privateMessage', (m) => setMessages((s) => [...s, m]));


socketRef.current.on('onlineUsers', (list) => setOnlineUsers(list));
socketRef.current.on('typing', (t) => setTyping((s) => [...s, t]));


// join as user
if (username) {
socketRef.current.emit('join', { username });
}

const root = document.getElementById('root') || document.body;
const tailwindClasses = [
    'min-h-screen',
    'bg-gray-50',
    'text-gray-800',
    'antialiased',
    'p-4',
    'container',
    'mx-auto'
];
root.classList.add(...tailwindClasses);

socketRef.current.on('disconnect', () => {
    root.classList.remove(...tailwindClasses);
});
return () => {
socketRef.current.disconnect();
};
}, [url, username]);


const sendMessage = (payload) => socketRef.current.emit('message', payload);
const sendPrivate = (toSocketId, payload) => socketRef.current.emit('privateMessage', { toSocketId, payload });
const setIsTyping = ({ room, from, typing }) => socketRef.current.emit('typing', { room, from, typing });
const joinRoom = (room) => socketRef.current.emit('joinRoom', { room });
const leaveRoom = (room) => socketRef.current.emit('leaveRoom', { room });


return { connected, messages, onlineUsers, typing, sendMessage, sendPrivate, setIsTyping, joinRoom, leaveRoom };
}