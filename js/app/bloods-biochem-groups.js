export const BIOCHEM_GROUPS = [
  {
    id: 'electrolytes',
    title: 'Electrolytes & Minerals',
    description: 'Fluid balance, nerve signalling, and muscle function.',
    instrument: 'meter',
    keys: new Set([
      'sodium',
      'potassium',
      'chloride',
      'bicarbonate',
      'anion_gap',
      'calcium',
      'adjusted_calcium',
      'magnesium',
      'phosphate'
    ])
  },
  {
    id: 'kidney',
    title: 'Kidney & Waste Clearance',
    description: 'Waste filtered from the blood and the rate of filtration.',
    instrument: 'tube',
    keys: new Set(['creatinine', 'urea', 'egfr', 'uric_acid'])
  },
  {
    id: 'protein',
    title: 'Protein Profile',
    description: 'Protein fractions and antibody subclasses shown by concentration.',
    instrument: 'protein',
    keys: new Set([
      'alpha_1_globulin',
      'alpha_2_globulin',
      'beta_1_globulin',
      'beta_2_globulin',
      'gamma_globulin',
      'igg1',
      'igg2',
      'igg3',
      'igg4',
      'caeruloplasmin'
    ])
  },
  {
    id: 'other',
    title: 'Other Markers',
    description: 'Additional tests reported with this panel.',
    instrument: 'meter',
    keys: new Set(['afp', 'ck', 'copper', 'testosterone_total'])
  }
];

export function groupBiochemistryMarkers(markers = []) {
  const assigned = new Set();
  return BIOCHEM_GROUPS.map(group => {
    const grouped = markers.filter(marker => {
      if (assigned.has(marker)) return false;
      const belongs = group.id === 'other'
        ? !BIOCHEM_GROUPS.slice(0, -1).some(candidate => candidate.keys.has(marker.key))
        : group.keys.has(marker.key);
      if (belongs) assigned.add(marker);
      return belongs;
    });
    return { ...group, markers: grouped };
  }).filter(group => group.markers.length);
}
