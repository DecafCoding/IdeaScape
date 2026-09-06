import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('../logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const { invokeSafe, IpcError } = await import('../ipc');

function rejectsWith(value: unknown) {
  invoke.mockRejectedValue(value);
}

async function captureError(command: string): Promise<unknown> {
  try {
    await invokeSafe(command);
    throw new Error('invokeSafe was expected to reject');
  } catch (error) {
    return error;
  }
}

describe('invokeSafe', () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it('invokeSafe_commandSucceeds_returnsTheTypedResult', async () => {
    invoke.mockResolvedValue({ id: 7 });
    await expect(invokeSafe<{ id: number }>('open_project', { path: 'x' })).resolves.toEqual({
      id: 7,
    });
    expect(invoke).toHaveBeenCalledWith('open_project', { path: 'x' });
  });

  it('invokeSafe_commandRejectsWithAString_throwsIpcErrorCarryingThatMessage', async () => {
    rejectsWith('the project database could not be opened: locked');
    const error = await captureError('open_project');
    expect(error).toBeInstanceOf(IpcError);
    expect((error as Error).message).toBe('the project database could not be opened: locked');
  });

  it('invokeSafe_commandRejectsWithANonString_neverSurfacesTheRawValue', async () => {
    rejectsWith({ secret: 'internal panic detail' });
    const error = await captureError('list_canvases');
    expect(error).toBeInstanceOf(IpcError);
    expect((error as Error).message).toBe('The application could not complete that action.');
    expect((error as Error).message).not.toContain('internal panic detail');
  });

  it('invokeSafe_commandRejectsWithAnEmptyString_fallsBackToTheGenericMessage', async () => {
    rejectsWith('');
    const error = await captureError('ping');
    expect((error as Error).message).toBe('The application could not complete that action.');
  });
});
