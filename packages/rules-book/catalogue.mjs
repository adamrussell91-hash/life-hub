// packages/rules-book/catalogue.mjs
// The Rules Book's rules as data (Krogerus and Tschäppeler), for the Rules Book tool.
// Generated once from the private book pack, then kept by hand. No book text, quotation or page
// number lives here. `seeAlso` holds the book's own cross-references and `pairsWell` our own
// suggestions. `reuse` names the Problem Solver or Decision Maker tool a variant is built on;
// `merged` lists the cut-down entries folded into a parent. Every other id starts with `rb_`.

/** The four source groups, in the book's order. `route` is the id a session stores. */
export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'workplace', title: 'How to Survive Meetings, Deadlines and Other Workplace Adventures', route: 'workplace' }),
  Object.freeze({ key: 'change', title: 'When You’re Convinced You Should Be Doing Everything Differently', route: 'change' }),
  Object.freeze({ key: 'people', title: 'Understanding Yourself (and Others) Better', route: 'people' }),
  Object.freeze({ key: 'life', title: 'How to Handle Life’s Big Questions', route: 'life' })
]);

/** Chart families: the shared Decision Book families. */
export const FAMILIES = Object.freeze(['path', 'list', 'quadrant', 'curve', 'scales', 'plot', 'tension']);

const r = (section, id, title, family, tier, { seeAlso = [], pairsWell = [], reuse = null, merged = [] } = {}) =>
  Object.freeze({ id, section, title, family: reuse ? null : family, tier, seeAlso: Object.freeze(seeAlso), pairsWell: Object.freeze(pairsWell), reuse, merged: Object.freeze(merged) });

