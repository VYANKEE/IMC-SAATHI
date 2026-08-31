/**
 * demo.js
 *
 * Client for the single demo page (public/demo.html). No build step, no
 * framework -- plain DOM, so this reads clearly for whoever builds the real
 * Phase 9 frontend and wants to see the intended flow and the exact API
 * shapes before wiring their own UI to them.
 *
 * Flow implemented (department-first, matching the intended product UX):
 *   1. Citizen picks a department from a grid (or "something else / not
 *      sure" to skip straight to free-form chat).
 *   2. Real, corpus-derived suggested questions for that department are
 *      shown as clickable chips -- picking one asks it verbatim. The free-
 *      text input at the bottom is ALWAYS available too, so a citizen is
 *      never limited to the suggestions.
 *   3. Suggestions + a "change department" control stay visible for the
 *      rest of the conversation, so asking a second question in the same
 *      department is always one click away.
 *
 * ============================================================================
 * API CONTRACT
 * ============================================================================
 * GET /api/departments?lang=en
 *   -> { success: true, data: { departments: [{id, code, slug, name,
 *        description, coverageTier, isSelectable, hasVerifiedContent}],
 *        count } }
 *   Only tier-A, citizen-selectable departments (see Department.js).
 *   hasVerifiedContent is true only once real ingested KB content exists
 *   for that department -- a tier-A, selectable department can still be
 *   false (e.g. every source row quarantined for a data-quality reason).
 *   false means picking it will only ever get the low-confidence fallback
 *   answer, so the UI should say so up front rather than let the citizen
 *   find out after typing a question. See docs/11-decisions.md D17.
 *
 * GET /api/departments/:slug/suggested-questions?limit=5
 *   -> { success: true, data: { departmentId, slug, questions: string[] } }
 *   Real questions extracted from that department's actual knowledge base
 *   content (services/suggestedQuestions.service.js) -- not hand-written.
 *
 * POST /api/chat   body: { "query": "<citizen text, 2-1000 chars>" }
 *   Response envelope (always): { success: boolean, data?: {...}, code?,
 *     message?, requestId? }. On success, data.route is one of:
 *
 *   "grounded" -- a real answer generated from retrieved knowledge.
 *     { route, answer, procedureSteps[], requiredDocuments[],
 *       requiredInformation[], officeTiming, fees, escalation,
 *       sources[{chunkId, document, section, url}], suggestedActions[],
 *       confidence: "high"|"medium"|"low", groundingViolations[],
 *       department: {id, name} | null,   // from the DB, not the LLM
 *       contact: {name, designation, phone, office} | null,  // from the DB
 *       classification: {...}, departmentFilterApplied, retrievedCount }
 *
 *   "out_of_scope" -- not a civic/IMC matter at all.
 *     { route, answer, sources: [], confidence: "high", classification }
 *
 *   "non_imc" -- a real civic issue, but a different authority handles it.
 *     { route, answer, sources: [], confidence: "high",
 *       externalAuthority: {key, name, phone, altPhone, note, handles[]},
 *       classification }
 *
 *   "non_imc_unresolved" -- classifier said non-IMC but couldn't resolve
 *   which authority; treat like a low-confidence fallback.
 *
 * Non-2xx (400/500/503): { success: false, code, message, requestId } --
 * `message` is always safe to show a user as-is (server's errorHandler.js
 * never lets internal error detail reach this response).
 * ============================================================================
 */

const chatFlowEl = document.getElementById('chat-flow');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('query-input');
const sendBtn = document.getElementById('send-btn');
const coveragePillsEl = document.getElementById('coverage-pills');
const coverageSubEl = document.getElementById('coverage-sub');
const statDeptCountEl = document.getElementById('stat-dept-count');

/** @type {Array<{id:string, code:string, slug:string, name:string, description:string|null}>} */
let departments = [];
/** Currently selected department, or null (picker screen / general mode). */
let selectedDepartment = null;
/** True once the citizen has explicitly chosen "something else / not sure". */
let generalMode = false;

