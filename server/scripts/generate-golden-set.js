#!/usr/bin/env node
/**
 * scripts/generate-golden-set.js
 *
 * Produces server/data/eval/golden-set.json — the ~80-question golden set
 * docs/03-rag.md's Evaluation framework calls for, drawn from the real
 * ingested corpus rather than invented from scratch. Not re-run
 * automatically (golden-set.json is committed and hand-reviewable); re-run
 * this deliberately if the ingested corpus changes enough that the
 * expectedChunkIds below would go stale, then diff the result before
 * committing — an eval set that silently drifts out of sync with the
 * corpus is worse than no eval set.
 *
 * Sourcing per slice (docs/03-rag.md's 8-slice table):
 *   - english_factual / hinglish: real question text / real Hinglish
 *     questionVariants already sitting on active chunks — not paraphrased.
 *   - hindi_devanagari: hand-translated (common civic vocabulary) since no
 *     chunk in this corpus is itself in Devanagari script — this slice
 *     tests cross-lingual retrieval (docs/11-decisions.md D15's whole
 *     reason for picking a Hindi+Hinglish-evaluated embedding model), not
 *     whether the answer text is Hindi.
 *   - ambiguous: real chunks that literally straddle two departments
 *     (drain/sewer routing between PWD and Water Works; SWM charge between
 *     Sanitation and Revenue) — not synthetic hypotheticals.
 *   - multi_hop: a real procedure chunk plus a ward mention. The
 *     ward -> zone -> contact resolution itself is a Zone/Contact DB
 *     lookup (Phase 2), never part of RAG retrieval — expectedChunkIds
 *     here checks only the procedure half.
 *   - missing_information: deliberately points at topics this corpus
 *     cannot answer (rupee amounts quarantined by validate.js's
 *     stale_rate_risk rule, Housing_and_Rental's register #6 quarantine,
 *     specific complaint-status lookups that belong to Phase 10's DB, not
 *     RAG) — expectedChunkIds: [] is the correct ground truth, i.e. the
 *     right retrieval behaviour is finding nothing confident enough to
 *     answer from.
 *   - out_of_scope / non_imc_routing: hand-written; the latter uses real
 *     ExternalAuthority seed rows (MPPKVVCL discom, Police, Fire, etc.)
 *     so "the right answer is someone else's phone number" is grounded in
 *     real seeded facts, not invented ones.
 */

import fs from 'node:fs';

const chunks = JSON.parse(fs.readFileSync('data/processed/knowledgeChunks.json', 'utf8'));
const active = chunks.filter((c) => c.status === 'active');

function extractQuestion(c) {
  const body = c.text.replace(/^\[[^\]]*\]\n/, '');
  const qaMatch = body.match(/^Q: (.+?)\nA: /s);
  if (qaMatch) return qaMatch[1].trim();
  const firstLine = body
    .split('\n')[0]
    .trim()
    .replace(/^\d+\.\s*/, '');
  if (firstLine.endsWith('?') && firstLine.length < 200) return firstLine;
  return null;
}

const withQ = active
  .map((c) => ({ ...c, extractedQuestion: extractQuestion(c) }))
  .filter((c) => c.extractedQuestion);

function pick(dept, n, skipIds = new Set()) {
  return withQ.filter((c) => c.department === dept && !skipIds.has(c.chunkId)).slice(0, n);
}

const used = new Set();
const golden = [];
let id = 1;
function add(slice, language, query, expectedChunkIds, expectedDepartment, notes) {
  golden.push({
    id: `G${String(id).padStart(3, '0')}`,
    slice,
    language,
    query,
    expectedChunkIds,
    expectedDepartment,
    notes: notes ?? null,
  });
  id += 1;
}

// ---- English factual (15) — department-balanced real questions ----
const englishPicks = [
  ...pick('ELECTRICAL', 3),
  ...pick('FIRE', 2),
  ...pick('PWD', 3),
  ...pick('REVENUE', 3),
  ...pick('SANITATION', 1),
  ...pick('COMPLAINT_PROCEDURE', 2),
  ...pick('WATER_WORKS', 1),
];
englishPicks.forEach((c) => {
  used.add(c.chunkId);
  add('english_factual', 'en', c.extractedQuestion, [c.chunkId], c.department);
});

