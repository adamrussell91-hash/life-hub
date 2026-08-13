function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function normalize(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Keys are normalize(rawName). Values are canonical keys.
const MARKER_ALIASES = {
  '25-oh vitamin d': 'vitamin_d',
  'vitamin d (25-hydroxyvitamin d)': 'vitamin_d',
  'adj. calcium': 'adjusted_calcium',
  'adjusted calcium': 'adjusted_calcium',
  'calcium (adjusted)': 'adjusted_calcium',
  'corrected calcium': 'adjusted_calcium',
  'afp': 'afp',
  'albumin': 'albumin',
  'alk. phosphatase': 'alp',
  'alkaline phosphatase': 'alp',
  'alp': 'alp',
  'alpha 1 globulin': 'alpha_1_globulin',
  'alpha 2 globulin': 'alpha_2_globulin',
  'alt': 'alt',
  'anion gap': 'anion_gap',
  'ast': 'ast',
  'basophils': 'basophils',
  'beta 1 globulin': 'beta_1_globulin',
  'beta 2 globulin': 'beta_2_globulin',
  'bicarbonate': 'bicarbonate',
  'bilirubin': 'bilirubin_total',
  'bilirubin total': 'bilirubin_total',
  'c-reactive protein': 'crp',
  'c-reactive protein (crp)': 'crp',
  'crp': 'crp',
  'caeruloplasmin': 'caeruloplasmin',
  'calcium': 'calcium',
  'calprotectin': 'calprotectin',
  'chloride': 'chloride',
  'cholesterol': 'cholesterol',
  'ck': 'ck',
  'copper': 'copper',
  'creatinine': 'creatinine',
  'egfr': 'egfr',
  'eosinophils': 'eosinophils',
  'esr': 'esr',
  'fasting glucose': 'fasting_glucose',
  'glucose fasting': 'fasting_glucose',
  'ferritin': 'ferritin',
  'gamma globulin': 'gamma_globulin',
  'gamma gt': 'ggt',
  'ggt': 'ggt',
  'globulin': 'globulin',
  'glucose': 'glucose',
  'haematocrit': 'haematocrit',
  'hct': 'haematocrit',
  'haemoglobin': 'haemoglobin',
  'hba1c': 'hba1c_ngsp',
  'hba1c (ngsp)': 'hba1c_ngsp',
  'hba1c (ifcc)': 'hba1c_ifcc',
  'hdl': 'hdl',
  'hdl-c': 'hdl',
  'hepb core totalab': 'hepb_core_total_ab',
  'hepb sag': 'hepb_sag',
  'hepb surface ab': 'hepb_surface_ab',
  'hepc ab': 'hepc_ab',
  'homocysteine': 'homocysteine',
  'igg1': 'igg1',
  'igg2': 'igg2',
  'igg3': 'igg3',
  'igg4': 'igg4',
  'insulin': 'insulin',
  'iron': 'iron',
  'ldl': 'ldl',
  'ldl-c': 'ldl',
  'lipase': 'lipase',
  'lkm ab': 'lkm_ab',
  'lymphocytes': 'lymphocytes',
  'magnesium': 'magnesium',
  'mch': 'mch',
  'mchc': 'mchc',
  'mcv': 'mcv',
  'mitochondrial ab': 'mitochondrial_ab',
  'monocytes': 'monocytes',
  'mpv': 'mpv',
  'neutrophils': 'neutrophils',
  'non-hdl-c': 'non_hdl',
  'phosphate': 'phosphate',
  'platelets': 'platelets',
  'potassium': 'potassium',
  'procalcitonin': 'procalcitonin',
  'rbc': 'rbc',
  'red cell count': 'rbc',
  'rdw': 'rdw',
  'serum folate': 'serum_folate',
  'sma-v ab': 'sma_v_ab',
  'sodium': 'sodium',
  'tc/hdl-c ratio': 'tc_hdl_ratio',
  'testosterone (total)': 'testosterone_total',
  'total protein': 'total_protein',
  'transferrin': 'transferrin',
  'transferrin saturation': 'transferrin_saturation',
  'triglyceride': 'triglycerides',
  'triglycerides': 'triglycerides',
  'tsh': 'tsh',
  'ttg-iga': 'ttg_iga',
  'urea': 'urea',
  'uric acid': 'uric_acid',
  'vitamin b12': 'vitamin_b12',
  'wbc': 'wcc',
  'wcc': 'wcc',
  'white cells': 'wcc'
};

export function canonicalMarkerKey(rawName) {
  const trimmed = String(rawName ?? '').trim();
  if (!trimmed) {
    console.warn('Unmapped blood marker: (empty)');
    return 'unknown';
  }
  const key = MARKER_ALIASES[normalize(trimmed)];
  if (key) return key;
  console.warn(`Unmapped blood marker: ${trimmed}`);
  return slugify(trimmed);
}
