const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateFromPage(page) {
  if (DATE_KEY.test(page?.created_at)) return page.created_at;
  if (typeof page?.created_at === 'string' && page.created_at.length >= 10 && DATE_KEY.test(page.created_at.slice(0, 10))) {
    return page.created_at.slice(0, 10);
  }
  return '';
}

export function knowledgeEventsFromPages(pages) {
  return (pages ?? [])
    .map(page => {
      const date = dateFromPage(page);
      if (!page || typeof page.id !== 'string' || !date) return null;
      return {
        path: `knowledge:${page.id}`,
        record: {
          type: 'knowledge_page',
          id: page.id,
          date,
          title: typeof page.title === 'string' && page.title ? page.title : page.id,
          area: typeof page.area === 'string' ? page.area : undefined
        },
        body: typeof page.excerpt === 'string' ? page.excerpt : ''
      };
    })
    .filter(Boolean);
}