let messagesEl = null; // created fresh each time renderChatArea() runs

// ---------------------------------------------------------------------------
// Department loading (powers the hero stat, the coverage section, and the
// chat picker -- fetched once, reused everywhere).
// ---------------------------------------------------------------------------

async function loadDepartments() {
  try {
    const res = await fetch('/api/departments?lang=en');
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.message || 'Failed to load departments');
    departments = body.data.departments;
  } catch {
    departments = [];
    coverageSubEl.textContent =
      'Departments abhi load nahi ho paaye. Server chal raha hai ya nahi check karein.';
  }

  statDeptCountEl.textContent = departments.length || '—';
  renderCoveragePills();
  renderDepartmentPicker();
}

function renderCoveragePills() {
  if (departments.length === 0) return;
  coverageSubEl.textContent = `${departments.length} vibhaag, ek jagah — chunein aur seedha sahi jaankari paayein.`;
  coveragePillsEl.innerHTML = '';
  departments.forEach((d) => {
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = d.name;
    coveragePillsEl.appendChild(span);
  });
}

// ---------------------------------------------------------------------------
// Chat area rendering. Two screens inside #chat-flow:
//   - picker: no department chosen yet.
//   - active: a department is selected (or general mode) -- banner (if any)
//     + suggested-question chips (if a department is selected) + messages.
// The free-text <form> below #chat-flow is always visible in both screens.
// ---------------------------------------------------------------------------

function renderDepartmentPicker() {
  chatFlowEl.innerHTML = '';

  const heading = document.createElement('p');
  heading.className = 'picker-heading';
  heading.textContent = 'Aapki dikkat ya sawaal kis vibhaag se sambandhit hai?';
  chatFlowEl.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'dept-grid';

  departments.forEach((d) => {
    const btn = document.createElement('button');
    btn.className = d.hasVerifiedContent === false ? 'dept-card limited' : 'dept-card';
    btn.type = 'button';
    btn.innerHTML = '<div class="dept-name"></div><div class="dept-desc"></div>';
    btn.querySelector('.dept-name').textContent = d.name;
    btn.querySelector('.dept-desc').textContent = d.description || '';
    if (d.hasVerifiedContent === false) {
      const flag = document.createElement('div');
      flag.className = 'dept-flag';
      flag.textContent = 'Verified jaankari jald aayegi';
      btn.appendChild(flag);
    }
    btn.addEventListener('click', () => selectDepartment(d));
    grid.appendChild(btn);
  });

  const otherBtn = document.createElement('button');
  otherBtn.className = 'dept-card other';
  otherBtn.type = 'button';
  otherBtn.textContent = 'Pata nahi / kuch aur — seedha type karein';
  otherBtn.addEventListener('click', selectGeneral);
  grid.appendChild(otherBtn);

  chatFlowEl.appendChild(grid);
  inputEl.placeholder = 'Pehle upar se apna vibhaag chunein…';
}