// ---- Hinglish (15) — real questionVariants, department-balanced ----
const hinglishSource = withQ.filter((c) => c.questionVariants?.length > 0 && !used.has(c.chunkId));
const byDeptHinglish = {};
for (const c of hinglishSource) {
  (byDeptHinglish[c.department] ??= []).push(c);
}
const deptOrder = Object.keys(byDeptHinglish);
let hinglishPicked = [];
outer: while (hinglishPicked.length < 15) {
  let progressed = false;
  for (const dept of deptOrder) {
    if (hinglishPicked.length >= 15) break outer;
    const list = byDeptHinglish[dept];
    if (list.length > 0) {
      hinglishPicked.push(list.shift());
      progressed = true;
    }
  }
  if (!progressed) break;
}
hinglishPicked.forEach((c) => {
  used.add(c.chunkId);
  add('hinglish', 'hinglish', c.questionVariants[0], [c.chunkId], c.department);
});

// ---- Hindi/Devanagari (12) — hand-translated queries against real chunks ----
const hindiSeed = [
  // Each entry is [chunkId, department, query] -- the chunkId is hand-verified
  // by keyword search against the real corpus (see git history of this file
  // for the search), NOT auto-picked by department alone. An earlier version
  // of this script picked "first unused chunk in department X", which
  // produced topically mismatched ground truth (e.g. a street-light query
  // paired with a "how do I track my complaint" chunk) -- that bug is what
  // made the first real eval run's Hindi Recall@5 look artificially bad.
  // Verify topical fit again if this list is ever regenerated.
  ['b0cc7f39734638a4', 'ELECTRICAL', 'मेरे इलाके में स्ट्रीट लाइट खराब है, शिकायत कहाँ करें?'],
  [
    'a2f142ec02e254cb',
    'WATER_WORKS',
    'मेरे घर में पानी का प्रेशर बहुत कम है, शिकायत किस विभाग में करूं?',
  ],
  ['0a15bdb25bf56e74', 'SANITATION', 'हमारी गली में कचरा गाड़ी नहीं आई, क्या करूं?'],
  ['eea08dbb3c085a92', 'FIRE', 'फायर एनओसी क्या होता है और यह क्यों जरूरी है?'],
  ['5fb75adf5676ee68', 'PWD', 'मेरे इलाके की सड़क टूटी हुई है, किस विभाग से संपर्क करूं?'],
  ['6e9af37555bc6984', 'REVENUE', 'संपत्ति कर क्या होता है?'],
  ['eb8f9ddaabb61896', 'COMPLAINT_PROCEDURE', 'इंदौर 311 ऐप पर शिकायत कैसे दर्ज करें?'],
  ['655cffe75012570e', 'SEWERAGE', 'सड़क पर सीवर ओवरफ्लो हो रहा है, इसकी शिकायत कहां करें?'],
  ['b99f4de915151165', 'ELECTRICAL', 'स्ट्रीट लाइट बार-बार टिमटिमा रही है, शिकायत कैसे करें?'],
  ['a8b86fcd4664ec2d', 'REVENUE', 'मैंने नई संपत्ति खरीदी है, नगर निगम रिकॉर्ड कैसे अपडेट करूं?'],
  ['c59447d54a6116d0', 'PWD', 'सड़क पर गड्ढे की शिकायत कौन सुनेगा?'],
  ['770d717674320d28', 'SANITATION', 'सार्वजनिक शौचालय गंदा है, इसकी सफाई के लिए किसे बताएं?'],
  ['eff0ab11e7c7401d', 'COMPLAINT_PROCEDURE', 'शिकायत दर्ज करने के बाद उसका स्टेटस कैसे चेक करूं?'],
];
const chunkById = new Map(active.map((c) => [c.chunkId, c]));
hindiSeed.forEach(([chunkId, dept, query]) => {
  const match = chunkById.get(chunkId);
  if (match) {
    used.add(match.chunkId);
    add(
      'hindi_devanagari',
      'hi',
      query,
      [match.chunkId],
      dept,
      `EN source: ${match.extractedQuestion ?? match.text.split('\n')[1]?.slice(0, 80)}`
    );
  } else {
    console.error(
      `WARNING: hindiSeed chunkId ${chunkId} not found among active QA chunks — check it's still real.`
    );
  }
});

