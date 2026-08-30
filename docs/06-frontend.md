# PART 10 — Frontend Architecture

## Pages (only what is actually needed)

```
/                       Home — "How can we help you?" + language switch + quick actions
/chat                   AI Assistant (main surface)
/departments            Department directory (data-driven from /api/departments)
/departments/:slug      Department detail — services, responsibilities, contacts, timings
/complaints/new         File a complaint (accepts pre-fill from chat)
/complaints/track       Track by reference ID (public, no login)
/complaints             My complaints (auth)
/complaints/:refId      Complaint detail + timeline (auth)
/login  /register       Firebase auth
/profile                Profile & language preference
/staff                  Staff dashboard (role: staff)
/staff/complaints/:id   Staff complaint detail
/admin                  Admin dashboard (role: admin)
/admin/knowledge        Knowledge base management + data-quality queue
/admin/users            User & role management
```

Dropped from your candidate list: a separate `/services` page (services are
already inside department detail — a second page would need its own content and
would duplicate the taxonomy) and a separate `/register` flow for staff (staff
are provisioned by an admin, never self-registered).

## State management

**No Redux. No Zustand.** For an app this size that would be ceremony.

- **Server state → TanStack Query.** Departments, categories, zones, complaints
  are all server data with caching, refetch and loading states — that is exactly
  what Query is for, and it removes ~80% of what people reach for Redux to do.
- **Auth → one React Context** wrapping Firebase's `onAuthStateChanged`, exposing
  `{user, role, loading, login, logout}`.
- **Language → one Context + i18next**, persisted to `localStorage`.
- **Chat → local `useReducer` inside the chat route**, since it lives and dies
  with that screen.

If it later needs global client state, add Zustand then. Not before.

## Component library (build once, reuse everywhere)

`Button · Input · TextArea · Select · Modal · Card · Badge · Spinner ·
EmptyState · ErrorState · Toast · Pagination`

Domain: `Navbar · Sidebar · LanguageSwitcher · DepartmentCard ·
DepartmentSelector · ChatMessage · ChatInput · SourceCitation · AnswerCard ·
SuggestedActions · ComplaintCard · ComplaintForm · StatusBadge · StatusTimeline ·
ImageUploader · ImageGallery · TrackForm`

**`AnswerCard` is the important one.** It consumes the structured JSON from
`/api/chat` and renders labelled sections — Procedure, Required Documents,
Department, Office Timing, Fees, Sources — exactly as in your mockup. Because the
backend returns structure rather than markdown, the card is deterministic: a
missing `fees` field renders nothing at all rather than the model writing
"Fees: not specified" into prose.

## Chat UI

Per your mockup: dark navy sidebar (New Chat · Chat with IMC Saathi · My Queries ·
Popular Services · Track Complaint · Announcements · Feedback), IMC crest with
bilingual header, language dropdown, theme toggle, quick-action chips.

Behaviours: conversation history · streaming or typing indicator · error state
with retry · **source citations under every answer** · suggested-action buttons ·
department context chip showing what the bot decided (and letting the citizen
correct it — this is both good UX and free classifier training data) · optional
photo attachment · clear chat · full mobile responsiveness.

Deliberately **not** a ChatGPT clone: it is a civic form-shaped interface that
happens to accept free text. The answer is a card, not a wall of prose.

**Disable the Birth Certificate and Trade License quick-action chips at v1** —
there is no source content behind them (data quality item 16). Ship the chips
that Tier A departments support.

## Internationalisation

`react-i18next`, locale files `en.json` / `hi.json`, **no inline strings
anywhere**. Language is chosen on the home screen and persisted; every API call
sends `lang` so server-generated content (department names, category labels,
error messages) arrives already localised — this is why `departments.name` is an
`{en, hi}` object in the schema rather than a plain string.

Devanagari needs care: load **Noto Sans Devanagari** with a real fallback stack,
give Hindi text slightly more line-height (Devanagari has taller ascenders and
matras clip at tight leading), and test that Hindi labels don't overflow buttons
sized for English.

## Accessibility & responsiveness

Keyboard navigable throughout · visible focus rings · labelled form controls ·
`aria-live` on the chat transcript so screen readers announce new answers ·
WCAG AA contrast · ≥44 px touch targets · error messages in plain language, in
the selected language.

Mobile-first, and the complaint flow especially — a citizen standing next to a
broken street light on a phone is the primary user. Camera capture must be one
tap (`<input type="file" accept="image/*" capture="environment">`), with client-
side compression before upload so a 12 MP photo doesn't fail on a 3G connection.

## Route protection

`<ProtectedRoute requiredRole="staff">` wrappers exist for UX only — they stop a
citizen seeing a broken dashboard. **All real authorization is server-side.**
Anyone can edit React state; nobody can edit the Express middleware.
