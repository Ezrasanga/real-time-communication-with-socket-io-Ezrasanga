import React, { useState } from 'react';
export default function Login({ onLogin }) {
    const [name, setName] = useState('');
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-6 sm:p-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Enter username</h2>
                <div className="flex gap-3">
                    <input
                        aria-label="username"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="flex-1 px-4 py-3 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                    />
                    <button
                        onClick={() => name && onLogin(name)}
                        disabled={!name}
                        className={`px-5 py-3 rounded-lg font-medium text-white transition ${
                            name ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'
                        }`}
                    >
                        Join
                    </button>
                </div>
                <p className="text-sm text-gray-500 mt-3">You’ll join the chat with this username.</p>
            </div>
        </div>
    );
}