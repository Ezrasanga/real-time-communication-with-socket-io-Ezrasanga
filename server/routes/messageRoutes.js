const express = require('express');
const router = express.Router();
const msgCtrl = require('../controllers/messageController');
const { requireClerkAuth } = require('../middleware/clerkAuth');

router.get('/', msgCtrl.getMessages);         // GET /api/messages?room=roomName&limit=100
router.get('/:id', msgCtrl.getMessageById);  // GET /api/messages/:id
// protect message creation with Clerk auth
router.post('/', requireClerkAuth, msgCtrl.createMessage);     // POST /api/messages
// New: delete message (protected)
router.delete('/:id', requireClerkAuth, msgCtrl.deleteMessage); // DELETE /api/messages/:id

module.exports = router;