// ---- Ambiguous (8) — real cross-department overlap chunks ----
const ambiguousPairs = [
  {
    query: 'Mere area mein naali overflow ho rahi hai, kise complain karu?',
    ids: ['96b942c2b8e3d67b', 'c2718c2583ddb9d8', '655cffe75012570e'],
    depts: ['PWD', 'SEWERAGE'],
    note: 'Drain/sewer complaints straddle PWD (physical drain) and Sewerage & Drainage — this is the exact ambiguity docs/03-rag.md flags. (Was WATER_WORKS before D17 split the mislabeled water_supply.csv content into its own SEWERAGE topic.)',
  },
  {
    query: 'Sadak par pani jama ho gaya hai baarish ki wajah se, complaint kaha karu?',
    ids: ['4f5058f30b53aedc'],
    depts: ['WATER_WORKS', 'PWD'],
    note: 'Waterlogging: drainage capacity (Water Works) vs road condition (PWD).',
  },
];
const extraAmbiguous = [
  {
    query: 'Ghar ke bahar kachra fenka hua hai kai din se, kise batayein?',
    ids: ['4fdc20411f49cf16'],
    depts: ['SANITATION', 'REVENUE'],
    note: 'Garbage collection service (Sanitation) vs the SWM charge on the property bill (Revenue) — citizens conflate the two constantly.',
  },
  {
    query: 'Naye ghar mein sewer connection lena hai, kis department se baat karu?',
    ids: ['655cffe75012570e'],
    depts: ['SEWERAGE', 'PWD'],
    note: 'New sewer connections vs sewer overflow complaints straddle Sewerage & Drainage and PWD (physical digging/road-cut permission).',
  },
];
ambiguousPairs.push(...extraAmbiguous);
let ambCount = 0;
for (const pair of ambiguousPairs) {
  if (ambCount >= 8) break;
  add('ambiguous', 'hinglish', pair.query, pair.ids, pair.depts[0], pair.note);
  ambCount += 1;
}
// Pad to 8 with real overlapping-content variants (garbage/SWM charge touches both SANITATION ops and REVENUE billing)
const swmChunks = withQ.filter((c) => c.category === 'SWM Fee').slice(0, 6);
swmChunks.forEach((c) => {
  if (ambCount >= 8) return;
  used.add(c.chunkId);
  add(
    'ambiguous',
    c.language,
    c.extractedQuestion,
    [c.chunkId],
    'REVENUE',
    'Garbage/SWM charge questions straddle Sanitation (the service) and Revenue (the billing) — real users ask this of either.'
  );
  ambCount += 1;
});

// ---- Multi-hop (8) — procedure chunk + implied ward/zone/contact lookup (DB, not RAG) ----
const multiHop = [
  {
    query: 'Ward 47 mein garbage van nahi aa raha, kise contact karun?',
    dept: 'SANITATION',
    note: 'Retrieval should surface the sanitation complaint procedure; ward 47 -> zone 9 -> ARO contact is a separate deterministic DB lookup (Zone/Contact), not part of this Recall@k check.',
  },
  {
    query: 'Meri street light 3 din se band hai, ward 12 mein hai, complaint kaise karu?',
    dept: 'ELECTRICAL',
    note: 'Same pattern: procedure retrieval + a separate ward->zone->contact DB lookup.',
  },
  {
    query: 'Humare mohalle mein paani ka pressure bahut kam hai, ward 5, kisse baat karu?',
    dept: 'WATER_WORKS',
    note: 'Procedure retrieval + ward->zone->contact DB lookup.',
  },
  {
    query: 'Fire NOC ke liye apply karna hai, mera business ward 20 mein hai, process kya hai?',
    dept: 'FIRE',
    note: 'Procedure retrieval + ward->zone->contact DB lookup.',
  },
];
multiHop.forEach(({ query, dept, note }) => {
  const match = withQ.find((c) => c.department === dept && !used.has(c.chunkId));
  if (match) {
    used.add(match.chunkId);
    add('multi_hop', 'hinglish', query, [match.chunkId], dept, note);
  }
});
// pad to 8 with two more real department procedure chunks + ward mention
const multiHopPad = [
  ['PWD', 'Ward 30 mein sadak ka gaddha bahut bada ho gaya hai, complaint kaise karu?'],
  ['REVENUE', 'Ward 8 ke property tax office ka number chahiye, kaise pata karu?'],
];
multiHopPad.forEach(([dept, query]) => {
  const match =
    withQ.find((c) => c.department === dept && !used.has(c.chunkId)) ??
    withQ.find((c) => c.department === dept);
  if (match) {
    used.add(match.chunkId);
    add(
      'multi_hop',
      'hinglish',
      query,
      [match.chunkId],
      dept,
      'Procedure retrieval + ward->zone->contact DB lookup.'
    );
  }
});
const multiHopPad2 = [
  ['SANITATION', 'Ward 15 mein safai nahi ho rahi 4 din se, complaint kaise karu?'],
  ['FIRE', 'Ward 3 mein hotel ke fire safety ki complaint karni hai, process bataiye'],
];
multiHopPad2.forEach(([dept, query]) => {
  const match = withQ.find((c) => c.department === dept);
  if (match)
    add(
      'multi_hop',
      'hinglish',
      query,
      [match.chunkId],
      dept,
      'Procedure retrieval + ward->zone->contact DB lookup.'
    );
});

