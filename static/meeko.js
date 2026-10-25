/* MeekoMateAI chat page.
   Loaded BEFORE app.js. It only uses helpers from app.js (h, api, icon, slip, ...) when a function runs,
   never while this file loads. All text is added with textContent (never innerHTML). */
"use strict";

const MEEKO = {
  scope: undefined, // undefined = not chosen yet, null = all my notes, number = one document
  busy: false,
  ui: null,
};

const MEEKO_CHIPS = [
  "What are the main ideas in my notes?",
  "Explain this topic in simple words",
  "What should I revise first?",
];

function meekoScroll() {
  if (MEEKO.ui) MEEKO.ui.body.scrollTop = MEEKO.ui.body.scrollHeight;
}

// ------------------------------------------------------------------ message pieces
function meekoBadge(m) {
  const ev = m.evidence || [];
  const pages = [...new Set(ev.filter((e) => e.page).map((e) => e.page))].sort((a, b) => a - b);
  const pageText = pages.length ? (pages.length === 1 ? "page " + pages[0] : "pages " + pages.join(", ")) : "";
  if (m.status === "notes") {
    return h("div", { class: "src-badge notes" }, icon("book"), "From your notes" + (pageText ? " · " + pageText : ""));
  }
  if (m.status === "both") {
    return h("div", { class: "src-badge both" }, icon("book"), "Your notes + AI" + (pageText ? " · " + pageText : ""));
  }
  return h("div", { class: "src-badge ai" }, icon("bot"), "From AI, not found in your notes");
}

function meekoBotNode(m, showRecs) {
  const status = m.status || "ai";
  const n = h("div", { class: "msg bot meeko-bot " + status });
  n.append(meekoBadge({ ...m, status }), renderText(m.content));
  if (m.notice) n.append(h("div", { class: "missing" }, m.notice));

  const ev = m.evidence || [];
  if (ev.length) {
    const where = [...new Set(ev.map((e) => e.source + (e.page ? " (page " + e.page + ")" : "")))].join(", ");
    n.append(h("div", { class: "src-where small" }, "Found in: " + where));
    const d = h("details", { class: "evidence" }, h("summary", {}, `View evidence (${ev.length})`, icon("chev")));
    ev.forEach((e) => d.append(slip(e, e.document_id)));
    if (ev.length === 1) d.open = true;
    n.append(d);
  }

  const recs = m.recommendations || [];
  if (showRecs && recs.length) {
    n.append(
      h("div", { class: "rec" },
        h("div", { class: "rec-title" }, "Suggested next"),
        h("div", { class: "suggest" }, recs.map((r) => h("button", { class: "chip", type: "button", onclick: () => meekoSend(r) }, r))))
    );
  }
  return n;
}

function meekoFillScope(sel) {
  sel.replaceChildren(h("option", { value: "" }, "All my notes"), ...S.docs.map((d) => h("option", { value: d.id }, d.filename)));
  sel.value = MEEKO.scope == null ? "" : String(MEEKO.scope);
}

// ------------------------------------------------------------------ actions
function meekoSend(text) {
  const ui = MEEKO.ui;
  text = (text || "").trim();
  if (!text || !ui) return;
  ui.input.value = "";
  ui.log.querySelectorAll(".rec").forEach((x) => x.remove()); // only the newest answer offers suggestions
  ui.log.append(h("div", { class: "msg user" }, text));
  ui.log.append(JOBS.thinking("Meeko is thinking…"));
  meekoScroll();
  const scope = MEEKO.scope;
  JOBS.start("meeko", "chat", "MeekoMateAI's answer",
    () => api("/meeko/chat", { json: { message: text, document_id: scope } }),
    {
      payload: text,
      isHere: () => S.route === "meeko",
      onDone: () => render(),
      onError: (e) => { toast(e.message, "error"); render(); },
      open: () => go("meeko"),
      openLabel: "Open",
    });
}

async function meekoAttach(file) {
  const ui = MEEKO.ui;
  if (!file || !ui) return;
  const ext = "." + file.name.split(".").pop().toLowerCase();
  const limit = S.health.max_upload_mb * 1024 * 1024;
  if (!EXTS.includes(ext)) {
    ui.log.append(errorBox(`“${file.name}” is not supported. Use PDF, TXT, PNG, JPG or WEBP.`));
    return meekoScroll();
  }
  if (file.size > limit) {
    ui.log.append(errorBox(`“${file.name}” is larger than ${S.health.max_upload_mb} MB.`));
    return meekoScroll();
  }
  ui.log.append(h("div", { class: "msg user" }, icon("clip"), " " + file.name));
  const wait = h("div", { class: "msg bot" }, h("span", { class: "typing" }, h("span", { class: "spinner" }), "Reading your file… photos and scans take a little longer."));
  ui.log.append(wait);
  meekoScroll();
  try {
    const fd = new FormData();
    fd.append("files", file);
    const data = await api("/documents/upload", { method: "POST", body: fd });
    const r = data.results[0];
    if (r.error) {
      wait.replaceWith(errorBox(r.error));
    } else {
      const d = r.document;
      setDoc(d.id);
      MEEKO.scope = d.id; // the chatbot now looks in the file that was just added
      await refreshDocs();
      meekoFillScope(ui.scope);
      const size = `${d.char_count.toLocaleString()} characters, ${d.page_count} ${d.page_count === 1 ? "section" : "pages"}`;
      wait.replaceWith(
        h("div", { class: "msg bot meeko-bot" },
          h("p", {}, `Got it! I added “${d.filename}” (${size}). I will look in it first now. What would you like to know?`),
          d.notes ? h("div", { class: "missing" }, d.notes) : null,
          h("div", { class: "suggest" }, MEEKO_CHIPS.map((c) => h("button", { class: "chip", type: "button", onclick: () => meekoSend(c) }, c))))
      );
    }
  } catch (e) {
    wait.replaceWith(errorBox(e.message));
  } finally {
    ui.fileInput.value = "";
    meekoScroll();
  }
}

