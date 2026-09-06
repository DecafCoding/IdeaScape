/**
 * The New project dialog, and the projects feature state's recents handling.
 *
 * The dialog is modal: it owns Enter and Esc while it is open, and a rejected create draws
 * inside it rather than opening a second dialog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({ invokeSafe, IpcError: class extends Error {} }));

const NewProjectDialog = (await import('../NewProjectDialog.svelte')).default;
const { projectsState } = await import('../projects.svelte');

describe('the New project dialog', () => {
  beforeEach(() => invokeSafe.mockReset());
  afterEach(cleanup);

  it('newProjectDialog_blankName_disablesCreate', async () => {
    const { getByText, getByLabelText } = render(NewProjectDialog, {
      props: { parentPath: 'C:\\Users\\me\\Documents' },
    });

    const create = getByText('Create Project') as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    // Whitespace only is still blank.
    await fireEvent.input(getByLabelText('Name'), { target: { value: '   ' } });
    expect((getByText('Create Project') as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.input(getByLabelText('Name'), { target: { value: 'Ship notes' } });
    expect((getByText('Create Project') as HTMLButtonElement).disabled).toBe(false);
  });

  it('newProjectDialog_nameAndFolder_invokesCreateProjectWithBoth', async () => {
    const created: string[] = [];
    const chosen: number[] = [];
    const { getByText, getByLabelText, getByTestId } = render(NewProjectDialog, {
      props: {
        parentPath: 'C:\\Users\\me\\Documents',
        onCreate: (name: string) => created.push(name),
        onChooseParent: () => chosen.push(1),
      },
    });

    expect(getByTestId('new-project-parent').textContent).toBe('C:\\Users\\me\\Documents');
    await fireEvent.click(getByText('Choose…'));
    expect(chosen).toHaveLength(1);

    await fireEvent.input(getByLabelText('Name'), { target: { value: '  Ship notes  ' } });
    // The helper line names the folder that will be created.
    expect(getByText(/C:\\Users\\me\\Documents\\Ship notes will be created\./)).toBeInTheDocument();

    // Enter creates, so the dialog does not need its button clicked.
    await fireEvent.keyDown(getByLabelText('Name'), { key: 'Enter' });
    expect(created).toEqual(['Ship notes']);
  });

  it('newProjectDialog_createRejected_drawsTheMessageInTheDialog', () => {
    const message = 'that value is not valid: a folder called Taken is already there';
    const { getByTestId, queryByText } = render(NewProjectDialog, {
      props: { parentPath: 'C:\\Docs', failure: message },
    });

    expect(getByTestId('new-project-failure').textContent).toBe(message);
    // Still one dialog: the failure is a strip inside it, not a second surface.
    expect(getByTestId('new-project-dialog')).toBeInTheDocument();
    expect(queryByText('OK')).toBeNull();
  });

  it('newProjectDialog_escape_cancelsWithoutCreating', async () => {
    const created: string[] = [];
    let cancelled = 0;
    const { getByLabelText } = render(NewProjectDialog, {
      props: {
        parentPath: 'C:\\Docs',
        onCreate: (name: string) => created.push(name),
        onCancel: () => (cancelled += 1),
      },
    });

    await fireEvent.input(getByLabelText('Name'), { target: { value: 'Half typed' } });
    await fireEvent.keyDown(getByLabelText('Name'), { key: 'Escape' });

    expect(cancelled).toBe(1);
    expect(created).toEqual([]);
  });

  it('newProjectDialog_nameField_takesFocusOnMount', () => {
    const { getByLabelText } = render(NewProjectDialog, { props: { parentPath: 'C:\\Docs' } });
    expect(document.activeElement).toBe(getByLabelText('Name'));
  });
});

describe('the projects feature state', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    projectsState.recents = [];
    projectsState.selectedIndex = -1;
    projectsState.failure = null;
    projectsState.defaultParent = null;
  });

  it('loadRecents_readsTheListThroughTheSeam', async () => {
    invokeSafe.mockResolvedValue([
      { path: 'C:\\A', name: 'A', canvas_count: 1, card_count: 0, opened_at: '' },
    ]);
    await projectsState.loadRecents();

    expect(invokeSafe).toHaveBeenCalledWith('list_recent_projects');
    expect(projectsState.recents).toHaveLength(1);
  });

  it('loadRecents_aShorterList_pullsTheCursorBackInsideIt', async () => {
    projectsState.selectedIndex = 3;
    invokeSafe.mockResolvedValue([
      { path: 'C:\\A', name: 'A', canvas_count: 1, card_count: 0, opened_at: '' },
    ]);
    await projectsState.loadRecents();
    expect(projectsState.selectedIndex).toBe(0);
  });

  it('loadDefaultParent_isReadOnceAndCached', async () => {
    invokeSafe.mockResolvedValue('C:\\Users\\me\\Documents');
    expect(await projectsState.loadDefaultParent()).toBe('C:\\Users\\me\\Documents');
    expect(await projectsState.loadDefaultParent()).toBe('C:\\Users\\me\\Documents');
    expect(invokeSafe).toHaveBeenCalledTimes(1);
  });
});
