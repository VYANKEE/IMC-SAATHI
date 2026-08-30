# PART 11 — Complaint Workflow

## Status lifecycle

```
                    ┌─────────────┐
                    │  SUBMITTED  │  citizen files
                    └──────┬──────┘
                           ▼
                    ┌──────────────┐
                    │ ACKNOWLEDGED │  system/staff confirms receipt
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐      ┌──────────┐
                    │   ASSIGNED   │─────►│ REJECTED │ (out of jurisdiction /
                    └──────┬───────┘      └──────────┘  duplicate — reason required)
                           ▼
                    ┌──────────────┐
                    │ IN_PROGRESS  │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │   RESOLVED   │  staff marks done
                    └──────┬───────┘
                  ┌────────┴────────┐
       citizen    │                 │  no objection / 7 days
     "not         ▼                 ▼
    satisfied" ┌──────────┐   ┌──────────┐
               │ REOPENED │   │  CLOSED  │ (terminal)
               └────┬─────┘   └──────────┘
                    └──► ASSIGNED
```

**Legal transitions — enforced in the service layer, not the UI:**

| From         | Allowed to             | Who                                                     |
| ------------ | ---------------------- | ------------------------------------------------------- |
| SUBMITTED    | ACKNOWLEDGED, REJECTED | staff, admin                                            |
| ACKNOWLEDGED | ASSIGNED, REJECTED     | staff, admin                                            |
| ASSIGNED     | IN_PROGRESS, REJECTED  | staff, admin                                            |
| IN_PROGRESS  | RESOLVED               | staff, admin                                            |
| RESOLVED     | CLOSED, REOPENED       | CLOSED: system/admin · REOPENED: **citizen owner only** |
| REOPENED     | ASSIGNED               | staff, admin                                            |
| CLOSED       | —                      | terminal                                                |
| REJECTED     | —                      | terminal (reason mandatory)                             |

`REOPENED` exists because `complaint_procedure.docx` documents it explicitly:
_"You can reopen/reject the closure — most systems allow marking 'not satisfied'
against a closed complaint."_ Implementing the documented citizen right, rather
than a generic lifecycle, is the difference between a demo and a real system.

Every transition writes a `complaintEvent` with actor, role, from, to, remark and
timestamp. An invalid transition returns `409 INVALID_STATUS_TRANSITION` — it is
not merely hidden from the UI, because a staff member with an old page open
would otherwise corrupt the timeline.

---

## Reference ID design

Format: **`IMC-2026-K7M2QX4`** — prefix, calendar year, 7 characters of Crockford
base32 (alphabet excludes I, L, O, U to avoid transcription errors over the
phone, which is exactly how citizens will read these out).

```
generateReferenceId():
  for attempt in 1..5:
    suffix = crockford32(crypto.randomBytes(5))[0..6]   // ~34 bits ≈ 3.4e10 space
    id = `IMC-${year}-${suffix}`
    if not exists(id): return id
  throw ReferenceIdGenerationError
```

**Why not sequential.** Your brief says "do not use predictable database IDs as
public complaint IDs" and the reasoning is worth stating precisely:

1. **Enumeration** — sequential IDs plus the public `/track` endpoint means
   anyone can walk the entire complaint set.
2. **Business intelligence leakage** — `IMC-2026-000412` on Monday and
   `IMC-2026-000487` on Friday tells a journalist exactly how many complaints
   IMC receives per week. That is IMC's data to publish, not to leak.
3. **Mongo ObjectIds are worse than they look** — they embed a timestamp and a
   machine identifier, so exposing one leaks creation time and infrastructure
   shape.

Collision probability at 100k complaints/year in a 3.4×10¹⁰ space is ~0.015%,
and the uniqueness check plus retry makes it effectively zero. The unique index
on `referenceId` is the final backstop.

---

## Filing flows

### Direct (portal)

```
Login → File Complaint → Department → Category
  → dynamic required fields (from category.requiredFields)
  → description → location (GPS or typed + ward)
  → photos (camera on mobile, ≤5, ≤5 MB, live preview)
  → review → submit
  → confirmation screen: BIG reference ID, copy button, SLA if known,
    "save this number" instruction (your documents stress this twice)
```

### From chat — the integration your brief calls out as a key feature

```
Citizen: "Mere area mein street light kharab hai"
   │
Assistant answers the procedure, and returns:
   suggestedActions: [{ type:"FILE_COMPLAINT",
                        departmentId:<Electrical>, categoryId:<STREET_LIGHT_NOT_WORKING> }]
   │
UI renders a [ शिकायत दर्ज करें / File a Complaint ] button
   │
Click → complaint form opens PRE-FILLED:
   department = Electrical & Mechanical
   category   = Street light not working
   description = draft extracted from the conversation
   chatSessionId = <linked for traceability>
   │
Citizen edits freely → explicitly submits
```

**Never auto-submit.** Beyond your brief requiring it, the reason is legal and
practical: a complaint is a formal grievance filed in a citizen's name against a
public body. A model's interpretation of "naali overflow ho rahi hai" is a draft,
not consent. The pre-fill saves typing; the human supplies intent.

`chatSessionId` on the complaint is a genuinely useful link — when a complaint is
mis-categorised you can open the conversation that produced it and see whether
the classifier or the citizen got it wrong. That closes the loop back into the
eval set.

---

## SLA handling

`slaDueAt = createdAt + category.slaHours` — **only when `slaHours` is not null.**
Today that is street lights alone (24 h arterial / 48–72 h internal lanes, from
`Electrical_and_mechanical_dept_final.docx`). Everything else shows "timeline as
per IMC norms" rather than an invented number.

A scheduled sweep marks overdue complaints and surfaces the escalation path your
documents define — Nodal Grievance Officer / Mayor's grievance cell → CM Helpline
**181** → MP Department of Local Bodies. `complaint_procedure.docx` is explicit
that the system should offer this _proactively_ rather than waiting for the
citizen to ask, so escalation appears as a banner on an overdue complaint.

---

## The product risk you must raise with IMC

There is **no official Indore 311 API** in any document you provided. That means
complaints filed in this application land in **your** MongoDB — not in IMC's real
grievance system. A citizen who files here and receives `IMC-2026-K7M2QX4` may
reasonably believe IMC has been notified. They have not been.

Three honest options, in order of preference:

1. **Get 311 / CRM integration from IMC.** Ask your mentor whether an API,
   webhook or even a daily CSV export exists. This is the correct answer and
   worth asking for in week one.
2. **Position the portal as internal-tracking-plus-guidance** and label it
   clearly in both languages: _"This complaint has been recorded in the IMC
   Saathi system. To file an official grievance, also register on Indore 311."_
   Provide the deep link.
3. **Assistant-only for v1** — guidance and routing, no filing.

Do not ship option 2's flow without option 2's label. Raise this in your first
review; it is the kind of thing that reads as senior judgement rather than a
missing feature.
