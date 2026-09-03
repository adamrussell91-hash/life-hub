import { navigate } from '@/app/router';
import type { TeacherSection } from '@/teacher/section';

export interface PrimaryNavOptions {
  activeSection: TeacherSection;
}

const SECTIONS: Array<{
  id: TeacherSection;
  label: string;
  path: string;
  glyph: string[];
}> = [
  {
    id: 'home',
    label: 'Dashboard',
    path: '/',
    glyph: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z']
  },
  {
    id: 'classes',
    label: 'Classes',
    path: '/classes',
    glyph: [
      'M8 3v4M16 3v4M5 7h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM4 11h16'
    ]
  },
  {
    id: 'scope-sequences',
    label: 'Scope & Sequences',
    path: '/scope-sequences',
    glyph: ['M4 6h16M4 12h16M4 18h16']
  },
  {
    id: 'units',
    label: 'Units',
    path: '/units',
    glyph: ['M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4zM6 4v14a2 2 0 0 0 2 2M10 8h6M10 12h6']
  },
  {
    id: 'lessons',
    label: 'Lessons',
    path: '/lessons',
    glyph: ['M7 3h8l5 5v13H7zM15 3v5h5']
  },
  {
    id: 'templates',
    label: 'Templates',
    path: '/templates',
    glyph: ['M4 4h16v16H4zM4 9h16M10 9v11']
  },
  {
    id: 'resources',
    label: 'Resource Library',
    path: '/resources',
    glyph: ['M3 7h18v4H3zM5 11v8h14v-8M10 14h4']
  },
  {
    id: 'trash',
    label: 'Trash',
    path: '/trash',
    glyph: ['M5 7h14M10 4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5']
  }
];

function createGlyph(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('primary-nav__glyph', 'hub-rail__icon');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function renderPrimaryNav(container: HTMLElement, options: PrimaryNavOptions): void {
  container.replaceChildren();

  const nav = document.createElement('div');
  nav.className = 'primary-nav';
  nav.setAttribute('aria-label', 'Teacher sections');

  for (const section of SECTIONS) {
    const link = document.createElement('a');
    link.className = 'primary-nav__link hub-rail__link';
    link.href = section.path;
    if (section.id === options.activeSection) {
      link.setAttribute('aria-current', 'page');
    }

    const label = document.createElement('span');
    label.className = 'primary-nav__label';
    label.textContent = section.label;

    link.setAttribute('aria-label', section.label);
    link.title = section.label;
    link.append(createGlyph(section.glyph), label);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(section.path);
    });
    nav.append(link);
  }

  container.append(nav);
}