function renderChatArea() {
  chatFlowEl.innerHTML = '';

  if (selectedDepartment) {
    const banner = document.createElement('div');
    banner.className = 'selected-banner';
    const label = document.createElement('span');
    label.innerHTML = 'Chuna gaya vibhaag: <strong></strong>';
    label.querySelector('strong').textContent = selectedDepartment.name;
    banner.appendChild(label);
    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.textContent = 'Vibhaag badlein';
    changeBtn.addEventListener('click', resetToPicker);
    banner.appendChild(changeBtn);
    chatFlowEl.appendChild(banner);

    if (selectedDepartment.hasVerifiedContent === false) {
      // No point calling suggested-questions -- there is nothing real to
      // suggest, and offering an empty "no suggestion, type your own" chip
      // just walks the citizen into the generic low-confidence fallback
      // with no explanation. Be upfront, and surface the department's real
      // contact instead so there's still a useful next step.
      const note = document.createElement('div');
      note.className = 'limited-note';
      note.innerHTML =
        '<strong>Verified jaankari jald aayegi.</strong> Iss vibhaag ke liye humare paas abhi verified procedure details nahi hain — neeche diya gaya contact istemaal karein, ya apna sawaal type karke dekh sakte hain.';
      chatFlowEl.appendChild(note);

      const contactWrap = document.createElement('div');
      contactWrap.id = 'dept-contact';
      contactWrap.innerHTML = '<span class="chip loading">Contact load ho raha hai…</span>';
      chatFlowEl.appendChild(contactWrap);
      loadDepartmentContact(selectedDepartment.slug);
    } else {
      const label2 = document.createElement('p');
      label2.className = 'suggested-label';
      label2.textContent = 'Suggested sawaal';
      chatFlowEl.appendChild(label2);

      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'chips';
      chipsWrap.id = 'suggested-chips';
      chipsWrap.innerHTML = '<span class="chip loading">Load ho raha hai…</span>';
      chatFlowEl.appendChild(chipsWrap);
      loadSuggestedQuestions(selectedDepartment.slug);
    }
  } else {
    const backBtn = document.createElement('button');
    backBtn.className = 'chip';
    backBtn.type = 'button';
    backBtn.textContent = '← Vibhaag chunein';
    backBtn.addEventListener('click', resetToPicker);
    chatFlowEl.appendChild(backBtn);
  }

  messagesEl = document.createElement('div');
  messagesEl.id = 'messages';
  messagesEl.innerHTML =
    '<p class="empty-state">Ek suggested sawaal chunein ya neeche apna sawaal type karein.</p>';
  chatFlowEl.appendChild(messagesEl);

  inputEl.placeholder = 'Apna sawaal yahan likhein… (English / हिंदी / Hinglish)';
}

async function loadSuggestedQuestions(slug) {
  const wrap = document.getElementById('suggested-chips');
  try {
    const res = await fetch(
      `/api/departments/${encodeURIComponent(slug)}/suggested-questions?limit=5`
    );
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.message || 'Failed to load suggestions');
    const questions = body.data.questions;
    if (!wrap) return; // user may have navigated away before this resolved
    wrap.innerHTML = '';
    if (questions.length === 0) {
      wrap.innerHTML =
        '<span class="chip loading">Iss vibhaag ke liye abhi koi suggestion nahi — apna sawaal type karein.</span>';
      return;
    }
    questions.forEach((q) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = q;
      chip.addEventListener('click', () => sendQuery(q));
      wrap.appendChild(chip);
    });
  } catch {
    if (wrap) wrap.innerHTML = '<span class="chip loading">Suggestions load nahi ho paaye.</span>';
  }
}

/** Real contact for a hasVerifiedContent:false department -- the useful
 *  next step when there's no procedure content to suggest questions from. */
async function loadDepartmentContact(slug) {
  const wrap = document.getElementById('dept-contact');
  try {
    const res = await fetch(`/api/departments/${encodeURIComponent(slug)}?lang=en`);
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.message || 'Failed to load department');
    const contact = (body.data.contacts || []).find((c) => c.isPrimary) || body.data.contacts?.[0];
    if (!wrap) return;
    if (!contact) {
      wrap.innerHTML = '';
      return;
    }
    const parts = [contact.name, contact.designation, contact.mobile].filter(Boolean);
    wrap.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'fact-row';
    row.innerHTML = '<strong>Contact: </strong>';
    row.appendChild(document.createTextNode(parts.join(' — ')));
    wrap.appendChild(row);
  } catch {
    if (wrap) wrap.innerHTML = '';
  }
}

function selectDepartment(dept) {
  selectedDepartment = dept;
  generalMode = false;
  renderChatArea();
}

function selectGeneral() {
  selectedDepartment = null;
  generalMode = true;
  renderChatArea();
}

