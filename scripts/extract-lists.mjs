/**
 * Extract the six shipped vocabulary lists from the Book Guides library.
 *
 * RUN BY HAND, NEVER BY THE BUILD. The library lives outside this repository; the *output*
 * of this script is committed to `src-tauri/data/lists/`, so a clean checkout on a machine
 * that has never seen the library still builds the installer. Nothing in `package.json`,
 * `build.rs` or `tauri.conf.json` may invoke this file.
 *
 *   node scripts/extract-lists.mjs ["C:\\path\\to\\Book Guides"]
 *
 * Each output file is `{ "list": "<id>", "entries": [ { id, text, tags } ] }`, sorted by
 * `text`, where `tags` holds the *ids of parent list entries* the entry sorts under.
 *
 * ONLY `id` AND `text` ARE CARRIED. Never `description`, `aliases`, `relationships` or
 * `examples` — that trim is what keeps 669 KB of source down to about 50 KB embedded, and it
 * is also the "generic fields only" rule in `docs/feature-writing-pack.html` §5.
 *
 * Trope ids are permanent by the library's own rule and are copied into the project when a
 * value is picked, so a rename outside never rewrites a saved card. Nothing at runtime ever
 * resolves an id back to the library.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src-tauri', 'data', 'lists');

const DEFAULT_LIBRARY = join(
  process.env.USERPROFILE ?? process.env.HOME ?? '.',
  'Documents',
  'SecondBrain',
  'Book Guides',
);
const library = process.argv[2] ?? DEFAULT_LIBRARY;

/**
 * The eight sub-genre classes, mapped to authored ids EXPLICITLY rather than slugified. The
 * class strings carry a middle dot (U+00B7) and an ampersand; a punctuation change in the
 * source must fail loudly here rather than silently produce a ninth genre.
 */
const CLASS_IDS = new Map([
  ['Class I \u00b7 Rigor', 'genre.rigor'],
  ['Class II \u00b7 Technology & Future', 'genre.technology-future'],
  ['Class III \u00b7 Retro & Aesthetic', 'genre.retro-aesthetic'],
  ['Class IV \u00b7 Scope & Setting', 'genre.scope-setting'],
  ['Class V \u00b7 Time & Reality', 'genre.time-reality'],
  ['Class VI \u00b7 Catastrophe & Aftermath', 'genre.catastrophe-aftermath'],
  ['Class VII \u00b7 Encounter & Scale', 'genre.encounter-scale'],
  ['Class VIII \u00b7 Cross-Genre & Tonal', 'genre.cross-genre-tonal'],
]);

/** The class name without its "Class N · " prefix. */
function className(full) {
  const dot = full.indexOf('\u00b7');
  return dot === -1 ? full : full.slice(dot + 1).trim();
}

function readJson(...parts) {
  return JSON.parse(readFileSync(join(library, ...parts), 'utf8'));
}

function write(list, entries) {
  entries.sort((a, b) => a.text.localeCompare(b.text));
  const file = join(OUT_DIR, `${list}.json`);
  writeFileSync(file, `${JSON.stringify({ list, entries }, null, 2)}\n`, 'utf8');
  console.log(`${list}: ${entries.length} entries -> ${file}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const subgenreFile = readJson('library', 'subgenres.json');
const tropeFile = readJson('library', 'tropes.json');

// genres — the eight classes.
const classes = subgenreFile.classes ?? [];
for (const name of classes) {
  if (!CLASS_IDS.has(name)) throw new Error(`unmapped sub-genre class: ${name}`);
}
write(
  'genres',
  classes.map((name) => ({ id: CLASS_IDS.get(name), text: className(name), tags: [] })),
);

// subgenres — the ratified 45 only. The library also holds six `proposed` ones.
const ratified = subgenreFile.subgenres.filter((s) => s.status === 'ratified');
write(
  'subgenres',
  ratified.map((s) => {
    const genreId = CLASS_IDS.get(s.class);
    if (!genreId) throw new Error(`sub-genre ${s.id} names an unmapped class: ${s.class}`);
    return { id: s.id, text: s.name, tags: [genreId] };
  }),
);

// Which genre classes each trope appears under, rolled up from the ratified sub-genres'
// tier lists. `feature-writing-pack.html` §5 says story tropes filter by Genre, and the
// library tags tropes against sub-genres, so the hop is preserved by rolling up.
const tropeGenres = new Map();
for (const s of ratified) {
  const genreId = CLASS_IDS.get(s.class);
  for (const tier of Object.values(s.tiers ?? {})) {
    for (const appearance of tier ?? []) {
      const id = appearance?.trope;
      if (!id) continue;
      if (!tropeGenres.has(id)) tropeGenres.set(id, new Set());
      tropeGenres.get(id).add(genreId);
    }
  }
}

const STORY_FUNCTIONS = new Set(['plot', 'setting', 'theme', 'tone']);
const CHARACTER_FUNCTIONS = new Set(['character', 'internal_conflict']);

// story-tropes — tagged by genre. An untagged trope keeps `tags: []` and sorts below; it is
// never hidden, which is the one-hop filter's whole rule.
write(
  'story-tropes',
  tropeFile.tropes
    .filter((t) => STORY_FUNCTIONS.has(t.function))
    .map((t) => ({ id: t.id, text: t.name, tags: [...(tropeGenres.get(t.id) ?? [])].sort() })),
);

// character-tropes — `internal_conflict` has no other home and belongs with a character.
write(
  'character-tropes',
  tropeFile.tropes
    .filter((t) => CHARACTER_FUNCTIONS.has(t.function))
    .map((t) => ({ id: t.id, text: t.name, tags: [] })),
);

// themes — seeded from the theme-function tropes, so a theme carries a real permanent id and
// can be counted later. The overlap with story tropes is correct: a theme trope is both.
write(
  'themes',
  tropeFile.tropes
    .filter((t) => t.function === 'theme')
    .map((t) => ({ id: t.id, text: t.name, tags: [] })),
);

// points-of-view — authored here, not extracted. No shipped list covers it, and a typed
// value is accepted as everywhere else, so a short list costs nothing.
write('points-of-view', [
  { id: 'pov.first', text: 'First person', tags: [] },
  { id: 'pov.third-limited', text: 'Third person limited', tags: [] },
  { id: 'pov.third-omniscient', text: 'Third person omniscient', tags: [] },
  { id: 'pov.second', text: 'Second person', tags: [] },
  { id: 'pov.epistolary', text: 'Epistolary', tags: [] },
]);
