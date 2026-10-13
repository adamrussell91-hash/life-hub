/**
 * Teacher review for annotation voice tracks (4d).
 * Runs the quote matcher when a track already has words, then lets Adam
 * approve / edit / discard AI clips before publish.
 */
import type { AnnotationAnchor, AnnotationTextModel, AnnotationVoiceTrack } from '@/schemas/block';
import { buildAnchor } from '@/blocks/annotation-anchor';
import { matchQuotes } from '@/blocks/voice-match';
import { segmentClips, type SegmentClip } from '@/blocks/voice-segment';
import { askSelectCard, askTextCard } from '@/teacher/confirm-dialog';

export type VoiceReviewHandle = {
  el: HTMLElement;
  dispose: () => void;
};

export type MountVoiceReviewOptions = {
  track: AnnotationVoiceTrack;
  text: AnnotationTextModel;
  onChange: (track: AnnotationVoiceTrack) => void;
  onClose: () => void;
};

function cloneTrack(track: AnnotationVoiceTrack): AnnotationVoiceTrack {
  return {
    ...track,
    audio: { ...track.audio },
    transcript: {
      timing: track.transcript.timing,
      words: track.transcript.words.map((w) => ({ ...w }))
    },
    taps: track.taps?.map((tap) => ({
      t: tap.t,
      anchor: { ...tap.anchor, quote: { ...tap.anchor.quote } }
    })),
    clips: track.clips.map((clip) => ({
      ...clip,
      word_range: [clip.word_range[0], clip.word_range[1]] as [number, number],
      anchor: clip.anchor
        ? { ...clip.anchor, quote: { ...clip.anchor.quote } }
        : undefined
    })),
    extras: track.extras?.map((extra) => ({ ...extra }))
  };
}

function clipsFromMatch(track: AnnotationVoiceTrack, text: AnnotationTextModel): SegmentClip[] {
  if (track.transcript.words.length === 0) {
    return track.clips.length > 0
      ? track.clips.map((clip) => ({ ...clip }))
      : [
          {
            id: 'clip_1',
            start_s: 0,
            end_s: track.audio.duration_s,
            word_range: [0, 0],
            source: 'manual',
            confidence: 1,
            approved: true,
            transcript_text: ''
          }
        ];
  }
  const { pins } = matchQuotes({
    text,
    words: track.transcript.words,
    taps: track.taps
  });
  return segmentClips({
    pins,
    words: track.transcript.words,
    duration: track.audio.duration_s
  }).map((clip) => ({
    ...clip,
    // Fresh matcher output is treated as AI until Adam approves.
    source: clip.source === 'tap' ? 'tap' : clip.source === 'quote' ? 'ai' : clip.source,
    approved: clip.source === 'tap' || clip.source === 'manual' ? true : false
  }));
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'High';
  if (confidence >= 0.55) return 'Medium';
  return 'Low';
}

function anchorSummary(anchor?: AnnotationAnchor): string {
  if (!anchor) return 'General comment';
  const quote = anchor.quote?.exact?.trim();
  if (quote) return quote.length > 48 ? `${quote.slice(0, 45)}…` : quote;
  if (anchor.line) return `Line ${anchor.line}`;
  return `Stanza ${anchor.stanza}`;
}

function renumber(clips: SegmentClip[]): SegmentClip[] {
  return clips.map((clip, index) => ({ ...clip, id: `clip_${index + 1}` }));
}

/**
 * Build review UI: poem text + clip list with confidence chips and publish gate.
 */
