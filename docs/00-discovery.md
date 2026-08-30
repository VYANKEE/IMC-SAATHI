# PART 1–3 — Discovery, Document Analysis & Department Map

> Status: Discovery phase. No code written. Every IMC fact below is traced to a
> file you provided. Anything not in your files is marked
> **"Not available in provided source material."**

---

## PART 1 — What I understood

You are building **IMC Saathi**, an AI-powered citizen service and complaint
platform for the **Indore Municipal Corporation**. It is not a chatbot demo. It
is two connected products sharing one knowledge layer:

**A. AI Citizen Assistant** — a multilingual (English/Hindi/Hinglish) RAG chatbot
that answers "which department handles my problem, what do I do, who do I
contact, what do I need" strictly from official IMC material, with source
citations and an explicit "I don't know" path.

**B. Citizen Complaint Portal** — authenticated complaint filing with category,
description, location, photo evidence, a public reference ID, status lifecycle,
and role-separated dashboards for citizens, department staff and admins.

The two are joined by one flow: citizen describes a problem in plain Hindi →
assistant identifies department + procedure → offers **"File a Complaint"** →
complaint form opens pre-filled with department and category → citizen edits and
confirms → complaint created. Never auto-submitted.

**The real engineering problem is not "call an LLM."** It is: a municipal system
where a wrong phone number or an invented procedure is a real harm to a real
citizen. So the architecture is organised around _groundedness and
traceability_, not around chat.

**The single most important design decision in this whole project** (explained
fully in `03-rag.md`): **contact numbers, office addresses, zone/ward mappings
and officer names must never come out of a vector search into an LLM.** They are
served from structured MongoDB collections by deterministic lookup and injected
into the response, then validated after generation. RAG answers the _procedure_;
the database answers the _facts_. This is what makes "never invent a phone
number" an enforceable property instead of a hope.

---

## PART 2 — Document analysis

Your folder contains **22 items**: 16 knowledge documents, 2 UI mockups, 2
inventory screenshots, one byte-identical duplicate of the dataset, and
`desktop.ini` (Windows metadata). Here is what each contains and what it is good
for.

### Tier 1 — Rich, chatbot-ready content

| File                                                    | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                           | Engineering value                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated.numbers`   | **66 rows × 24 columns.** PWD-001…023 (23 rows) + REV-001…043 (43 rows). Columns: `faq_id, department, category, intent, language, question, answer, required_information, action, source, last_verified, dynamic_data_required, source_url, source_url_2, contact_person, contact_designation, contact_mobile, alt_contact_person, alt_contact_designation, alt_contact_mobile, office_address, office_phone, escalation_helpline, website`       | **The most valuable file you have.** This schema is effectively the target ingestion schema for the whole knowledge base. 15 rows are Hinglish, 51 English. It already separates _procedure_ from _contact_ from _required information_ — exactly the split the architecture needs. |
| `IMC_PWD_Revenue_Chatbot_FAQ_Knowledge_Base.pdf` (8 pp) | Narrative version of the same PWD + Revenue FAQ, plus a department routing table, an "official data" table (website, helplines, Additional Commissioners, MIC members), the 2024-25 property tax / SBM rate table, chatbot behaviour rules, and a source register with 8 official URLs. Marked "verified against official IMC sources on 18 August 2026".                                                                                          | Routing table → seeds the intent→department classifier. Source register → the `source_url` metadata field. Rate table → **quarantine, see data quality register.**                                                                                                                  |
| `Electrical_and_mechanical_dept_final.docx`             | The only _complete_ department dossier: overview, 8 responsibilities, required complaint information, and 9 fully worked citizen scenarios (street light off / blinking / on in daytime / whole street dark / high mast / new installation request / pole fallen / pole leaning / hanging cable / public toilet light), each with step-by-step Indore 311 procedure, SLA, escalation and alternate channels. Office timings, responsible engineer. | **This is your gold-standard template.** Every other department should eventually be documented in this shape. It is also the best source for chunking strategy design.                                                                                                             |
| `Zonal_Offices(Ward_Wise)_and_Contact_Details.docx`     | All **22 zonal offices**: zone name, ward list, office landline, Zonal Officer name + mobile, CSI Health number, Assistant Revenue Officer name + mobile.                                                                                                                                                                                                                                                                                          | **Verified clean: 22 zones cover wards 1–85 with zero gaps and zero duplicates.** Directly usable as a seed for a `zones` collection and a ward→zone reverse lookup. High-confidence structured data.                                                                               |
| `Department_Head_Contact_Details.docx`                  | ~35 officers: name, designation, mobile, and their allocated departments.                                                                                                                                                                                                                                                                                                                                                                          | The authoritative `contacts` seed. Also the only evidence for ~19 departments that have **no procedural content at all**.                                                                                                                                                           |

### Tier 2 — Department FAQ sets (Q/A pairs, docx + matching CSV)

| Files                                                       | Coverage                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMC_Saath_sanitation1.docx` / `IMC_Saathi_sanitation1.csv` | Garbage & sanitation (van not coming, black spots, collection overcharging, dirty/locked public toilets). The docx also carries the **overall content plan** — Sections A–E, including "Section C — confusions & misroutes the bot must catch" and "Section D — how real citizens phrase things". |
| `water_supply.docx` / `water_supply.csv`                    | A2 Water Supply (4 Q), A3 Roads/Streetlights/Potholes (3 Q), A4 Sewerage & Drainage (2 Q).                                                                                                                                                                                                        |
| `complaint_procedure.docx` / `complaint_procedure.csv`      | Section B — the cross-cutting complaint lifecycle: how to file (3 routes), what happens after, tracking, escalation ladder, reopening a wrongly-closed complaint, cost (free), anonymity, multi-issue complaints. Plus Section E — meta-FAQs about the bot itself.                                |
| `Fire_NOC.docx` / `Fire_NOC.csv`                            | Fire NOC: what it is, who needs it, how to apply, documents, building-permission-vs-NOC confusion, renewal, penalties, plus fire-safety compliance complaints (blocked exits, hazardous storage).                                                                                                 |
| `Housing_and_Rental.docx` / `Housing_and_Rental_(2).csv`    | Property tax online payment, new property registration, transfer, documents, application tracking, shop rent. **Plus a "Food and Civil Supplies" section (ration card, e-KYC, ONORC) which is not an IMC function** — see routing note below.                                                     |
| `Helpline_numbers.docx`                                     | 13 external helplines: PM 011-23386447, CM MP 181, Senior Citizen +91 731 2510 308, Children 1098, Election 1950, Police 100, Fire 101, Snake Picker 9179137698, Dead Animal 07312535555, Women 1091, Hospital 0731-2438100, Ambulance 108, Safai Mitra Suraksha 14420.                           |

