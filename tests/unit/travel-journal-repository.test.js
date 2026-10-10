import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelJournalRepository } from '../../netlify/functions/_shared/travel-journal-repository.mjs';
import { emptyJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

function fakeGithub() {
  const files = new Map();
  return {
    async resolveTree() {
      return {
        tree: [...files.entries()].map(([path, { sha }]) => ({ path, type: 'blob', sha }))
      };
    },
    async readBlob(sha) {
      for (const [, value] of files) {
        if (value.sha === sha) {
          return { content: Buffer.from(value.content, 'utf8').toString('base64'), encoding: 'base64' };
        }
      }
      throw new Error('missing blob');
    },
    async writeFile({ path, content, sha }) {
      const existing = files.get(path);
      if (existing && sha && existing.sha !== sha) {
        const err = new Error('sha does not match');
        err.status = 409;
        throw err;
      }
      const nextSha = `ccccccccccccccccccccccccccccccccccccccc${files.size}`.slice(0, 40);
      files.set(path, { content, sha: nextSha });
      return { sha: nextSha, commitSha: nextSha };
    },
    _files: files
  };
}

test('createTravelJournalRepository get/create/save', async () => {
  const github = fakeGithub();
  const repo = createTravelJournalRepository({ github });
  const journal = emptyJournal('trp_journal_repo01');
  const created = await repo.createJournal(journal);
  assert.equal(created.journal.trip_id, 'trp_journal_repo01');

  const got = await repo.getJournal('trp_journal_repo01');
  assert.equal(got.version, created.version);

  const next = { ...got.journal, title: 'Renamed', revision: 1 };
  const saved = await repo.saveJournal(next, got.version, 'travel-journal: edit');
  assert.equal(saved.journal.title, 'Renamed');
  assert.notEqual(saved.version, got.version);
});

test('stale sha becomes 409 conflict on saveJournal', async () => {
  const github = fakeGithub();
  const repo = createTravelJournalRepository({ github });
  const journal = emptyJournal('trp_conflict01');
  await repo.createJournal(journal);
  await assert.rejects(
    () => repo.saveJournal(journal, 'dddddddddddddddddddddddddddddddddddddddd', 'travel-journal: edit'),
    (err) => err.code === 'conflict' && err.status === 409
  );
});
