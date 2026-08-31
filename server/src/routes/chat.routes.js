import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { chatBody } from '../validators/chat.validator.js';
import { postChat } from '../controllers/chat.controller.js';

const router = Router();

router.post('/', validate(chatBody, 'body'), postChat);

export default router;
