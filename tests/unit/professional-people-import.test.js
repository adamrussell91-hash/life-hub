import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let importer = null;
try {
  importer = await import('../../scripts/lib/professional-people-import.mjs');
} catch {
  // The first red run intentionally proves the importer does not exist yet.
}

const CSV = [
  'Person,AI summary,Email,LinkedIn Profile,Current Workplace,Books,Podcasts,Notes,Future Column',
  'Alex Example,Knows the program,alex@example.com,https://www.linkedin.com/in/alex,Example College,Thinking in Systems,Learning Lab,Planning note,Keep exactly'
].join('\n');

const PEOPLE = [
  { legacy_id: 'person-alex', display_name: 'Alex Example', aliases: [] },
  { legacy_id: 'person-unrelated', display_name: 'Other Person', aliases: [] }
];

test('imports every CSV property while projecting safe profile fields and Markdown', () => {
  assert.ok(importer, 'expected the professional People importer module');
  const result = importer.buildProfessionalPeopleImport({
    people: PEOPLE,
    csvText: CSV,
    markdownByTitle: new Map([['Alex Example', '# Alex Example\n\n### Overview\n\nImported profile body.']])
  });

  assert.deepEqual(result.report, {
    total_csv_rows: 1,
    matched_rows: 1,
    unmatched_rows: [],
    ambiguous_rows: [],
    markdown_matched: 1,
    markdown_missing: [],
    unknown_columns: ['Future Column']
  });
  const alex = result.people.find((person) => person.legacy_id === 'person-alex');
  assert.deepEqual(alex.professional_profile.source.properties, {
    Person: 'Alex Example',
    'AI summary': 'Knows the program',
    Email: 'alex@example.com',
    'LinkedIn Profile': 'https://www.linkedin.com/in/alex',
    'Current Workplace': 'Example College',
    Books: 'Thinking in Systems',
    Podcasts: 'Learning Lab',
    Notes: 'Planning note',
    'Future Column': 'Keep exactly'
  });
  assert.equal(alex.professional_profile.summary, 'Knows the program');
  assert.equal(alex.professional_profile.contact.linkedin_url, 'https://www.linkedin.com/in/alex');
  assert.deepEqual(alex.professional_profile.current_workplace, ['Example College']);
  assert.deepEqual(alex.professional_profile.references.books, [
    { label: 'Thinking in Systems', source_url: null, hub_href: null }
  ]);
  assert.equal(alex.professional_profile.body_markdown, '# Alex Example\n\n### Overview\n\nImported profile body.');
  assert.equal(result.people.find((person) => person.legacy_id === 'person-unrelated').professional_profile, undefined);
});

test('reports ambiguous and unmatched source rows without guessing a profile target', () => {
  assert.ok(importer, 'expected the professional People importer module');
  const result = importer.buildProfessionalPeopleImport({
    people: [
      { legacy_id: 'one', display_name: 'Casey Example', aliases: [] },
      { legacy_id: 'two', display_name: 'Casey Example', aliases: [] }
    ],
    csvText: [
      'Person,AI summary',
      'Casey Example,Ambiguous profile',
      'Missing Example,Unmatched profile'
    ].join('\n'),
    markdownByTitle: new Map()
  });

  assert.deepEqual(result.report.ambiguous_rows, ['Casey Example']);
  assert.deepEqual(result.report.unmatched_rows, ['Missing Example']);
  assert.equal(result.people.every((person) => person.professional_profile === undefined), true);
});

test('maps exported Markdown filenames to their page titles without changing their bodies', () => {
  assert.ok(importer, 'expected the professional People importer module');
  const pages = importer.markdownPagesFromEntries([
    {
      path: 'People 123/Alex Example 456.md',
      body: '# Alex Example\n\n### Overview\n\nExact body.'
    },
    {
      path: 'People 123/Ignore me.txt',
      body: 'Not Markdown'
    }
  ]);
  assert.equal(pages.get('Alex Example'), '# Alex Example\n\n### Overview\n\nExact body.');
  assert.equal(pages.size, 1);
});

test('CLI dry run reports the import without changing the named output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'professional-people-import-'));
  try {
    const peoplePath = join(directory, 'people.json');
    const csvPath = join(directory, 'people_all.csv');
    const pagesPath = join(directory, 'pages');
    const outputPath = join(directory, 'output.json');
    mkdirSync(pagesPath);
    writeFileSync(peoplePath, JSON.stringify(PEOPLE));
    writeFileSync(csvPath, CSV);
    writeFileSync(join(pagesPath, 'alex.md'), '# Alex Example\n\nBody');
    writeFileSync(outputPath, 'unchanged');

    const stdout = execFileSync(process.execPath, [
      'scripts/import-professional-people.mjs',
      '--people', peoplePath,
      '--csv', csvPath,
      '--pages-dir', pagesPath,
      '--out', outputPath
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(JSON.parse(stdout).matched_rows, 1);
    assert.equal(readFileSync(outputPath, 'utf8'), 'unchanged');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
