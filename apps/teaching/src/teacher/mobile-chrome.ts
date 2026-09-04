import { mountMobileChrome } from '../../../../packages/design-kit/js/mount-mobile-chrome.js';
import { withAppBase } from '@/app/base-path';
import { navigate } from '@/app/router';
import type { TeacherSection } from '@/teacher/section';

const HOME = ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'];
const CLASSES = [
  'M8 3v4M16 3v4M5 7h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM4 11h16'
];
const LESSONS = ['M7 3h8l5 5v13H7zM15 3v5h5'];
const SCOPE = ['M4 6h16M4 12h16M4 18h16'];
const UNITS = ['M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4zM6 4v14a2 2 0 0 0 2 2M10 8h6M10 12h6'];
const TEMPLATES = ['M4 4h16v16H4zM4 9h16M10 9v11'];
const RESOURCES = ['M3 7h18v4H3zM5 11v8h14v-8M10 14h4'];
const TRASH = ['M5 7h14M10 4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5'];

/** Locked phone chrome — same bottom bar + More sheet as every other hub. */
export function syncTeachingMobileChrome(host: HTMLElement, active: TeacherSection): void {
  mountMobileChrome(host, {
    currentHub: 'teaching',
    primary: [
      {
        id: 'home',
        label: 'Home',
        paths: HOME,
        href: withAppBase('/'),
        current: active === 'home',
        onSelect: () => navigate('/')
      },
      {
        id: 'classes',
        label: 'Classes',
        paths: CLASSES,
        href: withAppBase('/classes'),
        current: active === 'classes',
        onSelect: () => navigate('/classes')
      },
      {
        id: 'lessons',
        label: 'Lessons',
        paths: LESSONS,
        href: withAppBase('/lessons'),
        current: active === 'lessons',
        onSelect: () => navigate('/lessons')
      }
    ],
    more: [
      {
        id: 'scope-sequences',
        label: 'Scope & Sequences',
        paths: SCOPE,
        href: withAppBase('/scope-sequences'),
        onSelect: () => navigate('/scope-sequences')
      },
      {
        id: 'units',
        label: 'Units',
        paths: UNITS,
        href: withAppBase('/units'),
        onSelect: () => navigate('/units')
      },
      {
        id: 'templates',
        label: 'Templates',
        paths: TEMPLATES,
        href: withAppBase('/templates'),
        onSelect: () => navigate('/templates')
      },
      {
        id: 'resources',
        label: 'Resources',
        paths: RESOURCES,
        href: withAppBase('/resources'),
        onSelect: () => navigate('/resources')
      },
      {
        id: 'trash',
        label: 'Trash',
        paths: TRASH,
        href: withAppBase('/trash'),
        onSelect: () => navigate('/trash')
      }
    ]
  });
}
