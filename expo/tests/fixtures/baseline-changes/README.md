# Declared, evidence-backed baseline changes

Recorded captures keep the output the engine produced when they were recorded. When a repair genuinely
improves a recorded field, the old expectation is not rewritten. Instead the repair adds one new JSON file
here naming each exact change:

```json
{
  "failure": "title-not-property",
  "evidence": "docs/compatibility-knowledge/title-not-property.md",
  "rationale": "why each new value is the property's own published value",
  "changes": [
    { "capture": "realm-partners-idaho", "sourceUrl": "https://…/property/20261373/", "field": "title",
      "before": "$8,500,000", "after": "Cottage Island, Hope, ID 83836" }
  ]
}
```

Rules (enforced by `tests/discoveryJobsCpu.test.cjs` and the acceptance gate `scripts/improve/gate.cjs`):
- Files are added, never edited or deleted. Older captures and their expectations stay untouched.
- Only fields in `DECLARABLE_FIELDS` can be declared (currently `title`).
- Each change must match the recorded `before` exactly, and the engine must now produce `after` exactly.
- The gate verifies each `after` is an improvement by rule (a title must name the property and the old
  one must not), that it matches the candidate's evaluation, and that nothing undeclared changed.
