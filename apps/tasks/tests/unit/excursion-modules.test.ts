import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPLIANCE_MODULES,
  cloneDefaultComplianceModules,
  complianceModulesByCategory
} from '@/domain/excursion-modules';

describe('excursion compliance catalog', () => {
  it('has a unique id for every module', () => {
    const ids = DEFAULT_COMPLIANCE_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clones independently — mutating a clone does not affect the catalog', () => {
    const clone = cloneDefaultComplianceModules();
    clone[0]!.on = !clone[0]!.on;
    expect(clone[0]!.on).not.toBe(DEFAULT_COMPLIANCE_MODULES[0]!.on);
  });

  it('groups modules by category in a stable order, dropping empty categories', () => {
    const groups = complianceModulesByCategory(DEFAULT_COMPLIANCE_MODULES);
    expect(groups.map((g) => g.category)).toEqual([
      'staff',
      'medical',
      'transport',
      'docs',
      'dayof',
      'post'
    ]);
    for (const group of groups) {
      expect(group.modules.every((m) => m.category === group.category)).toBe(true);
    }

    const staffOnly = DEFAULT_COMPLIANCE_MODULES.filter((m) => m.category === 'staff');
    expect(complianceModulesByCategory(staffOnly).map((g) => g.category)).toEqual(['staff']);
  });
});
