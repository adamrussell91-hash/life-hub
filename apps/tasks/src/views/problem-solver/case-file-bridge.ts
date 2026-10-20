// apps/tasks/src/views/problem-solver/case-file-bridge.ts
// Writes the case file to a Tasks page, then tells the session (link_case_file). The page is
// the only writer: the server never touches Tasks. A project made for the case file is
// remembered, so a retry after a failed append never makes a second one.
import type { Block } from '@/schemas/block';
import type { PsCaseFileOffer, PsCaseFileTarget, PsSession } from '../../../../../packages/problem-solver/types';
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
};

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
  let made: string | null = null;

  async function append(target: PsCaseFileTarget, blocks: Block[]): Promise<void> {
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
    if (fresh.length) await put(target.id, { page_blocks: [...existing, ...fresh] });
  }

  return {
    /**
     * Write `offer` and link it. A write goes to `choice.place` (a new project is made once,
     * named by the case file's title); an update goes where the case file already is unless
     * `moved` (its page is gone) sends the full file to `choice.place`.
     */
    async write(session: PsSession, offer: PsCaseFileOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
      const full = offer.kind === 'write' || Boolean(choice.moved);
      const file = { ...offer.file, title: choice.title };
      const sent: PsCaseFileOffer = full ? { ...offer, kind: 'write', file } : offer;
      let target: PsCaseFileTarget;
      if (!full && session.caseFile) target = session.caseFile.target;
      else if (choice.place === 'new') {
        made ??= (await deps.createProject({ title: choice.title })).id;
        target = { kind: 'project', id: made };
      } else target = choice.place;
      await append(target, caseFileBlocks(sent, { sessionId: session.id, date: deps.today() }));
      const sections = full ? offer.digests : Object.fromEntries(offer.changed.map((key) => [key, offer.digests[key]]));
      const title = full ? choice.title : session.caseFile!.title;
      await deps.link({ target, version: offer.version, title, sections, ...(choice.moved ? { moved: true } : {}) });
    }
  };
}
