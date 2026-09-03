import type { CurriculumResponse } from '@/teacher/nav';
import { renderClassesNav } from '@/teacher/nav';
import { renderPrimaryNav } from '@/teacher/primary-nav';
import type { TeacherSection } from '@/teacher/section';

export function renderTeacherRail(
  railNav: HTMLElement,
  curriculum: CurriculumResponse,
  options: {
    activeSection: TeacherSection;
    activeClassId?: string;
    onCreateClass?: () => void;
    onOpenSearch?: () => void;
  }
): void {
  railNav.replaceChildren();

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'rail-search';
  searchBtn.setAttribute('aria-label', 'Search');
  searchBtn.title = 'Search';

  const searchGlyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  searchGlyph.setAttribute('viewBox', '0 0 24 24');
  searchGlyph.setAttribute('fill', 'none');
  searchGlyph.setAttribute('stroke', 'currentColor');
  searchGlyph.setAttribute('stroke-width', '1.8');
  searchGlyph.setAttribute('stroke-linecap', 'round');
  searchGlyph.setAttribute('stroke-linejoin', 'round');
  searchGlyph.setAttribute('aria-hidden', 'true');
  searchGlyph.classList.add('rail-search__glyph');
  const searchCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  searchCircle.setAttribute('cx', '11');
  searchCircle.setAttribute('cy', '11');
  searchCircle.setAttribute('r', '7');
  const searchHandle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  searchHandle.setAttribute('d', 'm20 20-3.5-3.5');
  searchGlyph.append(searchCircle, searchHandle);

  const searchLabel = document.createElement('span');
  searchLabel.className = 'rail-search__label';
  searchLabel.textContent = 'Search';

  searchBtn.append(searchGlyph, searchLabel);
  searchBtn.addEventListener('click', () => options.onOpenSearch?.());

  const primaryHost = document.createElement('div');
  primaryHost.className = 'teacher-layout__primary-nav-host';
  const treeHost = document.createElement('div');
  treeHost.className = 'teacher-layout__tree-host';

  railNav.append(searchBtn, primaryHost, treeHost);
  renderPrimaryNav(primaryHost, { activeSection: options.activeSection });
  renderClassesNav(treeHost, curriculum, {
    activeClassId: options.activeClassId,
    onCreateClass: options.onCreateClass
  });
}
