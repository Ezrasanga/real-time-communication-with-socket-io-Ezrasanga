const express = require('express');
const router = express.Router();
const msgCtrl = require('../controllers/messageController');

router.get('/', msgCtrl.getMessages);         // GET /api/messages?room=roomName&limit=100
router.get('/:id', msgCtrl.getMessageById);  // GET /api/messages/:id
router.post('/', msgCtrl.createMessage);     // POST /api/messages

module.exports = router;