// ------------------------------------------------------------------ the page
async function viewMeeko(root) {
  if (!ICONS.clip) ICONS.clip = "M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5";
  await refreshDocs();
  if (MEEKO.scope === undefined) MEEKO.scope = S.docId || null; // start with the document chosen at the top
  if (MEEKO.scope !== null && !S.docs.find((d) => d.id === MEEKO.scope)) MEEKO.scope = null;
  const history = await api("/meeko/chat");

  const first = S.me ? S.me.full_name.split(" ")[0] : "";
  const hello = window.marginaliaGreeting ? window.marginaliaGreeting() : "Hello";

  const log = h("div", { class: "chat-log", "aria-live": "polite" });
  const welcome = h("div", { class: "msg bot meeko-bot welcome" },
    h("p", { class: "welcome-title" }, `${hello}${first ? ", " + first : ""}! I'm MeekoMateAI, your study buddy.`),
    h("p", {}, "Ask me anything. I look in your notes first and show you the page where I found the answer. If your notes don't have it, I answer from my own AI knowledge and tell you clearly that it did not come from your notes."),
    h("p", {}, "Use the paperclip to add a PDF, text file or photo of your notes and I will read it right away. You can write in English, Hindi or Hinglish."),
    S.docs.length ? null : h("p", { class: "muted" }, "You have not added any notes yet. You can still ask me general questions."),
    h("div", { class: "suggest" }, MEEKO_CHIPS.map((c) => h("button", { class: "chip", type: "button", onclick: () => meekoSend(c) }, c)))
  );
  const body = h("div", { class: "panel-body" }, welcome, log);

  const lastBot = history.map((m) => m.role).lastIndexOf("assistant");
  history.forEach((m, i) => log.append(m.role === "user" ? h("div", { class: "msg user" }, m.content) : meekoBotNode(m, i === lastBot)));

  const pendingMeeko = JOBS.running("meeko", "chat");
  if (pendingMeeko) log.append(h("div", { class: "msg user" }, pendingMeeko.payload), JOBS.thinking("Meeko is thinking…"));

  const scopeSel = h("select", { "aria-label": "Where should Meeko look in your notes?" });
  meekoFillScope(scopeSel);
  scopeSel.addEventListener("change", () => { MEEKO.scope = scopeSel.value ? Number(scopeSel.value) : null; });

  const clearBtn = h("button", { class: "btn sm secondary", type: "button" }, "Clear chat");
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear this conversation?")) return;
    try { await api("/meeko/chat", { method: "DELETE" }); toast("Conversation cleared"); render(); } catch (e) { toast(e.message, "error"); }
  });

  const fileInput = h("input", { type: "file", accept: EXTS.join(","), class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
  fileInput.addEventListener("change", () => meekoAttach(fileInput.files[0]));
  const attachBtn = h("button", { class: "attach-btn", type: "button", "aria-label": "Attach a PDF, text file or photo of your notes", title: "Attach notes (PDF, TXT, photo)" }, icon("clip"));
  attachBtn.addEventListener("click", () => fileInput.click());

  const input = h("textarea", { rows: 1, placeholder: "Ask Meeko anything…", "aria-label": "Your question", maxlength: 1500 });
  const sendBtn = h("button", { class: "btn", type: "button", "aria-label": "Send question" }, icon("send"));
  sendBtn.addEventListener("click", () => meekoSend(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); meekoSend(input.value); } });

  MEEKO.ui = { log, body, input, sendBtn, scope: scopeSel, fileInput };

  root.replaceChildren(
    h("div", { class: "panel meeko-panel", "aria-label": "MeekoMateAI chat" },
      h("div", { class: "panel-head meeko-head" },
        h("div", { class: "meeko-title" },
          h("img", { class: "meeko-avatar", src: "/static/logo.png", alt: "", width: "40", height: "40" }),
          h("div", {}, h("h2", {}, "MeekoMateAI"), h("div", { class: "small muted" }, "Notes first, AI when needed"))),
        h("div", { class: "meeko-tools" },
          h("label", { class: "doc-picker meeko-scope" }, h("span", { class: "doc-picker-label" }, "Look in"), scopeSel),
          clearBtn)),
      body,
      h("div", { class: "composer" }, attachBtn, fileInput, input, sendBtn))
  );
  meekoScroll();
}
