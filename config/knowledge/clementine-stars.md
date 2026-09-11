# Stars protocol

You are producing one saved interpretation for the Knowledge Hub Stars renderer. The archive retrieval and research rounds are already complete. Use only the supplied archive findings. Do not search again. Do not invent a note, page id, title, quotation, method, or relationship.

Return only one JSON object. Do not add markdown fences or prose before or after it.

Select between 5 and 10 genuinely useful notes. Prefer a compact set whose members contribute different but connected work. Do not fill the set with weak matches merely to reach 10. Every selected pageId must appear in the supplied archive findings.

Choose one closed symbol template:

- `eye`: perspective, interpretation, seeing, reading, literacy, attention
- `bridge`: connection, transition, transfer, mediation
- `cycle`: change, recurrence, development, feedback, process
- `spiral`: iterative inquiry, deepening, return with revision
- `tree`: growth, branching, taxonomy, differentiation, inheritance
- `compass`: direction, leadership, judgement, strategy, orientation

Order the notes deliberately. The renderer places them in array order around or through the symbol. Every drawn line must have a defensible intellectual relationship. Supply one relationship for every required pair below. Positions are one based and `n` is the final note position.

- `bridge` and `spiral`: 1 to 2, 2 to 3, continuing through n minus 1 to n
- `cycle`: the same chain, plus n to 1
- `eye`: notes 1 through n minus 1 form a closed chain, then connect note n to note 1 and to the middle outline note
- `tree`: note 1 is the root; notes 2 and 3 connect to it; each later note connects to the earlier branch at floor of its zero based index divided by 2
- `compass`: note 1 is the centre and connects to every other note; when there are more than 5 notes, notes 2 through n also form a closed chain

A relationship may support, complicate, extend, apply, contrast, or build on another note. Do not claim causation unless the notes support it. Do not add decorative lines without a relationship.

Write a concise synthesis rather than a literature review. The summary should explain the constellation as a whole. Each claim must list the selected pageIds supporting it. Separate tensions and gaps. Claims grounded only by interpretation should say so.

Use this exact shape:

{
  "version": 1,
  "query": "the user's question or topic",
  "title": "short constellation title",
  "symbol": {
    "templateId": "eye | bridge | cycle | spiral | tree | compass",
    "label": "human label for the symbol",
    "meaning": "why this symbol represents this synthesis"
  },
  "notes": [
    {
      "pageId": "an exact supplied page id",
      "title": "the exact supplied note title",
      "excerpt": "short evidence excerpt or accurate paraphrase",
      "role": "the note's distinct role in this constellation"
    }
  ],
  "relations": [
    {
      "sourceId": "selected page id",
      "targetId": "different selected page id",
      "type": "supports | complicates | extends | applies | contrasts | builds_on",
      "explanation": "specific relationship grounded in the two notes"
    }
  ],
  "synthesis": {
    "summary": "two to four sentences",
    "claims": [
      {
        "text": "one grounded synthesis claim",
        "sourceIds": ["selected page id"]
      }
    ],
    "tensions": ["material disagreement, different explanatory level, or interpretive caution"],
    "gaps": ["what the selected archive does not yet establish"]
  }
}

Final audit before responding:

- 5 to 10 unique notes
- every id came from the supplied findings
- every relationship endpoint is selected and distinct
- every claim has at least one selected source
- symbol is from the closed list
- JSON parses without repair
