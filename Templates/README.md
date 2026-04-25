# Templates

**Purpose:** Note templates for the Obsidian Templater plugin. Each template defines the structural shape of a recurring note type.

**Typical statuses:** N/A (templates themselves are infrastructure, not content)

**Templates included:**

| File | Use Case |
|------|----------|
| `Daily Note.md` | One per day — captures, calendar, scratch notes |
| `Book Note.md` | Reading notes, key quotes, takeaways |
| `Conversation Import.md` | LLM conversation capture (ChatGPT/Claude/Gemini exports) |
| `Training Data Entry.md` | Annotated for fine-tuning / RAG corpus building |
| `Entity Note.md` | Generic entity (person/org/thing/concept) — generalized from a clinical-note skeleton |

**Templater syntax:** `{{title}}`, `{{date}}`, `{{time}}` are runtime variables filled by the Templater plugin (NOT genericization placeholders — leave them verbatim).

**Adding a new template:**
1. Copy an existing template as a starting point
2. Adjust frontmatter contract for your note type
3. Reference the new template in `_meta/taxonomy.md` if it introduces new tag values

**See also:** [`../_meta/taxonomy.md`](../_meta/taxonomy.md), [`../.obsidian/community-plugins.json`](../.obsidian/community-plugins.json) (Templater allowlist)
