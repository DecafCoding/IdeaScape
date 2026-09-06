/**
 * The single invoke wrapper, and the single place a Rust error becomes a front-end error.
 * Nothing else in the front end calls `invoke()` — that is what keeps the command seam
 * from being bypassed, and what guarantees a raw Rust string never reaches a component.
 */
import { invoke } from '@tauri-apps/api/core';
import { logError } from './logger';

export class IpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcError';
  }
}

const GENERIC_MESSAGE = 'The application could not complete that action.';

export async function invokeSafe<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    // AppError serializes to its Display string; anything else is not safe to show.
    const message = typeof raw === 'string' && raw.length > 0 ? raw : GENERIC_MESSAGE;
    logError(`ipc ${command} failed`, raw);
    throw new IpcError(message);
  }
}
