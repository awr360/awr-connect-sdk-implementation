/**
 * AWR Connect SDK â€“ Example implementation (browser).
 * Uses AwrConnectClient from the SDK when available (e.g. from UMD bundle),
 * otherwise falls back to fetch() to demonstrate the same REST calls.
 */

(function () {
  "use strict";

  // Resolve SDK constructor from known UMD global shapes across package versions/builds.
  function resolveAwrConnectClient() {
    if (typeof window === "undefined") return undefined;
    // adventist-inbox-sdk 0.5.0+ (IIFE global "AdventistInbox").
    if (window.AdventistInbox && window.AdventistInbox.AdventistInboxClient) {
      return window.AdventistInbox.AdventistInboxClient;
    }
    // Older awr-client-js-sdk builds.
    if (window.AwrConnectClient) return window.AwrConnectClient;
    if (window.awrClientJsSdk && window.awrClientJsSdk.AwrConnectClient) return window.awrClientJsSdk.AwrConnectClient;
    if (
      window.awrClientJsSdk &&
      window.awrClientJsSdk.default &&
      window.awrClientJsSdk.default.AwrConnectClient
    ) {
      return window.awrClientJsSdk.default.AwrConnectClient;
    }
    return undefined;
  }
  var AwrConnectClient = resolveAwrConnectClient();

  const baseUrlEl = document.getElementById("baseUrl");
  const channelIdEl = document.getElementById("channelId");
  const secretEl = document.getElementById("secret");
  const sessionIdEl = document.getElementById("sessionId");
  const visitorNameEl = document.getElementById("visitorName");
  const messageTextEl = document.getElementById("messageText");
  const logEl = document.getElementById("log-output");
  const btnConnect = document.getElementById("btn-connect");
  const btnSend = document.getElementById("btn-send");
  const btnChannel = document.getElementById("btn-channel");
  const btnConversation = document.getElementById("btn-conversation");
  const btnDisconnect = document.getElementById("btn-disconnect");
  const btnClearLog = document.getElementById("btn-clear-log");
  const btnOpenChat = document.getElementById("btn-open-chat");
  const credentialsWrap = document.getElementById("credentials-wrap");
  const chatPanel = document.getElementById("chat-panel");
  const chatHeaderInfo = document.getElementById("chat-header-info");
  const chatErrorBanner = document.getElementById("chat-error-banner");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatFileInput = document.getElementById("chat-file-input");
  const btnChatAttach = document.getElementById("btn-chat-attach");
  const btnChatSend = document.getElementById("btn-chat-send");
  const btnLeaveChat = document.getElementById("btn-leave-chat");
  const contactCountryEl = document.getElementById("contactCountry");
  const contactLanguageEl = document.getElementById("contactLanguage");
  const contactAttributesEl = document.getElementById("contactAttributes");
  const btnUpdateContact = document.getElementById("btn-update-contact");

  let client = null;
  let useSdk = false;
  /** Chat mode: client instance and sessionId/visitorName when in chat view */
  let chatClient = null;
  let chatSessionId = "";
  let chatVisitorName = "";
  let chatMessageHandler = null;

  /** SDK 0.5.0+ only accepts UUID session ids (guessable ids are rejected). */
  function newSessionId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
      return (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
    });
  }

  function ensureSlash(url) {
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }

  function log(msg, isError = false) {
    const line = "[" + new Date().toISOString() + "] " + msg + "\n";
    logEl.textContent += line;
    logEl.scrollTop = logEl.scrollHeight;
    if (isError) logEl.classList.add("has-error");
  }

  function getConfig() {
    const baseUrl = (baseUrlEl && baseUrlEl.value && baseUrlEl.value.trim()) || "";
    const channelId = (channelIdEl && channelIdEl.value && channelIdEl.value.trim()) || "";
    const secret = (secretEl && secretEl.value && secretEl.value.trim()) || "";
    const sessionId = (sessionIdEl && sessionIdEl.value && sessionIdEl.value.trim()) || newSessionId();
    const visitorName = (visitorNameEl && visitorNameEl.value && visitorNameEl.value.trim()) || "Demo Visitor";
    return { baseUrl, channelId, secret, sessionId, visitorName };
  }

  /**
   * Contact details from the "Contact details" form, as a ContactProfile:
   * { country?, language?, attributes? }. Returns undefined when every field is empty.
   * Throws when the attributes box is not a JSON object.
   */
  function getContactProfile() {
    const country = (contactCountryEl && contactCountryEl.value.trim()) || "";
    const language = (contactLanguageEl && contactLanguageEl.value.trim()) || "";
    const rawAttributes = (contactAttributesEl && contactAttributesEl.value.trim()) || "";
    const profile = {};
    if (country) profile.country = country;
    if (language) profile.language = language;
    if (rawAttributes) {
      let attributes;
      try {
        attributes = JSON.parse(rawAttributes);
      } catch (e) {
        throw new Error("Attributes must be valid JSON: " + e.message);
      }
      if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
        throw new Error('Attributes must be a JSON object, e.g. {"platform": "web"}');
      }
      profile.attributes = attributes;
    }
    return Object.keys(profile).length > 0 ? profile : undefined;
  }

  function setConnected(connected) {
    if (btnConnect) btnConnect.disabled = connected;
    if (btnSend) btnSend.disabled = !connected;
    if (btnChannel) btnChannel.disabled = !connected;
    if (btnConversation) btnConversation.disabled = !connected;
    if (btnDisconnect) btnDisconnect.disabled = !connected;
  }

  function showChatError(msg) {
    if (chatErrorBanner) {
      chatErrorBanner.textContent = msg;
      chatErrorBanner.hidden = false;
    }
  }

  function hideChatError() {
    if (chatErrorBanner) {
      chatErrorBanner.textContent = "";
      chatErrorBanner.hidden = true;
    }
  }

  /** Infer SDK mediaType from file MIME type */
  function mediaTypeFromFile(file) {
    var type = (file.type || "").toLowerCase();
    if (type.indexOf("image/") === 0) return "image";
    if (type.indexOf("audio/") === 0) return "audio";
    return "document";
  }

  /** Render a single SimplifiedMessage into a DOM element (text + optional media: image, audio, document) */
  function renderMessage(msg) {
    const div = document.createElement("div");
    div.className = "chat-msg chat-msg--" + (msg.senderType === "CONTACT" ? "contact" : "agent");
    const sender = document.createElement("span");
    sender.className = "chat-msg-sender";
    sender.textContent = msg.senderType === "CONTACT" ? "You" : "Agent";
    div.appendChild(sender);
    if (msg.textMessage) {
      const text = document.createElement("div");
      text.className = "chat-msg-text";
      text.textContent = msg.textMessage;
      div.appendChild(text);
    }
    if (msg.messageType === "media" && msg.mediaUrl) {
      const media = document.createElement("div");
      media.className = "chat-msg-media";
      var mt = (msg.mediaType || "").toLowerCase();
      if (mt === "image") {
        var img = document.createElement("img");
        img.src = msg.mediaUrl;
        img.alt = msg.textMessage || "Image";
        img.className = "chat-msg-media-img";
        img.loading = "lazy";
        img.onerror = function () {
          var fallback = document.createElement("a");
          fallback.href = msg.mediaUrl;
          fallback.target = "_blank";
          fallback.rel = "noopener noreferrer";
          fallback.textContent = "Open image";
          media.appendChild(fallback);
        };
        media.appendChild(img);
      } else if (mt === "audio") {
        var audio = document.createElement("audio");
        audio.controls = true;
        audio.src = msg.mediaUrl;
        audio.className = "chat-msg-media-audio";
        media.appendChild(audio);
      } else {
        if (mt) {
          var label = document.createElement("span");
          label.className = "chat-msg-media-type";
          label.textContent = mt + ": ";
          media.appendChild(label);
        }
        var link = document.createElement("a");
        link.href = msg.mediaUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.download = "";
        link.textContent = msg.textMessage || "Download";
        media.appendChild(link);
      }
      div.appendChild(media);
    }
    if (msg.createdAt) {
      const time = document.createElement("span");
      time.className = "chat-msg-time";
      time.textContent = new Date(msg.createdAt).toLocaleTimeString();
      div.appendChild(time);
    }
    return div;
  }

  function appendMessage(msg) {
    if (chatMessages) chatMessages.appendChild(renderMessage(msg));
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function openChat() {
    const { baseUrl, channelId, secret, sessionId, visitorName } = getConfig();
    if (!baseUrl || !channelId || !secret) {
      log("Open chat failed: baseUrl, channelId, and secret are required.", true);
      return;
    }
    if (typeof AwrConnectClient === "undefined") {
      log("Open chat failed: SDK not loaded. Load from unpkg or build the SDK.", true);
      return;
    }
    let contact;
    try {
      contact = getContactProfile();
    } catch (e) {
      log("Open chat failed: " + e.message, true);
      return;
    }
    hideChatError();
    chatSessionId = sessionId;
    chatVisitorName = visitorName;
    try {
      // config.contact rides on every message; later changes go through updateContact().
      chatClient = new AwrConnectClient({
        baseUrl,
        channelId,
        secret,
        sessionId: chatSessionId,
        visitorName: chatVisitorName,
        contact,
      });
      chatClient.on("connection_ready", function onReady() {
        hideChatError();
        if (chatHeaderInfo) chatHeaderInfo.textContent = chatSessionId + " Â· " + chatVisitorName;
        chatClient.getConversation(chatSessionId, { page: 1, limit: 50 }).then(function (res) {
          if (chatMessages) chatMessages.innerHTML = "";
          (res.messages || []).forEach(appendMessage);
          if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }).catch(function (err) {
          showChatError("Could not load conversation: " + err.message);
        });
        chatMessageHandler = function (msg) {
          appendMessage(msg);
        };
        chatClient.on("message", chatMessageHandler);
      });
      chatClient.on("connection_error", function (err) {
        showChatError("Connection error: " + err.message + ". Check Base URL and that the API allows your origin (ORIGIN_URL).");
      });
      chatClient.on("error", function (err) {
        var hint = err.message && (err.message.indexOf("websocket") !== -1 || err.message.indexOf("fetch") !== -1)
          ? " Check Base URL and API CORS (ORIGIN_URL)."
          : "";
        showChatError(err.message + hint);
      });
      chatClient.connect();
      if (credentialsWrap) credentialsWrap.hidden = true;
      if (chatPanel) chatPanel.hidden = false;
      if (chatMessages) chatMessages.innerHTML = "";
      if (chatInput) chatInput.value = "";
      log("Opened chat (session: " + chatSessionId + ").");
    } catch (e) {
      chatClient = null;
      showChatError("Open chat failed: " + e.message);
      log("Open chat error: " + e.message, true);
    }
  }

  async function onChatSend() {
    const text = (chatInput && chatInput.value && chatInput.value.trim()) || "";
    if (!text || !chatClient) return;
    if (!chatClient.sendMessage) {
      showChatError("SDK sendMessage not available.");
      return;
    }
    hideChatError();
    const opts = { sessionId: chatSessionId, visitorName: chatVisitorName };
    try {
      const result = await chatClient.sendMessage(text, opts);
      if (result.success) {
        appendMessage({
          _id: "local-" + Date.now(),
          senderType: "CONTACT",
          messageType: "TEXT",
          textMessage: text,
          createdAt: new Date().toISOString(),
        });
        if (chatInput) chatInput.value = "";
      } else {
        showChatError("Send failed: " + (result.message || "unknown"));
      }
    } catch (e) {
      showChatError("Send error: " + e.message);
    }
  }

  async function onChatAttach(file) {
    if (!file || !chatClient) return;
    if (!chatClient.uploadMedia || !chatClient.sendMessage) {
      showChatError("SDK uploadMedia/sendMessage not available. Load awr-client-js-sdk@0.3.0 or later (see index.html script src).");
      return;
    }
    hideChatError();
    var mediaType = mediaTypeFromFile(file);
    var caption = (chatInput && chatInput.value && chatInput.value.trim()) || (file.name || "Attachment");
    try {
      var uploadRes = await chatClient.uploadMedia(file, {
        sessionId: chatSessionId,
        mediaType: mediaType,
        visitorName: chatVisitorName,
      });
      var result = await chatClient.sendMessage(caption, {
        sessionId: chatSessionId,
        visitorName: chatVisitorName,
        messageType: "media",
        mediaUrl: uploadRes.mediaUrl,
        mediaType: uploadRes.mediaType,
      });
      if (result.success) {
        appendMessage({
          _id: "local-" + Date.now(),
          senderType: "CONTACT",
          messageType: "media",
          textMessage: caption,
          mediaType: uploadRes.mediaType,
          mediaUrl: uploadRes.mediaUrl,
          createdAt: new Date().toISOString(),
        });
        if (chatInput) chatInput.value = "";
      } else {
        showChatError("Send media failed: " + (result.message || "unknown"));
      }
    } catch (e) {
      showChatError("Upload/send error: " + e.message);
    }
  }

  function leaveChat() {
    if (chatMessageHandler && chatClient && chatClient.off) {
      chatClient.off("message", chatMessageHandler);
    }
    if (chatClient && chatClient.disconnect) {
      chatClient.disconnect();
    }
    chatClient = null;
    chatMessageHandler = null;
    if (credentialsWrap) credentialsWrap.hidden = false;
    if (chatPanel) chatPanel.hidden = true;
    hideChatError();
    log("Left chat.");
  }

  /**
   * Update contact details without sending a message. Uses the chat client when the chat is
   * open, otherwise the Connect client (SDK or fetch). The contact must already exist: the
   * visitor's first message creates it.
   */
  async function onUpdateContact() {
    const { baseUrl, channelId, secret, sessionId } = getConfig();
    const inChat = !!chatClient;
    const report = function (msg, isError) {
      log(msg, isError);
      if (inChat && isError) showChatError(msg);
    };
    const activeClient = chatClient || client;
    if (!activeClient) {
      report("Update contact: open the chat or click Connect first.", true);
      return;
    }
    let profile;
    try {
      profile = getContactProfile();
    } catch (e) {
      report("Update contact failed: " + e.message, true);
      return;
    }
    if (!profile) {
      report("Update contact: fill in country, language or attributes first.", true);
      return;
    }
    const targetSessionId = inChat ? chatSessionId : sessionId;
    if (inChat) hideChatError();
    try {
      let result;
      if (inChat || (useSdk && client.updateContact)) {
        if (!activeClient.updateContact) {
          report("Update contact: SDK updateContact not available. Load adventist-inbox-sdk@0.6.0 or later.", true);
          return;
        }
        result = await activeClient.updateContact(Object.assign({ sessionId: targetSessionId }, profile));
      } else {
        result = await fetchUpdateContact(baseUrl, secret, targetSessionId, profile);
      }
      if (result.success) {
        let msg = "Update contact: saved for session " + targetSessionId + ".";
        if (result.droppedAttributes && result.droppedAttributes.length > 0) {
          msg += " Not saved (50-key limit): " + result.droppedAttributes.join(", ") + ".";
        }
        log(msg);
      } else {
        report("Update contact failed: " + (result.message || "unknown"), true);
      }
    } catch (e) {
      report("Update contact error: " + e.message, true);
    }
  }

  /** Fallback: same REST calls as the SDK (no SDK dependency). */
  async function fetchUpdateContact(baseUrl, secret, sessionId, profile) {
    const base = ensureSlash(baseUrl);
    const res = await fetch(base + "/webhook/custom/contact", {
      method: "POST",
      headers: {
        "X-AWR-Channel-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.assign({ sessionId }, profile)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: data.message || "HTTP " + res.status };
    const dropped = (data.data && data.data.droppedAttributes) || [];
    return dropped.length > 0 ? { success: true, message: data.message, droppedAttributes: dropped } : { success: true };
  }

  async function fetchSendMessage(baseUrl, channelId, secret, sessionId, visitorName, text, contact) {
    const base = ensureSlash(baseUrl);
    const url = base + "/webhook/custom";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-AWR-Channel-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          senderType: "CONTACT",
          messageType: "TEXT",
          textMessage: text,
          socialMessageId: null,
          // contact = { country?, language?, attributes? } sits flat in metadata.
          metadata: Object.assign(
            {
              sessionId,
              visitorName,
              customChannelId: channelId,
              senderType: "CONTACT",
              timestamp: new Date().toISOString(),
            },
            contact || {}
          ),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: data.message || "HTTP " + res.status };
    return { success: true };
  }

  async function fetchGetChannelInfo(baseUrl, channelId, secret) {
    const base = ensureSlash(baseUrl);
    const url = base + "/webhook/custom/channels/" + encodeURIComponent(channelId);
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-AWR-Channel-Secret": secret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
    return data.data != null ? data.data : data;
  }

  async function fetchGetConversation(baseUrl, channelId, secret, sessionId, page, limit) {
    const base = ensureSlash(baseUrl);
    const url =
      base +
      "/webhook/custom/channels/" +
      encodeURIComponent(channelId) +
      "/contact/" +
      encodeURIComponent(sessionId) +
      "?page=" +
      page +
      "&limit=" +
      limit;
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-AWR-Channel-Secret": secret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        return {
          messages: [],
          pagination: {
            currentPage: 1,
            limit,
            totalMessages: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
            nextPage: null,
            prevPage: null,
          },
        };
      }
      throw new Error(data.message || "HTTP " + res.status);
    }
    const payload = data.data != null ? data.data : data;
    return {
      messages: payload.messages || [],
      pagination:
        payload.pagination || {
          currentPage: 1,
          limit,
          totalMessages: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
    };
  }

  async function onConnect() {
    const { baseUrl, channelId, secret } = getConfig();
    if (!baseUrl || !channelId || !secret) {
      log("Connect failed: baseUrl, channelId, and secret are required.", true);
      return;
    }

    if (typeof AwrConnectClient !== "undefined") {
      try {
        client = new AwrConnectClient({ baseUrl, channelId, secret });
        client.on("connection_ready", () => log("SDK: connection_ready"));
        client.on("connection_error", (err) => log("SDK: connection_error " + err.message, true));
        client.on("error", (err) => log("SDK: error " + err.message, true));
        client.connect();
        useSdk = true;
        log("Connected via SDK.");
      } catch (e) {
        client = null;
        log("SDK connect error: " + e.message, true);
        return;
      }
    } else {
      client = { baseUrl, channelId, secret, connected: true };
      useSdk = false;
      log("Connected via fetch (SDK not loaded).");
    }
    setConnected(true);
  }

  async function onSend() {
    const { baseUrl, channelId, secret, sessionId, visitorName } = getConfig();
    const text = (messageTextEl && messageTextEl.value && messageTextEl.value.trim()) || "Hello!";
    if (!client) {
      log("Not connected.", true);
      return;
    }

    try {
      // The Connect client has no sessionId in its config, so contact details go per message.
      const contact = getContactProfile();
      let result;
      if (useSdk && client.sendMessage) {
        const opts = { sessionId, visitorName };
        if (contact) opts.contact = contact;
        result = await client.sendMessage(text, opts);
      } else {
        result = await fetchSendMessage(baseUrl, channelId, secret, sessionId, visitorName, text, contact);
      }
      if (result.success) {
        log("Send message: success.");
      } else {
        log("Send message failed: " + (result.message || "unknown"), true);
      }
    } catch (e) {
      log("Send error: " + e.message, true);
    }
  }

  async function onGetChannel() {
    const { baseUrl, channelId, secret } = getConfig();
    if (!client) {
      log("Not connected.", true);
      return;
    }

    try {
      let channel;
      if (useSdk && client.getChannelInfo) {
        channel = await client.getChannelInfo();
      } else {
        channel = await fetchGetChannelInfo(baseUrl, channelId, secret);
      }
      log("Channel info: " + JSON.stringify(channel, null, 2));
    } catch (e) {
      log("Get channel error: " + e.message, true);
    }
  }

  async function onGetConversation() {
    const { baseUrl, channelId, secret, sessionId } = getConfig();
    if (!client) {
      log("Not connected.", true);
      return;
    }

    try {
      let out;
      if (useSdk && client.getConversation) {
        out = await client.getConversation(sessionId, { page: 1, limit: 20 });
      } else {
        out = await fetchGetConversation(baseUrl, channelId, secret, sessionId, 1, 20);
      }
      log("Conversation: " + JSON.stringify({ messages: out.messages, pagination: out.pagination }, null, 2));
    } catch (e) {
      log("Get conversation error: " + e.message, true);
    }
  }

  function onDisconnect() {
    if (client && useSdk && client.disconnect) {
      client.disconnect();
    }
    client = null;
    useSdk = false;
    setConnected(false);
    log("Disconnected.");
  }

  function clearLog() {
    if (logEl) {
      logEl.textContent = "";
      logEl.classList.remove("has-error");
    }
  }

  if (btnConnect) btnConnect.addEventListener("click", onConnect);
  if (btnSend) btnSend.addEventListener("click", onSend);
  if (btnChannel) btnChannel.addEventListener("click", onGetChannel);
  if (btnConversation) btnConversation.addEventListener("click", onGetConversation);
  if (btnDisconnect) btnDisconnect.addEventListener("click", onDisconnect);
  if (btnClearLog) btnClearLog.addEventListener("click", clearLog);
  if (btnOpenChat) btnOpenChat.addEventListener("click", openChat);
  if (btnLeaveChat) btnLeaveChat.addEventListener("click", leaveChat);
  if (btnUpdateContact) btnUpdateContact.addEventListener("click", onUpdateContact);
  if (btnChatSend) btnChatSend.addEventListener("click", onChatSend);
  if (btnChatAttach && chatFileInput) {
    btnChatAttach.addEventListener("click", function () {
      chatFileInput.click();
    });
    chatFileInput.addEventListener("change", function () {
      var file = chatFileInput.files && chatFileInput.files[0];
      if (file) {
        onChatAttach(file);
        chatFileInput.value = "";
      }
    });
  }
  if (chatInput) {
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        onChatSend();
      }
    });
  }

  if (document.getElementById("config-form")) {
    document.getElementById("config-form").addEventListener("submit", function (e) {
      e.preventDefault();
      onConnect();
    });
  }

  // Pre-fill a stable session id so Send, Update contact and Open chat all target the same visitor.
  if (sessionIdEl && !sessionIdEl.value.trim()) sessionIdEl.value = newSessionId();

  log("AWR Connect SDK example loaded. Enter credentials and click Open chat or Connect.");
})();
