/**
 * demo.js
 *
 * Minimal client for the single demo page (public/demo.html). No build
 * step, no framework -- plain DOM, so anything here reads clearly for
 * whoever builds the real Phase 9 frontend and wants to see the contract
 * this backend actually returns before wiring their own UI to it.
 *
 * ============================================================================
 * API CONTRACT -- POST /api/chat
 * ============================================================================
 * Request body:  { "query": "<citizen text, 2-1000 chars, en/hi/hinglish>" }
 *
 * Response envelope (always): { "success": boolean, "data"?: {...},
 *   "code"?: string, "message"?: string, "requestId"?: string }
 * On success (HTTP 200) `data.route` is one of:
 *
 *   "grounded" -- a real answer was generated from retrieved knowledge.
 *     {
 *       route, answer, procedureSteps[], requiredDocuments[],
 *       requiredInformation[], officeTiming, fees, escalation,
 *       sources[{chunkId, document, section, url}], suggestedActions[],
 *       confidence: "high"|"medium"|"low", groundingViolations[],
 *       department: {id, name} | null,   // from the DB, not the LLM
 *       contact: {name, designation, phone, office} | null,  // from the DB
 *       classification: {...}, departmentFilterApplied, retrievedCount
 *     }
 *
 *   "out_of_scope" -- not a civic/IMC matter at all (e.g. cricket scores).
 *     { route, answer, sources: [], confidence: "high", classification }
 *
 *   "non_imc" -- a real civic issue, but a different authority handles it
 *   (e.g. household electricity -> the Discom, not IMC Electrical).
 *     { route, answer, sources: [], confidence: "high",
 *       externalAuthority: {key, name, phone, altPhone, note, handles[]},
 *       classification }
 *
 *   "non_imc_unresolved" -- classifier said non-IMC but couldn't resolve
 *   which authority; treat like a low-confidence fallback.
 *     { route, answer, sources: [], confidence: "low", classification }
 *
 * Non-2xx (400/500/503): { success: false, code, message, requestId } --
 * `message` is always safe to show a user as-is (see server's errorHandler.js
 * -- internal error detail never reaches this response on purpose).
 * ============================================================================
 */

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('query-input');
const sendBtn = document.getElementById('send-btn');
const chipsEl = document.getElementById('example-chips');

function clearEmptyState() {
  const empty = messagesEl.querySelector('.empty-state');
  if (empty) empty.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  wrap.dataset.typing = 'true';
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

chipsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  sendQuery(btn.dataset.query);
});
