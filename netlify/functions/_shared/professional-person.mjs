import { getGithubPerson, isGithubPersonDeleted } from './github-professional-data.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { mergeProfessionalProfile } from './professional-profile.mjs';

const IDENTITY_FIELDS = ['display_name', 'sort_name', 'aliases'];

// Imported facts are canonical. An intentional Hub edit overrides only the
// fields it changed, and only while their imported baseline remains unchanged.
// A later source correction therefore supersedes an old local edit without
// discarding unrelated local edits or relationship/job-title records.
export function mergeProfessionalPerson(native, imported) {
  if (!imported || (native && isDeletedRecord(native))) return native ?? imported;
  if (!native) return imported;
  const record = {...native, ...imported,
    lifecycle_status:native.lifecycle_status,
    created_at:native.created_at, updated_at:native.updated_at};
  const edits = native.professional_edits;
  if (edits?.schema_version !== 1) return record;
  for (const key of IDENTITY_FIELDS) {
    const edit = edits.identity?.[key];
    if (edit && JSON.stringify(edit.base) === JSON.stringify(imported[key])) record[key] = native[key];
  }
  const patch = {};
  for (const key of ['summary', 'linkedin_url', 'current_workplace']) {
    const edit = edits.profile?.[key];
    const baseline = key === 'linkedin_url' ? imported.professional_profile?.contact?.linkedin_url : imported.professional_profile?.[key];
    if (edit && JSON.stringify(edit.base ?? null) === JSON.stringify(baseline ?? null)) {
      patch[key] = key === 'linkedin_url' ? native.professional_profile?.contact?.linkedin_url : native.professional_profile?.[key];
    }
  }
  if (Object.keys(patch).length) record.professional_profile = mergeProfessionalProfile(imported.professional_profile, patch);
  return record;
}

export function professionalEditBaselines(native, imported, patch) {
  if (!imported) return native?.professional_edits;
  const previous = native?.professional_edits?.schema_version === 1 ? native.professional_edits : {};
  const edits = {schema_version:1, identity:{...previous.identity}, profile:{...previous.profile}};
  for (const key of IDENTITY_FIELDS) {
    if (Object.hasOwn(patch,key)) edits.identity[key] = {base:imported[key] ?? null};
  }
  for (const key of ['summary','linkedin_url','current_workplace']) {
    if (Object.hasOwn(patch.professional_profile ?? {},key)) {
      edits.profile[key] = {base:(key === 'linkedin_url' ? imported.professional_profile?.contact?.linkedin_url : imported.professional_profile?.[key]) ?? null};
    }
  }
  return edits;
}

export async function readProfessionalPerson(id, native, github = {}) {
  if (await isGithubPersonDeleted(id,github)) return null;
  return mergeProfessionalPerson(native,await getGithubPerson(id,github));
}
