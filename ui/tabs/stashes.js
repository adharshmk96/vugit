"use strict";

(() => {
  const {
    el,
    esc,
    toast,
    apiGet,
    apiPost,
    confirmAction,
    promptFields,
    setTopbar,
    content,
  } = window.vu;

  let stashes = [];
  let selectedRef = "";
  let showCache = null;
  let showSeq = 0;
  let gen = 0;
  let busy = false;

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.stashes = async function renderStashes() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    let data;
    try {
      data = await apiGet("/api/stashes");
      if (my !== gen) return;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load stashes", err);
      return;
    }

    stashes = Array.isArray(data.stashes) ? data.stashes : [];
    if (selectedRef && !findStash(selectedRef)) {
      selectedRef = "";
      showCache = null;
    }
    paint();
  };

  async function refreshTopbar() {
    try {
      const data = await apiGet("/api/overview");
      if (data && data.repo) setTopbar(data.repo);
    } catch {
      /* overview is optional */
    }
  }

  function showError(title, err) {
    content.replaceChildren(
      el("div", "notice", `<h2>${esc(title)}</h2><p>${esc(err.message || err)}</p>`)
    );
  }

  function showLoading() {
    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">\u{1F4E6}</div><h2>Loading stashes\u2026</h2>`)
    );
  }

  function findStash(ref) {
    return stashes.find((s) => s.ref === ref) || null;
  }

  function resolveSelected() {
    const still = findStash(selectedRef);
    if (still) return still;
    return stashes[0] || null;
  }

  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function dash(v) {
    const s = String(v ?? "").trim();
    return s ? s : "\u2014";
  }

  function button(label, className, onClick) {
    const b = el("button", window.vu.autoTone(className, label), window.vu.labelHtml(label));
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  function paint() {
    const selected = resolveSelected();
    selectedRef = selected ? selected.ref : "";

    const frag = document.createDocumentFragment();
    frag.append(buildToolbar());

    if (!stashes.length) {
      showCache = null;
      frag.append(
        el("div", "empty-state", `<span class="ico">\u{1F4E6}</span><span>No stashes</span>`)
      );
      content.replaceChildren(frag);
      return;
    }

    const split = el("div", "split");
    const listPanel = el("div", "list-panel");
    const detailPanel = el("div", "detail-panel");
    fillList(listPanel, selected);
    fillDetail(detailPanel, selected);
    split.append(listPanel, detailPanel);
    frag.append(split);
    content.replaceChildren(frag);
  }

  function buildToolbar() {
    const bar = el("div", "toolbar");
    bar.append(el("div", "section-title", "Stashes"));
    bar.append(el("span", "spacer"));
    bar.append(button("Create stash", "btn btn-primary", () => createStash()));
    return bar;
  }

  function fillList(panel, selected) {
    const scroll = el("div", "list-scroll");
    scroll.append(
      el("div", "card-head", `<h3>Stashes</h3><span class="count">${stashes.length}</span>`)
    );
    for (const s of stashes) scroll.append(stashRow(s, selected));
    panel.replaceChildren(scroll);
  }

  function stashRow(s, selected) {
    const active = selected && selected.ref === s.ref;
    const row = el("div", "row-item" + (active ? " is-active" : ""));
    row.dataset.ref = s.ref;

    const main = el("div", "row-main");
    const title = el("div", "row-title", esc(s.message || s.ref));
    title.title = s.message || s.ref;
    main.append(title);
    const sub = el("div", "row-sub");
    const bits = [s.ref];
    if (s.date) bits.push(fmtDate(s.date) || s.date);
    sub.textContent = bits.join(" \u00b7 ");
    main.append(sub);

    row.append(main);
    if (s.branch) row.append(el("span", "pill", esc(s.branch)));
    row.addEventListener("click", () => selectStash(s.ref));
    return row;
  }

  function selectStash(ref) {
    selectedRef = ref;
    content.querySelectorAll(".list-panel .row-item").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.ref === ref);
    });
    const detail = content.querySelector(".detail-panel");
    if (detail) fillDetail(detail, findStash(ref));
  }

  function fillDetail(panel, s) {
    if (!s) {
      panel.replaceChildren(
        el(
          "div",
          "placeholder",
          `<div class="ico">\u{1F4E6}</div><h2>Select a stash</h2><p>Choose a stash to view files and diff</p>`
        )
      );
      return;
    }

    const head = el("div", "detail-head");
    const titleRow = el("div", "branch-detail");
    titleRow.append(el("h3", null, esc(s.ref)));
    if (s.branch) titleRow.append(el("span", "pill", esc(s.branch)));
    head.append(titleRow);

    const body = el("div", "detail-body");
    const kv = el("div", "kv");
    kv.append(el("span", "k", "Ref"), el("span", "v", esc(s.ref)));
    kv.append(el("span", "k", "Index"), el("span", "v", esc(dash(s.index))));
    kv.append(el("span", "k", "Branch"), el("span", "v", esc(dash(s.branch))));
    kv.append(el("span", "k", "Message"), el("span", "v", esc(dash(s.message))));
    kv.append(el("span", "k", "Date"), el("span", "v", esc(dash(fmtDate(s.date) || s.date))));
    body.append(kv);

    const actions = el("div", "row-actions");
    actions.style.marginTop = "16px";
    actions.append(
      button("Apply", "btn btn-sm", () => applyStash(s)),
      button("Pop", "btn btn-sm", () => popStash(s)),
      button("Branch from stash", "btn btn-sm", () => branchFromStash(s)),
      button("Drop", "btn btn-sm btn-danger", () => dropStash(s))
    );
    body.append(actions);

    const extra = el("div");
    extra.className = "stash-show";
    extra.style.marginTop = "16px";
    body.append(extra);
    panel.replaceChildren(head, body);
    loadShow(s.ref, extra);
  }

  async function loadShow(ref, host) {
    const cached = showCache && showCache.ref === ref ? showCache : null;
    if (cached) {
      renderShow(host, cached);
      return;
    }
    host.replaceChildren(el("div", "empty-state", `<span>Loading diff\u2026</span>`));
    const seq = ++showSeq;
    try {
      const data = await apiGet("/api/stashes/show?ref=" + encodeURIComponent(ref));
      if (seq !== showSeq) return;
      showCache = data;
      if (selectedRef === ref) renderShow(host, data);
    } catch (err) {
      if (seq !== showSeq) return;
      toast(err.message || "failed to load stash diff", true);
      host.replaceChildren(
        el("div", "notice", `<h2>Can't load diff</h2><p>${esc(err.message || err)}</p>`)
      );
    }
  }

  function renderShow(host, data) {
    const frag = document.createDocumentFragment();
    const files = Array.isArray(data.files) ? data.files : [];

    const filesTitle = el("div", "section-title");
    filesTitle.textContent = files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "Files";
    frag.append(filesTitle);

    if (!files.length) {
      frag.append(el("div", "empty-state", `<span>No files listed</span>`));
    } else {
      const list = el("div", "line-list");
      for (const f of files) {
        list.append(
          el("div", "file-row", `<span class="code"></span><span class="fname">${esc(f)}</span>`)
        );
      }
      frag.append(list);
    }

    const diffTitle = el("div", "section-title");
    diffTitle.style.marginTop = "16px";
    diffTitle.textContent = "Diff";
    frag.append(diffTitle);
    frag.append(renderDiff(data.diff));
    host.replaceChildren(frag);
  }

  function renderDiff(diff) {
    const view = el("div", "diff-view");
    if (!diff) {
      view.append(el("div", "empty-state", `<span>No diff for this stash</span>`));
      return view;
    }
    let oldLn = 0;
    let newLn = 0;
    for (const line of String(diff).split("\n")) {
      if (line.startsWith("@@")) {
        const m = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)/);
        if (m) {
          oldLn = Number(m[1]);
          newLn = Number(m[2]);
        }
        view.append(el("div", "diff-hunk", esc(line)));
        continue;
      }
      if (
        line.startsWith("diff ") ||
        line.startsWith("index ") ||
        line.startsWith("---") ||
        line.startsWith("+++") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file")
      ) {
        view.append(el("div", "diff-meta", esc(line)));
        continue;
      }
      const row = el("div", "diff-line");
      const ch = line[0];
      if (ch === "+") {
        row.classList.add("diff-add");
        row.append(el("span", "ln", ""), el("span", "ln", String(newLn++)), el("span", "code", esc(line)));
      } else if (ch === "-") {
        row.classList.add("diff-del");
        row.append(el("span", "ln", String(oldLn++)), el("span", "ln", ""), el("span", "code", esc(line)));
      } else if (ch === "\\") {
        row.append(el("span", "ln", ""), el("span", "ln", ""), el("span", "code", esc(line)));
      } else {
        row.append(
          el("span", "ln", oldLn ? String(oldLn++) : ""),
          el("span", "ln", newLn ? String(newLn++) : ""),
          el("span", "code", esc(line))
        );
      }
      view.append(row);
    }
    return view;
  }

  async function runAction(body, okMsg, opts) {
    if (busy) return false;
    busy = true;
    try {
      await apiPost("/api/stashes", body);
      if (opts && opts.select) selectedRef = opts.select;
      if (opts && opts.clear) selectedRef = "";
      showCache = null;
      toast(okMsg);
      await window.TabRenderers.stashes();
      return true;
    } catch (err) {
      toast(err.message || "action failed", true);
      return false;
    } finally {
      busy = false;
    }
  }

  async function createStash() {
    const fields = await promptFields(
      "Create stash",
      [
        { name: "message", label: "Message (optional)", placeholder: "WIP" },
        { name: "includeUntracked", label: "Include untracked files", type: "checkbox", value: true },
      ],
      { confirmLabel: "Stash" }
    );
    if (!fields) return;
    const body = { action: "create" };
    const message = String(fields.message || "").trim();
    if (message) body.message = message;
    if (fields.includeUntracked) body.includeUntracked = true;
    await runAction(body, "Created stash", { clear: true });
  }

  async function applyStash(s) {
    const ok = await confirmAction(
      "Apply stash",
      `Apply ${s.ref} to the working tree? The stash entry is kept.`,
      { confirmLabel: "Apply" }
    );
    if (!ok) return;
    await runAction({ action: "apply", ref: s.ref }, `Applied ${s.ref}`);
  }

  async function popStash(s) {
    const ok = await confirmAction(
      "Pop stash",
      `Pop ${s.ref}? It will be applied and then dropped.`,
      { confirmLabel: "Pop" }
    );
    if (!ok) return;
    await runAction({ action: "pop", ref: s.ref }, `Popped ${s.ref}`, { clear: true });
  }

  async function dropStash(s) {
    const ok = await confirmAction(
      "Drop stash",
      `Permanently drop ${s.ref}? This cannot be undone.`,
      { danger: true, confirmLabel: "Drop" }
    );
    if (!ok) return;
    await runAction({ action: "drop", ref: s.ref }, `Dropped ${s.ref}`, { clear: true });
  }

  async function branchFromStash(s) {
    const fields = await promptFields(
      `Branch from ${s.ref}`,
      [{ name: "branch", label: "New branch name", required: true, placeholder: "fix/from-stash" }],
      { confirmLabel: "Create branch" }
    );
    if (!fields) return;
    const branch = String(fields.branch || "").trim();
    if (!branch) {
      toast("Branch name is required", true);
      return;
    }
    await runAction({ action: "branch", ref: s.ref, branch }, `Created branch ${branch} from ${s.ref}`, {
      clear: true,
    });
  }
})();
