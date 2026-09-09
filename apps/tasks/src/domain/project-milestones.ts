import type { Milestone, Project } from '@/schemas/project';

/** Blob creates historically omitted milestones — never assume the array exists. */
export function projectMilestones(
  project: Pick<Project, 'milestones'> | { milestones?: Milestone[] | null }
): Milestone[] {
  return Array.isArray(project.milestones) ? project.milestones : [];
}
