/**
 * A rough check for abusive words in student peer feedback. Anything it
 * flags is held back for the teacher; it never blocks a student from sending.
 *
 * It is deliberately simple. It catches the obvious, plus common dodges:
 * leetspeak (sh1t), stretched letters (fuuuck), punctuation inside a word
 * (f.u.c.k) and spaced-out letters (f u c k). Kids will still get past it;
 * the teacher view and "Show student symbols" are the real backstop.
 */

/** Matched as whole words after normalising. */
const WORDS = [
  'arse', 'arsehole', 'ass', 'asshole', 'bastard', 'bellend', 'bitch', 'bollocks', 'bugger', 'crap',
  'cunt', 'dick', 'dickhead', 'dumb', 'dumbass', 'dyke', 'fag', 'faggot', 'fuck', 'garbage', 'hoe',
  'idiot', 'kys', 'loser', 'moron', 'nigga', 'nigger', 'paki', 'pathetic', 'piss', 'prick', 'pussy',
  'retard', 'retarded', 'shit', 'skank', 'slag', 'slut', 'spastic', 'spaz', 'stupid', 'tits', 'trash',
  'twat', 'ugly', 'wank', 'wanker', 'whore', 'boong', 'coon', 'chink', 'spic', 'kike', 'tranny', 'lesbo',
  'sucks'
];
/* Left out on purpose: words that turn up in ordinary English analysis
   ("bloody", "hate", "fat", "gay" in older poems, "cock" crowing). */

/** Matched at the start of a word, so endings don't slip past (fucking, shitty, wankers). */
const STEMS = ['fuck', 'fuk', 'shit', 'cunt', 'bitch', 'wank', 'slut', 'whore', 'fag', 'retard', 'nigg', 'twat', 'dickhead', 'asshole', 'arsehole', 'bastard', 'motherf', 'stfu'];

/** Phrases checked across the whole normalised text. */
const PHRASES = ['kill yourself', 'kill urself', 'go die', 'shut up', 'no one likes you', 'nobody likes you', 'you suck', 'ur dumb', 'your dumb', 'youre dumb'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

const wordSet = new Set(WORDS);

function normalise(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0134578@$!|+]/g, (c) => LEET[c] ?? c)
    // Punctuation inside a word (f.u.c.k, s*it) joins the letters.
    .replace(/(?<=[a-z])[.*_\-'’~^](?=[a-z])/g, '')
    .replace(/[^a-z\s]/g, ' ');
}

/** "fuuuck" → "fuck", while keeping one real double ("ass", "kill"). */
const squeeze = (word) => word.replace(/(.)\1{2,}/g, '$1$1');
const single = (word) => word.replace(/(.)\1+/g, '$1');

function hit(word) {
  for (const form of new Set([word, squeeze(word), single(word)])) {
    if (wordSet.has(form)) return true;
    if (STEMS.some((stem) => form.startsWith(stem))) return true;
  }
  return false;
}

export function flagText(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const clean = normalise(text);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.some(hit)) return true;

  // Spaced-out letters: "f u c k" or "s h i t".
  const runs = clean.match(/\b(?:[a-z] ){2,}[a-z]\b/g) ?? [];
  if (runs.some((run) => hit(run.replace(/ /g, '')))) return true;

  const flat = ` ${words.map(squeeze).join(' ')} `;
  return PHRASES.some((phrase) => flat.includes(` ${phrase} `));
}
