import React, { useState } from 'react';
import useSocket from './hooks/useSocket';
import Chat from './components/Chat';
import Login from './components/Login';
import RoomList from './components/RoomList';
import PrivateChat from './components/PrivateChat';

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('user') || '');
  const [currentRoom, setCurrentRoom] = useState('global');
  const [privateChats, setPrivateChats] = useState({});

  const { connected, messages, onlineUsers, typing, sendMessage, sendPrivate, setIsTyping, joinRoom, leaveRoom } =
    useSocket({ url: URL, username: user });

  const handleJoinRoom = (room) => {
    if (currentRoom !== room) {
      leaveRoom(currentRoom);
      joinRoom(room);
      setCurrentRoom(room);
    }
  };

  const handleOpenPrivateChat = (socketId, username) => {
    setPrivateChats((prev) => ({ ...prev, [socketId]: username }));
  };

  if (!user)
    return (
      <Login
        onLogin={(name) => {
          setUser(name);
          localStorage.setItem('user', name);
        }}
      />
    );

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white text-xl font-bold p-4 shadow-md">
        Socket.io Chat — {connected ? 'Online' : 'Connecting...'}
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <RoomList
          availableRooms={['global', 'tech', 'games']}
          currentRoom={currentRoom}
          onJoinRoom={handleJoinRoom}
          className="w-full md:w-60 flex-shrink-0"
        />

        {/* Chat area */}
        <Chat
          messages={messages.filter((m) => m.room === currentRoom || m.room === 'global')}
          onlineUsers={onlineUsers}
          typing={typing}
          onSend={(text) => sendMessage({ room: currentRoom, text, from: user, ts: Date.now() })}
          onTyping={(t) => setIsTyping({ room: currentRoom, from: user, typing: t })}
          onPrivateChat={handleOpenPrivateChat}
          className="flex-1"
        />
      </div>

      {/* Private chats (floating for desktop, full-width on mobile) */}
      {Object.entries(privateChats).map(([socketId, username], idx) => (
        <PrivateChat
          key={socketId}
          socketId={socketId}
          user={username}
          messages={messages.filter(
            (m) => m.type === 'private' && (m.fromSocketId === socketId || m.toSocketId === socketId)
          )}
          onSendPrivate={(toSocketId, payload) => sendPrivate(toSocketId, payload)}
          className={`absolute top-20 md:right-${idx * 96} right-0 w-full md:w-80`}
        />
      ))}
    </div>
  );
}
