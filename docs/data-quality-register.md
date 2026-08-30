# Data Quality Register

Every issue below is a real defect found in the files you provided, with the
engineering decision it forces. This register should be committed and kept
updated — it is the thing that stops the knowledge base rotting silently.

Severity: **S1** = will produce wrong information to a citizen · **S2** = will
degrade retrieval or routing · **S3** = cosmetic / hygiene.

---

### 1. `language` column is corrupted in 51 of 66 dataset rows — **S2**

In `IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated.numbers`, the `language` column
contains **action values** for the English rows: `Complaint` (18), `Inform` (15),
`Status` (7), `Route` (4), `Payment` (3), `Process` (3), `Contact` (1). Only the
15 Hinglish rows have a real language value (`Hinglish`). This is a
one-column-left shift during export.

**Decision:** the ingestion pipeline must **not trust this column.** Detect
language from the question text (Devanagari codepoint ratio + a Hinglish
heuristic on romanised Hindi tokens) and write a computed `language` field. Log
the mismatch rather than silently overwriting, so the source file gets fixed too.

### 2. Duplicate source file — **S3**

`…Dataset_Updated (1).numbers` and `…Dataset_Updated.numbers` are byte-identical
(MD5 `dcd9cf1490891034087592b88f2cc443`).
**Decision:** content-hash every document at ingest; skip on hash collision. This
is needed anyway for the "re-run ingestion is idempotent" requirement.

### 3. Conflicting IMC main phone number — **S1**

- `KB.pdf` and `Electrical_and_mechanical_dept_final.docx`: **0731-4071717**
- `dataset.numbers` `office_phone` column (all 66 rows): **0731-2535555**
- But `Helpline_numbers.docx` lists **07312535555** as the **Dead Animal** helpline.

**Decision:** treat **0731-4071717** as the IMC main contact (two independent
sources). Quarantine `0731-2535555` from the dataset — serving a dead-animal
line as the general helpline is exactly the failure mode this project exists to
prevent.

### 4. Unverified toll-free number — **S1**

`dataset.numbers` `escalation_helpline` claims _"IMC Toll-Free: 1800-233-5522"_.
This number appears in **no other file**.
**Decision:** do not serve until confirmed against imcindore.mp.gov.in. `181`
(CM Helpline) is corroborated in three files and is safe to serve.

### 5. Helpline list of unclear provenance — **S2**

`KB.pdf` lists IMC helplines as _"104; 1075; 0755-2704201; 2441419; 4926892"_.
`0755` is Bhopal's STD code, and 104/1075 are national health helplines. These
look like MP state health lines, not IMC citizen-service lines.
**Decision:** exclude from the contacts seed; keep only in the raw document
chunk with a low-confidence flag.

### 6. Housing content describes _other municipalities_ — **S1**

`Housing_and_Rental` answers cite **"Nagar Parishad Makronia"** and **"Nagar
Parishad Chhatarpur"** portals, and the e-Nagar Palika flow generically. Those
are different ULBs. The procedure was generalised from another municipality's
manual.
**Decision:** do not serve these as IMC procedure. Either re-source from IMC's
own property-tax pages, or serve with an explicit hedge
("the standard MP e-Nagar Palika flow is…; confirm on the IMC portal"). This is
the highest-risk content in the whole corpus because it _sounds_ specific.

### 7. AI-generated content marker — **S2**

`Housing_and_Rental_(2).csv` contains a URL with `?utm_source=chatgpt.com`.
**Decision:** the Housing/Food sections need human verification against primary
sources before launch. Strip tracking params at ingest.

### 8. Ration card content is not an IMC function — **S1 (routing)**

"Food and Civil Supplies" (ration card issuance, e-KYC, ONORC) sits inside an
IMC knowledge file but belongs to MP Food & Civil Supplies / NFSA.
**Decision:** ingest it under a dedicated `EXTERNAL` department with
`authority: "MP Food & Civil Supplies / NFSA"` so the answer template becomes
"this is not handled by IMC — here is who does" rather than an IMC procedure.

### 9. Property tax rates are two cycles stale — **S1**

`KB.pdf` §5 carries the **2024-25** revised rate list. Today is **August 2026**,
so FY 2026-27 is current. The document itself warns the rates may be superseded.
**Decision:** store the rate table in a `rateNotices` collection with
`effectiveFrom`/`effectiveTo`, **not** as a RAG chunk. The bot must never quote a
rupee figure whose `effectiveTo` has passed; it answers "rates depend on rate
zone and construction category; the current notice is published on the IMC
portal" and links out.

