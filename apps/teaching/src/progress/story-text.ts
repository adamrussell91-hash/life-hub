import type { PieceCol, Place, Story } from './types';

export const STEP_ORDER: Place[] = ['starting', 'building', 'secure', 'extending'];
export const RUNG_ORDER: Place[] = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];
const NAMES: Record<Place, string> = { starting: 'Starting', building: 'Building', secure: 'Secure', extending: 'Extending', below: 'On the way to Capable', capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent' };
export const placeName = (p: Place | null): string => (p ? NAMES[p] : '');
/** Words that never appear in what a student reads about their own learning. */
export const BANNED = ['weak', 'struggling', 'struggle', 'not', 'never', 'lacks', 'without', 'dropped', 'fail', 'poor'];

const nextOf = (p: Place): Place | null => {
  const ladder = STEP_ORDER.includes(p) ? STEP_ORDER : RUNG_ORDER;
  return ladder[ladder.indexOf(p) + 1] ?? null;
};

/** The one-line story under an outcome, concept or skill. `code` is the display code looked up from the payload's code grid. */
export function storyText(story: Story, code: string | null, skill: boolean, pieces: PieceCol[] = []): string {
  if (story.kind === 'holding') {
    const next = nextOf(story.step);
    const tail = code && !skill ? `Next step to ${placeName(next)}: see ${code}.` : `Next step: ${placeName(next)}.`;
    return `Holding at ${placeName(story.step)} for your last ${story.count} pieces. ${tail}`;
  }
  if (story.kind === 'moved_up') {
    const p = pieces.find((x) => x.id === story.piece_id);
    return `Moved up from ${placeName(story.from)} to ${placeName(story.to)}${p ? ` on ${p.label} (${p.date})` : ''}.`;
  }
  if (story.kind === 'few') return `${story.count} ${story.count === 1 ? 'piece' : 'pieces'} so far. More pieces will show the pattern.`;
  return `Now at ${placeName(story.step)}.`;
}