### Tier 3 — Design references (not knowledge)

| File                                    | What it tells me                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WhatsApp Image …11.37.26 PM.jpeg`      | IMC Saathi home screen mockup: dark navy sidebar (New Chat, Chat with IMC Saathi, My Queries, Popular Services, Track Complaint, Announcements, Feedback), IMC crest + bilingual header, language dropdown, theme toggle, quick-action chips (Birth Certificate, Property Tax, Water Connection, Trade License, Garbage Complaint, More Services), Indore skyline watermark, mic input. |
| `WhatsApp Image …11.37.23 PM.jpeg`      | Answer-rendering mockup: structured response card with labelled sections — Procedure / Required Documents / Department / Office Timing / Fees. **This is a strong product decision and I am adopting it:** the LLM should return _structured JSON_, and the UI renders the sections. Not free-form markdown.                                                                            |
| `Screenshot …001216.png`, `…001243.png` | Your own file inventory (10 numbered groups). Confirms nothing is missing from what you intended to send.                                                                                                                                                                                                                                                                               |
| `desktop.ini`                           | Windows folder metadata. Ignore.                                                                                                                                                                                                                                                                                                                                                        |

### Duplicate

`IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated (1).numbers` is byte-identical to
`IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated.numbers` (same MD5
`dcd9cf14…c443`). Ingest one; the pipeline must content-hash and skip duplicates.

---

## PART 3 — IMC department & service map (derived from your documents only)

I did **not** use the example list from your instruction PDF. This taxonomy is
built from what the files actually evidence. The critical structural finding is
that your departments fall into **three coverage tiers**, and this determines
launch scope.

### Tier A — Launch-ready (procedural content exists)

These go into the department selector at v1.

| Department                              | Services / complaint types evidenced                                                                                                                                                                                                                                                                           | Contact (from source)                                                                                                                                                                                  | Source                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Electrical & Mechanical**             | Street light not working / blinking / on in daytime / whole street dark; high mast light; new street light installation request; fallen pole; leaning pole; hanging cable; public toilet light; municipal building electrical; pumps & motors; decorative/festival lighting; fountains; traffic signal support | Mr. Ashwin Janvade, In-Charge Executive Engineer — 7440440005. Addl. Commissioner: Mr. Shringar Shrivastav — 9425920720. Office 10:00–18:00 Mon–Fri                                                    | `Electrical_and_mechanical_dept_final.docx`                         |
| **PWD / Public Works**                  | Damaged road, pothole, road repair, road construction, incomplete road work, poor-quality work, dug-up-and-unrestored road, road tenders                                                                                                                                                                       | Mr. Srikant Kate, Executive Engineer — 7974162847. Alt: Mr. Neeraj Anand Likhar, Chief City Engineer — 9179089333. Addl. Commissioner: Mr. Abhay Rajangaonkar                                          | `KB.pdf`, `dataset.numbers`                                         |
| **Revenue**                             | Property tax (payment, dues, receipt, calculation, rate zone, increase, penalty, disputes), water tax & water charges, property survey, property data corrections (name/address/area/missing property), purchase & inheritance record updates, SWM door-to-door charge                                         | Ms. Garima Patidar, Deputy Commissioner (Revenue, Property & Water tax, Zones 1–22). Addl. Commissioner: Mr. Akash Singh                                                                               | `KB.pdf`, `dataset.numbers`, `Department_Head_Contact_Details.docx` |
| **Water Works (Jal Pradaya Vibhag)**    | No supply, low pressure (localised), irregular timing, billing correction (separate accounts wing), new water connection application                                                                                                                                                                           | _Only partial:_ Mr. Shantilal Yadav is listed as Assistant Engineer Water Supply — 7440443332 (primarily Garden in-charge). **Dedicated Water Works head: not available in provided source material.** | `water_supply.docx`                                                 |
| **Sewerage & Drainage**                 | Sewer overflow on road (health-hazard priority), seasonal waterlogging / monsoon desilting                                                                                                                                                                                                                     | Mr. Prabhat Tiwari — In-Charge Asst. Engineer, Project NMCG (Sewerage). **Mobile not available in provided source material.**                                                                          | `water_supply.docx`, `Department_Head_Contact_Details.docx`         |
| **Sanitation / Swachhata (SWM)**        | Garbage van not arriving, open dumps / black spots, collection overcharging, public toilet dirty or locked                                                                                                                                                                                                     | Swachh Bharat Mission under Mr. Ashwin Janvade — 7440440005; Mr. Sumeet Asthana, In-Charge EE SBM — 7440443349. CTPT: Mr. P.R. Aroliya — 7440446077                                                    | `IMC_Saath_sanitation1.docx`                                        |
| **Fire Department**                     | Fire NOC application, required documents, renewal, building-permission-vs-NOC distinction, penalties for operating without NOC; fire-safety compliance complaints (blocked exits, hazardous storage)                                                                                                           | Mr. Vinod Mishra, Fire Officer In-Charge — 7440440187                                                                                                                                                  | `Fire_NOC.docx`                                                     |
| **Housing / Property Services**         | Property tax online payment, new property registration, property transfer + documents, application tracking, shop rent payment                                                                                                                                                                                 | Routed to Revenue contacts                                                                                                                                                                             | `Housing_and_Rental.docx`                                           |
| **Complaint Procedure (cross-cutting)** | Filing routes, post-filing process, tracking, escalation ladder, reopening, cost, anonymity, multi-issue                                                                                                                                                                                                       | —                                                                                                                                                                                                      | `complaint_procedure.docx`                                          |

### Tier B — Contact-only (name + mobile, **no procedures**)

Evidenced solely by `Department_Head_Contact_Details.docx`. The bot may state
"this is handled by X, contact Y" and **must not** describe a procedure.

Establishment · Lease · Health Establishment · Central Store · Birth-Death &
Marriage Registration · Information & Technology · Control Room (HO) · Urban
Poverty Alleviation / NULM · Deendayal Antyodaya Kitchen / Rain Basera ·
Removal (Encroachment) · Census · Market & License (Trade License) · Election
Cell · Vidhansabha Prakoshth · Traffic · Building Permission (zone-wise Building
Officers) · AICTSL · Mayor Helpline · Collector Jansunvayi · Programme Officer &
Protocol · Secretary/PRO · Zoo · Dog Eradication · Meat Unit · Workshop ·
Trenching Ground · Law · PMAY · Garden · Planning · Nehru Stadium · Health
Control Room · Bridge Cell

### Tier C — Referenced in the UI mockup, **zero source content**

The home-screen mockup offers quick actions for **Birth Certificate** and
**Trade License**, and the answer mockup shows a full birth-certificate
procedure with a ₹50 fee and Mon–Sat timings. **None of that exists in any file
you gave me.** If those chips ship at v1, the bot will hallucinate to fill them.
Either supply the source documents or disable those chips. See
`data-quality-register.md` item 16.

### Explicit non-IMC routing (required by your own Section C)

| Citizen issue                            | Correct authority                                          | Evidence                                    |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Ration card, e-KYC, ONORC                | MP Food & Civil Supplies / NFSA portal — **not IMC**       | `Housing_and_Rental.docx`                   |
| Power cut, live wire, electricity supply | MPPKVVCL / West Discom **1912**; local office 0731-2421414 | `Electrical_and_mechanical_dept_final.docx` |
| Fire emergency / Police / Ambulance      | 101 / 100 / 108                                            | `Helpline_numbers.docx`                     |
| Escalation beyond IMC                    | CM Helpline **181**, MP Dept. of Local Bodies              | `complaint_procedure.docx`                  |

**Note the trap this creates:** the Electrical & Mechanical department handles
_street lights_, but a _household power cut_ is the Discom's job. Both are
"light nahi aa rahi" to a citizen. The classifier must separate them, and this
belongs in the evaluation set as a named adversarial case.

---

## Verified ward → zone mapping (22 zones, wards 1–85, complete)

Programmatically validated: no missing ward, no ward assigned twice.
This is seed data, not RAG content.

| Zone | Office name                                       | Wards              | Office phone              |
| ---- | ------------------------------------------------- | ------------------ | ------------------------- |
| 01   | Dr. Hedgewar (Kila Maidan)                        | 7, 9, 10, 16       | 0731-2410120              |
| 02   | Lal Bahadur Shastri (Rajmohalla)                  | 67, 68, 69, 70     | 0731-2410512              |
| 03   | Shaheed Bhagat Singh (Nagar Nigam)                | 56, 57, 58         | 7440440068                |
| 04   | Maharana Pratap (Sangam Nagar)                    | 11, 12, 13, 17     | 0731-4986512              |
| 05   | Chandragupta Maurya (Sukhaliya)                   | 20, 23, 27         | 0731-4984586              |
| 06   | Subhash Chandra Bose (Subhash Nagar)              | 22, 24, 25         | 0731-2532161              |
| 07   | Atal Bihari Vajpayee (Scheme No. 54)              | 29, 32, 33, 34     | 0731-2551310              |
| 08   | Chandrashekhar Azad (Vijay Nagar)                 | 28, 30, 37         | 0731-2573355 / 7440443508 |
| 09   | Dr. Bhimrao Ambedkar (Pancham ki Fel)             | 26, 44, 45, 46, 47 | 0731-4986513              |
| 10   | Dr. Shyamaprasad Mukherjee (Saket Nagar)          | 39, 40, 42, 43, 49 | 0771-2497422 ⚠            |
| 11   | Rajmata Scindia (Stadium)                         | 48, 54, 55, 60     | 7440443514                |
| 12   | Harsiddhi                                         | 59, 61, 62, 65, 66 | 0731-4947526              |
| 13   | Pt. Deendayal Upadhyay (Bilawali)                 | 74, 75, 77, 78     | 0731-360201 ⚠             |
| 14   | Rajendra Dharkar (Hawa Bungalow)                  | 82, 84, 85         | 0731-4986346 / 7440443514 |
| 15   | Laxman Singh Gaud (David Nagar)                   | 2, 71, 72, 83      | 0731-4984585 / 7440445068 |
| 16   | Kushabhau Thackeray (Aerodrome Road)              | 1, 3, 14, 15       | 0731-2411833              |
| 17   | Mahatma Gandhi (Narwal)                           | 18, 19, 21         | 0731-4400027              |
| 18   | Chhatrapati Shivaji (Krishi Vihar)                | 51, 52, 63, 64     | 7440443518                |
| 19   | Sardar Vallabhbhai Patel (Scheme No. 94)          | 38, 41, 50, 53, 76 | 7440441832                |
| 20   | Rajmata Jeejabai (Ramganj Jinsi)                  | 4, 5, 6, 8         | 9826667333                |
| 21   | Veer Savarkar (Pragati Nagar)                     | 73, 79, 80, 81     | 7440443492                |
| 22   | Gen. Harisingh Nalwa (Bombay Hospital Water Tank) | 31, 35, 36         | 7440441758                |

⚠ = flagged in the data quality register (STD code / digit-count anomalies).
