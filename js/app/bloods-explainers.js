const KEY_ALIASES = {
  hba1c_ngsp: 'hba1c',
  hba1c_ifcc: 'hba1c',
  bilirubin_total: 'bilirubin',
  cholesterol: 'total_cholesterol',
  hdl_cholesterol: 'hdl',
  transferrin_saturation: 'transferrin_sat',
  serum_folate: 'folate',
  glucose_fasting: 'fasting_glucose'
};

const DISCLAIMER = 'General information, not medical advice.';

const CATEGORY_NOTES = {
  'Inflammation Markers': 'ESR and CRP are read together as a picture of inflammatory activity, not as a diagnosis on their own.',
  'Iron Studies': 'These four markers are read together because they describe the same iron picture from different angles; a high or low result in isolation is usually less meaningful than the pattern across all four.',
  'Liver Function': 'These enzymes and pigments are grouped because they describe liver and bile flow from several angles.',
  'Full Blood Count': 'These counts describe the cells in blood and are usually interpreted as a set, especially when looking for anaemia or infection.',
  'Lipid Studies': 'Cholesterol fractions and triglycerides are read together; the ratio of total cholesterol to HDL is often the number clinicians watch.',
  'Vitamins & Nutrients': 'These are stores that change slowly and are often checked when fatigue, gut disease, or limited sun exposure is in the picture.',
  'Biochemistry/Electrolytes': 'Electrolytes and kidney markers are grouped because fluid balance and filtering sit on the same panel.',
  'Thyroid': 'TSH is usually the first signal; free T4 and T3 confirm the picture when TSH is off.',
  'Glucose/Diabetes': 'Fasting glucose is a snapshot; HbA1c is a roughly three-month average. Zones matter more here than a single in-range band.'
};

