# AWR Connect SDK – Documentation & Example Implementation

Static site that documents the **AWR Connect Client JS SDK** (`awr-client-js-sdk`) and provides a **live, runnable example** so you can see how the SDK works in a real chat UI. This README is a granular guide to using and understanding the implementation.

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
- **Open chat:** Click **Open chat** to start a real-time chat: history is loaded, then new agent messages arrive via Socket.IO. You can send messages; each send includes `sessionId` and `visitorName` as required by the SDK.
- **API buttons:** **Connect**, **Send message**, **Get channel info**, **Get conversation**, **Disconnect** – each runs the corresponding SDK (or fetch) operation and logs the result. Useful to test one operation at a time.
- **Log:** All operations and errors are printed in the Log area. Use **Clear log** to reset.

---

## Prerequisites

1. **AWR Connect API** running (e.g. `http://localhost:8081` or your deployed base URL). The page will send requests to this origin; CORS must allow your page origin.
2. **A Custom Channel** created in the AWR Connect webapp:
   - Channels → Add Channel → Add Custom Channel.
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
   - **Session ID** (optional): e.g. `user-123`. If empty, a default like `demo-session-<timestamp>` is used when opening chat.
   - **Visitor name** (optional): e.g. `Alice`. Used in chat and in send payloads.

4. **Open chat:** Click **Open chat**. The app creates an `AwrConnectClient` with `baseUrl`, `channelId`, `secret`, `sessionId`, and `visitorName`, attaches `connection_ready`, `connection_error`, `message`, and `error` listeners, then calls `connect()`. After `connection_ready`, it loads the first page of conversation with `getConversation(sessionId, { page: 1, limit: 50 })` and registers the `message` handler so new agent messages are appended. You can type in the input and click **Send**; each send uses `sendMessage(text, { sessionId, visitorName })`.

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
| **Open chat** | Starts real-time chat: connect → load history → listen for `message`. |
| **Connect** | Connects the client (SDK or mock). Enables Send, Get channel, Get conversation, Disconnect. |
| **Send message** | Sends the text in “Message text” with current sessionId/visitorName. |
| **Get channel info** | Calls `getChannelInfo()` and logs the result. |
| **Get conversation** | Calls `getConversation(sessionId, { page: 1, limit: 20 })` and logs messages and pagination. |
| **Disconnect** | Disconnects the client and clears connected state. |
| **Log** | Shows timestamps and messages for each operation and errors. |
| **Chat panel** | Message list (history + incoming agent messages), input, and Send. |

---

## Custom Chat flow (step-by-step)

1. User fills Base URL, Channel ID, Secret; optionally Session ID and Visitor name.
2. User clicks **Open chat**.
3. App creates `AwrConnectClient({ baseUrl, channelId, secret, sessionId, visitorName })`.
4. App attaches:
   - `connection_ready` → hide error banner, set header text, call `getConversation(sessionId, { page: 1, limit: 50 })`, render `res.messages`, then attach `message` handler to append new messages.
   - `connection_error` → show error banner.
   - `error` → show error banner.
5. App calls `client.connect()`. Credentials form is hidden, chat panel is shown.
6. When the server acknowledges the join, `connection_ready` runs; history is fetched and rendered; the `message` listener is active.
7. User types and clicks **Send**. App calls `client.sendMessage(text, { sessionId: chatSessionId, visitorName: chatVisitorName })`. On success, a local “contact” bubble is appended and the input is cleared.
8. When an agent replies in the AWR Connect inbox, the API emits to the session room; the SDK receives it and emits `message`; the handler appends the agent message to the list.
9. User clicks **Leave chat**. App removes the `message` listener, calls `client.disconnect()`, and shows the credentials form again.

Important details that match the SDK docs: **sessionId** is required in every `sendMessage` call; **connection_ready** has no payload; **getConversation** is called with `(sessionId, { page, limit })`; the client must be connected before `getConversation`.

---

## API buttons (Connect, Send, Get channel, Get conversation, Disconnect)

- **Connect:** Builds config from the form (baseUrl, channelId, secret; sessionId/visitorName only used for Send and Get conversation). If the SDK is loaded, creates `AwrConnectClient`, attaches `connection_ready` / `connection_error` / `error`, calls `connect()`. If the SDK is not loaded, sets a mock “connected” state. Enables the other buttons.
- **Send message:** Reads “Message text” and sessionId/visitorName from the form. If using the SDK, calls `client.sendMessage(text, { sessionId, visitorName })`; otherwise uses the built-in `fetchSendMessage()` that POSTs the same `message` shape to `/webhook/custom`. Logs success or failure.
- **Get channel info:** Calls `client.getChannelInfo()` (or fetch to `GET /webhook/custom/channels/:channelId`) and logs the response.
- **Get conversation:** Calls `client.getConversation(sessionId, { page: 1, limit: 20 })` (or fetch to `GET /webhook/custom/channels/:channelId/contact/:sessionId?page=1&limit=20`) and logs `messages` and `pagination`.
- **Disconnect:** If using the SDK, calls `client.disconnect()`. Clears the client reference and disables the other buttons.

All of these require being “connected” first (Connect clicked). The implementation uses the same config field names as the SDK: `baseUrl`, `channelId`, `secret`, `sessionId`, `visitorName`.

---

## SDK loading

- **Default:** The page loads the SDK from **unpkg**: `awr-client-js-sdk@0.1.2` (see the `<script>` tag in `index.html`). No local build required.
- **Local build:** To test a local SDK build, replace the unpkg script with your bundle, e.g.:
  ```html
  <script src="../awr-connect-custom-channel-js-sdk/dist/index.umd.js"></script>
  ```
  Serve the implementation folder from a server so the script loads correctly.
- **Without SDK:** The Connect, Send, Get channel, and Get conversation buttons fall back to `fetch()` and implement the same request shapes (nested `message` body for POST, correct GET URLs). The **Open chat** flow requires the SDK (real-time `message` events).

---

## Files

| File | Purpose |
| ----- | ----- |
| `index.html` | Documentation and live example UI (nav, sections, credentials form, chat panel, script tags). |
| `styles.css` | Layout and styling for the doc and chat. |
| `app.js` | Example logic: config from form, Open chat (connect, connection_ready, getConversation, message handler, send), Leave chat, Connect/Send/Get channel/Get conversation/Disconnect, fetch fallbacks. |
| `README.md` | This file. |

---

## Troubleshooting

| Issue | What to check |
| ----- | -------------- |
| “Open chat failed: baseUrl, channelId, and secret are required” | Fill Base URL, Channel ID, and Secret. |
| “SDK not loaded” | Ensure the unpkg script loads (network tab). If using a local bundle, path and server must allow the script to run. |
| “Connection error” / “Custom channel not found” | Wrong Base URL, wrong Channel ID (use connection key), or channel not created. Check API and CORS. |
| 401 Unauthorized | Wrong Secret. |
| CORS errors | Configure the AWR Connect API to allow your page origin (e.g. `http://localhost:3000`). |
| Agent reply not showing in chat | Same Session ID as in the open chat; agent replying to that conversation in the inbox; `connection_ready` fired (check Log or error banner). |
| Get conversation returns empty | Use the same Session ID you used when sending; ensure you clicked Connect before Get conversation. |

For more SDK-level troubleshooting (e.g. `sessionId` colon, mediaUrl required, join timeout), see the **awr-client-js-sdk** [README](https://github.com/awr-connect/awr-connect-client-js-sdk) and [TESTING.md](https://github.com/awr-connect/awr-connect-client-js-sdk/blob/main/TESTING.md).
