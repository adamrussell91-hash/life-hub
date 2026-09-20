import { CENTRAL_ID } from './hub-map-model.js';

/**
 * Starting inventory for the Hub Map: hubs, main pages, sections and page TYPES.
 * Never individual tasks, lessons, notes or people.
 *
 * Every page starts as `unreviewed`: a route existing in code does not prove the page
 * is fully built. Features are listed only where they were read from the code.
 */
export function buildHubMapSeed() {
  const nodes = [];
  const edges = [];

  const add = (id, name, hub, kind, parent, extra = {}) => {
    nodes.push({
      id,
      name,
      hub,
      kind,
      route: extra.route ?? '',
      status: extra.status ?? 'unreviewed',
      features: extra.features ?? [],
      plans: extra.plans ?? [],
      notes: extra.notes ?? ''
    });
    if (parent) edges.push({ from: parent, to: id, type: 'structure', label: '' });
  };
  const link = (from, to, label) => edges.push({ from, to, type: 'link', label });

  add(CENTRAL_ID, 'Life Hub', 'central', 'hub', null, {
    route: '#home',
    notes: 'Centre of the map. Design kit source: github.com/adamrussell91-hash/hub-design-kit'
  });

  // Life
  add('hub-life', 'Life', 'life', 'hub', CENTRAL_ID);
  add('life-home', 'Home', 'life', 'page', 'hub-life', { route: '#home', features: ['Hub pulse cards for Teaching, Knowledge and Tasks'] });
  add('life-chat', 'Chat', 'life', 'page', 'hub-life', { route: '#chat', features: ['Agent picker', 'Chat composer'] });
  add('life-nutrition', 'Nutrition', 'life', 'page', 'hub-life', { route: '#nutrition' });
  add('life-fitness', 'Fitness', 'life', 'page', 'hub-life', { route: '#fitness' });
  add('life-skincare', 'Skincare', 'life', 'page', 'hub-life', { route: '#skincare' });
  add('life-calendar', 'Calendar', 'life', 'page', 'hub-life', { route: '#calendar' });
  add('life-body', 'Body', 'life', 'page', 'hub-life', { route: '#body' });
  add('life-body-bloods', 'Bloods', 'life', 'section', 'life-body', { route: '#body-bloods' });
  add('life-body-medical', 'Medical overview', 'life', 'section', 'life-body', { route: '#body-medical' });
  add('life-mind', 'Mind', 'life', 'page', 'hub-life', { route: '#mind' });
  add('life-central-node', 'Central Node', 'life', 'page', 'hub-life', {
    route: '#central-node',
    features: [
      'Completion ring',
      'Week horizon',
      'Long-term trends stream',
      'Year consistency radial',
      'Governance log heat',
      'Cross-agent chord',
      'Recent agent actions',
      'Backlinks and URL watch',
      'Run audit button',
      'Chat with Hammond',
      'Hub map button'
    ]
  });
  add('life-shortcuts', 'Shortcuts', 'life', 'page', 'hub-life', {
    route: '#shortcuts',
    features: ['Promoted shortcuts list', 'Shortcut catalog', 'Confirm card before any write']
  });
  add('life-hub-map', 'Hub map', 'life', 'page', 'hub-life', {
    route: '#hub-map',
    status: 'partial',
    features: [
      'Pan and zoom canvas',
      'Expandable hub and page cards',
      'Status filter',
      'Edit panel for status, features, plans and links',
      'Autosave to life-hub-data',
      'Export and import JSON'
    ],
    plans: [{ text: 'Review every page: set its status and fill in its features', done: false }]
  });

  // Teaching
  add('hub-teaching', 'Teaching', 'teaching', 'hub', CENTRAL_ID);
  add('teaching-home', 'Teacher home', 'teaching', 'page', 'hub-teaching', { route: 'teacher-home' });
  add('teaching-classes', 'Classes', 'teaching', 'page', 'hub-teaching', { route: 'teacher-classes' });
  add('teaching-class', 'Class page', 'teaching', 'page-type', 'teaching-classes', { route: 'teacher-class' });
  add('teaching-units', 'Units', 'teaching', 'page', 'hub-teaching', { route: 'teacher-units' });
  add('teaching-unit', 'Unit page', 'teaching', 'page-type', 'teaching-units', { route: 'teacher-unit' });
  add('teaching-lessons', 'Lessons', 'teaching', 'page', 'hub-teaching', { route: 'teacher-lessons' });
  add('teaching-lesson', 'Lesson page', 'teaching', 'page-type', 'teaching-lessons', {
    route: 'teacher-lesson',
    features: [
      'Block canvas: heading, image, video, audio, gallery, table, chart, diagram, code, equation',
      'Block canvas: cloze, flashcards, definition, quote, callout, accordion, tabs, columns, timeline',
      'Block canvas: embed, attachment, html, divider, spacer'
    ]
  });
  add('teaching-student-lesson', 'Public student lesson', 'teaching', 'page-type', 'teaching-lessons');
  add('teaching-scope-sequences', 'Scope and sequences', 'teaching', 'page', 'hub-teaching', { route: 'teacher-scope-sequences' });
  add('teaching-scope-sequence', 'Scope and sequence page', 'teaching', 'page-type', 'teaching-scope-sequences', { route: 'teacher-scope-sequence' });
  add('teaching-resources', 'Resources', 'teaching', 'page', 'hub-teaching', { route: 'teacher-resources' });
  add('teaching-templates', 'Templates', 'teaching', 'page', 'hub-teaching', { route: 'teacher-templates' });
  add('teaching-trash', 'Trash', 'teaching', 'page', 'hub-teaching', { route: 'teacher-trash' });

  // Knowledge
  add('hub-knowledge', 'Knowledge', 'knowledge', 'hub', CENTRAL_ID);
  add('knowledge-archive', 'Archive', 'knowledge', 'page', 'hub-knowledge', { route: 'all' });
  add('knowledge-note', 'Note page', 'knowledge', 'page-type', 'knowledge-archive', { route: '#/page/' });
  add('knowledge-notebooks', 'Notebooks', 'knowledge', 'page', 'hub-knowledge', { route: 'notebooks' });
  add('knowledge-graph', 'Graph', 'knowledge', 'page', 'hub-knowledge', {
    route: 'graph',
    features: ['Force graph', 'Search and focus colour', 'Preview card']
  });
  add('knowledge-timeline', 'Timeline', 'knowledge', 'page', 'hub-knowledge', { route: 'timeline' });
  add('knowledge-chat', 'Chat', 'knowledge', 'page', 'hub-knowledge', { route: 'chat' });
  add('knowledge-protocols', 'Protocols', 'knowledge', 'page', 'hub-knowledge', { route: 'protocols' });
  add('knowledge-podcast', 'Podcast', 'knowledge', 'page', 'hub-knowledge', { route: 'podcast' });
  add('knowledge-quiz', 'Quiz', 'knowledge', 'page', 'hub-knowledge', { route: 'quiz' });
  add('knowledge-mindmap', 'Mindmap maker (tool)', 'knowledge', 'page', 'hub-knowledge', {
    route: '/tools/mindmap.html',
    features: ['Tab adds child, Enter adds sibling', 'Drag a node to re-parent', 'Colour picker', 'Import and export JSON'],
    notes: 'Standalone and not linked from the rail. The source the Hub map was built from.'
  });

  // Tasks
  add('hub-tasks', 'Tasks', 'tasks', 'hub', CENTRAL_ID);
  add('tasks-board', 'Dashboard', 'tasks', 'page', 'hub-tasks', { route: '#/board' });
  add('tasks-task', 'Task editor', 'tasks', 'page-type', 'tasks-board');
  add('tasks-clare', 'Chat', 'tasks', 'page', 'hub-tasks', { route: '#/clare' });
  add('tasks-day', 'Today', 'tasks', 'page', 'hub-tasks', { route: '#/day' });
  add('tasks-week', 'Week', 'tasks', 'page', 'hub-tasks', { route: '#/week' });
  add('tasks-month', 'Month', 'tasks', 'page', 'hub-tasks', { route: '#/month' });
  add('tasks-list', 'Backlog', 'tasks', 'page', 'hub-tasks', { route: '#/list' });
  add('tasks-graph', 'Graph', 'tasks', 'page', 'hub-tasks', {
    route: '#/graph',
    features: ['Blockers mode', 'Workstreams mode', 'Preview card']
  });
  add('tasks-gantt', 'Gantt', 'tasks', 'page', 'hub-tasks', { route: '#/gantt' });
  add('tasks-timeline', 'Timeline', 'tasks', 'page', 'hub-tasks', { route: '#/timeline' });
  add('tasks-goals', 'Goals', 'tasks', 'page', 'hub-tasks', { route: '#/goals' });
  add('tasks-someday', 'Someday', 'tasks', 'page', 'hub-tasks', { route: '#/someday' });
  add('tasks-templates', 'Templates', 'tasks', 'page', 'hub-tasks', { route: '#/templates' });
  add('tasks-projects', 'Projects', 'tasks', 'page', 'hub-tasks', { route: '#/projects' });
  add('tasks-project', 'Project page', 'tasks', 'page-type', 'tasks-projects');
  add('tasks-excursions', 'Excursions', 'tasks', 'page', 'hub-tasks', { route: '#/excursions' });
  add('tasks-excursion', 'Excursion page', 'tasks', 'page-type', 'tasks-excursions');
  add('tasks-excursion-admin', 'Excursion admin', 'tasks', 'section', 'tasks-excursion');
  add('tasks-excursion-compliance', 'Excursion compliance', 'tasks', 'section', 'tasks-excursion');
  add('tasks-excursion-dayof', 'Excursion day-of', 'tasks', 'section', 'tasks-excursion');
  add('tasks-excursion-timeline', 'Excursion timeline', 'tasks', 'section', 'tasks-excursion');
  add('tasks-programs', 'Programs', 'tasks', 'page', 'hub-tasks', { route: '#/programs' });
  add('tasks-archive', 'Archive', 'tasks', 'page', 'hub-tasks', { route: '#/archive' });
  add('tasks-stress', 'Network', 'tasks', 'page', 'hub-tasks', { route: '#/stress' });
  add('tasks-corey', 'Corey', 'tasks', 'page', 'hub-tasks', { route: '#/corey' });
  add('tasks-maps', 'Maps', 'tasks', 'page', 'hub-tasks', {
    route: '#/maps',
    features: ['Transit-style lines and stations', 'Planned and active items']
  });
  add('tasks-map-item', 'Map item page', 'tasks', 'page-type', 'tasks-maps');
  add('tasks-search', 'Search', 'tasks', 'page', 'hub-tasks', { route: '#/search' });
  add('tasks-properties', 'Properties', 'tasks', 'page', 'hub-tasks', { route: '#/properties' });
  add('tasks-orbit', 'Orbit', 'tasks', 'page', 'hub-tasks', { route: '#/orbit' });
  add('tasks-universe', 'Universe', 'tasks', 'page', 'hub-tasks', {
    route: '#/universe',
    features: ['Search', 'Dark mode toggle', 'Colour key', 'Fullscreen']
  });
  add('tasks-branch', 'Branch', 'tasks', 'page', 'hub-tasks', {
    route: '#/branch',
    features: ['Project task tree', 'Preview card']
  });

  // Professional
  add('hub-professional', 'Professional', 'professional', 'hub', CENTRAL_ID);
  add('professional-home', 'Home', 'professional', 'page', 'hub-professional', { route: '#/home' });
  add('professional-people', 'People', 'professional', 'page', 'hub-professional', { route: '#/people' });
  add('professional-person', 'Person page', 'professional', 'page-type', 'professional-people', { route: '#/person/' });
  add('professional-organisations', 'Organisations', 'professional', 'page', 'hub-professional', { route: '#/organisations' });
  add('professional-organisation', 'Organisation page', 'professional', 'page-type', 'professional-organisations', { route: '#/organisation/' });
  add('professional-relationships', 'Relationships', 'professional', 'page', 'hub-professional', { route: '#/relationships' });
  add('professional-communications', 'Communications', 'professional', 'page', 'hub-professional', { route: '#/communications' });
  add('professional-communication', 'Communication page', 'professional', 'page-type', 'professional-communications', { route: '#/communication/' });
  add('professional-meetings', 'Meetings', 'professional', 'page', 'hub-professional', { route: '#/meetings' });
  add('professional-meeting', 'Meeting page', 'professional', 'page-type', 'professional-meetings', { route: '#/meeting/' });
  add('professional-events', 'Events', 'professional', 'page', 'hub-professional', { route: '#/events' });
  add('professional-event', 'Event page', 'professional', 'page-type', 'professional-events', { route: '#/event/' });
  add('professional-applications', 'Applications', 'professional', 'page', 'hub-professional', { route: '#/applications' });
  add('professional-application', 'Application page', 'professional', 'page-type', 'professional-applications', { route: '#/application/' });
  add('professional-career', 'Career', 'professional', 'page', 'hub-professional', { route: '#/career' });
  add('professional-network-ecology', 'Network ecology', 'professional', 'page', 'hub-professional', { route: '#/network-ecology' });

  // Cross-links read from the code
  link('life-home', 'hub-teaching', 'hub pulse');
  link('life-home', 'hub-knowledge', 'hub pulse');
  link('life-home', 'hub-tasks', 'hub pulse');
  link('life-central-node', 'knowledge-archive', 'backlinks and URL watch');
  link('tasks-graph', 'tasks-task', 'opens');
  link('tasks-branch', 'tasks-task', 'opens');
  link('tasks-universe', 'tasks-task', 'opens');
  link('tasks-maps', 'tasks-projects', 'station links');
  link('tasks-maps', 'tasks-excursions', 'station links');

  return { version: 1, nodes, edges };
}
