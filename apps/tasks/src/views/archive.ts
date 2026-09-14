import { isProjectArchived, type Project, type ProjectType } from '@/schemas/project';
import type { ReviewLog } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import { projectPageHash } from '@/domain/cards';
import { isMapCardProject } from '@/domain/maps-planning';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { errorMessage, renderLoadError, showConfirmWrite, showViewLoading } from '@/views/feedback';
import { createHubPills, createHubSearch, createHubToolbar, el } from '@/views/hub-kit';

type ArchiveTypeFilter = 'all' | 'standard' | 'excursion';

let archiveQuery = '';
let archiveTypeFilter: ArchiveTypeFilter = 'all';

export function resetArchiveViewStateForTests(): void {
  archiveQuery = '';
  archiveTypeFilter = 'all';
}

const TYPE_LABEL: Record<ProjectType, string> = {
  standard: 'Project',
  excursion: 'Excursion',
  academic_program: 'Academic program'
};

function matchesQuery(project: Project, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return project.title.toLowerCase().includes(q) || project.description.toLowerCase().includes(q);
}

function matchesTypeFilter(project: Project, filter: ArchiveTypeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'excursion') return project.type === 'excursion';
  return project.type !== 'excursion';
}

function latestReviewFor(project: Project, reviews: ReviewLog[]): ReviewLog | null {
  const matches = reviews
    .filter((review) => review.project_id === project.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return matches[0] ?? null;
}

function outcomeBadge(
  project: Project,
  review: ReviewLog | null,
  projectsById: Map<string, Project>
): { label: string; tint: string } {
  const outcome = review?.outcome;
  if (outcome === 'buried') return { label: 'Abandoned', tint: 'tint-peach' };
  if (outcome === 'frankensteined') {
    const target = review?.merge_into_project_id ? projectsById.get(review.merge_into_project_id) : null;
    return { label: target ? `Merged into ${target.title}` : 'Merged', tint: 'tint-lilac' };
  }
  if (outcome === 'completed' || outcome === 'closed') return { label: 'Completed', tint: 'tint-sage' };
  if (project.status === 'completed') return { label: 'Completed', tint: 'tint-sage' };
  return { label: 'Archived', tint: 'tint-peach' };
}

function renderArchiveCard(
  project: Project,
  review: ReviewLog | null,
  projectsById: Map<string, Project>,
  actions: {
    onOpen: (project: Project) => void;
    onRestore: (project: Project) => void;
    onDelete: (project: Project) => void;
  },
  confirmHost: HTMLElement
): HTMLElement {
  const badge = outcomeBadge(project, review, projectsById);
  const card = el('article', 'hub-card pcard archive-card');
  card.dataset.projectId = project.id;

  const top = el('div', 'pcard__top');
  top.append(el('span', 'pcard__title', project.title));
  top.append(el('span', `status-badge ${badge.tint}`, badge.label));

  const menuItems: CardMenuItem[] = [
    { id: 'page', label: 'Full page', onSelect: () => actions.onOpen(project) },
    {
      id: 'restore',
      label: 'Restore',
      onSelect: () =>
        showConfirmWrite(
          confirmHost,
          `Restore ${project.title}`,
          'Sets it back to active and returns it to its board.',
          async () => {
            await tasksApi.updateProject(project.id, { status: 'active', stall_flagged_at: null });
            actions.onRestore(project);
          },
          'Restore'
        )
    },
    {
      id: 'delete',
      label: 'Delete forever',
      danger: true,
      onSelect: () =>
        showConfirmWrite(
          confirmHost,
          `Delete ${project.title}`,
          'Permanently removes this project and its tasks. This cannot be undone.',
          async () => {
            await tasksApi.deleteProject(project.id, { agent: 'Tasks Hub', reason: 'Archive delete' });
            actions.onDelete(project);
          },
          'Delete'
        )
    }
  ];
  top.append(renderCardMenu(`${project.title} card menu`, menuItems));
  card.append(top);

  const meta = el('div', 'pcard__row');
  meta.append(el('span', 'hub-chip', TYPE_LABEL[project.type] ?? project.type));
  meta.append(el('span', 'meta-line', `Closed ${formatDisplayDate(project.updated_at)}`));
  card.append(meta);

  const reason = review?.reason || project.review_summary;
  if (reason) card.append(el('p', 'pcard__desc', reason));

  if (review?.slip_days != null) {
    const slip = review.slip_days;
    const slipText =
      slip === 0
        ? 'Landed on baseline.'
        : slip > 0
          ? `${slip} day${slip === 1 ? '' : 's'} past baseline.`
          : `${Math.abs(slip)} day${Math.abs(slip) === 1 ? '' : 's'} ahead of baseline.`;
    card.append(el('p', 'meta-line', slipText));
  }

  return card;
}

/** Where completed and abandoned projects/excursions go to live — record only, off the active boards. */
export async function renderArchiveView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading archive…', '.archive-board');

  let projects: Project[];
  let reviews: ReviewLog[];
  try {
    [projects, reviews] = await Promise.all([
      tasksApi.listProjects(),
      tasksApi.listReviewLogs().catch(() => [] as ReviewLog[])
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderArchiveView(canvas), 'Could not load the archive');
    return;
  }

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  let archived = projects.filter(
    (project) => isProjectArchived(project.status) && !isMapCardProject(project)
  );

  function dropProject(projectId: string): void {
    archived = archived.filter((project) => project.id !== projectId);
    paint();
  }

  function paint(): void {
    canvas.replaceChildren();
    const confirmHost = el('div', 'archive-confirm');

    const toolbar = createHubToolbar('projects-toolbar', 'archive-toolbar');
    const search = createHubSearch({
      placeholder: 'Filter the archive…',
      ariaLabel: 'Filter archive',
      value: archiveQuery,
      onInput: (value) => {
        archiveQuery = value;
        paint();
      }
    });
    toolbar.append(
      search.el,
      createHubPills({
        label: 'Type',
        role: 'tablist',
        items: [
          { id: 'all', label: 'All' },
          { id: 'standard', label: 'Projects' },
          { id: 'excursion', label: 'Excursions' }
        ],
        value: archiveTypeFilter,
        onSelect: (id) => {
          archiveTypeFilter = id;
          paint();
        }
      })
    );
    canvas.append(toolbar, confirmHost);

    const visible = archived
      .filter((project) => matchesQuery(project, archiveQuery) && matchesTypeFilter(project, archiveTypeFilter))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (!visible.length) {
      canvas.append(
        el(
          'p',
          'empty-state archive-board',
          archived.length ? 'No archived projects match.' : 'Nothing archived yet.'
        )
      );
      return;
    }

    const grid = el('div', 'projects-board archive-board');
    for (const project of visible) {
      grid.append(
        renderArchiveCard(project, latestReviewFor(project, reviews), projectsById, {
          onOpen: (current) => {
            location.hash = projectPageHash(current.id);
          },
          onRestore: (current) => dropProject(current.id),
          onDelete: (current) => dropProject(current.id)
        }, confirmHost)
      );
    }
    canvas.append(grid);
  }

  paint();
}
