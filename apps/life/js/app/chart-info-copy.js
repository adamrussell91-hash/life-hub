/**
 * Chart "i" copy. Windows and units match the renderers.
 * Stimulus gate copy is the model from the chart-info brief.
 * Surfaces that already show a permanent caption or legend do not get an "i".
 */

export function stimulusGateInfo(windowDays) {
  const window = windowDays ? `the last ${windowDays} days` : 'usually the last 28 days';
  return {
    id: 'life.home.stimulus.gate',
    title: 'Stimulus',
    what: 'Whether your training and protein are enough for the forecast to assume you keep muscle while losing fat. Miss a key and the forecast assumes some loss is muscle, so your body-fat date moves later.',
    how: `Each ring is your average over ${window}, scaled from zero to twice the pass mark so every pass mark sits on the orange spoke. Sessions count completed workouts with a set above 0 kg and 0 reps. Upper sets count chest, shoulders, arms, back and full-body sets. Protein is typical daily protein ÷ current weight. A white dot means the ring is off the scale. The thin line is your last 7 days of training, or your last 4 fully logged protein days, fading from your average to a dot: green when that pace is up on the average, red when it is down. Unlogged days are skipped. Whether the average itself clears the gate is the Met / Short pill.`
  };
}

export function stimulusRegionsInfo(windowDays) {
  const window = windowDays ? `the last ${windowDays} days` : 'usually the last 28 days';
  return {
    id: 'life.home.stimulus.regions',
    title: 'Stimulus regions',
    what: 'Where your loaded sets are going, and which regions count toward the upper-body key.',
    how: `Each petal's area is that region's loaded sets per week over ${window}. The dashed ring is 10 sets a week. Chest, shoulders, arms, back and full body feed the upper-body key. Legs and abs are shown and do not count toward it.`
  };
}

export const scaleInfo = {
  id: 'life.home.scale',
  title: 'Scale',
  what: 'Whether your weight is heading into the target range, and how far each weigh-in sits from that line.',
  how: 'The navy line is a Theil-Sen trend over the last 56 days. It needs at least 5 weigh-ins. Each stalk is that day’s weight minus the trend. The band is your target weight range, and the mark ahead is where this slope would enter it. This slope does not set the forecast dates.'
};

export const recompInfo = {
  id: 'life.home.recomp',
  title: 'Recomp forecast',
  what: 'When your weight and body fat would both sit inside the target box, as logged and on plan.',
  how: 'Each clock is one year. One arc is the dates your weight would be in range, one is body fat, and a date only counts where they overlap. The plane plots weight against body fat, with lines of constant lean mass and a road for each scenario. Both use the long intake and training averages. The thin pace lines on Stimulus do not move these dates.'
};

export const energyInfo = {
  id: 'life.home.energy',
  title: 'Energy',
  what: 'How much of this day’s calorie target you have logged.',
  how: 'The ring is logged calories for the date at the top of Home, divided by that day’s target. The target follows the day type and adds a recovery bonus when one applies. The ring fills to the target and stops; the percentage underneath can pass 100.'
};

export const proteinInfo = {
  id: 'life.home.protein',
  title: 'Protein',
  what: 'How much of this day’s protein target you have logged.',
  how: 'The ring is logged protein for the date at the top of Home, divided by that day’s protein target. Recovery days raise the target. The ring fills to the target and stops; the percentage can pass 100.'
};

export const fatInfo = {
  id: 'life.home.fat',
  title: 'Fat',
  what: 'How much of this day’s fat ceiling you have logged.',
  how: 'The ring is logged fat for the date at the top of Home, divided by that day’s fat ceiling. It is a ceiling, not a goal to hit. The ring fills to the ceiling and stops; the percentage can pass 100 when you are over it.'
};

export const BODY_CHART_INFO = Object.freeze({
  stack: {
    id: 'life.body.shed-stack',
    title: 'Shed stack',
    what: 'How much weight you’ve shed since your heaviest, and what’s still above the band.',
    how: 'One block is one kilogram. Today’s stack is your current weight. Every kilogram shed since your heaviest weigh-in piles beside it, coloured by the year it went. Dashed outlines keep the height the stack used to reach. Blocks still above the target band are tinted.'
  },
  stairs: {
    id: 'life.body.stairs',
    title: 'Stairs',
    what: 'Whether weight is stepping toward the target band.',
    how: 'One step per weigh-in, week, month or quarter depending on the selected range. Down steps and up steps use different colours. Dashed steps at the end are what is left to the band.'
  },
  carved: {
    id: 'life.body.carved',
    title: 'Carved away',
    what: 'How much body fat you’ve taken off the high in this range.',
    how: 'The hatched shape is everything shed from the running high you actually reached in the selected range. Earlier rises never count as progress. The pale sliver under the line is what is left to the target band.'
  },
  scissors: {
    id: 'life.body.scissors',
    title: 'Scissors',
    what: 'Whether body fat and skeletal muscle are moving apart the right way.',
    how: 'Both lines start at the first reading that has fat % and skeletal muscle. Each is percentage change on one shared axis. The shaded gap opens as fat falls and muscle rises.'
  },
  squares: {
    id: 'life.body.squares',
    title: '100 squares',
    what: 'What a composition reading is made of.',
    how: 'One hundred squares are 100% of body weight. Fat fills from the top, skeletal muscle from the bottom, and everything else sits between. Scrub Reading to move between dates; changed squares are marked.'
  }
});

export function bodyChartInfo(viewId) {
  return BODY_CHART_INFO[viewId] ?? null;
}

export const healthThreadsInfo = {
  id: 'life.medical.threads',
  title: 'Health Threads',
  what: 'Your medical story as parallel threads over time — visits, episodes, and related blood markers.',
  how: 'Each lane is a thread such as IBD, Liver, Mind or Acute. Markers are visits or linked blood results; bands are ongoing episodes. Weeks, Months and Years change density. − and + zoom the window around today.'
};

export const repMixInfo = {
  id: 'life.fitness.rep-mix',
  title: 'Rep mix',
  what: 'How your recent valid sets split across rep ranges.',
  how: 'The donut counts completed sets with weight and reps over the last 30 days. Buckets are 1–5 (strength), 6–8 and 9–12 (hypertrophy), and 13+ (endurance). The line above the chart names the dominant bucket.'
};
