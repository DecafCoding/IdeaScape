import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeSafe = vi.fn();

vi.mock('../ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  // The real one goes through Tauri's asset protocol, which is not present under jsdom.
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const {
  assetStatus,
  assetUrl,
  clearAssetStatuses,
  noteAssetPresent,
  refreshAssetStatuses,
  setAssetsFolder,
} = await import('../assets');

describe('assetUrl', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    clearAssetStatuses();
    setAssetsFolder(null);
  });

  afterEach(() => setAssetsFolder(null));

  it('assetUrl_theFolderHasNotBeenSet_returnsAnEmptyStringAndThrowsNothing', () => {
    expect(() => assetUrl('abc.png')).not.toThrow();
    expect(assetUrl('abc.png')).toBe('');
  });

  it('assetUrl_aName_producesAStableStringHoldingTheFileNameAndNeverABareWindowsPath', () => {
    setAssetsFolder('C:\\Users\\x\\Documents\\Project\\assets');
    const url = assetUrl('deadbeef.png');
    expect(url).toBe(assetUrl('deadbeef.png'));
    expect(decodeURIComponent(url)).toContain('deadbeef.png');
    expect(url.startsWith('C:')).toBe(false);
    expect(url).not.toContain('\\');
  });

  it('assetUrl_aNullOrEmptyName_returnsAnEmptyString', () => {
    setAssetsFolder('C:/p/assets');
    expect(assetUrl(null)).toBe('');
    expect(assetUrl('')).toBe('');
  });
});

describe('the asset status cache', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    clearAssetStatuses();
  });

  it('assetStatus_anUnknownName_reportsPresentSoNoCardFlickersIntoTheMissingState', () => {
    expect(assetStatus('never-checked.png').exists).toBe(true);
  });

  it('refreshAssetStatuses_aNameReportedAbsent_reportsAbsentAfterwards', async () => {
    invokeSafe.mockResolvedValue([
      { name: 'here.png', exists: true, byte_size: 12 },
      { name: 'gone.png', exists: false, byte_size: 0 },
    ]);

    await refreshAssetStatuses(['here.png', 'gone.png']);

    expect(invokeSafe).toHaveBeenCalledWith('asset_statuses', {
      names: ['here.png', 'gone.png'],
    });
    expect(assetStatus('here.png')).toEqual({ name: 'here.png', exists: true, byte_size: 12 });
    expect(assetStatus('gone.png').exists).toBe(false);
  });

  it('refreshAssetStatuses_aRepeatedName_isAskedForOnce', async () => {
    invokeSafe.mockResolvedValue([]);
    await refreshAssetStatuses(['a.png', 'a.png', '']);
    expect(invokeSafe).toHaveBeenCalledWith('asset_statuses', { names: ['a.png'] });
  });

  it('refreshAssetStatuses_noNames_makesNoCall', async () => {
    await refreshAssetStatuses([]);
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('refreshAssetStatuses_theCallFailing_leavesEveryNameReadingAsPresent', async () => {
    invokeSafe.mockRejectedValue(new Error('no project'));
    await expect(refreshAssetStatuses(['a.png'])).resolves.toBeUndefined();
    expect(assetStatus('a.png').exists).toBe(true);
  });

  it('noteAssetPresent_aJustCopiedFile_isReportedPresentWithoutARoundTrip', () => {
    noteAssetPresent('new.png', 99);
    expect(assetStatus('new.png')).toEqual({ name: 'new.png', exists: true, byte_size: 99 });
  });
});
