import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeProfessionalProfile,
  parseProfessionalProfile
} from '../../netlify/functions/_shared/professional-profile.mjs';

test('parseProfessionalProfile accepts hub-sourced profiles', () => {
  const parsed = parseProfessionalProfile({
    schema_version: 1,
    source: { system: 'hub', page_url: null, properties: {} },
    summary: 'Notes',
    contact: { email: null, phone: null, linkedin_url: 'https://www.linkedin.com/in/x' },
    last_contacted: null,
    current_workplace: ['Example College'],
    references: {},
    body_markdown: null
  });
  assert.equal(parsed.source.system, 'hub');
  assert.equal(parsed.summary, 'Notes');
  assert.equal(parsed.contact.linkedin_url, 'https://www.linkedin.com/in/x');
});

test('mergeProfessionalProfile creates a hub shell and preserves Notion provenance', () => {
  const fromEmpty = mergeProfessionalProfile(null, {
    summary: 'Hello',
    linkedin_url: 'https://www.linkedin.com/in/a',
    current_workplace: ['College']
  });
  assert.equal(fromEmpty.source.system, 'hub');
  assert.equal(fromEmpty.summary, 'Hello');

  const notion = parseProfessionalProfile({
    schema_version: 1,
    source: {
      system: 'notion',
      page_url: 'https://www.notion.so/page',
      properties: { Notes: 'old' }
    },
    summary: 'old',
    contact: { email: 'a@b.c', phone: null, linkedin_url: null },
    last_contacted: null,
    current_workplace: [],
    references: {},
    body_markdown: null
  });
  const merged = mergeProfessionalProfile(notion, {
    summary: 'new notes',
    linkedin_url: 'https://www.linkedin.com/in/b'
  });
  assert.equal(merged.source.system, 'notion');
  assert.equal(merged.source.page_url, 'https://www.notion.so/page');
  assert.equal(merged.summary, 'new notes');
  assert.equal(merged.contact.email, 'a@b.c');
  assert.equal(merged.contact.linkedin_url, 'https://www.linkedin.com/in/b');
});