### 10. Officer mobiles stored as floats — **S3**

`contact_mobile` reads `7974162847.0`, `9179089333.0` — Numbers coerced them to
floating point.
**Decision:** normalise to a 10-digit string at ingest; reject anything that
isn't exactly 10 digits after stripping `+91`, spaces and hyphens.

### 11. Per-row contacts are really department-level — **S3**

All 43 Revenue rows carry Ms. Garima Patidar; all 23 PWD rows carry Mr. Srikant
Kate. It is a department contact stamped onto every row, not a per-FAQ contact.
`KB.pdf` §6 says the same thing: _"Officer names and phone numbers are dynamic.
Keep them in a separately updateable contact table."_
**Decision:** exactly that. Contacts live in `contacts`, joined at response time
by `departmentId`. They are **stripped out of the embedded chunk text** so a
contact change never requires re-embedding the corpus.

### 12. Inconsistent section taxonomy in Fire NOC — **S2**

`Fire_NOC.csv` uses `Fire NOC / Fire Safety Certificate` for rows 1–6 then
switches to `SECTION C — Fire Safety Compliance Complaints` — mixing a topic
label with a document-structure label.
**Decision:** normalise to `department + category + intent` during ingest.
Document section headings are never used directly as metadata.

### 13. Unbalanced parentheses in question fields — **S3**

Most CSV questions open a Hindi transliteration bracket and never close it:
`"…complaint kaise karu?"` → `(Fire NOC kaise apply karu?` .
**Decision:** cosmetic, but the Hinglish variant inside the brackets is valuable
intent-matching data. Parse it out into a `question_variants[]` array instead of
leaving it glued to the English question.

### 14. Zone 10 phone has the wrong STD code — **S2**

`0771 2497422`. `0771` is Raipur (Chhattisgarh); Indore is `0731`. Every other
zone uses `0731`.
**Decision:** flag as suspected typo for `0731-2497422`. Do not auto-correct —
mark `verified: false` and surface it in the admin console for a human.

### 15. Zone 13 phone is too short — **S2**

`0731 360201` is 6 digits after the STD code; Indore landlines are 7 or 8.
**Decision:** same treatment — `verified: false`, human review.

### 16. UI mockup contains facts no document supports — **S1**

The answer mockup shows Birth Certificate: **₹50/- per certificate**, **10:00 AM
to 06:00 PM (Monday to Saturday)**, and a five-step procedure. None of this is in
any file you provided. The home screen also offers **Trade License** as a quick
action with no supporting content.
**Decision:** this is _design placeholder data_, and it is the clearest possible
illustration of the risk. Either source the real Birth & Death Registration and
Market & License documents, or disable those chips at v1. Do not let the mockup
become the spec.

### 17. Office-hours conflict — **S2**

`Electrical_and_mechanical_dept_final.docx`: **10:00–18:00 Monday–Friday**.
UI mockup: **10:00 AM–06:00 PM Monday–Saturday**.
**Decision:** trust the document (Mon–Fri); treat the mockup as unsourced.
Store office hours per department in `departments`, not in prose.

### 18. Missing information (not errors — gaps to fill) — **S2**

Marked **"Not available in provided source material"** wherever a citizen would
reasonably ask:

- SLA / resolution timelines for every category except street lights (24h arterial, 48–72h internal lanes).
- Fee schedules for Fire NOC, new water connection, trade license, birth/death certificates.
- Document checklists for most services outside Fire NOC and property transfer.
- A dedicated Water Works department head and a Sewerage/Drainage mobile number.
- Any **official Indore 311 API** — see the product risk in `12-risks.md`, item R1.
- Hindi (Devanagari) versions of the answers. You have Hinglish, not Devanagari.
- Ward → councillor (Parshad) mapping, which `Electrical_and_mechanical_dept_final.docx` tells citizens to contact.

---

## Ingestion-time validation rules (enforce these in code)

| Rule                                                                                     | Action on failure                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Phone normalises to exactly 10 digits, or a valid STD+number                             | `verified: false`, exclude from answer injection |
| STD code for an Indore landline is `0731`                                                | flag for review                                  |
| `source_url` host is in the allowed list (`imcindore.mp.gov.in`, `nfsa.gov.in`, MP govt) | flag                                             |
| `last_verified` is within 12 months of today                                             | `stale: true`, downweight in retrieval           |
| Chunk contains a rupee amount **and** its department is Revenue                          | require an `effectiveFrom` date or quarantine    |
| Detected language matches the declared `language` column                                 | log mismatch, prefer detected                    |
| Document content hash already ingested                                                   | skip                                             |
