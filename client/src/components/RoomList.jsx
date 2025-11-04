import React, { useState } from 'react';


export default function RoomList({ availableRooms = ['general'], currentRoom = 'global', onJoinRoom, onLeaveRoom }) {
const [newRoom, setNewRoom] = useState('');


const handleCreate = () => {
if (!newRoom) return;
onJoinRoom(newRoom);
setNewRoom('');
};
const [localCurrent, setLocalCurrent] = useState(currentRoom);

// keep localCurrent in sync with prop changes
React.useEffect(() => {
    setLocalCurrent(currentRoom);
}, [currentRoom]);

React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.querySelector('.room-list');
    if (!root) return;

    // container
    root.classList.add('p-4', 'bg-white', 'rounded-lg', 'shadow', 'w-80', 'text-sm');

    // header
    const h4 = root.querySelector('h4');
    if (h4) h4.classList.add('text-lg', 'font-semibold', 'mb-3');

    // list
    const ul = root.querySelector('ul');
    if (ul) ul.classList.add('space-y-1', 'mb-3');

    // attach listeners & style list items
    const listeners = [];
    const items = root.querySelectorAll('ul > li');
    items.forEach((li) => {
        li.classList.add('flex', 'justify-between', 'items-center', 'px-2', 'py-2', 'rounded');

        const span = li.querySelector('span');
        const roomName = span?.textContent?.trim();

        // active state based on localCurrent for immediate toggle feedback
        if (roomName && roomName === localCurrent) {
            li.classList.add('bg-blue-50', 'text-blue-700', 'font-medium', 'active');
        } else {
            li.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium', 'active');
            li.classList.add('hover:bg-gray-50');
        }

        if (span) span.classList.add('truncate');

        const btn = li.querySelector('button');
        if (btn) {
            btn.classList.add(
                'ml-3',
                'px-2',
                'py-1',
                'text-xs',
                'rounded',
                'border',
                'border-gray-200',
                'hover:bg-gray-100',
                'transition',
                'duration-150'
            );

            // attach a click handler that toggles join/leave and updates localCurrent for immediate UI feedback
            const handler = (e) => {
                e.preventDefault();
                if (!roomName) return;
                if (roomName === localCurrent) {
                    setLocalCurrent('');
                    onLeaveRoom && onLeaveRoom(roomName);
                } else {
                    setLocalCurrent(roomName);
                    onJoinRoom && onJoinRoom(roomName);
                }
            };

            btn.addEventListener('click', handler);
            listeners.push({ btn, handler });
        }
    });

    // create room area
    const create = root.querySelector('.create-room');
    if (create) create.classList.add('mt-3', 'flex', 'items-center', 'space-x-2');

    const input = root.querySelector('.create-room input');
    if (input) {
        input.classList.add(
            'flex-1',
            'px-3',
            'py-2',
            'border',
            'border-gray-200',
            'rounded',
            'focus:outline-none',
            'focus:ring-2',
            'focus:ring-blue-200'
        );
    }

    const createBtn = root.querySelector('.create-room button');
    if (createBtn) {
        createBtn.classList.add(
            'px-4',
            'py-2',
            'bg-blue-600',
            'text-white',
            'rounded',
            'hover:bg-blue-700',
            'transition',
            'duration-150'
        );
    }

    return () => {
        // cleanup event listeners
        listeners.forEach(({ btn, handler }) => {
            btn.removeEventListener('click', handler);
        });
    };
}, [availableRooms, localCurrent, newRoom, onJoinRoom, onLeaveRoom]);

return (
<div className="room-list">
<h4>Rooms</h4>
<ul>
{availableRooms.map((r) => (
<li key={r} className={r === currentRoom ? 'active' : ''}>
<span>{r}</span>
{r === currentRoom ? (
<button onClick={() => onLeaveRoom(r)}>Leave</button>
) : (
<button onClick={() => onJoinRoom(r)}>Join</button>
)}
</li>
))}
</ul>


<div className="create-room">
<input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="New room name" />
<button onClick={handleCreate}>Create & Join</button>
</div>
</div>
);
}