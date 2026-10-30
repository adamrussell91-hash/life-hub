// Synthetic skincare routine for tests. Invented products only; the live routine
// lives in the private data repo's config/skincare-routines.yml.
import { mergeSkincareRoutines } from '../../apps/life/js/app/skincare-routines-data.js';

export const SYNTHETIC_SKINCARE_YAML = `am:
  label: Morning routine
  duration_hint: ~20 min
  products:
    - Example Azelaic Gel 10%
    - Example Probiotic Gel Cream
    - Example Sunscreen SPF 50+
    - Example Green Colour Corrector
    - Example Peach Corrector and Concealer
    - Example Loose Setting Powder
pm:
  label: Evening routine
  duration_hint: ~20 min
  products:
    - Example Cleansing Balm
    - Example Foaming Cream Cleanser
    - Toner
    - Example Retinol Night Treatment
    - Example Barrier Moisturiser
    - Example Repair Moisturiser
extras:
  - Sheet mask
note_chips:
  - Redness
  - Tightness
  - Dryness
  - Congestion
  - Looking good
  - Irritated
  - Sensitive
`;

export const SYNTHETIC_SKINCARE_ROUTINES = mergeSkincareRoutines({
  am: {
    products: [
      'Example Azelaic Gel 10%',
      'Example Probiotic Gel Cream',
      'Example Sunscreen SPF 50+',
      'Example Green Colour Corrector',
      'Example Peach Corrector and Concealer',
      'Example Loose Setting Powder'
    ]
  },
  pm: {
    products: [
      'Example Cleansing Balm',
      'Example Foaming Cream Cleanser',
      'Toner',
      'Example Retinol Night Treatment',
      'Example Barrier Moisturiser',
      'Example Repair Moisturiser'
    ]
  }
});
