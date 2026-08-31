import { ok } from '../utils/respond.js';
import * as service from '../services/chat.service.js';

export async function postChat(req, res) {
  const { query } = req.body;
  const data = await service.askChat(query);
  return ok(res, data);
}
