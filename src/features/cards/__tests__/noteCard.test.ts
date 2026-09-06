import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import NoteCard from '../NoteCard.svelte';
import NoteEditor from '../NoteEditor.svelte';
import { LOW_ZOOM } from '../../../lib/geometry';

describe('NoteCard', () => {
  afterEach(cleanup);

  it('noteCard_aMarkdownBody_rendersAsSanitizedHtml', () => {
    const { getByTestId } = render(NoteCard, {
      props: { title: 'A Note', text: '**bold** and _italic_', selected: false, zoom: 1 },
    });
    const card = getByTestId('note-card');
    expect(card.querySelector('strong')?.textContent).toBe('bold');
    expect(card.querySelector('em')?.textContent).toBe('italic');
  });

  it('noteCard_aBodyCarryingAScriptTag_neverPutsAScriptNodeInTheDocument', () => {
    const { getByTestId } = render(NoteCard, {
      props: {
        title: 'Hostile',
        text: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>',
        selected: false,
        zoom: 1,
      },
    });
    const card = getByTestId('note-card');
    expect(card.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(card.innerHTML).not.toContain('onerror');
  });

  it('noteCard_theTitle_isPlainTextAndNeverMarkdown', () => {
    const { getByTestId } = render(NoteCard, {
      props: { title: '**not bold**', text: '', selected: false, zoom: 1 },
    });
    const title = getByTestId('note-card').querySelector('.title');
    expect(title?.textContent).toBe('**not bold**');
    expect(title?.querySelector('strong')).toBeNull();
  });

  it('noteCard_selected_widensTheTitleAndLiftsTheBody', () => {
    const { getByTestId } = render(NoteCard, {
      props: { title: 'T', text: 'body', selected: true, zoom: 1 },
    });
    const card = getByTestId('note-card');
    expect(card.querySelector('.title')?.className).toContain('selected');
    expect(card.querySelector('.body')?.className).toContain('selected');
  });

  it('noteCard_belowTheLowZoomThreshold_drawsTextBarsRatherThanText', () => {
    const { getByTestId, queryByTestId } = render(NoteCard, {
      props: { title: 'T', text: 'body', selected: false, zoom: LOW_ZOOM - 0.05 },
    });
    expect(getByTestId('note-card-simplified').querySelectorAll('.bar')).toHaveLength(3);
    expect(queryByTestId('note-card')).toBeNull();
  });

  it('noteCard_atOrAboveTheThreshold_drawsRealText', () => {
    const { getByTestId } = render(NoteCard, {
      props: { title: 'T', text: 'body', selected: false, zoom: LOW_ZOOM },
    });
    expect(getByTestId('note-card')).toBeInTheDocument();
  });
});

describe('NoteEditor', () => {
  afterEach(cleanup);

  it('noteEditor_open_holdsTheRawMarkdownSourceNotTheRenderedHtml', () => {
    const { getByLabelText } = render(NoteEditor, {
      props: { title: 'T', text: '**bold**', onChange: () => {}, onCommit: () => {} },
    });
    expect((getByLabelText('Note Text') as HTMLTextAreaElement).value).toBe('**bold**');
  });

  it('noteEditor_typing_raisesTheChangeWithTheNewSource', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(NoteEditor, {
      props: { title: 'T', text: '', onChange, onCommit: () => {} },
    });
    await fireEvent.input(getByLabelText('Note Text'), { target: { value: 'typed' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'T', text: 'typed' });
  });

  it('noteEditor_theBoldButton_wrapsTheSelection', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(NoteEditor, {
      props: { title: 'T', text: 'hello world', onChange, onCommit: () => {} },
    });
    const textarea = getByLabelText('Note Text') as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 11);

    await fireEvent.click(getByLabelText('Bold'));

    expect(onChange).toHaveBeenCalledWith({ title: 'T', text: 'hello **world**' });
  });

  it('noteEditor_theBulletListButton_prefixesTheLine', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(NoteEditor, {
      props: { title: 'T', text: 'one', onChange, onCommit: () => {} },
    });
    (getByLabelText('Note Text') as HTMLTextAreaElement).setSelectionRange(0, 3);
    await fireEvent.click(getByLabelText('Bullet List'));
    expect(onChange).toHaveBeenCalledWith({ title: 'T', text: '- one' });
  });

  it('noteEditor_blurringTheTextBox_commits', async () => {
    const onCommit = vi.fn();
    const { getByLabelText } = render(NoteEditor, {
      props: { title: 'T', text: '', onChange: () => {}, onCommit },
    });
    await fireEvent.blur(getByLabelText('Note Text'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('noteEditor_theTextBar_offersExactlyTheFourMarks', () => {
    const { getByTestId } = render(NoteEditor, {
      props: { title: 'T', text: '', onChange: () => {}, onCommit: () => {} },
    });
    expect(getByTestId('text-bar').querySelectorAll('button')).toHaveLength(4);
  });
});
