import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { clearAssetStatuses, refreshAssetStatuses } = await import('../../../lib/assets');

const PLACEMENT_ID = 1;
const ITEM_ID = 1;

function seedImageCard(asset: string) {
  canvasStore.upsertCard({
    placement: {
      id: PLACEMENT_ID,
      canvas_id: 1,
      item_id: ITEM_ID,
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      z_order: 0,
    },
    item: {
      id: ITEM_ID,
      project_id: 1,
      kind: 'image',
      payload: JSON.stringify({
        asset,
        natural_width: 1920,
        natural_height: 1080,
        alt: 'A steel truss',
        source_name: 'truss-reference.jpg',
      }),
      created_at: 'now',
      updated_at: 'now',
    },
  });
  canvasStore.setSelection([PLACEMENT_ID]);
}

const props = { expanded: true, onToggle: () => {} };

describe('the properties panel for an image card', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
    clearAssetStatuses();
  });

  afterEach(cleanup);

  it('panel_anImageSelection_rendersTheFileAndAltTextGroups', async () => {
    seedImageCard('deadbeef.png');
    invokeSafe.mockResolvedValue([{ name: 'deadbeef.png', exists: true, byte_size: 204_800 }]);
    await refreshAssetStatuses(['deadbeef.png']);

    const { getByTestId, getByLabelText } = render(PropertiesPanel, { props });
    // The stored file name is a content hash, so it is deliberately not shown; the original
    // name is.
    expect(getByTestId('panel-file-group').textContent).not.toContain('deadbeef.png');
    expect(getByTestId('panel-file-group').textContent).toContain('truss-reference.jpg');
    expect(getByTestId('panel-file-meta').textContent).toContain('1920 × 1080');
    expect(getByTestId('panel-file-meta').textContent).toContain('200 KB');
    expect(getByTestId('panel-file-meta').textContent).toContain('copied in');
    expect((getByLabelText('Description') as HTMLTextAreaElement).value).toBe('A steel truss');
  });

  it('panel_anImageSelection_readsAsImageRatherThanTheGenericCard', () => {
    seedImageCard('deadbeef.png');
    const { getByTestId } = render(PropertiesPanel, { props });
    const panel = getByTestId('properties-panel');
    expect(panel.querySelector('.kind')?.textContent).toBe('Image');
    // The original name is not repeated under the heading — it is in the File group.
    expect(panel.querySelector('.item-id')?.textContent).toBe('');
  });

  it('panel_anImageSelection_putsTheImageTitleFirstAndTheFileGroupLast', () => {
    seedImageCard('deadbeef.png');
    const { getByTestId } = render(PropertiesPanel, { props });
    const labels = [...getByTestId('properties-panel').querySelectorAll('.group-label')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Image Title', 'Position', 'Size', 'Description', 'Order', 'File']);
  });

  it('panel_aMissingAsset_printsMissingTheCardIsKeptAndNoDimensions', async () => {
    seedImageCard('gone.png');
    invokeSafe.mockResolvedValue([{ name: 'gone.png', exists: false, byte_size: 0 }]);
    await refreshAssetStatuses(['gone.png']);

    const { getByTestId } = render(PropertiesPanel, { props });
    const meta = getByTestId('panel-file-meta').textContent ?? '';
    expect(meta).toBe('Missing · the card is kept');
    expect(meta).not.toContain('1920');
    expect(meta).not.toContain('×');
  });

  it('panel_aMissingAsset_keepsReplaceAndShowInFolderEnabled', async () => {
    seedImageCard('gone.png');
    invokeSafe.mockResolvedValue([{ name: 'gone.png', exists: false, byte_size: 0 }]);
    await refreshAssetStatuses(['gone.png']);

    const { getByRole } = render(PropertiesPanel, { props });
    expect((getByRole('button', { name: 'Replace' }) as HTMLButtonElement).disabled).toBe(false);
    expect((getByRole('button', { name: 'Show in folder' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('panel_aMissingAsset_neverSaysWhereTheOriginalUsedToLive', async () => {
    seedImageCard('gone.png');
    invokeSafe.mockResolvedValue([{ name: 'gone.png', exists: false, byte_size: 0 }]);
    await refreshAssetStatuses(['gone.png']);

    const { getByTestId } = render(PropertiesPanel, { props });
    const text = getByTestId('panel-file-group').textContent ?? '';
    expect(text).not.toMatch(/[A-Z]:\\/);
    expect(text).not.toContain('originally');
  });

  it('panel_theAltTextCommittedOnBlur_raisesItOnce', async () => {
    seedImageCard('deadbeef.png');
    const onAltTextChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { ...props, onAltTextChange },
    });
    const box = getByLabelText('Description') as HTMLTextAreaElement;
    box.value = 'A different description';
    await fireEvent.blur(box);
    expect(onAltTextChange).toHaveBeenCalledExactlyOnceWith('A different description');
  });

  it('panel_replaceAndShowInFolderClicked_raiseTheirCallbacks', async () => {
    seedImageCard('deadbeef.png');
    const onReplaceImage = vi.fn();
    const onShowInFolder = vi.fn();
    const { getByRole } = render(PropertiesPanel, {
      props: { ...props, onReplaceImage, onShowInFolder },
    });
    await fireEvent.click(getByRole('button', { name: 'Replace' }));
    await fireEvent.click(getByRole('button', { name: 'Show in folder' }));
    expect(onReplaceImage).toHaveBeenCalledTimes(1);
    expect(onShowInFolder).toHaveBeenCalledTimes(1);
  });

  it('panel_anImageSelection_hasNoSourceGroup', () => {
    seedImageCard('deadbeef.png');
    const { queryByTestId } = render(PropertiesPanel, { props });
    expect(queryByTestId('panel-source-group')).toBeNull();
  });
  it('panel_theImageTitleCommittedOnBlur_raisesItOnce', async () => {
    seedImageCard('deadbeef.png');
    const onImageTitleChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { ...props, onImageTitleChange },
    });
    const box = getByLabelText('Image Title') as HTMLInputElement;
    box.value = 'North Elevation';
    await fireEvent.blur(box);
    expect(onImageTitleChange).toHaveBeenCalledExactlyOnceWith('North Elevation');
  });

  it('panel_theShowTitleCheckboxToggled_raisesTheNewState', async () => {
    seedImageCard('deadbeef.png');
    const onImageTitleVisibleChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { ...props, onImageTitleVisibleChange },
    });
    const box = getByLabelText('Show Title On Card') as HTMLInputElement;
    expect(box.checked).toBe(false);
    await fireEvent.click(box);
    expect(onImageTitleVisibleChange).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('panel_theShowDescriptionCheckboxToggled_raisesTheNewState', async () => {
    seedImageCard('deadbeef.png');
    const onAltVisibleChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { ...props, onAltVisibleChange },
    });
    const box = getByLabelText('Show Description On Card') as HTMLInputElement;
    expect(box.checked).toBe(false);
    await fireEvent.click(box);
    expect(onAltVisibleChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});
