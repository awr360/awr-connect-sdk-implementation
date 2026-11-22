# Adventist Inbox SDK – Documentation & Example Implementation

A static site that documents the **Adventist Inbox SDK** (`adventist-inbox-sdk`, source in `awr-connect-custom-channel-js-sdk`) and runs a **live example** of a Custom Channel chat built on it. The page targets **`adventist-inbox-sdk@0.6.0`**.

> **Local testing only.** The demo asks for the channel secret in the browser. In production, keep the secret on your backend: anyone who has it can read and write every session on the channel.

---

## Table of contents

- [What you get](#what-you-get)
- [Prerequisites](#prerequisites)
- [How to run](#how-to-run)
- [UI overview](#ui-overview)
- [Open chat flow](#open-chat-flow)
- [API buttons](#api-buttons)
- [Contact details](#contact-details)
- [SDK loading](#sdk-loading)
- [Files](#files)
- [Troubleshooting](#troubleshooting)

---

## What you get

- **In-page documentation** (`index.html`): overview, security, installation, quick start, history (`getMessageWindow`), media, delivery/read status, contact details, API reference, types, events, authentication and CORS.
- **Open chat:** a real-time chat that uses the SDK the way an integrator should:
  - history through `getMessageWindow` (seq-based, with **Load older messages**),
  - live agent replies on `message`, ordered by `seq` and de-duplicated by `socialMessageId`,
  - sent / delivered / read ticks on your messages from `message_status`,
  - agent messages reported as read with `markMessagesRead`,
  - media rendered through `getMessageDisplayUrl` / `getMessageFullUrl` (image, audio, video, document) and patched on `message_media_ready`,
  - **Attach** uploads with `uploadMedia` (with progress) then sends a media message,
  - a status line for `reconnecting` / `reconnected`.
- **API buttons:** Connect, Send message, Get channel info, Get message window, Update contact, Disconnect. Each runs one SDK call (or the same request with `fetch()` when the SDK is not loaded) and prints the result in the **Log**.
- **Contact details:** Country, Language and Attributes (JSON) that fill the agent's contact card.

---

## Prerequisites

1. **Adventist Inbox API** running, e.g. `http://localhost:8081` or your deployed `https://` URL. The SDK only allows `http://` for `localhost` / `127.0.0.1`.
2. **A Custom Channel** created in the Adventist Inbox webapp (Channels → Add Channel → Custom Channel). Copy the **connection key** (Channel ID) and the **secret** (shown once).
3. **Your page origin in the channel's `allowedOrigins`** (exact `http(s)://host[:port]`, no path), e.g. `http://localhost:3000`. Without it the browser blocks the requests (CORS).

---

## How to run

1. **Serve the workspace folder** that contains both this repo and `awr-connect-custom-channel-js-sdk`, so the local SDK fallback resolves:

   ```bash
   # from the folder that contains awr-connect-sdk-implementation/
   npx serve .
   ```

   Open `http://localhost:3000/awr-connect-sdk-implementation/`. (Once `adventist-inbox-sdk@0.6.0` is on npm, serving this folder alone works too.)

2. **Fill in the form:**
   - **Base URL:** API root, no trailing slash.
   - **Channel ID:** the connection key (not a numeric id).
   - **Secret:** the channel secret.
   - **Session ID:** pre-filled with a new UUID. The SDK only accepts UUIDs; keep the value to continue the same conversation later.
   - **Visitor name:** shown in the inbox.
   - **Contact details** (optional): see [Contact details](#contact-details).

3. Click **Open chat**, or **Connect** to use the API buttons.

---

## UI overview

| Element | Purpose |
| ------- | ------- |
| **Base URL / Channel ID / Secret** | Client config (`baseUrl`, `channelId`, `secret`). |
| **Session ID** | Visitor session (UUID) used by Open chat, Send message, Get message window and Update contact. |
| **Visitor name** | `visitorName` in config and send options. |
| **Open chat** | Real-time chat (see [Open chat flow](#open-chat-flow)). |
| **Connect** | REST-only client (no `sessionId` in config); enables the API buttons. |
| **Send message** | `sendMessage(text, { sessionId, visitorName, contact })`. |
| **Get channel info** | `getChannelInfo()`. |
| **Get message window** | `getMessageWindow(sessionId, { intent: "present", limit: 20 })`. |
| **Disconnect** | `disconnect()`. |
| **Country / Language / Attributes** | Contact details (`ContactProfile`). |
| **Update contact** | `updateContact({ sessionId, ...contact })` for the open chat, or for the form's Session ID after Connect. |
| **Log** | Timestamped results and errors. |
| **Chat panel** | Messages with ticks, Load older messages, Attach, input and Send. |

---

## Open chat flow

1. `new AdventistInboxClient({ baseUrl, channelId, secret, sessionId, visitorName, contact })`. `contact` comes from the Contact details fields and is left out when they are empty.
2. Listeners are registered **before** `connect()`:
   - `connection_ready` → load history with `getMessageWindow(sessionId, { intent: "present", limit: 50 })`. A 404 means the session has no conversation yet and is treated as empty.
   - `message` → add or update the bubble, then `markMessagesRead` for agent messages.
   - `message_media_ready` → patch the bubble's media (`resolveDurableMediaUrl`).
   - `message_status` → update the tick on your own message.
   - `reconnecting` / `reconnected` → status line. The SDK replays missed messages as `message` after a reconnect.
   - `connection_error` → error banner; `error` → log.
3. `connect()` opens Socket.IO and joins the session room.
4. **Send:** `sendMessage(text, { sessionId, visitorName })`. The bubble is keyed by the returned `socialMessageId`, so `message_status` (and any echo of the same message) updates it instead of adding a duplicate.
5. **Attach:** `uploadMedia(file, { sessionId, mediaType, onProgress })` (image, audio or document; video upload is not supported by the SDK), then `sendMessage(caption, { messageType: "media", mediaUrl, mediaType })`.
6. **Load older messages:** `getMessageWindow(sessionId, { intent: "older", beforeSeq: oldestSeq, limit: 50 })` while `hasOlder` is true.
7. **Update contact:** `updateContact({ sessionId, ...contact })`. Because the sessionId is the client's own, the SDK also updates `config.contact`, so later messages carry the new values.
8. **Leave chat:** removes the listeners with `off()` and calls `disconnect()`.

Window rows are passed through `toSimplifiedMessage()` so they render exactly like socket messages, with unsafe media URLs removed. Agent buttons are shown as labels; the demo does not send button replies.

---

## API buttons

All of them need **Connect** first. Connect creates a client without `sessionId`, so it is REST-only and `connection_ready` fires immediately.

- **Send message:** reads Message text, Session ID, Visitor name and Contact details. SDK: `sendMessage(text, { sessionId, visitorName, contact })`. fetch: `POST /webhook/custom` with the `message` object; `country`, `language` and `attributes` go in `message.metadata`.
- **Get channel info:** `getChannelInfo()` / `GET /webhook/custom/channels/:channelId`.
- **Get message window:** `getMessageWindow(sessionId, { intent: "present", limit: 20 })` / `GET /webhook/custom/channels/:channelId/contact/:sessionId/messages/window?intent=present&limit=20`. Throws 404 until the session has a conversation.
- **Update contact:** `updateContact({ sessionId, ...contact })` / `POST /webhook/custom/contact` with `{ sessionId, country?, language?, attributes? }`. Fails with 404 until the visitor has sent a message.
- **Disconnect:** `disconnect()`.

---

## Contact details

Agents see a contact card next to each conversation. The demo fills it from the **Contact details** fields:

- **Country** and **Language** fill the card's Location and Language only when they are empty, still the channel default, or a value you sent earlier. A value an agent set in the inbox is kept.
- **Attributes** merge per key (`null` removes a key), up to 50 keys, and show read-only under *Additional details*.
- **Update contact** needs an existing contact: send a message first, otherwise the API returns 404.
- Invalid or unknown codes on a message are skipped and the message is still delivered; **Update contact** reports them as a failure.

Full rules: the SDK README's *Contact details* section.

---

## SDK loading

- The loader script at the bottom of `index.html` tries `https://unpkg.com/adventist-inbox-sdk@0.6.0/dist/index.umd.js`, then the local build `../awr-connect-custom-channel-js-sdk/dist/index.umd.js`, then starts `app.js`.
- Build the local SDK with `pnpm install && pnpm build` in `awr-connect-custom-channel-js-sdk`.
- `app.js` uses the `AdventistInbox` global (`AdventistInboxClient` plus the media helpers and `toSimplifiedMessage`). It needs 0.6.0 or later for contact details; older `awr-client-js-sdk` builds are not supported.
- **Without the SDK:** Connect and the API buttons use `fetch()` with the same requests; **Open chat** needs the SDK.

---

## Files

| File | Purpose |
| ---- | ------- |
| `index.html` | Documentation sections, live example UI, SDK loader. |
| `styles.css` | Layout and styling for the docs and the chat. |
| `app.js` | Example logic: config and contact details from the form, Open chat (events, message window, ticks, read receipts, media, upload), API buttons, fetch fallbacks. |
| `README.md` | This file. |

---

## Troubleshooting

| Issue | What to check |
| ----- | ------------- |
| "SDK not loaded" | The unpkg script failed and the local build was not found. Serve the parent folder and build the SDK (see [SDK loading](#sdk-loading)). |
| `sessionId must be a UUID` | Use the pre-filled Session ID or another `crypto.randomUUID()` value. |
| `baseUrl must use https` | Use `https://…`, or `http://localhost` for a local API. |
| CORS errors | Add the page origin (e.g. `http://localhost:3000`) to the Custom Channel's `allowedOrigins`; allow about a minute on multi-instance deploys. |
| Connection error / custom channel not found | Wrong Base URL, or Channel ID is not the connection key. |
| 401 Unauthorized | Wrong secret. |
| `custom:join timed out` | API or Socket.IO not reachable from the browser; check the Base URL and proxy. |
| No history in Open chat | A new Session ID has no conversation until the first message. To continue a conversation, reuse its Session ID. |
| Get message window returns 404 | Same as above: no conversation for that Session ID yet. |
| Agent reply not showing | Same Session ID in the chat and the inbox conversation; `connection_ready` fired (check the Log). |
| No read ticks in the inbox | Agent messages need a `socialMessageId`; check the Log for `markMessagesRead` errors. |
| Media bubble says "Media is processing" | Wait for `message_media_ready`; if it stays, the URL was not `https:` and was removed. |
| Update contact returns 404 | The contact is created by the visitor's first message. Send one with the same Session ID first. |
| Contact card still shows Location: Unknown | Check the country code (ISO alpha-2/alpha-3) and that an agent hasn't set Location already; an agent's value is never overwritten. |

For SDK-level details see the **adventist-inbox-sdk** [README](https://github.com/awr360/awr-connect-custom-channel-js-sdk) and [TESTING.md](https://github.com/awr360/awr-connect-custom-channel-js-sdk/blob/main/TESTING.md).
