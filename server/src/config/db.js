import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * MongoDB connection.
 *
 * Deliberately NOT called from app.js. The Express app must be constructible
 * without a database so tests can build it and fire requests at it in
 * milliseconds. index.js connects, then starts listening.
 */
let connected = false;

export async function connectDatabase() {
  if (!env.MONGODB_URI) {
    logger.warn('MONGODB_URI is not set — starting without a database (Phase 1 mode)');
    return false;
  }

  mongoose.set('strictQuery', true);

  // Fail fast instead of buffering queries for 30s behind a dead connection.
  // A citizen waiting on a chat response should get an honest error, not a hang.
  mongoose.set('bufferCommands', false);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });
    connected = true;
    logger.info({ host: mongoose.connection.host, db: mongoose.connection.name }, 'mongodb connected');
  } catch (err) {
    logger.error({ err: err.message }, 'mongodb connection failed');
    throw err;
  }

  mongoose.connection.on('disconnected', () => {
    connected = false;
    logger.warn('mongodb disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    connected = true;
    logger.info('mongodb reconnected');
  });

  return true;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connected = false;
}

/** 'connected' | 'connecting' | 'disconnected' | 'not_configured' */
export function databaseStatus() {
  if (!env.MONGODB_URI) return 'not_configured';
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return connected ? 'connected' : states[mongoose.connection.readyState] || 'disconnected';
}
