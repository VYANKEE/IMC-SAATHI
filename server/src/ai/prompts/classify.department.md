<!-- version: v2 -->

{{SYSTEM_PROMPT}}

Task: classify the citizen's query below against the real IMC department list.

Departments (code | tier | name — tier A has real procedural content, tier B
has only a name and contact, never invent a procedure for a tier B
department):
{{DEPARTMENT_LIST}}

COMPLAINT_PROCEDURE also covers general questions ABOUT IMC/Indore itself,
not just "how do I file a complaint": IMC's head office location, its
official website, how many wards/zones Indore has, who the mayor is, which
state Indore is in, and general "why is Indore known for X" city facts.
Route these to COMPLAINT_PROCEDURE, not isOutOfScope — a citizen asking
"nagar nigam kahan hai" or "Indore ke mayor kaun hain" is asking a real,
answerable question this assistant covers, even though it isn't a
complaint. Prefer a tier A department (real content) over a tier B one
whenever a query could plausibly fit either — a tier B department's
contact-only record cannot answer an informational or "where is X" query,
so classifying into one guarantees an unhelpful result.

Authorities that are NOT part of IMC at all (key | what they handle | name)
— if the query matches one of these, it belongs here, not to any IMC
department:
{{EXTERNAL_AUTHORITY_LIST}}

Citizen query:
<query>
{{QUERY}}
</query>

Decide:

- departmentId: the single best-matching department `code` from the list above, or null if none fits.
- categoryId: a short topic label within that department if you can tell one from the query, else null.
- confidence: 0.0-1.0, how sure you are departmentId is correct. Be honest — a
  wrong department filter is worse than an unfiltered search, so do not round
  up.
- alternatives: up to 2 other plausible department codes, if the query is
  genuinely ambiguous between them (e.g. a drainage complaint could be PWD or
  SEWERAGE).
- isOutOfScope: true if this has nothing to do with IMC or Indore at all
  (e.g. a cricket score, general chit-chat). General facts ABOUT Indore
  itself (population trivia, history, "why is Indore famous", how many
  wards) are IN scope — see the COMPLAINT_PROCEDURE note above — do not
  mark these isOutOfScope just because they are not a complaint/service
  request.
- isNonIMC: true if this is a real civic-sounding issue but belongs to a
  different authority entirely, not any IMC department (home electricity
  supply -> the power discom, ration cards -> Food & Civil Supplies, a crime
  -> Police, a medical emergency -> Ambulance, etc.) — set departmentId to
  null when this is true.
- nonImcAuthorityKey: when isNonIMC is true, the matching authority's `key`
  from the list above. null otherwise.

Respond with ONLY the JSON object matching the required schema. No prose
before or after it.
