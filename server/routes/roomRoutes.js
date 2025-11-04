const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  deleteRoom
} = require('../controllers/roomController');

router.post('/', auth, createRoom);        // Create new room
router.get('/', getRooms);                 // Get all public rooms
router.get('/:roomId', getRoom);           // Get single room
router.post('/:roomId/join', auth, joinRoom);    // Join room
router.post('/:roomId/leave', auth, leaveRoom);  // Leave room
router.delete('/:roomId', auth, deleteRoom);     // Delete room

module.exports = router;