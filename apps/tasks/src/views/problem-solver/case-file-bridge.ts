// apps/tasks/src/views/problem-solver/case-file-bridge.ts
// Writes the case file to a Tasks page, then tells the session (link_case_file). The page is
// the only writer: the server never touches Tasks. A project made for the case file is
// remembered (as one shared promise), so a retry after a failed append never makes a second
// one; if that project is later deleted, it is forgotten and the next try makes a fresh one.
// One case-file write runs at a time. Decision Maker passes its own blocks and a provenance
// graphic: the graphic goes above the text, and if it will not write the text still does,
// the session is told (`graphic: false`) and a later `graphic` offer retries just the image.
import type { Block } from '@/schemas/block';
import type { PsCaseFileOffer, PsCaseFileTarget, PsRecordOffer, PsSession } from '../../../../../packages/problem-solver/types';
import { nameVersion } from '../../../../../packages/problem-solver/naming.mjs';
import { caseFileBlocks } from './case-file-blocks';

type Entity = { id: string; page_blocks?: Block[] };
type Deps = {
  createProject(body: { title: string }): Promise<{ id: string }>;
  getProject(id: string): Promise<Entity>;
  updateProject(id: string, body: { page_blocks: Block[] }): Promise<unknown>;
  getTask(id: string): Promise<Entity>;
  updateTask(id: string, body: { page_blocks: Block[] }): Promise<unknown>;
  link(payload: Record<string, unknown>): Promise<void>;
  today(): string; // YYYYMMDD
  /** The page blocks for an offer (Problem Solver's case file by default). */
  blocks?(offer: PaperOffer, opts: { sessionId: string; date: string }): Block[];
  /** An image block written above the text on a full write, or null for none. */
  graphic?(offer: PaperOffer, opts: { sessionId: string; date: string }): Block | null;
};

/** What the card writes: Problem Solver's case file or Decision Maker's decision record. */
export type PaperOffer = PsCaseFileOffer | PsRecordOffer;

export type CaseFilePlace = PsCaseFileTarget | 'new';

/** The page the case file was on has gone; the card asks for another place. */
export class CaseFilePageGone extends Error {
  constructor() {
    super('The page the case file was on is gone. Pick another place for it.');
    this.name = 'CaseFilePageGone';
  }
}

// ApiClientError carries the HTTP status as `status`.
const isMissing = (err: unknown) => (err as { status?: number }).status === 404;

export function createCaseFileBridge(deps: Deps) {
  /** The project made for the case file, shared by every write (one createProject). */
  let made: Promise<string> | null = null;
  let writing = false;

  /** Add the blocks the page lacks, at the end or just before block `before` when it is there. */
  async function append(target: PsCaseFileTarget, blocks: Block[], before?: string): Promise<void> {
    const get = target.kind === 'project' ? deps.getProject : deps.getTask;
    const put = target.kind === 'project' ? deps.updateProject : deps.updateTask;
    let entity: Entity;
    try {
      entity = await get(target.id);
    } catch (err) {
      if (isMissing(err)) throw new CaseFilePageGone();
      throw err;
    }
    const existing = Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
    const have = new Set(existing.map((block) => block.id));
    const fresh = blocks.filter((block) => !have.has(block.id));
    if (!fresh.length) return;
    const at = before ? existing.findIndex((block) => block.id === before) : -1;
    await put(target.id, { page_blocks: at < 0 ? [...existing, ...fresh] : [...existing.slice(0, at), ...fresh, ...existing.slice(at)] });
  }

  const api = {
    /**
     * Write `offer` and link it. A write goes to `choice.place` (a new project is made once,
     * named by the case file's title); an update goes where the case file already is unless
     * `moved` (its page is gone) sends the full file to `choice.place`.
     */
    async write(session: PsSession, offer: PaperOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
      if (writing) throw new Error('The case file is still being written.');
      writing = true;
      try {
        await writeOnce(session, offer, choice);
      } finally {
        writing = false;
      }
    }
  };

  const blocksFor = deps.blocks ?? ((offer: PaperOffer, opts: { sessionId: string; date: string }) => caseFileBlocks(offer as PsCaseFileOffer, opts));

  /** Retry the graphic alone: above the record's heading on the page it is already on. */
  async function retryGraphic(session: PsSession, offer: PaperOffer): Promise<void> {
    const record = session.caseFile;
    const opts = { sessionId: session.id, date: deps.today() };
    const image = deps.graphic?.(offer, opts);
    if (!record || !image) throw new Error('There is no graphic to write.');
    const heading = blocksFor({ ...offer, kind: 'write' } as PaperOffer, opts)[0]?.id;
    await append(record.target, [image], heading);
    await deps.link({ target: record.target, version: record.version, title: record.title, sections: offer.digests, graphic: true });
  }

  async function writeOnce(session: PsSession, offer: PaperOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
    if (offer.kind === 'graphic') return retryGraphic(session, offer);
    const full = offer.kind === 'write' || Boolean(choice.moved);
    // A first write takes its version from the title the person settled on; a later or moved
    // write keeps the offer's (the card refuses a title that disagrees).
    const first = offer.kind === 'write' && !choice.moved && !session.caseFile;
    const version = first ? (nameVersion(choice.title) ?? offer.version) : offer.version;
    const file = { ...offer.file, title: choice.title, version };
    const sent = (full ? { ...offer, kind: 'write', version, file } : offer) as PaperOffer;
    let target: PsCaseFileTarget;
    let ours: Promise<string> | null = null;
    if (!full && session.caseFile) target = session.caseFile.target;
    else if (choice.place === 'new') {
      if (!made) {
        const creating = deps.createProject({ title: choice.title }).then((project) => project.id);
        creating.catch(() => {
          if (made === creating) made = null;
        });
        made = creating;
      }
      ours = made;
      target = { kind: 'project', id: await ours };
    } else target = choice.place;
    const opts = { sessionId: session.id, date: deps.today() };
    const text = blocksFor(sent, opts);
    const image = full && deps.graphic ? deps.graphic(sent, opts) : null;
    /** Whether the graphic wrote; left out when there is none to write. */
    let graphic: boolean | undefined;
    try {
      if (image) {
        try {
          await append(target, [image, ...text]);
          graphic = true;
        } catch (err) {
          if (err instanceof CaseFilePageGone) throw err;
          await append(target, text);
          graphic = false;
        }
      } else await append(target, text);
    } catch (err) {
      // The project made for the case file has been deleted: make a fresh one next time.
      if (err instanceof CaseFilePageGone && ours && made === ours) made = null;
      throw err;
    }
    const sections = full ? offer.digests : Object.fromEntries(offer.changed.map((key) => [key, offer.digests[key]]));
    const title = full ? choice.title : session.caseFile!.title;
    await deps.link({ target, version, title, sections, ...(choice.moved ? { moved: true } : {}), ...(graphic === undefined ? {} : { graphic }) });
  }

  return api;
}
