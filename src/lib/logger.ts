/**
 * The shared front-end logger. This module is the only place in the front end that touches
 * the console — CLAUDE.md forbids a bare console.log anywhere else in shipped code.
 * Log messages stay in sentence case.
 */

/* eslint-disable no-console */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, detail?: unknown): void {
  const line = `[ideascape] ${message}`;
  if (level === 'error') {
    console.error(line, detail ?? '');
  } else if (level === 'warn') {
    console.warn(line, detail ?? '');
  } else {
    console.info(line, detail ?? '');
  }
}

export function logInfo(message: string, detail?: unknown): void {
  emit('info', message, detail);
}

export function logWarn(message: string, detail?: unknown): void {
  emit('warn', message, detail);
}

export function logError(message: string, detail?: unknown): void {
  emit('error', message, detail);
}