export const CATALOGUE = Object.freeze([
  r('workplace', 'rb_ketchup', 'The Ketchup Effect', 'curve', 'lens', { seeAlso: [], pairsWell: [], reuse: null, merged: [] }),
  r('workplace', 'rb_parkinson', 'Parkinson’s Law', 'path', 'worksheet', { seeAlso: [], pairsWell: ['kanban'], reuse: null, merged: [] }),
  r('workplace', 'rb_three_three_three', 'The 333 Method', 'list', 'worksheet', { seeAlso: [], pairsWell: [], reuse: null, merged: ['rb_clothes_chair', 'rb_three_minutes'] }),
  r('workplace', 'rb_hofstadter', 'Hofstadter’s Law', 'path', 'worksheet', { seeAlso: [], pairsWell: ['rb_parkinson'], reuse: null, merged: [] }),
  r('workplace', 'rb_plotz', 'Plotz’s Law', 'path', 'lens', { seeAlso: [], pairsWell: ['dm_yes_no'], reuse: null, merged: ['rb_agnes_allen', 'rb_canada'] }),
  r('workplace', 'rb_pareto', 'The Pareto Principle', 'list', 'worksheet', { seeAlso: ['rb_hofstadter'], pairsWell: [], reuse: 'pareto', merged: [] }),
  r('workplace', 'rb_triviality', 'Parkinson’s Law of Triviality', 'curve', 'lens', { seeAlso: [], pairsWell: [], reuse: null, merged: [] }),
  r('workplace', 'rb_brooks', 'Brooks’ Law', 'list', 'worksheet', { seeAlso: [], pairsWell: ['dm_team'], reuse: null, merged: [] }),
  r('workplace', 'rb_goodhart', 'Goodhart’s Law', 'tension', 'lens', { seeAlso: ['rb_unintended'], pairsWell: ['smart'], reuse: null, merged: [] }),
  r('workplace', 'rb_locksmith', 'The Locksmith’s Paradox', 'tension', 'lens', { seeAlso: [], pairsWell: [], reuse: null, merged: [] }),
  r('workplace', 'rb_murphy', 'Murphy’s Law', 'list', 'worksheet', { seeAlso: [], pairsWell: ['dm_swiss_cheese'], reuse: null, merged: [] }),
  r('change', 'rb_chesterton', 'Chesterton’s Fence', 'path', 'worksheet', { seeAlso: [], pairsWell: ['rb_unintended'], reuse: null, merged: ['rb_lindy'] }),
  r('change', 'rb_amara', 'Amara’s Law', 'list', 'lens', { seeAlso: [], pairsWell: ['dm_expectations'], reuse: null, merged: [] }),
  r('change', 'rb_kiss', 'The KISS Principle', 'list', 'worksheet', { seeAlso: [], pairsWell: ['problem_reduction'], reuse: null, merged: ['rb_gall'] }),
  r('change', 'rb_strummer', 'Strummer’s Law', 'path', 'worksheet', { seeAlso: [], pairsWell: ['analogical_reasoning'], reuse: null, merged: ['rb_sutton', 'rb_write_it_down'] }),
  r('change', 'rb_unintended', 'The Law of Unintended Consequences', 'list', 'worksheet', { seeAlso: [], pairsWell: ['causal_map'], reuse: null, merged: ['rb_two_sides'] }),
  r('change', 'rb_ikea', 'The IKEA Effect', 'list', 'lens', { seeAlso: [], pairsWell: ['rb_goodhart'], reuse: null, merged: [] }),
  r('change', 'rb_maya', 'The MAYA Principle', 'plot', 'lens', { seeAlso: ['rb_chesterton'], pairsWell: ['dm_chasm'], reuse: null, merged: [] }),
  r('people', 'rb_wiio', 'Wiio’s Law', 'list', 'worksheet', { seeAlso: [], pairsWell: ['perspective_shift'], reuse: null, merged: [] }),
  r('people', 'rb_peter', 'The Peter Principle', 'list', 'worksheet', { seeAlso: [], pairsWell: ['dm_team'], reuse: null, merged: [] }),
  r('people', 'rb_jaspers', 'Jaspers’ Law', 'tension', 'lens', { seeAlso: ['rb_peter'], pairsWell: ['rb_wiio'], reuse: null, merged: [] }),
  r('people', 'rb_comfort', 'The Law of the Comfort Zone', 'list', 'lens', { seeAlso: [], pairsWell: ['rb_goldilocks'], reuse: null, merged: [] }),
  r('people', 'rb_region_beta', 'The Region-Beta Paradox', 'plot', 'lens', { seeAlso: [], pairsWell: ['rb_comfort'], reuse: null, merged: [] }),
  r('people', 'rb_goldilocks', 'The Goldilocks Principle', 'list', 'worksheet', { seeAlso: [], pairsWell: ['dm_flow'], reuse: null, merged: [] }),
  r('people', 'rb_big_fish', 'The Big-Fish-Little-Pond Effect', 'tension', 'lens', { seeAlso: [], pairsWell: ['rb_goldilocks'], reuse: null, merged: [] }),
  r('life', 'rb_morrison', 'Morrison’s Laws', 'list', 'worksheet', { seeAlso: [], pairsWell: ['rb_three_three_three'], reuse: null, merged: [] }),
  r('life', 'rb_occam', 'Occam’s Razor', 'list', 'worksheet', { seeAlso: [], pairsWell: ['five_whys'], reuse: null, merged: [] }),
  r('life', 'rb_korzybski', 'Korzybski’s Law', 'list', 'worksheet', { seeAlso: [], pairsWell: ['perspective_shift', 'double_loop'], reuse: null, merged: ['rb_box', 'rb_brach', 'rb_instrument'] }),
  r('life', 'rb_one_step', 'The One-Step-Closer Rule', 'list', 'worksheet', { seeAlso: [], pairsWell: ['rb_wiio'], reuse: 'dm_conflict', merged: [] }),
  r('life', 'rb_ten_ten_ten', 'The 10-10-10 Method', 'path', 'worksheet', { seeAlso: [], pairsWell: ['dm_consequences'], reuse: null, merged: [] })
]);

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The entry with this id, or null. */
export const entry = (id) => BY_ID.get(id) ?? null;

/** The entries of a section, in the book's order. */
export const entriesInSection = (key) => CATALOGUE.filter((e) => e.section === key);
