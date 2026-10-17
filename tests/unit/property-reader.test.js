import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PropertyReaderError,
  parseReaderReply,
  proposalsFromReply,
  readPropertyDocument,
  readerSystemPrompt,
  validateReaderFile
} from '../../netlify/functions/_shared/property-reader.mjs';
import { addEntries, emptyPropertyRecord, findDuplicate } from '../../apps/life/js/app/property-model.js';

const PDF = { name: 'statement.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 test').toString('base64') };

test('validateReaderFile accepts PDFs and photos, strips a data URL prefix', () => {
  assert.equal(validateReaderFile(PDF).type, 'application/pdf');
  const photo = validateReaderFile({ name: 'bill.jpg', type: 'image/JPEG', data: `data:image/jpeg;base64,${PDF.data}` });
  assert.equal(photo.type, 'image/jpeg');
  assert.equal(photo.data, PDF.data);
});

test('validateReaderFile rejects other types, bad data and files over 4MB', () => {
  assert.throws(() => validateReaderFile({ ...PDF, type: 'text/plain' }), error => error.code === 'unsupported_file');
  assert.throws(() => validateReaderFile({ ...PDF, data: 'not base64!' }), error => error.code === 'invalid_file');
  assert.throws(() => validateReaderFile(null), error => error.code === 'invalid_file');
  const big = 'A'.repeat(Math.ceil((4 * 1024 * 1024 + 10) / 3) * 4);
  assert.throws(() => validateReaderFile({ ...PDF, data: big }), error => error.code === 'file_too_large' && error.status === 413);
});

test('parseReaderReply finds the JSON inside a code fence', () => {
  assert.deepEqual(parseReaderReply('```json\n{"document":"bill","entries":[]}\n```'), { document: 'bill', entries: [] });
  assert.equal(parseReaderReply('no json here'), null);
  assert.equal(parseReaderReply('{broken'), null);
  assert.equal(parseReaderReply('[1,2]'), null);
});

test('proposalsFromReply keeps valid entries and counts the rest as skipped', () => {
  const result = proposalsFromReply({
    document: 'agent statement',
    summary: 'October statement',
    entries: [
      { kind: 'statement', date: '2026-10-01', gross: '1,300.00', deductions: 143, periodFrom: '2026-09-15', periodTo: '2026-09-30', number: 42 },
      { kind: 'expense', date: '2026-09-20', amount: 180, category: 'repairs', note: 'Plumber', inStatement: true },
      { kind: 'interest', date: 'last month', amount: 900 },
      { kind: 'mystery', date: '2026-10-01' }
    ]
  });
  assert.equal(result.entries.length, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.entries[0].gross, 1300);
  assert.equal(result.entries[0].number, 42);
  assert.equal(result.entries[1].inStatement, true);
  assert.equal(result.summary, 'October statement');
});

test('readerSystemPrompt includes the property context it has', () => {
  const record = emptyPropertyRecord();
  record.tenancy.agent = 'Test Realty';
  const prompt = readerSystemPrompt(record, '2026-10-17');
  assert.match(prompt, /Today is 2026-10-17/);
  assert.match(prompt, /Managing agent: Test Realty/);
  assert.doesNotMatch(prompt, /Lender:/);
});

test('readPropertyDocument sends the PDF as a document block and returns proposals', async () => {
  let sent;
  const fetchImpl = async (url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ content: [{ type: 'text', text: '{"document":"loan statement","summary":"September loan","entries":[{"kind":"interest","date":"2026-09-30","amount":2100.55},{"kind":"balance","date":"2026-09-30","balance":512000}]}' }] });
  };
  const result = await readPropertyDocument({ file: PDF, record: emptyPropertyRecord(), today: '2026-10-17', apiKey: 'key', fetchImpl });
  assert.equal(sent.messages[0].content[0].type, 'document');
  assert.equal(sent.messages[0].content[0].source.media_type, 'application/pdf');
  assert.deepEqual(result.entries.map(entry => entry.kind), ['interest', 'balance']);
});

test('readPropertyDocument explains a missing key, an outage and an unreadable reply', async () => {
  await assert.rejects(readPropertyDocument({ file: PDF, apiKey: '' }), error => error instanceof PropertyReaderError && error.code === 'reader_unconfigured');
  const down = async () => new Response('busy', { status: 529 });
  await assert.rejects(readPropertyDocument({ file: PDF, apiKey: 'k', fetchImpl: down, today: '2026-10-17' }), error => error.code === 'reader_unavailable' && error.retryable);
  const prose = async () => Response.json({ content: [{ type: 'text', text: 'Sorry, I cannot read this.' }] });
  await assert.rejects(readPropertyDocument({ file: PDF, apiKey: 'k', fetchImpl: prose, today: '2026-10-17' }), error => error.code === 'reader_unreadable');
});

test('addEntries saves all or nothing and stamps each entry', () => {
  let n = 0;
  const opts = { newId: () => `id${++n}`, today: '2026-10-17' };
  const ok = addEntries(emptyPropertyRecord(), [
    { kind: 'balance', date: '2026-09-30', balance: 512000 },
    { kind: 'interest', date: '2026-09-30', amount: 2100 }
  ], opts);
  assert.deepEqual(ok.entries.map(entry => entry.id), ['balance-id1', 'interest-id2']);
  assert.equal(ok.record.entries.length, 2);
  assert.equal(ok.entries[0].recordedOn, '2026-10-17');
  const bad = addEntries(emptyPropertyRecord(), [{ kind: 'balance', date: '2026-09-30', balance: 1 }, { kind: 'interest', date: '2026-09-30' }], opts);
  assert.match(bad.error, /^Record 2: /);
  assert.ok(addEntries(emptyPropertyRecord(), [], opts).error);
});

test('findDuplicate matches kind, date and amount', () => {
  const record = { ...emptyPropertyRecord(), entries: [{ id: 's1', kind: 'statement', date: '2026-10-01', gross: 1300, deductions: 143 }] };
  assert.equal(findDuplicate(record, { kind: 'statement', date: '2026-10-01', gross: 1300 })?.id, 's1');
  assert.equal(findDuplicate(record, { kind: 'statement', date: '2026-10-01', gross: 1250 }), null);
  assert.equal(findDuplicate(record, { kind: 'statement', date: '2026-10-15', gross: 1300 }), null);
});
