/**
 * Adventist Inbox SDK - example implementation (browser).
 *
 * Uses adventist-inbox-sdk (global `AdventistInbox`) when it is loaded. Without it, the
 * Connect / Send / Get channel / Get message window / Update contact buttons make the same
 * REST calls with fetch(); Open chat needs the SDK for real-time events.
 *
 * Local testing only: this page holds the channel secret in the browser. In production keep
 * the secret on your server (see the Security section of the page).
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // SDK resolution
  // ---------------------------------------------------------------------------

  /** The SDK namespace from the UMD bundle (global "AdventistInbox", adventist-inbox-sdk 0.6.0+). */
  function resolveSdk() {
    var ns = typeof window !== "undefined" ? window.AdventistInbox : null;
    if (!ns || !ns.AdventistInboxClient) return null;
    return {
      Client: ns.AdventistInboxClient,
      getMessageDisplayUrl: ns.getMessageDisplayUrl,
      getMessageFullUrl: ns.getMessageFullUrl,
      resolveDurableMediaUrl: ns.resolveDurableMediaUrl,
      toSimplifiedMessage: ns.toSimplifiedMessage,
    };
  }

  var sdk = resolveSdk();

  /** Media URL helpers. Fallbacks follow the SDK's rule: only https: and blob: are safe. */
  function isSafeUrl(url) {
    return typeof url === "string" && /^(https:|blob:)/i.test(url);
  }
  function displayUrl(msg) {
    if (sdk && sdk.getMessageDisplayUrl) return sdk.getMessageDisplayUrl(msg);
    if (isSafeUrl(msg.thumbnail)) return msg.thumbnail;
    return isSafeUrl(msg.mediaUrl) ? msg.mediaUrl : "";
  }
  function fullUrl(msg) {
    if (sdk && sdk.getMessageFullUrl) return sdk.getMessageFullUrl(msg);
    return isSafeUrl(msg.mediaUrl) ? msg.mediaUrl : "";
  }
  function durableUrl(incoming, existing) {
    if (sdk && sdk.resolveDurableMediaUrl) return sdk.resolveDurableMediaUrl(incoming, existing);
    return isSafeUrl(incoming) ? incoming : existing;
  }
  /** getMessageWindow returns raw API rows; normalize them like socket messages (also scrubs URLs). */
  function normalize(raw) {
    if (sdk && sdk.toSimplifiedMessage) return sdk.toSimplifiedMessage(raw);
    return raw;
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  var baseUrlEl = $("baseUrl");
  var channelIdEl = $("channelId");
  var secretEl = $("secret");
  var sessionIdEl = $("sessionId");
  var visitorNameEl = $("visitorName");
  var messageTextEl = $("messageText");
  var logEl = $("log-output");
  var btnConnect = $("btn-connect");
  var btnSend = $("btn-send");
  var btnChannel = $("btn-channel");
  var btnWindow = $("btn-window");
  var btnDisconnect = $("btn-disconnect");
  var btnClearLog = $("btn-clear-log");
  var btnOpenChat = $("btn-open-chat");
  var credentialsWrap = $("credentials-wrap");
  var chatPanel = $("chat-panel");
  var chatHeaderInfo = $("chat-header-info");
  var chatErrorBanner = $("chat-error-banner");
  var chatStatusLine = $("chat-status");
  var btnLoadOlder = $("btn-load-older");
  var chatMessages = $("chat-messages");
  var chatInput = $("chat-input");
  var chatFileInput = $("chat-file-input");
  var btnChatAttach = $("btn-chat-attach");
  var btnChatSend = $("btn-chat-send");
  var btnLeaveChat = $("btn-leave-chat");
  var contactCountryEl = $("contactCountry");
  var contactLanguageEl = $("contactLanguage");
  var contactAttributesEl = $("contactAttributes");
  var btnUpdateContact = $("btn-update-contact");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Connect-panel client: REST-only SDK client, or { fetch: true } without the SDK. */
  var client = null;
  var useSdk = false;

  /** Chat client (real-time) and its state. */
  var chatClient = null;
  var chatSessionId = "";
  var chatVisitorName = "";
  var chatListeners = [];
  /** key (socialMessageId or _id) -> { el, msg } */
  var bubbles = new Map();
  var oldestSeq = null;
  var hasOlder = false;
  /** Agent socialMessageIds already reported as read. */
  var markedRead = new Set();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** SDK 0.5.0+ only accepts UUID session ids (guessable ids are rejected). */
  function newSessionId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
      return (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
    });
  }

  function trimSlash(url) {
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }

  function log(msg, isError) {
    logEl.textContent += "[" + new Date().toISOString() + "] " + msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
    if (isError) logEl.classList.add("has-error");
  }

  function value(el) {
    return (el && el.value && el.value.trim()) || "";
  }

  function getConfig() {
    return {
      baseUrl: value(baseUrlEl),
      channelId: value(channelIdEl),
      secret: value(secretEl),
      sessionId: value(sessionIdEl) || newSessionId(),
      visitorName: value(visitorNameEl) || "Demo Visitor",
    };
  }

  /**
   * Contact details from the form as a ContactProfile { country?, language?, attributes? }.
   * Returns undefined when every field is empty; throws when attributes is not a JSON object.
   */
  function getContactProfile() {
    var profile = {};
    var country = value(contactCountryEl);
    var language = value(contactLanguageEl);
    var rawAttributes = value(contactAttributesEl);
    if (country) profile.country = country;
    if (language) profile.language = language;
    if (rawAttributes) {
      var attributes;
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
    btnConnect.disabled = connected;
    btnSend.disabled = !connected;
    btnChannel.disabled = !connected;
    btnWindow.disabled = !connected;
    btnDisconnect.disabled = !connected;
  }

  var CORS_HINT = " Check the Base URL, and that this page's origin is in the Custom Channel's allowedOrigins.";

  function showChatError(msg) {
    chatErrorBanner.textContent = msg;
    chatErrorBanner.hidden = false;
  }
  function hideChatError() {
    chatErrorBanner.textContent = "";
    chatErrorBanner.hidden = true;
  }
  function setChatStatus(msg) {
    chatStatusLine.textContent = msg || "";
    chatStatusLine.hidden = !msg;
  }

  /** uploadMedia supports image, audio and document. */
  function uploadTypeFromFile(file) {
    var type = (file.type || "").toLowerCase();
    if (type.indexOf("image/") === 0) return "image";
    if (type.indexOf("audio/") === 0) return "audio";
    if (type.indexOf("video/") === 0) return null;
    return "document";
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  var STATUS_LABELS = { sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed" };

  function messageKey(msg) {
    return msg.socialMessageId || msg._id || "";
  }

  function link(href, text) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    return a;
  }

  function renderMedia(msg) {
    var media = document.createElement("div");
    media.className = "chat-msg-media";
    var type = (msg.mediaType || "").toLowerCase();
    var full = fullUrl(msg);
    var preview = displayUrl(msg);
    if (!full && !preview) {
      // Not finalized yet (message_media_ready will patch it) or an unsafe URL that was scrubbed.
      media.classList.add("chat-msg-media--pending");
      media.textContent = "Media is processing…";
      return media;
    }
    if (type === "image") {
      var img = document.createElement("img");
      img.src = preview || full;
      img.alt = msg.textMessage || "Image";
      img.className = "chat-msg-media-img";
      img.loading = "lazy";
      if (full) {
        var wrap = link(full, "");
        wrap.appendChild(img);
        media.appendChild(wrap);
      } else {
        media.appendChild(img);
      }
    } else if (type === "audio" && full) {
      var audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = full;
      audio.className = "chat-msg-media-audio";
      media.appendChild(audio);
    } else if (type === "video" && full) {
      var video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.src = full;
      if (isSafeUrl(msg.thumbnail)) video.poster = msg.thumbnail;
      video.className = "chat-msg-media-video";
      media.appendChild(video);
    } else {
      if (type) {
        var label = document.createElement("span");
        label.className = "chat-msg-media-type";
        label.textContent = type + ": ";
        media.appendChild(label);
      }
      media.appendChild(link(full || preview, msg.textMessage || "Download"));
    }
    return media;
  }

  function renderMessage(msg) {
    var mine = msg.senderType === "CONTACT";
    var div = document.createElement("div");
    div.className = "chat-msg chat-msg--" + (mine ? "contact" : "agent");

    var sender = document.createElement("span");
    sender.className = "chat-msg-sender";
    sender.textContent = mine ? "You" : "Agent";
    div.appendChild(sender);

    var isMedia = String(msg.messageType || "").toLowerCase() === "media";
    if (msg.textMessage && !(isMedia && (msg.mediaType || "").toLowerCase() === "document")) {
      var text = document.createElement("div");
      text.className = "chat-msg-text";
      text.textContent = msg.textMessage;
      div.appendChild(text);
    }
    if (isMedia) div.appendChild(renderMedia(msg));

    // Agent buttons are shown for reference; this demo does not send button replies.
    if (msg.buttons && msg.buttons.length > 0) {
      var row = document.createElement("div");
      row.className = "chat-msg-buttons";
      msg.buttons.forEach(function (b) {
        var chip = document.createElement("span");
        chip.className = "chat-msg-button";
        chip.textContent = b.title;
        row.appendChild(chip);
      });
      div.appendChild(row);
    }

    var meta = document.createElement("span");
    meta.className = "chat-msg-time";
    meta.textContent = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : "";
    if (mine) {
      var status = msg.deliveryStatus || statusFromMessage(msg);
      if (status) meta.textContent += (meta.textContent ? " · " : "") + STATUS_LABELS[status];
      if (status === "failed") div.classList.add("chat-msg--failed");
    }
    if (meta.textContent) div.appendChild(meta);
    return div;
  }

  function statusFromMessage(msg) {
    if (chatClient && chatClient.getMessageStatus && msg.socialMessageId) {
      var cached = chatClient.getMessageStatus(chatSessionId, msg.socialMessageId);
      if (cached) return cached;
    }
    var s = String(msg.status || "").toLowerCase();
    if (s === "received") return "sent";
    return STATUS_LABELS[s] ? s : "";
  }

  /**
   * Insert or replace a bubble. Keyed by socialMessageId (or _id) so the echo of a message we
   * sent, a media-ready patch, or a replayed message after reconnect updates the same bubble.
   * Ordered by seq when the message has one.
   */
  function upsertMessage(msg) {
    var key = messageKey(msg);
    var existing = key ? bubbles.get(key) : null;
    if (existing) {
      var merged = Object.assign({}, existing.msg, msg);
      merged.mediaUrl = durableUrl(msg.mediaUrl, existing.msg.mediaUrl);
      if (!msg.textMessage) merged.textMessage = existing.msg.textMessage;
      var el = renderMessage(merged);
      existing.el.replaceWith(el);
      bubbles.set(key, { el: el, msg: merged });
      return;
    }
    var node = renderMessage(msg);
    var before = null;
    if (typeof msg.seq === "number") {
      bubbles.forEach(function (b) {
        if (typeof b.msg.seq === "number" && b.msg.seq > msg.seq) {
          if (!before || b.msg.seq < before.msg.seq) before = b;
        }
      });
    }
    if (before) chatMessages.insertBefore(node, before.el);
    else chatMessages.appendChild(node);
    if (key) bubbles.set(key, { el: node, msg: msg });
    if (!before) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setDeliveryStatus(socialMessageId, status) {
    var entry = bubbles.get(socialMessageId);
    if (!entry || entry.msg.senderType !== "CONTACT") return;
    var msg = Object.assign({}, entry.msg, { deliveryStatus: status });
    var el = renderMessage(msg);
    entry.el.replaceWith(el);
    bubbles.set(socialMessageId, { el: el, msg: msg });
  }

  /** Report agent messages as read so the inbox shows read ticks. */
  function markAgentMessagesRead(messages) {
    if (!chatClient || !chatClient.markMessagesRead) return;
    var ids = messages
      .filter(function (m) {
        return m.senderType !== "CONTACT" && m.socialMessageId && !markedRead.has(m.socialMessageId);
      })
      .map(function (m) {
        return m.socialMessageId;
      });
    if (ids.length === 0) return;
    ids.forEach(function (id) {
      markedRead.add(id);
    });
    chatClient.markMessagesRead(chatSessionId, ids, chatVisitorName).then(function (res) {
      if (res.failed && res.failed.length > 0) {
        res.failed.forEach(function (id) {
          markedRead.delete(id);
        });
        log("markMessagesRead: " + res.failed.length + " failed.", true);
      }
    }).catch(function (e) {
      ids.forEach(function (id) {
        markedRead.delete(id);
      });
      log("markMessagesRead error: " + e.message, true);
    });
  }

  // ---------------------------------------------------------------------------
  // Chat (real-time)
  // ---------------------------------------------------------------------------

  function listen(name, fn) {
    chatClient.on(name, fn);
    chatListeners.push([name, fn]);
  }

  function isNotFound(err) {
    return /404|not found/i.test((err && err.message) || "");
  }

  /** Load a window of history: "present" on open, "older" with beforeSeq for paging. */
  async function loadWindow(intent) {
    var options = { intent: intent, limit: 50 };
    if (intent === "older") options.beforeSeq = oldestSeq;
    try {
      var res = await chatClient.getMessageWindow(chatSessionId, options);
      var messages = res.messages.map(normalize);
      messages.forEach(upsertMessage);
      if (res.oldestSeq != null) oldestSeq = res.oldestSeq;
      hasOlder = res.hasOlder && oldestSeq != null;
      btnLoadOlder.hidden = !hasOlder;
      markAgentMessagesRead(messages);
      log("getMessageWindow(" + intent + "): " + messages.length + " messages" + (hasOlder ? ", more available." : "."));
    } catch (e) {
      if (intent === "present" && isNotFound(e)) {
        // A new visitor has no conversation yet; the first message creates it.
        log("getMessageWindow: no conversation yet for this session.");
        btnLoadOlder.hidden = true;
        return;
      }
      showChatError("Could not load messages: " + e.message);
    }
  }

  function openChat() {
    var cfg = getConfig();
    if (!cfg.baseUrl || !cfg.channelId || !cfg.secret) {
      log("Open chat failed: Base URL, Channel ID and Secret are required.", true);
      return;
    }
    if (!sdk) {
      log("Open chat failed: SDK not loaded (see SDK loading in the README).", true);
      return;
    }
    var contact;
    try {
      contact = getContactProfile();
    } catch (e) {
      log("Open chat failed: " + e.message, true);
      return;
    }
    hideChatError();
    setChatStatus("Connecting…");
    chatSessionId = cfg.sessionId;
    chatVisitorName = cfg.visitorName;
    sessionIdEl.value = chatSessionId;
    bubbles = new Map();
    markedRead = new Set();
    oldestSeq = null;
    hasOlder = false;
    chatMessages.innerHTML = "";
    btnLoadOlder.hidden = true;

    try {
      // config.contact rides on every message; later changes go through updateContact().
      chatClient = new sdk.Client({
        baseUrl: cfg.baseUrl,
        channelId: cfg.channelId,
        secret: cfg.secret,
        sessionId: chatSessionId,
        visitorName: chatVisitorName,
        contact: contact,
      });
      chatListeners = [];

      // Register every listener before connect().
      listen("connection_ready", function () {
        hideChatError();
        setChatStatus("");
        chatHeaderInfo.textContent = chatSessionId + " · " + chatVisitorName;
        loadWindow("present");
      });
      listen("message", function (msg) {
        upsertMessage(msg);
        markAgentMessagesRead([msg]);
      });
      listen("message_media_ready", function (msg) {
        upsertMessage(msg);
      });
      listen("message_status", function (payload) {
        setDeliveryStatus(payload.socialMessageId, payload.status);
      });
      listen("reconnecting", function () {
        setChatStatus("Reconnecting…");
      });
      listen("reconnected", function () {
        // The SDK replays messages missed while offline as `message` events.
        setChatStatus("");
        log("Reconnected.");
      });
      listen("connection_error", function (err) {
        setChatStatus("");
        showChatError("Connection error: " + err.message + "." + CORS_HINT);
      });
      listen("error", function (err) {
        log("SDK error: " + err.message, true);
      });

      chatClient.connect();
      credentialsWrap.hidden = true;
      chatPanel.hidden = false;
      chatInput.value = "";
      log("Opened chat (session " + chatSessionId + ").");
    } catch (e) {
      chatClient = null;
      setChatStatus("");
      log("Open chat failed: " + e.message, true);
    }
  }

  async function onChatSend() {
    var text = value(chatInput);
    if (!text || !chatClient) return;
    hideChatError();
    try {
      var result = await chatClient.sendMessage(text, { sessionId: chatSessionId, visitorName: chatVisitorName });
      if (!result.success) {
        showChatError("Send failed: " + (result.message || "unknown error"));
        return;
      }
      upsertMessage({
        _id: result.socialMessageId,
        socialMessageId: result.socialMessageId,
        senderType: "CONTACT",
        messageType: "text",
        textMessage: text,
        createdAt: new Date().toISOString(),
        deliveryStatus: "sent",
      });
      chatInput.value = "";
    } catch (e) {
      showChatError("Send error: " + e.message);
    }
  }

  async function onChatAttach(file) {
    if (!file || !chatClient) return;
    var mediaType = uploadTypeFromFile(file);
    if (!mediaType) {
      showChatError("uploadMedia supports images, audio and documents; video uploads are not supported.");
      return;
    }
    hideChatError();
    var caption = value(chatInput) || file.name || "Attachment";
    try {
      var upload = await chatClient.uploadMedia(file, {
        sessionId: chatSessionId,
        mediaType: mediaType,
        visitorName: chatVisitorName,
        onProgress: function (percent) {
          setChatStatus("Uploading " + file.name + ": " + Math.round(percent) + "%");
        },
      });
      setChatStatus("");
      var result = await chatClient.sendMessage(caption, {
        sessionId: chatSessionId,
        visitorName: chatVisitorName,
        messageType: "media",
        mediaUrl: upload.mediaUrl,
        mediaType: upload.mediaType,
      });
      if (!result.success) {
        showChatError("Send media failed: " + (result.message || "unknown error"));
        return;
      }
      upsertMessage({
        _id: result.socialMessageId,
        socialMessageId: result.socialMessageId,
        senderType: "CONTACT",
        messageType: "media",
        textMessage: caption,
        mediaType: upload.mediaType,
        mediaUrl: upload.mediaUrl,
        thumbnail: upload.thumbnail,
        createdAt: new Date().toISOString(),
        deliveryStatus: "sent",
      });
      chatInput.value = "";
    } catch (e) {
      setChatStatus("");
      showChatError("Upload/send error: " + e.message);
    }
  }

  function leaveChat() {
    if (chatClient) {
      chatListeners.forEach(function (pair) {
        chatClient.off(pair[0], pair[1]);
      });
      chatClient.disconnect();
    }
    chatClient = null;
    chatListeners = [];
    credentialsWrap.hidden = false;
    chatPanel.hidden = true;
    hideChatError();
    setChatStatus("");
    log("Left chat.");
  }

  // ---------------------------------------------------------------------------
  // fetch() fallbacks: the same REST calls the SDK makes
  // ---------------------------------------------------------------------------

  function authHeaders(secret, json) {
    var headers = { "X-AWR-Channel-Secret": secret };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function readJson(res) {
    return res.json().catch(function () {
      return {};
    });
  }

  async function fetchSendMessage(cfg, text, contact) {
    var socialMessageId = newSessionId();
    var res = await fetch(trimSlash(cfg.baseUrl) + "/webhook/custom", {
      method: "POST",
      headers: authHeaders(cfg.secret, true),
      body: JSON.stringify({
        message: {
          senderType: "CONTACT",
          messageType: "TEXT",
          textMessage: text,
          socialMessageId: socialMessageId,
          // contact = { country?, language?, attributes? } sits flat in metadata.
          metadata: Object.assign(
            {
              sessionId: cfg.sessionId,
              visitorName: cfg.visitorName,
              customChannelId: cfg.channelId,
              senderType: "CONTACT",
              timestamp: new Date().toISOString(),
            },
            contact || {}
          ),
        },
      }),
    });
    var data = await readJson(res);
    if (!res.ok) return { success: false, message: data.message || "HTTP " + res.status, socialMessageId: socialMessageId };
    return { success: true, socialMessageId: socialMessageId };
  }

  async function fetchGetChannelInfo(cfg) {
    var res = await fetch(trimSlash(cfg.baseUrl) + "/webhook/custom/channels/" + encodeURIComponent(cfg.channelId), {
      headers: authHeaders(cfg.secret),
    });
    var data = await readJson(res);
    if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
    return data.data != null ? data.data : data;
  }

  async function fetchGetMessageWindow(cfg, limit) {
    var url =
      trimSlash(cfg.baseUrl) +
      "/webhook/custom/channels/" +
      encodeURIComponent(cfg.channelId) +
      "/contact/" +
      encodeURIComponent(cfg.sessionId) +
      "/messages/window?intent=present&limit=" +
      limit;
    var res = await fetch(url, { headers: authHeaders(cfg.secret) });
    var data = await readJson(res);
    if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
    return data.data != null ? data.data : data;
  }

  async function fetchUpdateContact(cfg, sessionId, profile) {
    var res = await fetch(trimSlash(cfg.baseUrl) + "/webhook/custom/contact", {
      method: "POST",
      headers: authHeaders(cfg.secret, true),
      body: JSON.stringify(Object.assign({ sessionId: sessionId }, profile)),
    });
    var data = await readJson(res);
    if (!res.ok) return { success: false, message: data.message || "HTTP " + res.status };
    var dropped = (data.data && data.data.droppedAttributes) || [];
    return dropped.length > 0 ? { success: true, message: data.message, droppedAttributes: dropped } : { success: true };
  }

  // ---------------------------------------------------------------------------
  // Connect panel (REST-only)
  // ---------------------------------------------------------------------------

  function onConnect() {
    var cfg = getConfig();
    if (!cfg.baseUrl || !cfg.channelId || !cfg.secret) {
      log("Connect failed: Base URL, Channel ID and Secret are required.", true);
      return;
    }
    if (sdk) {
      try {
        // No sessionId in config: REST-only, so connection_ready fires immediately.
        client = new sdk.Client({ baseUrl: cfg.baseUrl, channelId: cfg.channelId, secret: cfg.secret });
        client.on("connection_ready", function () {
          log("SDK: connection_ready (REST-only)");
        });
        client.on("error", function (err) {
          log("SDK: error " + err.message, true);
        });
        client.connect();
        useSdk = true;
        log("Connected via SDK.");
      } catch (e) {
        client = null;
        log("SDK connect error: " + e.message, true);
        return;
      }
    } else {
      client = { fetch: true };
      useSdk = false;
      log("Connected via fetch() (SDK not loaded).");
    }
    setConnected(true);
  }

  async function onSend() {
    var cfg = getConfig();
    var text = value(messageTextEl) || "Hello!";
    if (!client) return log("Not connected.", true);
    try {
      // This client has no sessionId in its config, so contact details go per message.
      var contact = getContactProfile();
      var result;
      if (useSdk) {
        var opts = { sessionId: cfg.sessionId, visitorName: cfg.visitorName };
        if (contact) opts.contact = contact;
        result = await client.sendMessage(text, opts);
      } else {
        result = await fetchSendMessage(cfg, text, contact);
      }
      if (result.success) log("Send message: success (socialMessageId " + result.socialMessageId + ").");
      else log("Send message failed: " + (result.message || "unknown error"), true);
    } catch (e) {
      log("Send error: " + e.message, true);
    }
  }

  async function onGetChannel() {
    var cfg = getConfig();
    if (!client) return log("Not connected.", true);
    try {
      var channel = useSdk ? await client.getChannelInfo() : await fetchGetChannelInfo(cfg);
      log("Channel info: " + JSON.stringify(channel, null, 2));
    } catch (e) {
      log("Get channel error: " + e.message, true);
    }
  }

  async function onGetWindow() {
    var cfg = getConfig();
    if (!client) return log("Not connected.", true);
    try {
      var res = useSdk
        ? await client.getMessageWindow(cfg.sessionId, { intent: "present", limit: 20 })
        : await fetchGetMessageWindow(cfg, 20);
      log(
        "Message window: " +
          JSON.stringify(
            {
              messages: res.messages,
              oldestSeq: res.oldestSeq,
              newestSeq: res.newestSeq,
              hasOlder: res.hasOlder,
              hasNewer: res.hasNewer,
            },
            null,
            2
          )
      );
    } catch (e) {
      log("Get message window error: " + e.message + (isNotFound(e) ? " (no conversation for this session yet)" : ""), true);
    }
  }

  function onDisconnect() {
    if (client && useSdk) client.disconnect();
    client = null;
    useSdk = false;
    setConnected(false);
    log("Disconnected.");
  }

  /**
   * Update contact details without sending a message. Uses the chat client when the chat is
   * open, otherwise the Connect client. The contact must exist: the first message creates it.
   */
  async function onUpdateContact() {
    var cfg = getConfig();
    var inChat = !!chatClient;
    function report(msg, isError) {
      log(msg, isError);
      if (inChat && isError) showChatError(msg);
    }
    if (!inChat && !client) return report("Update contact: open the chat or click Connect first.", true);
    var profile;
    try {
      profile = getContactProfile();
    } catch (e) {
      return report("Update contact failed: " + e.message, true);
    }
    if (!profile) return report("Update contact: fill in country, language or attributes first.", true);
    var sessionId = inChat ? chatSessionId : cfg.sessionId;
    var sdkClient = inChat ? chatClient : useSdk ? client : null;
    if (inChat) hideChatError();
    try {
      var result;
      if (sdkClient) {
        if (!sdkClient.updateContact) {
          return report("Update contact: this SDK has no updateContact. Load adventist-inbox-sdk@0.6.0 or later.", true);
        }
        // Same sessionId as the chat client's config: the SDK also updates its config.contact.
        result = await sdkClient.updateContact(Object.assign({ sessionId: sessionId }, profile));
      } else {
        result = await fetchUpdateContact(cfg, sessionId, profile);
      }
      if (result.success) {
        var msg = "Update contact: saved for session " + sessionId + ".";
        if (result.droppedAttributes && result.droppedAttributes.length > 0) {
          msg += " Not saved (50-key limit): " + result.droppedAttributes.join(", ") + ".";
        }
        log(msg);
      } else {
        report("Update contact failed: " + (result.message || "unknown error"), true);
      }
    } catch (e) {
      report("Update contact error: " + e.message, true);
    }
  }

  function clearLog() {
    logEl.textContent = "";
    logEl.classList.remove("has-error");
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  btnConnect.addEventListener("click", onConnect);
  btnSend.addEventListener("click", onSend);
  btnChannel.addEventListener("click", onGetChannel);
  btnWindow.addEventListener("click", onGetWindow);
  btnDisconnect.addEventListener("click", onDisconnect);
  btnClearLog.addEventListener("click", clearLog);
  btnOpenChat.addEventListener("click", openChat);
  btnLeaveChat.addEventListener("click", leaveChat);
  btnChatSend.addEventListener("click", onChatSend);
  btnUpdateContact.addEventListener("click", onUpdateContact);
  btnLoadOlder.addEventListener("click", function () {
    if (chatClient && hasOlder) loadWindow("older");
  });
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
  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      onChatSend();
    }
  });
  $("config-form").addEventListener("submit", function (e) {
    e.preventDefault();
    onConnect();
  });

  // Pre-fill a stable session id so Send, Update contact and Open chat target the same visitor.
  if (!value(sessionIdEl)) sessionIdEl.value = newSessionId();

  log(
    sdk
      ? "Adventist Inbox SDK example loaded. Enter credentials, then Open chat or Connect."
      : "SDK not loaded: Connect and the API buttons use fetch(); Open chat needs the SDK."
  );
})();
