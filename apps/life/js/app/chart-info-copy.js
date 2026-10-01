/**
 * Home chart "i" copy. Windows and units match the renderers.
 * Stimulus gate copy is the model from the chart-info brief.
 */

export function stimulusGateInfo(windowDays) {
  const window = windowDays ? `the last ${windowDays} days` : 'usually the last 28 days';
  return {
    id: 'life.home.stimulus.gate',
    title: 'Stimulus',
    what: 'Whether your training and protein are enough for the forecast to assume you keep muscle while losing fat. Miss a key and the forecast assumes some loss is muscle, so your body-fat date moves later.',
    how: `Each ring is your average over ${window}, scaled from zero to twice the pass mark so every pass mark sits on the orange spoke. Sessions count completed workouts with a set above 0 kg and 0 reps. Upper sets count chest, shoulders, arms, back and full-body sets. Protein is typical daily protein ÷ current weight. A white dot means the ring is off the scale. The thin line is your last 7 days of training, or your last 4 fully logged protein days, fading from your average to a dot: green clears the gate, red does not, and unlogged days are skipped.`
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