function resetToPicker() {
  selectedDepartment = null;
  generalMode = false;
  renderDepartmentPicker();
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

function clearEmptyState() {
  const empty = messagesEl && messagesEl.querySelector('.empty-state');
  if (empty) empty.remove();
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addUserMessage(text) {
  clearEmptyState();
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = '<div class="bubble"></div>';
  wrap.querySelector('.bubble').textContent = text;
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML =
    '<div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function listBlock(title, items) {
  if (!items || items.length === 0) return '';
  const lis = items.map(() => '<li></li>').join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<h4>${title}</h4><ul>${lis}</ul>`;
  const lisEls = wrap.querySelectorAll('li');
  items.forEach((text, i) => {
    lisEls[i].textContent = text;
  });
  return wrap.innerHTML;
}

function factRow(label, value) {
  if (!value) return '';
  const div = document.createElement('div');
  div.className = 'fact-row';
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  div.appendChild(strong);
  div.appendChild(document.createTextNode(value));
  return div.outerHTML;
}

function badge(text, cls) {
  const span = document.createElement('span');
  span.className = `badge ${cls}`;
  span.textContent = text;
  return span.outerHTML;
}

/** Renders one bot response bubble from a successful /api/chat `data` object. */
function renderBotResponse(data) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const answerP = document.createElement('div');
  answerP.textContent = data.answer || '';
  bubble.appendChild(answerP);

  const card = document.createElement('div');
  card.className = 'answer-card';
  let extraHtml = '';

  if (data.route === 'grounded') {
    extraHtml += listBlock('Procedure', data.procedureSteps);
    extraHtml += listBlock('Required documents', data.requiredDocuments);
    extraHtml += listBlock('Required information', data.requiredInformation);
    extraHtml += factRow('Department', data.department ? data.department.name : null);
    extraHtml += factRow(
      'Contact',
      data.contact
        ? `${data.contact.name}${data.contact.designation ? ' — ' + data.contact.designation : ''}${data.contact.phone ? ' — ' + data.contact.phone : ''}`
        : null
    );
    extraHtml += factRow('Office timing', data.officeTiming);
    extraHtml += factRow('Fees', data.fees);
    extraHtml += factRow('Escalation', data.escalation);
    if (data.sources && data.sources.length) {
      extraHtml += factRow('Sources', `${data.sources.length} verified knowledge chunk(s)`);
    }
  } else if (data.route === 'non_imc' && data.externalAuthority) {
    const auth = data.externalAuthority;
    extraHtml += factRow('Handled by', auth.name?.en);
    extraHtml += factRow('Contact', [auth.phone, auth.altPhone].filter(Boolean).join(' / '));
  }

  card.innerHTML = extraHtml;
  if (extraHtml) bubble.appendChild(card);

  let badges = badge(data.route, `route-${data.route}`);
  if (data.confidence) badges += badge(`confidence: ${data.confidence}`, 'confidence');
  if (data.groundingViolations && data.groundingViolations.length) {
    badges += badge(`${data.groundingViolations.length} auto-corrected`, 'violation');
  }
  const badgeWrap = document.createElement('div');
  badgeWrap.className = 'badges';
  badgeWrap.innerHTML = badges;
  bubble.appendChild(badgeWrap);

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function renderBotError(message) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML = '<div class="bubble error"></div>';
  wrap.querySelector('.bubble').textContent = message;
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

async function sendQuery(query) {
  // Typing before a department has ever been picked (or "something else")
  // still works -- it just starts in general mode implicitly.
  if (!selectedDepartment && !generalMode) {
    generalMode = true;
    renderChatArea();
  }

  addUserMessage(query);
  sendBtn.disabled = true;
  const typingEl = addTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const body = await res.json();
    typingEl.remove();

    if (!res.ok || !body.success) {
      renderBotError(body.message || 'Something went wrong. Please try again.');
      return;
    }
    renderBotResponse(body.data);
  } catch {
    typingEl.remove();
    renderBotError('Could not reach the server. Is it running?');
  } finally {
    sendBtn.disabled = false;
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = inputEl.value.trim();
  if (!query) return;
  inputEl.value = '';
  sendQuery(query);
});

loadDepartments();
