import type { Page } from "../domain/page";
import type { LexicalDoc } from "../lib/lexicalRetrieve";
import { blockedIdsFor } from "./apply";
import { addCrossBookCandidates, bookLabelFromOrigins } from "./crossBook";
import { rankCandidates, type VectorHit } from "./candidates";
import { capChanged, parseNameStatus } from "./changedPages";
import { parseJudgements, type JudgedLink } from "./propose";
import {
  appendProposals,
  dropDismissedMentioning,
  dropPairsMentioning,
  linkBoth,
  makeProposal,
  stripConnected,
} from "./proposals";
import {
  CuratorStateSchema,
  routeConfidence,
  type AutoApproved,
  type DismissedPair,
  type PendingProposal,
} from "./schema";

export type CorpusEntry = {
  pageId: string;
  title: string;
  excerpt: string;
  vector: ArrayLike<number>;
};

export type CuratorIO = {
  gitNameStatus: (fromSha: string) => Promise<string>;
  headSha: () => Promise<string>;
  readState: () => Promise<unknown>;
  writeState: (state: { lastProcessedSha: string }) => Promise<void>;
  readPending: () => Promise<PendingProposal[]>;
  writePending: (pending: PendingProposal[]) => Promise<void>;
  readDismissed: () => Promise<DismissedPair[]>;
  writeDismissed: (dismissed: DismissedPair[]) => Promise<void>;
  readPage: (id: string) => Promise<Page | null>;
  writePage: (page: Page) => Promise<void>;
  listPageIds: () => Promise<string[]>;
  corpus: CorpusEntry[];
  lexicalDocs?: LexicalDoc[];
  embed: (text: string) => Promise<number[]>;
  judge: (note: Page, candidates: VectorHit[]) => Promise<JudgedLink[]>;
  now: () => string;
  excerpt: (body: string) => string;
  bookOf?: (pageId: string) => string | undefined;
  readAutoApproved?: () => Promise<AutoApproved[]>;
  writeAutoApproved?: (rows: AutoApproved[]) => Promise<void>;
  patchManifest?: (updates: { id: string; connected: string[] }[]) => Promise<void>;
};

export function excerptLine(body: string) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 157);
}

