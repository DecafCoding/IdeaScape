import { describe, expect, it } from 'vitest';
import { insertMark, renderMarkdown } from '../markdown';

function render(source: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderMarkdown(source);
  return host;
}

describe('renderMarkdown', () => {
  it('renderMarkdown_boldItalicAndLists_produceTheExpectedElements', () => {
    expect(render('**bold**').querySelector('strong')?.textContent).toBe('bold');
    expect(render('_italic_').querySelector('em')?.textContent).toBe('italic');
    expect(render('- one\n- two').querySelectorAll('li')).toHaveLength(2);
    expect(render('1. one\n2. two').querySelector('ol')).not.toBeNull();
  });

  it('renderMarkdown_headingsAndLinks_render', () => {
    expect(render('## Heading').querySelector('h2')?.textContent).toBe('Heading');
    const link = render('[site](https://example.com)').querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  it('renderMarkdown_scriptTag_producesNoScriptNode', () => {
    const host = render('before <script>alert(1)</script> after');
    expect(host.querySelector('script')).toBeNull();
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('alert(1)');
  });

  it('renderMarkdown_eventHandlerAttribute_losesTheHandler', () => {
    const host = render('<img src=x onerror=alert(1)>');
    expect(host.innerHTML).not.toContain('onerror');
    expect(host.querySelector('img')).toBeNull();
  });

  it('renderMarkdown_javascriptHref_isStripped', () => {
    const host = render('[click](javascript:alert(1))');
    const href = host.querySelector('a')?.getAttribute('href');
    expect(href ?? '').not.toContain('javascript:');
  });

  it('renderMarkdown_malformedNesting_stillProducesNoScriptNode', () => {
    const host = render('<div><script>x</script');
    expect(host.querySelector('script')).toBeNull();
  });

  it('renderMarkdown_emptySource_isAnEmptyString', () => {
    expect(renderMarkdown('')).toBe('');
  });
});

describe('insertMark', () => {
  it('insertMark_boldOnASelection_wrapsItAndKeepsTheSelectionOnTheText', () => {
    const result = insertMark('hello world', 6, 11, 'bold');
    expect(result.source).toBe('hello **world**');
    expect(result.source.slice(result.selectionStart, result.selectionEnd)).toBe('world');
  });

  it('insertMark_boldOnAnAlreadyWrappedSelection_unwrapsIt', () => {
    const result = insertMark('hello **world**', 6, 15, 'bold');
    expect(result.source).toBe('hello world');
    expect(result.source.slice(result.selectionStart, result.selectionEnd)).toBe('world');
  });

  it('insertMark_boldWithTheMarksJustOutsideTheSelection_unwrapsIt', () => {
    const result = insertMark('hello **world**', 8, 13, 'bold');
    expect(result.source).toBe('hello world');
  });

  it('insertMark_italic_usesTheUnderscoreToken', () => {
    expect(insertMark('a b', 0, 1, 'italic').source).toBe('_a_ b');
  });

  it('insertMark_bulletList_prefixesEveryLineOfTheSelection', () => {
    const result = insertMark('one\ntwo\nthree', 0, 7, 'bullet-list');
    expect(result.source).toBe('- one\n- two\nthree');
  });

  it('insertMark_numberedList_numbersEachLineFromOne', () => {
    const result = insertMark('one\ntwo', 0, 7, 'numbered-list');
    expect(result.source).toBe('1. one\n2. two');
  });

  it('insertMark_listWithACaretInsideALine_expandsToTheWholeLine', () => {
    const result = insertMark('one\ntwo', 5, 5, 'bullet-list');
    expect(result.source).toBe('one\n- two');
  });

  it('insertMark_isPure_leavesTheSourceStringUntouched', () => {
    const source = 'hello';
    insertMark(source, 0, 5, 'bold');
    expect(source).toBe('hello');
  });
});
