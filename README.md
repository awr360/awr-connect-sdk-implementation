# AWR Connect SDK – Documentation & Example Implementation

Static HTML/CSS/JavaScript site that documents the **AWR Connect Client JS SDK** (`awr-client-js-sdk`) and provides a **live, runnable example** so you can see how the SDK works in a real chat UI.

---

## Use case

**Who this is for**

- **Integrators** who want to add AWR Connect chat to their own site or app (e.g. help widget, support chat, custom UI).
- **Developers** who need to understand how to use the SDK (connect, send, receive, real-time) before wiring it into their stack.
- **QA / support** who need a simple way to test a Custom Channel end-to-end (visitor sends, agent replies, messages appear in real time).

**What problem it solves**

AWR Connect supports a **Custom Channel**: you use your own UI and connect with a **Channel ID** and **secret** (like an API key). This project:

1. **Documents** the SDK: config, methods, events, types, and authentication.
2. **Demonstrates** the SDK in a real chat: you enter credentials, open a chat, send messages, and receive agent replies in real time (Socket.IO).
3. **Removes guesswork**: no build step for the demo—the SDK is loaded from **unpkg** (`awr-client-js-sdk@0.1.2`); you only need a running AWR Connect API and a Custom Channel.

**When to use this project**

- You are building or evaluating an integration with AWR Connect via the **Custom Channel**.
- You want a **reference implementation** for “visitor chat” (session + send + receive).
- You need to **test** that your API, Channel ID, secret, and CORS are set up correctly before integrating the SDK into your app.

---

## What you get

- **Documentation**: Overview, installation, quick start, full API reference, types, events, and authentication (all in `index.html`).
- **Live example**: A form where you enter your Custom Channel credentials and try the SDK.
- **Custom Chat demo**: Enter your **Channel ID** (id) and **secret**, click **Open chat**, and use a real-time chat UI:
  - Message list (history on load + incoming agent messages via Socket.IO).
  - Send input and **Send** button.
  - **Leave chat** to disconnect and return to the form.

No local SDK build is required—the SDK is loaded from **unpkg**.

---

## How to run

1. **Open the page**

   - Open `index.html` in a browser (file protocol), or
   - Serve the folder with a static server (e.g. `npx serve .`, `python3 -m http.server 3000`).

2. **Use the Custom Chat demo**

   - Fill in **Base URL** (your AWR Connect API, e.g. `http://localhost:8081`), **Channel ID**, and **Secret** from your Custom Channel.
   - Optionally set **Session ID** and **Visitor name** (defaults are used if left empty).
   - Click **Open chat** to connect and open the chat view. Send messages; agent replies appear in real time. Click **Leave chat** to disconnect.

3. **Use the API buttons** (Connect, Send message, Get channel info, Get conversation, Disconnect)

   - Same credentials; use these to try individual SDK operations. The **Log** area shows requests and responses.

4. **SDK loading**
   - The page loads the SDK from **unpkg** (`awr-client-js-sdk@0.1.2`), so no local build is required. To use a local build instead, replace the unpkg script in `index.html` with:
     ```html
     <script src="../awr-connect-client-js-sdk/dist/index.umd.js"></script>
     ```
   - Use a local server when loading scripts. Without the SDK, the API buttons fall back to `fetch()`; the Custom Chat demo requires the SDK.

---

## Files

| File         | Purpose                                                               |
| ------------ | --------------------------------------------------------------------- |
| `index.html` | Documentation and live example UI (form + Custom Chat panel)          |
| `styles.css` | Layout and styling for the doc and chat                               |
| `app.js`     | Example logic: connect, open chat, send, receive, leave; SDK or fetch |
| `README.md`  | This file                                                             |

---

## SDK package

Use the npm package **awr-client-js-sdk**. To use it in your own app:

```bash
pnpm add awr-client-js-sdk
```

See the package page and repository docs for full usage and testing:

- npm: `https://www.npmjs.com/package/awr-client-js-sdk`
- repository: `https://github.com/awr-connect/awr-connect-client-js-sdk`