/** git's empty tree — first curator run diffs the whole tree, then RUN_CAP slices it. */
export const GIT_EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export async function runCurator(io: CuratorIO) {
  const parsed = CuratorStateSchema.safeParse(await io.readState());
  if (!parsed.success) throw new Error("curator state missing lastProcessedSha");
  const fromSha = parsed.data.lastProcessedSha;
  const head = await io.headSha();
  if (fromSha === head) {
    return { processed: 0, proposed: 0, heldBack: 0 };
  }

  const { process, deleted } = capChanged(parseNameStatus(await io.gitNameStatus(fromSha)));
  let pending = await io.readPending();
  let dismissed = await io.readDismissed();
  let proposed = 0;
  let heldBack = 0;

  for (const gone of deleted) {
    pending = dropPairsMentioning(pending, gone.id);
    dismissed = dropDismissedMentioning(dismissed, gone.id);
    const ids = await io.listPageIds();
    for (const id of ids) {
      const page = await io.readPage(id);
      if (!(page?.connected ?? []).includes(gone.id)) continue;
      await io.writePage({ ...page, connected: stripConnected(page.connected, gone.id) });
    }
  }

  const incoming: PendingProposal[] = [];
  const autoApproved: AutoApproved[] = [];
  const manifestUpdates = new Map<string, string[]>();
  const written = new Map<string, Page>();
  const readCurrent = async (id: string) => written.get(id) ?? io.readPage(id);
  for (const change of process) {
    const page = await readCurrent(change.id);
    if (!page) continue;
    let connected = [...(page.connected ?? [])];
    const query = `${page.title}\n\n${io.excerpt(page.body)}`;
    const useLexical = !io.corpus.some(entry => entry.vector.length);
    const vector = useLexical ? [] : await io.embed(query);
    const skip = blockedIdsFor(page.id, pending, dismissed);
    for (const item of incoming) {
      if (item.noteA === page.id) skip.add(item.noteB);
      if (item.noteB === page.id) skip.add(item.noteA);
    }
    const ranked = rankCandidates({
      sourceId: page.id,
      sourceVector: vector,
      corpus: io.corpus,
      connected,
      skip,
      query,
      lexicalDocs: io.lexicalDocs,
    });
    heldBack += ranked.heldBack.length;
    const sourceBook = bookLabelFromOrigins(page.origins) ?? io.bookOf?.(page.id);
    const linking = io.bookOf
      ? addCrossBookCandidates({
          sourceBook,
          linking: ranked.linking,
          sourceId: page.id,
          sourceVector: vector,
          corpus: io.corpus,
          connected,
          skip,
          query,
          lexicalDocs: io.lexicalDocs,
          bookOf: io.bookOf,
        })
      : ranked.linking;
    const judgements = await io.judge(page, linking);
    const byId = new Map(linking.map(hit => [hit.pageId, hit]));
    for (const judgement of judgements) {
      const hit = byId.get(judgement.pageId);
      if (!hit) continue;
      const proposal = makeProposal({
        noteA: page.id,
        noteB: hit.pageId,
        titleA: page.title,
        titleB: hit.title,
        excerptA: io.excerpt(page.body),
        excerptB: hit.excerpt || io.excerpt(""),
        relation: judgement.relation,
        rationale: judgement.rationale,
        proposedAt: io.now(),
        confidence: judgement.confidenceExplicit ? judgement.confidence : undefined,
        bookA: sourceBook,
        bookB: hit.book ?? io.bookOf?.(hit.pageId),
      });
      const canRecord = Boolean(io.writeAutoApproved && io.readAutoApproved && io.patchManifest);
      if (routeConfidence(judgement) !== "auto" || judgement.confidence === undefined || !canRecord) {
        incoming.push(proposal);
        continue;
      }
      const other = await readCurrent(hit.pageId);
      if (!other) {
        incoming.push(proposal);
        continue;
      }
      const linked = linkBoth(connected, other.connected, page.id, other.id);
      connected = linked.a;
      const nextPage = { ...page, connected: linked.a };
      const nextOther = { ...other, connected: linked.b };
      await io.writePage(nextPage);
      await io.writePage(nextOther);
      written.set(nextPage.id, nextPage);
      written.set(nextOther.id, nextOther);
      manifestUpdates.set(nextPage.id, nextPage.connected ?? []);
      manifestUpdates.set(nextOther.id, nextOther.connected ?? []);
      autoApproved.push({
        noteA: proposal.noteA,
        noteB: proposal.noteB,
        titleA: proposal.titleA,
        titleB: proposal.titleB,
        bookA: proposal.bookA ?? sourceBook ?? "",
        bookB: proposal.bookB ?? hit.book ?? io.bookOf?.(hit.pageId) ?? "",
        relation: proposal.relation,
        rationale: proposal.rationale,
        confidence: judgement.confidence,
        approvedAt: io.now(),
      });
    }
  }

  if (autoApproved.length) {
    if (!io.writeAutoApproved || !io.readAutoApproved) {
      throw new Error("curator cannot record auto-approved links");
    }
    const existing = await io.readAutoApproved();
    await io.writeAutoApproved([...existing, ...autoApproved]);
    if (!io.patchManifest) throw new Error("curator cannot update the manifest for auto-approved links");
    await io.patchManifest([...manifestUpdates].map(([id, ids]) => ({ id, connected: ids })));
  }

  const nextPending = appendProposals(pending, incoming);
  proposed = nextPending.length - pending.length;
  await io.writePending(nextPending);
  await io.writeDismissed(dismissed);
  await io.writeState({ lastProcessedSha: head });
  return { processed: process.length, proposed, heldBack };
}

export { parseJudgements };
