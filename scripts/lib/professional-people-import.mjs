const KNOWN_COLUMNS = new Set([
  'Person',
  'AI summary',
  'Back end',
  'Books',
  'Communications',
  'Current Workplace',
  'Email',
  'Last Contacted',
  'LinkedIn Profile',
  'Notes',
  'Phone',
  'Podcasts'
]);

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseProfessionalPeopleCsv(csvText) {
  const rows = parseCsvRows(String(csvText ?? ''));
  const [header = [], ...records] = rows;
  const columns = header.map((name) => String(name).trim());
  if (!columns.includes('Person')) throw new Error('People CSV must include a Person column.');
  return {
    columns,
    rows: records
      .filter((record) => record.some((value) => value !== ''))
      .map((record) => Object.fromEntries(columns.map((column, index) => [column, record[index] ?? ''])))
  };
}

function nameKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeHttpsUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function textOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function oneReference(value) {
  const label = textOrNull(value);
  return label ? [{ label, source_url: safeHttpsUrl(label), hub_href: null }] : [];
}

function profileForRow(row, markdown) {
  return {
    schema_version: 1,
    source: {
      system: 'notion',
      page_url: null,
      properties: { ...row }
    },
    summary: textOrNull(row['AI summary']),
    contact: {
      email: textOrNull(row.Email),
      phone: textOrNull(row.Phone),
      linkedin_url: safeHttpsUrl(row['LinkedIn Profile'])
    },
    last_contacted: textOrNull(row['Last Contacted']),
    current_workplace: textOrNull(row['Current Workplace']) ? [textOrNull(row['Current Workplace'])] : [],
    references: {
      communications: oneReference(row.Communications),
      books: oneReference(row.Books),
      podcasts: oneReference(row.Podcasts),
      notes: oneReference(row.Notes)
    },
    body_markdown: typeof markdown === 'string' && markdown.length ? markdown : null
  };
}

function findCandidates(people, name) {
  const key = nameKey(name);
  if (!key) return [];
  return people.filter((person) => {
    const names = [person.display_name, ...(Array.isArray(person.aliases) ? person.aliases : [])];
    return names.some((candidate) => nameKey(candidate) === key);
  });
}

/**
 * Keeps the original Markdown body verbatim while using its own top-level
 * heading as the join key. That avoids relying on Notion's volatile trailing
 * page identifiers in exported filenames.
 */
export function markdownPagesFromEntries(entries) {
  const pages = new Map();
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.path !== 'string' || !entry.path.toLowerCase().endsWith('.md')) continue;
    if (typeof entry.body !== 'string') continue;
    const heading = /^#\s+(.+?)\s*$/m.exec(entry.body)?.[1]?.trim();
    if (!heading || pages.has(heading)) continue;
    pages.set(heading, entry.body);
  }
  return pages;
}

/**
 * Build a deterministic update of the private People file. It does not write
 * anywhere and never guesses a match: caller-visible reporting decides whether
 * the result is safe to persist.
 */
export function buildProfessionalPeopleImport({ people, csvText, markdownByTitle = new Map() }) {
  const parsed = parseProfessionalPeopleCsv(csvText);
  const nextPeople = (Array.isArray(people) ? people : []).map((person) => ({ ...person }));
  const unmatchedRows = [];
  const ambiguousRows = [];
  const markdownMissing = [];
  let matchedRows = 0;
  let markdownMatched = 0;

  for (const row of parsed.rows) {
    const name = row.Person;
    const candidates = findCandidates(nextPeople, name);
    if (candidates.length === 0) {
      unmatchedRows.push(name);
      continue;
    }
    if (candidates.length > 1) {
      ambiguousRows.push(name);
      continue;
    }
    const candidate = candidates[0];
    const markdown = markdownByTitle.get(name) ?? markdownByTitle.get(candidate.display_name) ?? null;
    if (markdown) markdownMatched += 1;
    else markdownMissing.push(name);
    candidate.professional_profile = profileForRow(row, markdown);
    matchedRows += 1;
  }

  return {
    people: nextPeople,
    report: {
      total_csv_rows: parsed.rows.length,
      matched_rows: matchedRows,
      unmatched_rows: unmatchedRows.sort(),
      ambiguous_rows: ambiguousRows.sort(),
      markdown_matched: markdownMatched,
      markdown_missing: markdownMissing.sort(),
      unknown_columns: parsed.columns.filter((column) => !KNOWN_COLUMNS.has(column)).sort()
    }
  };
}
