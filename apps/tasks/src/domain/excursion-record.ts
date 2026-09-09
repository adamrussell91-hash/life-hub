import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { complianceModulesByCategory } from '@/domain/excursion-modules';
import { projectChildTasks } from '@/domain/cards';

/**
 * Compiles the excursion's current state into Markdown — meant to be handed
 * to Claude afterwards to brand with the school's letterhead, then filed.
 */
export function buildExcursionMarkdown(project: Project, tasks: Task[]): string {
  const lines: string[] = [];
  lines.push(`# ${project.title}`);
  lines.push('');
  lines.push(`Event date: ${formatDisplayDate(project.current_end_date)}  `);
  lines.push(`Exported: ${formatDisplayDate(new Date())}  `);
  lines.push('');
  lines.push(
    "> Ready for letterhead — hand this to Claude and ask for it to be branded with the school's Excursion Folder format."
  );
  lines.push('');

  const groups = complianceModulesByCategory(project.compliance_modules ?? []);
  if (groups.length) {
    lines.push('## Compliance');
    lines.push('');
    for (const group of groups) {
      lines.push(`**${group.label}**`);
      for (const module of group.modules) {
        lines.push(`- [${module.on ? 'x' : ' '}] ${module.label}${module.critical ? ' (critical)' : ''}`);
      }
      lines.push('');
    }
  }

  const musterLog = project.muster_log ?? [];
  lines.push('## Muster log');
  lines.push('');
  if (musterLog.length) {
    for (const entry of musterLog) {
      lines.push(`- ${entry.at} — ${entry.label} — ${entry.note}`);
    }
  } else {
    lines.push('- No muster activity recorded.');
  }
  lines.push('');

  const folder = project.folder_items ?? [];
  if (folder.length) {
    const present = folder.filter((item) => item.on).length;
    lines.push(`## Folder — ${present} / ${folder.length} present`);
    lines.push('');
    for (const item of folder) {
      lines.push(`- [${item.on ? 'x' : ' '}] ${item.name}`);
    }
    lines.push('');
  }

  const children = projectChildTasks(project, tasks);
  if (children.length) {
    lines.push('## Tasks');
    lines.push('');
    for (const task of children) {
      lines.push(
        `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}${task.due_date ? ` — due ${formatDisplayDate(task.due_date)}` : ''}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function excursionMarkdownFilename(project: Project): string {
  const base =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'excursion';
  return `${base}.md`;
}
