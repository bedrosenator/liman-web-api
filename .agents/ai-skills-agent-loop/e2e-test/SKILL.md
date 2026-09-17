---
name: e2e-test
description: End-to-end browser testing for the Boek 7 chat app using Chrome DevTools MCP. Covers server readiness, OTP login (reading the code from global.db), DOM assertions for HTMX swaps and WebSocket streaming, and cleanup. Use when asked to verify UI behavior in a real browser, reproduce a UI bug, or E2E-test chat features.
---

# E2E Browser Testing (Boek 7 App)

Verify real UI behavior in Chrome against the local app: login, chat interactions, HTMX swaps, and WebSocket streaming. Prefer this over unit-test reasoning when a bug report says "works after refresh" or "only happens when clicking around" — those are DOM/lifecycle bugs only a real browser reveals.

Complements `manual-automation` (generic port/launch/login workflow). This skill adds Boek 7–specific knowledge: OTP retrieval from SQLite, HTMX swap verification, WS streaming probes.

## 1. Server Readiness (do NOT restart blindly)

The dev server runs `bun --hot src/server.ts` on port 3000 and **hot-reloads code changes automatically — never kill it** just to "get fresh code". Only restart if it crashed:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN   # expect: bun ... LISTEN
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # expect 200
```

If you must launch it: `cd app && nohup bun --hot src/server.ts > /tmp/dal-server.log 2>&1 &` — then confirm a *single* listener (an `EADDRINUSE` in the log means one was already running; that's fine, kill only your duplicate).

## 2. Browser + Login (OTP without email access)

Open `http://localhost:3000/chat` with `chrome-devtools_new_page`. An unauthenticated visit redirects to `/login`. Login is email + 6-digit OTP. The OTP is stored in plaintext in `global.db` (dev convenience) and also printed to the server log (`[OTP DEBUG]`).

1. Snapshot → fill the email textbox → click "Stuur Inlogcode".
2. Read the OTP (dev account is `test@test.com`):
   ```bash
   sqlite3 data/global.db "SELECT email, otp_code, expires_at FROM login_otps ORDER BY rowid DESC LIMIT 1;"
   ```
3. Snapshot → fill the 6-digit code → click "Verifieer Code". Page navigates to `/chat`.

If `sqlite3` reports a locked DB, retry after a second (WAL contention with the running server); the OTP lives 10 minutes.

## 3. Driving the Chat UI

- **Open a session**: click a `.session-item` in the sidebar (or `evaluate_script` `item.click()` when the a11y snapshot is noisy — the sidebar has dozens of items).
- **New chat**: click `+ Nieuwe Chat`.
- **Send a message**: fill `#chat-input` (snapshot uid), then submit via `document.getElementById('chat-form').requestSubmit()` — do NOT press Enter blindly in the textarea (it may insert a newline; ⌘+Enter is the app binding).
- **Close the cookie banner** if it intercepts clicks.

## 4. Assert on DOM State, Not Screenshots

`take_screenshot` output may not be readable by the model. Assert programmatically with `evaluate_script` instead — screenshots are for the human's record only.

**Example — per-message sources chips and ordering (the invariant worth pinning):**

```js
() => [...document.querySelectorAll('.chat-message.assistant')].map(m => ({
  id: m.getAttribute('data-message-id'),
  chips: m.querySelectorAll('.message-sources .source-chip').length,
  order: m.querySelector('.message-content-wrapper')
    ? [...m.querySelector('.message-content-wrapper').children].map(c => c.className.split(' ')[0]).join(',') : null
}))
// expected order for a completed answer: message-bubble,sources-bar,copy-button
```

## 5. Prove It Was an HTMX Swap (Not a Full Reload)

Many bugs only occur on HTMX swaps (sidebar navigation, posting a message). Before navigating, plant a marker; if it survives, no page reload happened:

```js
() => { window.__e2eMarker = 'survives-htmx'; document.querySelector('[data-session-id="..."]').click(); }
// after navigation:
() => ({ marker: window.__e2eMarker || 'GONE (full reload)', chips: document.querySelectorAll('.message-sources .source-chip').length })
```

The `htmx:afterSwap` handler on `#chat-messages` is a historical source of bugs (e.g. it once de-duplicated any `[data-message-id]` element, silently deleting per-message sources). Any test of "switch chats via sidebar" must use the marker technique.

## 6. Probing WebSocket Streaming

Chat answers stream over WS (`/chat/ws/:sessionId`) through a status pipeline (`building_query` → … → `sources_found` → `generating_response` → `completed`/`failed`). Poll and record **transitions**, not just the final state — ordering bugs live in the transitions:

```js
async () => {
  const probe = () => { const el = document.querySelector('.chat-message.assistant'); /* read data-status, child order, chip count, bubble length */ };
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const p = probe();
    if (!seen.length || JSON.stringify(seen.at(-1)) !== JSON.stringify(p)) seen.push(p);
    if (p.phase === 'completed' || p.phase === 'failed') break;
    await new Promise(r => setTimeout(r, 1000));
  }
  return { transitions: seen, final: probe() };
}
```

Generation against local Ollama can take ~30–60s; poll at 1s intervals and cap the loop.

## 7. Console & Network

After any failing interaction, check `list_console_messages` for JS errors and `list_network_requests` (filter XHR/fetch/WS) — HTMX returns HTML partials (4xx/5xx show up as failed `hx-get/hx-post`).

## 8. Cleanup

- Do NOT stop the dev server (the user keeps it running).
- Close extra browser pages you opened; leave the user's original tabs alone.
- Chats you created stay in the dev account history — fine for `test@test.com`, but prefer distinctive question text so they're identifiable/deletable.

## Known Pitfalls

- `list_pages` after a browser restart: page ids change — always re-list before selecting.
- OTP row must be the LATEST (`ORDER BY rowid DESC`) — old rows linger until expiry.
- `performance.getEntriesByType('navigation')[0].type` reads "navigate" even after HTMX pushState swaps — use the window marker (§5), not navigation type, to distinguish.
- The a11y snapshot of the chat page is huge (sidebar history). Use targeted `evaluate_script` queries instead of parsing the full snapshot.
