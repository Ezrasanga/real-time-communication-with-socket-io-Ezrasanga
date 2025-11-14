const express = require('express');
const router = express.Router();
const { 
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
  clearRoomMessages
} = require('../controllers/roomController');
const { requireClerkAuth } = require('../middleware/clerkAuth');

router.post('/', requireClerkAuth, createRoom);        // Create new room (protected)
router.get('/', getRooms);                 // Get all public rooms
router.get('/:roomId', getRoom);           // Get single room
router.post('/:roomId/join', requireClerkAuth, joinRoom);    // Join room (protected)
router.post('/:roomId/leave', requireClerkAuth, leaveRoom);  // Leave room (protected)
router.post('/:roomId/clear', requireClerkAuth, clearRoomMessages); // Clear messages in a room (protected)
router.delete('/:roomId', requireClerkAuth, deleteRoom);     // Delete room (protected)

module.exports = router;