const MARKERS = {
  esr: {
    what: 'Measures how fast red cells settle in a test tube; faster settling suggests inflammation somewhere in the body.',
    why: 'Tracked alongside flare activity.',
    high: 'Can suggest active inflammation or infection.',
    low: 'Rarely significant on its own.',
    related: ['crp']
  },
  crp: {
    what: 'A protein the liver produces in response to inflammation; it reacts faster than ESR to acute changes.',
    why: 'Tracked alongside flare activity.',
    high: 'Can suggest active inflammation, infection or flare.',
    low: 'Not typically flagged.',
    related: ['esr']
  },
  calprotectin: {
    what: 'Protein from gut white cells. Raised means mucosal inflammation — the Crohn’s signal even when CRP looks calm.',
    why: 'Tracks mucosal inflammation when systemic markers can look settled.',
    high: 'Suggests active mucosal inflammation, including Crohn’s activity.',
    low: 'Usually reassuring for mucosal inflammation.',
    related: ['crp', 'esr']
  },
  ttg_iga: {
    what: 'An antibody used when checking for coeliac activity. Read with the rest of the gut picture, not alone.',
    why: 'Part of the inflammation / gut panel.',
    high: 'Can suggest coeliac activity; interpreted with other gut markers.',
    low: 'Usually the expected result.',
    related: ['calprotectin']
  },
  ferritin: {
    what: 'Reflects the body\'s stored iron. It can also rise as an inflammation marker, which is why it is read with CRP/ESR.',
    why: 'Tracked given IBD-related depletion risk.',
    high: 'Can mean iron overload, or can rise simply because ferritin is also an inflammation marker.',
    low: 'An early sign of iron deficiency, often before anaemia shows up.',
    related: ['transferrin', 'transferrin_sat', 'iron']
  },
  transferrin: {
    what: 'The protein that carries iron through the blood.',
    why: 'Tracked given IBD-related depletion risk.',
    high: 'Often seen with iron deficiency, as the body makes more of it to hunt for scarce iron.',
    low: 'Can reflect inflammation or overload states.',
    related: ['ferritin', 'transferrin_sat', 'iron']
  },
  transferrin_sat: {
    what: 'The percentage of transferrin actually carrying iron.',
    why: 'Tracked given IBD-related depletion risk.',
    high: 'Possible iron overload.',
    low: 'Possible iron deficiency.',
    related: ['ferritin', 'transferrin', 'iron']
  },
  iron: {
    what: 'The iron currently circulating in blood. It fluctuates through the day so it is read with the other three, not alone.',
    why: 'Tracked given IBD-related depletion risk.',
    high: 'Possible overload or recent supplementation.',
    low: 'Possible deficiency.',
    related: ['ferritin', 'transferrin', 'transferrin_sat']
  },
  bilirubin: {
    what: 'A breakdown product of red blood cells, processed by the liver.',
    why: 'Part of the liver panel.',
    high: 'Can suggest liver strain or bile flow issues.',
    low: 'Not typically flagged.',
    related: ['alt', 'ast', 'ggt', 'alp']
  },
  alp: {
    what: 'Present in liver and bone; a general liver/bile marker.',
    why: 'Part of the liver panel.',
    high: 'Possible liver or bile duct involvement, or bone turnover.',
    low: 'Not typically flagged on its own.',
    related: ['ggt', 'alt', 'ast']
  },
  ggt: {
    what: 'A sensitive liver enzyme, often the first to shift.',
    why: 'Part of the liver panel.',
    high: 'Liver stress; common causes include alcohol, some medications, or fatty liver changes.',
    low: 'Not typically flagged.',
    related: ['alt', 'ast', 'alp']
  },
  alt: {
    what: 'An enzyme concentrated in liver cells, released when they are stressed or damaged.',
    why: 'Part of the liver panel.',
    high: 'Liver inflammation or damage of some kind.',
    low: 'Not typically flagged.',
    related: ['ast', 'ggt']
  },
  ast: {
    what: 'Similar to ALT but also found in muscle and heart tissue, so it is read alongside ALT to localise the source.',
    why: 'Part of the liver panel.',
    high: 'Liver stress, or sometimes muscle-related.',
    low: 'Not typically flagged.',
    related: ['alt', 'ggt']
  },
  haemoglobin: {
    what: 'The oxygen-carrying protein in red blood cells.',
    why: 'Part of the full blood count.',
    high: 'Can reflect dehydration or other causes.',
    low: 'Possible anaemia.',
    related: ['haematocrit', 'mcv']
  },
  haematocrit: {
    what: 'The proportion of blood that is red cells by volume. Moves with haemoglobin.',
    why: 'Part of the full blood count.',
    high: 'Often moves with haemoglobin.',
    low: 'Often moves with haemoglobin.',
    related: ['haemoglobin']
  },
  wcc: {
    what: 'Total infection-fighting cells.',
    why: 'Part of the full blood count.',
    high: 'Possible infection, inflammation or stress response.',
    low: 'Can affect infection resistance.',
    related: ['platelets']
  },
  platelets: {
    what: 'Cells responsible for clotting.',
    why: 'Part of the full blood count.',
    high: 'Relevant depending on cause; usually interpreted alongside symptoms.',
    low: 'Relevant depending on cause; usually interpreted alongside symptoms.',
    related: ['wcc']
  },
  mcv: {
    what: 'Average red cell size; helps classify the type of anaemia if one is present.',
    why: 'Part of the full blood count.',
    high: 'Can point toward B12/folate-pattern anaemia.',
    low: 'Can point toward iron-pattern anaemia.',
    related: ['haemoglobin', 'vitamin_b12', 'folate']
  },
  total_cholesterol: {
    what: 'The overall cholesterol carried in blood, made up of several types below.',
    why: 'Part of the lipid panel.',
    high: 'Interpreted with HDL, LDL and triglycerides, not alone.',
    low: 'Not typically the concern on this panel.',
    related: ['hdl', 'ldl', 'triglycerides']
  },
  hdl: {
    what: 'Often called protective cholesterol; higher is generally favourable here.',
    why: 'Part of the lipid panel.',
    high: 'Generally favourable.',
    low: 'The lipid marker where low is the warning.',
    related: ['ldl', 'total_cholesterol']
  },
  ldl: {
    what: 'The type most associated with cardiovascular risk when elevated over time.',
    why: 'Part of the lipid panel.',
    high: 'The lipid fraction most watched when elevated over time.',
    low: 'Not typically flagged.',
    related: ['hdl', 'total_cholesterol']
  },
  triglycerides: {
    what: 'A blood fat linked to diet, alcohol and metabolic factors.',
    why: 'Part of the lipid panel.',
    high: 'Fasting values are the ones to watch.',
    low: 'Not typically flagged.',
    related: ['hdl', 'ldl']
  },
  vitamin_d: {
    what: 'Supports bone health and immune function; commonly low with limited sun exposure.',
    why: 'Nutrient store often checked with gut disease.',
    high: 'Usually supplementation-related.',
    low: 'Linked to fatigue and bone health over time.',
    related: ['calcium']
  },
  vitamin_b12: {
    what: 'Needed for nerve function and red cell production.',
    why: 'Nutrient store often checked with gut disease.',
    high: 'Usually supplementation-related.',
    low: 'Can cause fatigue and, if prolonged, nerve symptoms.',
    related: ['folate', 'mcv']
  },
  folate: {
    what: 'Works alongside B12 in red cell production.',
    why: 'Nutrient store often checked with gut disease.',
    high: 'Usually supplementation-related.',
    low: 'Can contribute to anaemia.',
    related: ['vitamin_b12', 'mcv']
  },
  sodium: {
    what: 'A key electrolyte for fluid balance.',
    why: 'Part of the biochemistry panel.',
    high: 'Usually followed up promptly.',
    low: 'Usually followed up promptly.',
    related: ['potassium']
  },
  potassium: {
    what: 'Critical for heart and muscle function; both extremes matter.',
    why: 'Part of the biochemistry panel.',
    high: 'Followed closely because of heart and muscle effects.',
    low: 'Followed closely because of heart and muscle effects.',
    related: ['sodium']
  },
  urea: {
    what: 'A kidney function marker, cleared from blood by the kidneys.',
    why: 'Part of the biochemistry panel.',
    high: 'Can suggest reduced kidney filtering or dehydration.',
    low: 'Less often the focus.',
    related: ['creatinine', 'egfr']
  },
  creatinine: {
    what: 'A kidney function marker, cleared from blood by the kidneys.',
    why: 'Part of the biochemistry panel.',
    high: 'Can suggest reduced kidney filtering.',
    low: 'Less often the focus.',
    related: ['urea', 'egfr']
  },
  egfr: {
    what: 'An estimate of overall kidney filtering capacity, calculated from creatinine.',
    why: 'Part of the biochemistry panel.',
    high: 'Not typically a warning.',
    low: 'Suggests reduced filtering capacity.',
    related: ['creatinine']
  },
  calcium: {
    what: 'Bone and muscle function marker, also linked to parathyroid activity.',
    why: 'Part of the biochemistry panel.',
    high: 'Followed up with related markers.',
    low: 'Followed up with related markers.',
    related: ['magnesium', 'vitamin_d']
  },
  magnesium: {
    what: 'Involved in muscle, nerve and heart function.',
    why: 'Part of the biochemistry panel.',
    high: 'Less common; usually reviewed with other electrolytes.',
    low: 'Can affect muscle and nerve function.',
    related: ['calcium', 'potassium']
  },
  tsh: {
    what: 'The pituitary\'s signal to the thyroid, usually the first marker checked.',
    why: 'Thyroid screening marker.',
    high: 'Can suggest an underactive thyroid.',
    low: 'Can suggest an overactive thyroid.',
    related: ['free_t4', 'free_t3']
  },
  free_t4: {
    what: 'One of the actual thyroid hormones, checked alongside TSH.',
    why: 'Confirms the thyroid picture.',
    high: 'Interpreted with TSH.',
    low: 'Interpreted with TSH.',
    related: ['tsh', 'free_t3']
  },
  free_t3: {
    what: 'One of the actual thyroid hormones, checked alongside TSH.',
    why: 'Confirms the thyroid picture.',
    high: 'Interpreted with TSH.',
    low: 'Interpreted with TSH.',
    related: ['tsh', 'free_t4']
  },
  fasting_glucose: {
    what: 'Blood sugar after a fasting period; a snapshot measure.',
    why: 'Glucose/diabetes panel.',
    high: 'Interpreted against clinical zones, not only a lab band.',
    low: 'Can reflect fasting or other causes.',
    related: ['hba1c']
  },
  hba1c: {
    what: 'A rolling average of blood sugar over roughly the past three months, less affected by a single day\'s food or fasting.',
    why: 'Glucose/diabetes panel.',
    high: 'Interpreted against clinical zones (normal, at-risk, diabetic range).',
    low: 'Not typically the concern.',
    related: ['fasting_glucose']
  }
};

const FALLBACK = {
  what: 'A laboratory marker from your bloods history.',
  why: 'Included because it appears on a synced panel.',
  high: 'A high result is interpreted by the clinician who ordered the test.',
  low: 'A low result is interpreted by the clinician who ordered the test.',
  related: []
};

export function explainerFor(key) {
  const resolved = KEY_ALIASES[key] || key;
  const entry = MARKERS[resolved] || FALLBACK;
  return { ...entry, disclaimer: DISCLAIMER };
}

export function categoryNote(categoryId) {
  return CATEGORY_NOTES[categoryId] || '';
}