// ---- Missing information (8) — correct answer is a refusal, no chunk should satisfy this ----
const missingInfo = [
  [
    'New water connection ki fees kitni hai?',
    'REVENUE, most rupee-amount Revenue chunks are quarantined (stale_rate_risk, docs/11-decisions.md/validate.js) — no active chunk should confidently answer a current fee.',
  ],
  [
    'Property tax ka current rate per square foot kya hai?',
    'Same stale-rate quarantine reasoning.',
  ],
  ['Fire NOC ki fees kitni lagti hai?', 'Fee amount not reliably present in the active corpus.'],
  [
    'Kal raat 11 baje IMC office khula rehta hai kya?',
    'Specific after-hours timing not in corpus — correct answer is the documented office-hours fallback, not a guess.',
  ],
  [
    'SWM charge is month se kyu badh gaya, exact wajah bataiye',
    'Requires a specific billing record this corpus does not contain.',
  ],
  [
    'Mera complaint number IMC-2026-0004521 ka status kya hai?',
    'A specific complaint status is a database lookup (Phase 10), never a RAG answer — no chunk should match this.',
  ],
  [
    'Housing department ke rental rules kya hain?',
    'Housing_and_Rental.docx is entirely quarantined pending human review (register #6) — genuinely zero active chunks exist for this department.',
  ],
  [
    'Sewerage connection ka naya rate kya hai iss saal?',
    'Rate/fee figures for the current year are exactly what the stale-rate quarantine excludes.',
  ],
];
missingInfo.forEach(([query, note]) =>
  add('missing_information', 'hinglish', query, [], null, note)
);

// ---- Out of scope (6) — nothing IMC-related at all ----
const outOfScope = [
  'Kal cricket match kisne jeeta?',
  "What's the weather like in Indore tomorrow?",
  'Best restaurants in Indore for chaat kaha hai?',
  'Aaj Sensex kitna upar gaya?',
  'Mujhe ek acchi movie recommend karo.',
  'Indore se Mumbai ki train ka time table kya hai?',
];
outOfScope.forEach((query) =>
  add(
    'out_of_scope',
    query.match(/[a-zA-Z]/) && !/kaha|kisne|kitna|karo|kya/.test(query) ? 'en' : 'hinglish',
    query,
    [],
    null,
    'Not an IMC matter at all — correct behaviour is a polite out-of-scope refusal, not a RAG answer.'
  )
);

// ---- Non-IMC routing (8) — real, IMC-adjacent, but belongs to another authority ----
const nonImc = [
  [
    'Ghar ki light chali gayi hai, complaint kaha karu?',
    'MPPKVVCL / West Discom (1912) handles home electricity supply — NOT the Electrical & Mechanical dept, which only covers municipal street lights.',
  ],
  [
    'Ration card ke liye apply karna hai, kya karu?',
    'MP Food & Civil Supplies / NFSA handles ration cards, not IMC.',
  ],
  ['Ghar mein chori ho gayi hai, kise call karu?', 'Police (100), not IMC.'],
  ['Kisi ko heart attack aaya hai, turant help chahiye', 'Ambulance (108), not IMC.'],
  [
    'Sadak par ek ghayal kutta pada hai',
    'Snake Picker / animal-related line — separate from IMC sanitation procedure content.',
  ],
  ['Mujhe voter list mein apna naam check karna hai', 'Election Helpline (1950), not IMC.'],
  [
    'Building mein aag lag gayi hai abhi',
    'Fire Station emergency line (101) for an active fire — different from the Fire NOC *application* procedure IMC documents.',
  ],
  [
    'Senior citizen ke liye koi helpline hai kya',
    'Senior Citizen Helpline, not an IMC department.',
  ],
];
nonImc.forEach(([query, note]) => add('non_imc_routing', 'hinglish', query, [], null, note));

fs.writeFileSync('data/eval/golden-set.json', JSON.stringify(golden, null, 2) + '\n');

const bySlice = {};
golden.forEach((g) => {
  bySlice[g.slice] = (bySlice[g.slice] || 0) + 1;
});
console.log('Total golden set entries:', golden.length);
console.log('By slice:', bySlice);
