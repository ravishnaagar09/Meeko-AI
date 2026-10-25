/* Background jobs: slow AI work (quiz generation, Ask your notes, MeekoMateAI) keeps running
   when the person opens another page. A small tray at the bottom-left shows what is still
   working, lets the person cancel it, and tells them when a result is ready. Loaded before
   app.js; it only calls app.js helpers (h, icon) when a job runs, never while this file loads. */
"use strict";

const JOBS = (() => {
  const list = [];
  let trayEl = null;

  function tray() {
    if (!trayEl) {
      trayEl = document.createElement("div");
      trayEl.className = "job-tray";
      trayEl.setAttribute("role", "status");
      trayEl.setAttribute("aria-live", "polite");
      document.body.appendChild(trayEl);
    }
    return trayEl;
  }

  function message(job) {
    if (job.status === "running") return job.text + " … you can keep using the app";
    if (job.status === "done") return job.text + " is ready";
    if (job.status === "cancelled") return job.text + " cancelled";
    return job.text + " failed" + (job.error && job.error.message ? ": " + job.error.message : ".");
  }

  function draw() {
    const shown = list.filter((j) => !j.hidden && (j.status === "running" || j.notify));
    const t = tray();
    t.replaceChildren(
      ...shown.map((j) => {
        let action = null;
        if (j.status === "running") {
          action = h("button", { class: "link", type: "button", onclick: () => cancel(j) }, "Cancel");
        } else if (j.status === "done" && j.open) {
          action = h("button", {
            class: "link",
            type: "button",
            onclick: () => {
              const open = j.open;
              dismiss(j);
              open(j.result);
            },
          }, j.openLabel);
        }
        const close = j.status === "running"
          ? h("button", { class: "job-x", type: "button", title: "Hide. It keeps working in the background.", "aria-label": "Hide notice", onclick: () => hide(j) }, "×")
          : h("button", { class: "job-x", type: "button", "aria-label": "Dismiss", onclick: () => dismiss(j) }, "×");
        return h("div", { class: "job " + j.status },
          j.status === "running"
            ? h("span", { class: "spinner", "aria-hidden": "true" })
            : icon(j.status === "error" ? "alert" : "check"),
          h("span", { class: "job-text" }, message(j)),
          action,
          close);
      })
    );
    t.hidden = shown.length === 0;
  }

  // Hides the notice only. The job keeps running and its result is still delivered.
  function hide(job) {
    job.hidden = true;
    draw();
  }

  function dismiss(job) {
    const i = list.indexOf(job);
    if (i >= 0) list.splice(i, 1);
    draw();
  }

  // Stops the job for good. The request is aborted if the caller passed the signal to api().
  function cancel(job) {
    if (job.status !== "running") return dismiss(job);
    job.cancelled = true;
    job.status = "cancelled";
    if (job.controller) job.controller.abort();
    dismiss(job);
  }

  // When the job ends: if the person is looking at the page, let the page update;
  // otherwise leave a message in the tray (even if it was hidden before).
  function settle(job, opts) {
    if (job.cancelled || !list.includes(job)) return;
    const watching = !!(opts.isHere && opts.isHere());
    if (watching) {
      dismiss(job);
      if (job.status === "done" && opts.onDone) opts.onDone(job.result);
      if (job.status === "error" && opts.onError) opts.onError(job.error);
      return;
    }
    job.hidden = false;
    job.notify = true;
    draw();
    if (job.status === "done") setTimeout(() => { if (list.includes(job)) dismiss(job); }, 20000);
  }

  // fn receives an AbortSignal. Pass it to api() as { signal } so Cancel really stops the request.
  function start(kind, key, text, fn, opts = {}) {
    if (opts.dedupe) {
      const same = list.find((j) => j.kind === kind && j.key === key && j.status === "running");
      if (same) return same;
    }
    const controller = new AbortController();
    const job = {
      kind, key, text, status: "running", result: null, error: null, notify: false, hidden: false,
      payload: opts.payload || "", open: opts.open || null, openLabel: opts.openLabel || "Open",
      controller, cancelled: false,
    };
    list.push(job);
    job.promise = Promise.resolve().then(() => fn(controller.signal)).then(
      (r) => { job.result = r; job.status = "done"; settle(job, opts); return r; },
      (e) => { job.error = e; job.status = job.cancelled ? "cancelled" : "error"; settle(job, opts); throw e; }
    );
    job.promise.catch(() => {}); // nobody listening is not an error
    draw();
    return job;
  }

  function running(kind, key) {
    return list.find((j) => j.kind === kind && j.key === key && j.status === "running") || null;
  }

  function thinking(text) {
    return h("div", { class: "msg bot" }, h("span", { class: "typing" }, h("span", { class: "spinner" }), text || "Working on it…"));
  }

  return { start, running, dismiss, cancel, hide, thinking };
})();