export function mountVoiceReview(options: MountVoiceReviewOptions): VoiceReviewHandle {
  let track = cloneTrack(options.track);
  if (track.clips.length === 0 && track.transcript.words.length > 0) {
    track = { ...track, clips: clipsFromMatch(track, options.text) };
  } else if (track.clips.length === 0) {
    track = { ...track, clips: clipsFromMatch(track, options.text) };
  }

  const el = document.createElement('aside');
  el.className = 'block-editor__annotation-voice-review';
  el.setAttribute('aria-label', 'Voice review');

  const header = document.createElement('div');
  header.className = 'block-editor__annotation-voice-header';
  const heading = document.createElement('h3');
  heading.className = 'block-editor__annotation-note-title';
  heading.textContent = track.title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost';
  closeBtn.textContent = 'Close';
  header.append(heading, closeBtn);

  const warning = document.createElement('p');
  warning.className = 'block-editor__hint block-editor__annotation-voice-warning';
  warning.textContent =
    'Students who get this audio file can play the whole recording, not only the clips.';

  const status = document.createElement('p');
  status.className = 'block-editor__hint';
  status.setAttribute('aria-live', 'polite');

  const list = document.createElement('div');
  list.className = 'block-editor__annotation-voice-clips';

  const footer = document.createElement('div');
  footer.className = 'block-editor__annotation-voice-actions';
  const rematchBtn = document.createElement('button');
  rematchBtn.type = 'button';
  rematchBtn.className = 'btn btn--secondary';
  rematchBtn.textContent = 'Re-match';
  const publishBtn = document.createElement('button');
  publishBtn.type = 'button';
  publishBtn.className = 'btn btn--primary';
  publishBtn.textContent = 'Publish';
  footer.append(rematchBtn, publishBtn);

  el.append(header, warning, status, list, footer);

  function emit(): void {
    options.onChange(cloneTrack(track));
    paint();
  }

  function unapprovedCount(): number {
    return track.clips.filter((clip) => clip.approved === false).length;
  }

  function paint(): void {
    list.replaceChildren();
    const pending = unapprovedCount();
    status.textContent =
      pending === 0
        ? track.status === 'published'
          ? 'Published. Students will see approved clips only.'
          : 'All clips approved. Publish when ready.'
        : `${pending} clip${pending === 1 ? '' : 's'} still need Approve, Edit, or Discard.`;
    publishBtn.disabled = pending > 0;

    track.clips.forEach((clip, index) => {
      const row = document.createElement('article');
      row.className = 'block-editor__annotation-voice-clip';
      row.dataset.clipId = clip.id;

      const top = document.createElement('div');
      top.className = 'block-editor__annotation-voice-clip-top';
      const title = document.createElement('strong');
      title.textContent = `${index + 1}. ${anchorSummary(clip.anchor)}`;
      const chip = document.createElement('span');
      chip.className = `block-editor__annotation-voice-confidence block-editor__annotation-voice-confidence--${confidenceLabel(clip.confidence).toLowerCase()}`;
      chip.textContent = `${confidenceLabel(clip.confidence)} · ${Math.round(clip.confidence * 100)}%`;
      top.append(title, chip);

      const meta = document.createElement('p');
      meta.className = 'block-editor__hint';
      meta.textContent = `${clip.start_s.toFixed(1)}s–${clip.end_s.toFixed(1)}s · ${clip.source}${clip.approved ? '' : ' · needs review'}`;

      const transcript = document.createElement('p');
      transcript.className = 'block-editor__annotation-voice-clip-text';
      transcript.textContent = clip.transcript_text || '(no transcript)';

      const actions = document.createElement('div');
      actions.className = 'block-editor__annotation-voice-clip-actions';

      const isAi = clip.source === 'ai' || clip.source === 'quote';
      if (isAi && !clip.approved) {
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'btn btn--primary';
        approve.textContent = 'Approve';
        approve.addEventListener('click', () => {
          track.clips = track.clips.map((rowClip, i) =>
            i === index ? { ...rowClip, approved: true, source: 'ai' } : rowClip
          );
          emit();
        });

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn--secondary';
        edit.textContent = 'Edit';
        edit.addEventListener('click', async () => {
          const next = await askTextCard({
            title: 'Edit transcript',
            value: clip.transcript_text
          });
          if (next == null) return;
          track.clips = track.clips.map((rowClip, i) =>
            i === index
              ? { ...rowClip, transcript_text: next.trim(), approved: true, source: 'manual' }
              : rowClip
          );
          emit();
        });

        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'btn btn--ghost';
        discard.textContent = 'Discard';
        discard.addEventListener('click', () => {
          // Discard as a pin: fold into neighbouring general span by clearing anchor.
          track.clips = track.clips.map((rowClip, i) =>
            i === index
              ? {
                  ...rowClip,
                  anchor: undefined,
                  source: 'manual',
                  approved: true,
                  confidence: 1
                }
              : rowClip
          );
          emit();
        });
        actions.append(approve, edit, discard);
      }

      const split = document.createElement('button');
      split.type = 'button';
      split.className = 'btn btn--secondary';
      split.textContent = 'Split';
      split.disabled = clip.end_s - clip.start_s < 0.4;
      split.addEventListener('click', async () => {
        const midDefault = ((clip.start_s + clip.end_s) / 2).toFixed(1);
        const raw = await askTextCard({
          title: 'Split at time (seconds)',
          value: midDefault
        });
        if (raw == null) return;
        const mid = Number(raw);
        if (!Number.isFinite(mid) || mid <= clip.start_s + 0.05 || mid >= clip.end_s - 0.05) {
          status.textContent = 'Split time must fall inside the clip.';
          return;
        }
        const words = track.transcript.words;
        let wordSplit = words.findIndex((w) => w.start >= mid);
        if (wordSplit < 0) wordSplit = clip.word_range[1];
        wordSplit = Math.max(clip.word_range[0] + 1, Math.min(clip.word_range[1] - 1, wordSplit));
        const left: SegmentClip = {
          ...clip,
          end_s: mid,
          word_range: [clip.word_range[0], wordSplit],
          transcript_text: words
            .slice(clip.word_range[0], wordSplit)
            .map((w) => w.w)
            .join(' '),
          source: 'manual',
          approved: true
        };
        const right: SegmentClip = {
          ...clip,
          id: `${clip.id}_b`,
          start_s: mid,
          word_range: [wordSplit, clip.word_range[1]],
          transcript_text: words
            .slice(wordSplit, clip.word_range[1])
            .map((w) => w.w)
            .join(' '),
          source: 'manual',
          approved: true,
          anchor: undefined
        };
        const next = [...track.clips];
        next.splice(index, 1, left, right);
        track.clips = renumber(next);
        emit();
      });

      const merge = document.createElement('button');
      merge.type = 'button';
      merge.className = 'btn btn--secondary';
      merge.textContent = 'Merge next';
      merge.disabled = index >= track.clips.length - 1;
      merge.addEventListener('click', () => {
        const nextClip = track.clips[index + 1];
        if (!nextClip) return;
        const merged: SegmentClip = {
          ...clip,
          end_s: nextClip.end_s,
          word_range: [clip.word_range[0], nextClip.word_range[1]],
          transcript_text: [clip.transcript_text, nextClip.transcript_text]
            .filter(Boolean)
            .join(' ')
            .trim(),
          confidence: Math.min(clip.confidence, nextClip.confidence),
          source: 'manual',
          approved: true,
          anchor: clip.anchor ?? nextClip.anchor
        };
        const next = [...track.clips];
        next.splice(index, 2, merged);
        track.clips = renumber(next);
        emit();
      });

      const general = document.createElement('button');
      general.type = 'button';
      general.className = 'btn btn--ghost';
      general.textContent = 'Set general';
      general.addEventListener('click', () => {
        track.clips = track.clips.map((rowClip, i) =>
          i === index
            ? { ...rowClip, anchor: undefined, source: 'manual', approved: true }
            : rowClip
        );
        emit();
      });

      const repin = document.createElement('button');
      repin.type = 'button';
      repin.className = 'btn btn--ghost';
      repin.textContent = 'Re-pin';
      repin.addEventListener('click', async () => {
        const stanzaChoices = options.text.stanzas.map((stanza, stanzaIndex) => ({
          value: stanza.id,
          label: `Stanza ${stanzaIndex + 1}`
        }));
        const stanzaId = await askSelectCard({
          title: 'Pin to stanza',
          choices: stanzaChoices
        });
        if (!stanzaId) return;
        const stanza = options.text.stanzas.find((row) => row.id === stanzaId);
        if (!stanza) return;
        const lineId = await askSelectCard({
          title: 'Pin to line (or whole stanza)',
          choices: [
            { value: '', label: 'Whole stanza' },
            ...stanza.lines.map((line, lineIndex) => ({
              value: line.id,
              label: `${lineIndex + 1}. ${line.text.slice(0, 40)}`
            }))
          ]
        });
        if (lineId == null) return;
        const anchor = lineId
          ? buildAnchor(options.text, {
              stanzaId,
              lineId,
              wholeLine: true
            })
          : buildAnchor(options.text, { stanzaId, wholeStanza: true });
        if (!anchor) return;
        track.clips = track.clips.map((rowClip, i) =>
          i === index
            ? { ...rowClip, anchor, source: 'manual', approved: true, confidence: 1 }
            : rowClip
        );
        emit();
      });

      actions.append(split, merge, general, repin);
      row.append(top, meta, transcript, actions);
      list.append(row);
    });
  }

  rematchBtn.addEventListener('click', () => {
    track = {
      ...track,
      clips: clipsFromMatch(track, options.text),
      status: 'draft'
    };
    emit();
  });

  publishBtn.addEventListener('click', () => {
    if (unapprovedCount() > 0) return;
    track = { ...track, status: 'published' };
    emit();
    status.textContent = 'Published.';
  });

  closeBtn.addEventListener('click', () => options.onClose());

  paint();
  // Persist matcher output on first open when clips were empty.
  options.onChange(cloneTrack(track));

  return {
    el,
    dispose: () => {
      el.remove();
    }
  };
}
