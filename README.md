# AWR Connect SDK â€“ Documentation & Example Implementation

Static site that documents the **AWR Connect Client JS SDK** (`adventist-inbox-sdk`) and provides a **live, runnable example** so you can see how the SDK works in a real chat UI. This README is a granular guide to using and understanding the implementation.

---

## Table of contents

- [Who this is for](#who-this-is-for)
- [What you get](#what-you-get)
- [Prerequisites](#prerequisites)
- [How to run](#how-to-run)
- [UI overview](#ui-overview)
- [Custom Chat flow (step-by-step)](#custom-chat-flow-step-by-step)
- [API buttons (Connect, Send, Get channel, Get conversation, Disconnect)](#api-buttons-connect-send-get-channel-get-conversation-disconnect)
- [SDK loading](#sdk-loading)
- [Contact details](#contact-details)
- [Files](#files)
- [Troubleshooting](#troubleshooting)

---

## Who this is for

- **Integrators** adding AWR Connect chat to their own site or app (e.g. help widget, support chat).
- **Developers** who need to see how the SDK is used (connect, send, receive, real-time) before wiring it into their stack.
- **QA / support** who need a simple way to test a Custom Channel end-to-end (visitor sends, agent replies, messages in real time).

You need a running **AWR Connect API** and a **Custom Channel** (connection key + secret from the webapp). No backend or build step is required for the demo; the SDK is loaded from **unpkg** by default.

---

## What you get

- **In-page documentation** (`index.html`): overview, installation, quick start, full API reference, types, events, authentication.
- **Credentials form:** Base URL, Channel ID, Secret, optional Session ID and Visitor name.
- **Open chat:** Click **Open chat** to start a real-time chat: history is loaded, then new agent messages arrive via Socket.IO. You can send text or **Attach** media (`uploadMedia` then `sendMessage`). Each send includes `sessionId` and `visitorName`.
- **API buttons:** **Connect**, **Send message**, **Get channel info**, **Get conversation**, **Disconnect** â€“ each runs the corresponding SDK (or fetch) operation and logs the result.
- **Contact details:** Country, Language and Attributes (JSON) fill the agent's contact card. They are sent as `config.contact` when you open the chat, per message with **Send message**, and on demand with **Update contact** (`updateContact`). See [Contact details](#contact-details).
- **Log:** All operations and errors are printed in the Log area. Use **Clear log** to reset.

---

## Prerequisites

1. **AWR Connect API** running (e.g. `http://localhost:8081` or your deployed base URL). The page will send requests to this origin; CORS must allow your page origin.
2. **A Custom Channel** created in the AWR Connect webapp:
   - Channels â†’ Add Channel â†’ Add Custom Channel.
   - Create the channel and copy the **connection key** (Channel ID) and **secret** (shown once).
3. **Browser or static server:** Open `index.html` via `file://` or serve the folder (e.g. `npx serve .`, `python3 -m http.server 3000`). For loading the SDK from unpkg, a static server is recommended.

---

## How to run

1. **Serve the folder** (recommended):
   ```bash
   npx serve .
   # or
   python3 -m http.server 3000
   ```
   Then open `http://localhost:3000` (or the port shown).

2. **Or open `index.html`** directly in the browser (file protocol). Some browsers may restrict cross-origin requests when using `file://`.

3. **Fill credentials:**
   - **Base URL:** Your AWR Connect API root (e.g. `http://localhost:8081`). No trailing slash.
   - **Channel ID:** The Custom Channel connection key (not an internal numeric ID).
   - **Secret:** The channel secret.
   - **Session ID:** pre-filled with a new UUID on page load. SDK 0.5.0+ only accepts UUIDs (e.g. `crypto.randomUUID()`); reuse the same value to continue a conversation.
   - **Visitor name** (optional): e.g. `Alice`. Used in chat and in send payloads.

4. **Open chat:** Click **Open chat**. The app creates an `AdventistInboxClient` with `baseUrl`, `channelId`, `secret`, `sessionId`, and `visitorName`, attaches `connection_ready`, `connection_error`, `message`, and `error` listeners, then calls `connect()`. After `connection_ready`, it loads the first page of conversation with `getConversation(sessionId, { page: 1, limit: 50 })` and registers the `message` handler so new agent messages are appended. You can type in the input and click **Send**; each send uses `sendMessage(text, { sessionId, visitorName })`.

5. **Leave chat:** Click **Leave chat** to disconnect the client and return to the credentials form.

---

## UI overview

| Element | Purpose |
| -------- | -------- |
| **Base URL** | AWR Connect API base URL. |
| **Channel ID** | Custom Channel connection key. |
| **Secret** | Channel secret (sent as `X-AWR-Channel-Secret`). |
| **Session ID** | Optional; used for chat session and for send/getConversation. |
| **Visitor name** | Optional; displayed and sent in message metadata. |
| **Open chat** | Starts real-time chat: connect â†’ load history â†’ listen for `message`. |
| **Connect** | Connects the client (SDK or mock). Enables Send, Get channel, Get conversation, Disconnect. |
| **Send message** | Sends the text in â€œMessage textâ€ with current sessionId/visitorName. |
| **Get channel info** | Calls `getChannelInfo()` and logs the result. |
| **Get conversation** | Calls `getConversation(sessionId, { page: 1, limit: 20 })` and logs messages and pagination. |
| **Disconnect** | Disconnects the client and clears connected state. |
| **Log** | Shows timestamps and messages for each operation and errors. |
| **Chat panel** | Message list (history + incoming agent messages), input, and Send. |
| **Country / Language** | Optional ISO codes (e.g. `NG`, `en-US`) for the contact's Location and Language. |
| **Attributes** | Optional JSON object of key-value details shown to agents (e.g. `{"platform": "web"}`); `null` removes a key. |
| **Update contact** | Calls `updateContact({ sessionId, country, language, attributes })` for the open chat, or for the form's Session ID after Connect. |

---

## Custom Chat flow (step-by-step)

1. User fills Base URL, Channel ID, Secret; optionally Session ID and Visitor name.
2. User clicks **Open chat**.
3. App creates `AdventistInboxClient({ baseUrl, channelId, secret, sessionId, visitorName, contact })`. `contact` comes from the Contact details fields and is left out when they are empty.
4. App attaches:
   - `connection_ready` â†’ hide error banner, set header text, call `getConversation(sessionId, { page: 1, limit: 50 })`, render `res.messages`, then attach `message` handler to append new messages.
   - `connection_error` â†’ show error banner.
   - `error` â†’ show error banner.
5. App calls `client.connect()`. Credentials form is hidden, chat panel is shown.
6. When the server acknowledges the join, `connection_ready` runs; history is fetched and rendered; the `message` listener is active.
7. User types and clicks **Send**. App calls `client.sendMessage(text, { sessionId: chatSessionId, visitorName: chatVisitorName })`. On success, a local â€œcontactâ€ bubble is appended and the input is cleared.
8. When an agent replies in the AWR Connect inbox, the API emits to the session room; the SDK receives it and emits `message`; the handler appends the agent message to the list.
9. User changes Contact details and clicks **Update contact**. App calls `client.updateContact({ sessionId: chatSessionId, ...contact })`; because the sessionId matches the client's own, the SDK also updates `config.contact`, so later messages carry the new values.
10. User clicks **Leave chat**. App removes the `message` listener, calls `client.disconnect()`, and shows the credentials form again.

Important details that match the SDK docs: **sessionId** is required in every `sendMessage` call; **connection_ready** has no payload; **getConversation** is called with `(sessionId, { page, limit })`; the client must be connected before `getConversation`.

---

## API buttons (Connect, Send, Get channel, Get conversation, Disconnect)

- **Connect:** Builds config from the form (baseUrl, channelId, secret; sessionId/visitorName only used for Send and Get conversation). If the SDK is loaded, creates `AdventistInboxClient`, attaches `connection_ready` / `connection_error` / `error`, calls `connect()`. If the SDK is not loaded, sets a mock â€œconnectedâ€ state. Enables the other buttons.
- **Send message:** Reads â€œMessage textâ€ and sessionId/visitorName from the form. Contact details are read too. If using the SDK, calls `client.sendMessage(text, { sessionId, visitorName, contact })`; otherwise uses the built-in `fetchSendMessage()` that POSTs the same `message` shape to `/webhook/custom`, with `country`, `language` and `attributes` in `message.metadata`. Logs success or failure.
- **Update contact:** Calls `client.updateContact({ sessionId, ...contact })` (or fetch `POST /webhook/custom/contact` with `{ sessionId, country?, language?, attributes? }`). Fails with 404 until the visitor has sent a message.
- **Get channel info:** Calls `client.getChannelInfo()` (or fetch to `GET /webhook/custom/channels/:channelId`) and logs the response.
- **Get conversation:** Calls `client.getConversation(sessionId, { page: 1, limit: 20 })` (or fetch to `GET /webhook/custom/channels/:channelId/contact/:sessionId?page=1&limit=20`) and logs `messages` and `pagination`.
- **Disconnect:** If using the SDK, calls `client.disconnect()`. Clears the client reference and disables the other buttons.

All of these require being â€œconnectedâ€ first (Connect clicked). The implementation uses the same config field names as the SDK: `baseUrl`, `channelId`, `secret`, `sessionId`, `visitorName`.

---

## SDK loading

- **Default:** The loader script at the bottom of `index.html` loads `adventist-inbox-sdk@0.6.0` from **unpkg**. The bundle exposes `AdventistInbox.AdventistInboxClient`; `app.js` also accepts the older `AwrConnectClient` globals.
- **Local build fallback:** If unpkg fails (for example before 0.6.0 is published), the loader tries `../awr-connect-custom-channel-js-sdk/dist/index.umd.js`. Build it with `pnpm build` in that repo and serve the **parent** folder so the relative path resolves, e.g. `npx serve ..` and open `/awr-connect-sdk-implementation/`.
- **Without SDK:** The Connect, Send, Get channel, and Get conversation buttons fall back to `fetch()` and implement the same request shapes (nested `message` body for POST, correct GET URLs). The **Open chat** flow requires the SDK (real-time `message` events).

---

## Contact details

Agents see a contact card next to each conversation. The demo fills it from the **Contact details** fields:

- **Country** and **Language** fill the card's Location and Language only when they are empty, still the channel default, or a value you sent earlier. A value an agent set in the inbox is kept.
- **Attributes** merge per key (`null` removes a key), up to 50 keys; they show read-only under *Additional details*.
- **Update contact** needs an existing contact: send a message first, otherwise the API returns 404.
- Invalid or unknown codes on a message are skipped and the message is still delivered; **Update contact** reports them as a failure.

Full rules: the SDK README's *Contact details* section.

---

## Files

| File | Purpose |
| ----- | ----- |
| `index.html` | Documentation and live example UI (nav, sections, credentials form, chat panel, script tags). |
| `styles.css` | Layout and styling for the doc and chat. |
| `app.js` | Example logic: config from form, Open chat (connect, connection_ready, getConversation, message handler, send), Leave chat, Connect/Send/Get channel/Get conversation/Disconnect, Update contact, fetch fallbacks. |
| `README.md` | This file. |

---

## Troubleshooting

| Issue | What to check |
| ----- | -------------- |
| â€œOpen chat failed: baseUrl, channelId, and secret are requiredâ€ | Fill Base URL, Channel ID, and Secret. |
| â€œSDK not loadedâ€ | Ensure the unpkg script loads (network tab). If using a local bundle, path and server must allow the script to run. |
| â€œConnection errorâ€ / â€œCustom channel not foundâ€ | Wrong Base URL, wrong Channel ID (use connection key), or channel not created. Check API and CORS. |
| 401 Unauthorized | Wrong Secret. |
| CORS errors | Configure the AWR Connect API to allow your page origin (e.g. `http://localhost:3000`). |
| Agent reply not showing in chat | Same Session ID as in the open chat; agent replying to that conversation in the inbox; `connection_ready` fired (check Log or error banner). |
| Update contact returns 404 | The contact is created by the visitor's first message. Send a message with the same Session ID first. |
| Contact card still shows Location: Unknown | Check the country code (ISO alpha-2/alpha-3) and that an agent hasn't set Location already; an agent's value is never overwritten. |
| Get conversation returns empty | Use the same Session ID you used when sending; ensure you clicked Connect before Get conversation. |

For more SDK-level troubleshooting (e.g. `sessionId` colon, mediaUrl required, join timeout, status events), see the **adventist-inbox-sdk** [README](https://github.com/awr360/awr-connect-custom-channel-js-sdk) and [TESTING.md](https://github.com/awr360/awr-connect-custom-channel-js-sdk/blob/main/TESTING.md).
