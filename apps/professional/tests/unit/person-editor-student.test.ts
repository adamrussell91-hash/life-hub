import { describe, expect, it, vi, beforeEach } from 'vitest';

const roles = vi.hoisted(() => ({
  addPersonRole: vi.fn(async () => ({ link: {}, chart_synced: true })),
  editPersonRole: vi.fn(async () => ({ link: {}, chart_synced: true })),
  endPersonRole: vi.fn(async () => ({ link: {}, chart_synced: true })),
  removePersonRole: vi.fn(async () => ({ link: {}, chart_synced: true }))
}));
const workplace = vi.hoisted(() => ({ setPersonWorkplace: vi.fn(async () => ({ workplace: null, released_organisation_ref: null })) }));

vi.mock('@/api/people-roles', () => roles);
vi.mock('@/api/people-workplace', () => workplace);
vi.mock('@/api/entities', () => ({
  updatePerson: vi.fn(async () => ({})),
  createEntity: vi.fn(),
  searchEntities: vi.fn(async () => ({ groups: {} }))
}));
vi.mock('@/api/network-ecology', () => ({ fetchSelfPerson: vi.fn(async () => ({ self: { ref: 'shared:person:self' } })) }));
vi.mock('@/api/universal-links', () => ({
  changeUniversalLinkRole: vi.fn(async () => ({})),
  createUniversalLink: vi.fn(async () => ({})),
  endUniversalLink: vi.fn(async () => ({}))
}));
vi.mock('@/api/org-structure', () => ({ fetchOrgStructure: vi.fn(async () => ({ positions: [] })) }));

import { mountIdentityEditor } from '@/components/person-identity-editor';

const SCHOOL = { ref: 'shared:organisation:organisation_1', display_label: 'Tallowwood College' };
const person = {
  kind: 'person',
  id: 'person_1',
  ref: 'shared:person:person_1',
  display_name: 'Ava Tran',
  sort_name: null,
  aliases: [],
  professional_profile: undefined
} as never;

function labels(form: HTMLFormElement): string[] {
  return [...form.querySelectorAll('label.add-person-form__label')].filter((l) => !(l as HTMLElement).hidden).map((l) => l.textContent ?? '');
}

function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('person editor for a student', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it('asks for School and Year, not Organisation and Job title', () => {
    const { form, button } = mountIdentityEditor(person, () => {}, { relationshipRole: 'student' });
    document.body.append(form);
    button.click();
    expect(labels(form)).toContain('School');
    expect(labels(form)).toContain('Year');
    expect(labels(form)).not.toContain('Job title');
    expect(labels(form)).not.toContain('Organisation');
    expect(form.querySelector<HTMLInputElement>('input[aria-label="Year"]')?.placeholder).toBe('e.g. Year 11');
  });

  it('switches the fields when How you know them changes to Student', () => {
    const { form, button } = mountIdentityEditor(person, () => {}, {});
    document.body.append(form);
    button.click();
    expect(labels(form)).toContain('Job title');
    const select = form.querySelector<HTMLSelectElement>('select[aria-label="How you know them"]')!;
    select.value = 'student';
    select.dispatchEvent(new Event('change'));
    expect(labels(form)).toContain('Year');
    expect(labels(form)).not.toContain('Workplace (not in Life Hub)');
  });

  it('saves a year change on the school link, never as a workplace', async () => {
    const { form, button } = mountIdentityEditor(person, () => {}, {
      relationshipRole: 'student',
      school: { ...SCHOOL, linkId: 'link-school', year: 'Year 10' }
    });
    document.body.append(form);
    button.click();
    const year = form.querySelector<HTMLInputElement>('input[aria-label="Year"]')!;
    expect(year.value).toBe('Year 10');
    year.value = 'Year 11';
    await submit(form);
    expect(roles.editPersonRole).toHaveBeenCalledWith({ person_ref: 'shared:person:person_1', link_id: 'link-school', role: 'Year 11' });
    expect(workplace.setPersonWorkplace).not.toHaveBeenCalled();
  });

  it('moves a school saved as a job onto a school link', async () => {
    const { form, button } = mountIdentityEditor(person, () => {}, {
      relationshipRole: 'student',
      organisation: SCHOOL,
      workplaceLinkId: 'link-job',
      jobTitle: 'Year 9'
    });
    document.body.append(form);
    button.click();
    expect(form.querySelector<HTMLInputElement>('input[aria-label="Year"]')!.value).toBe('Year 9');
    await submit(form);
    expect(roles.addPersonRole).toHaveBeenCalledWith({
      person_ref: 'shared:person:person_1',
      organisation_ref: SCHOOL.ref,
      relationship_type: 'studied_at',
      role: 'Year 9'
    });
    expect(roles.removePersonRole).toHaveBeenCalledWith({ person_ref: 'shared:person:person_1', link_id: 'link-job' });
    expect(workplace.setPersonWorkplace).not.toHaveBeenCalled();
  });
});
