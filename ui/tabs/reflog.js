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

  let currentRef = "HEAD";
  let gen = 0;

  async function refreshTopbar() {
    try {
      const data = await apiGet("/api/overview");
      if (data && data.repo) setTopbar(data.repo);
    } catch {
      /* overview is optional */
    }
  }

  async function loadBranchNames() {
    try {
      const data = await apiGet("/api/branches");
      return (data.branches || []).map((b) => b.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  function showError(title, err) {
    content.replaceChildren(
      el("div", "notice", `<h2>${esc(title)}</h2><p>${esc(err.message || err)}</p>`)
    );
  }

  function showLoading() {
    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">\u{1F504}</div><h2>Loading reflog\u2026</h2>`)
    );
  }

  function buildToolbar(refNames) {
    const bar = el("form", "toolbar");
    bar.append(el("div", "section-title", "Reflog"));

    const label = el("label", null);
    label.style.cssText = "display:flex;align-items:center;gap:8px;color:var(--text-dim);font-size:12px;";
    label.append(document.createTextNode("Ref"));

    const known = [];
    const seen = new Set();
    for (const name of ["HEAD", ...refNames, currentRef]) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      known.push(name);
    }

    const inp = el("input", "input search");
    inp.type = "text";
    inp.name = "ref";
    inp.value = currentRef;
    inp.placeholder = "or type a branch name";
    inp.setAttribute("list", "vu-reflog-refs");
    inp.setAttribute("autocomplete", "off");
    inp.setAttribute("spellcheck", "false");

    const sel = el("select", "input");
    sel.name = "refSelect";
    sel.style.width = "auto";
    sel.style.minWidth = "160px";
    for (const name of known) sel.append(new Option(name, name));
    sel.value = known.includes(currentRef) ? currentRef : "HEAD";
    sel.addEventListener("change", () => {
      currentRef = sel.value || "HEAD";
      inp.value = currentRef;
      renderReflog();
    });
    label.append(sel);
    bar.append(label);

    const list = el("datalist");
    list.id = "vu-reflog-refs";
    for (const name of known) list.append(new Option(name, name));

    const load = el("button", "btn btn-primary", "Show");
    load.type = "submit";

    bar.append(inp, list, load);
    bar.addEventListener("submit", (e) => {
      e.preventDefault();
      const typed = String(inp.value || "").trim();
      currentRef = typed || sel.value || "HEAD";
      renderReflog();
    });
    return bar;
  }

  function entryRow(entry) {
    const row = el("div", "row-item");
    row.style.cursor = "default";

    const main = el("div", "row-main");
    main.append(el("div", "row-title", esc(entry.subject || "(no subject)")));
    const meta = el("div", "row-sub");
    const selector = el("span", "ref-badge head", esc(entry.selector || ""));
    meta.append(selector);
    meta.append(document.createTextNode(" "));
    meta.append(el("span", "hash", esc(entry.short || "")));
    if (entry.relDate) {
      meta.append(document.createTextNode(" \u00b7 " + entry.relDate));
    }
    main.append(meta);

    const actions = el("div", "row-actions");
    const resetBtn = el("button", "btn btn-sm btn-danger", "Reset to here");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetTo(entry);
    });
    const checkoutBtn = el("button", "btn btn-sm", "Checkout");
    checkoutBtn.type = "button";
    checkoutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      checkoutEntry(entry);
    });
    actions.append(resetBtn, checkoutBtn);

    row.append(main, el("div", "commit-date", esc(entry.relDate || "")), actions);
    return row;
  }

  async function resetTo(entry) {
    const fields = await promptFields(
      "Reset to here",
      [
        {
          name: "mode",
          label: "Reset mode",
          type: "select",
          value: "hard",
          options: [
            { value: "soft", label: "soft \u2014 move HEAD, keep index and working tree" },
            { value: "mixed", label: "mixed \u2014 move HEAD, reset index, keep working tree" },
            { value: "hard", label: "hard \u2014 discard index and working tree (destructive)" },
          ],
        },
      ],
      { confirmLabel: "Continue", danger: true }
    );
    if (!fields) return;
    const mode = ["soft", "mixed", "hard"].includes(fields.mode) ? fields.mode : "hard";
    const short = entry.short || entry.hash;
    const ok = await confirmAction(
      `Reset --${mode} to ${short}`,
      `This will run git reset --${mode} to ${short}` +
        (entry.selector ? ` (${entry.selector})` : "") +
        `. Hard reset discards uncommitted changes.`,
      { danger: true, confirmLabel: "Reset" }
    );
    if (!ok) return;
    try {
      await apiPost("/api/reflog", { action: "reset", hash: entry.hash, mode });
      toast(`Reset --${mode} to ${short}`);
      await renderReflog();
    } catch (err) {
      toast(err.message || "reset failed", true);
    }
  }

  async function checkoutEntry(entry) {
    const short = entry.short || entry.hash;
    const ok = await confirmAction(
      "Checkout commit",
      `Check out ${short}` +
        (entry.subject ? ` \u2014 ${entry.subject}` : "") +
        `? This leaves the repository in a detached HEAD state.`,
      { confirmLabel: "Checkout" }
    );
    if (!ok) return;
    try {
      await apiPost("/api/reflog", { action: "checkout", hash: entry.hash });
      toast(`Checked out ${short} (detached HEAD)`);
      await renderReflog();
    } catch (err) {
      toast(err.message || "checkout failed", true);
    }
  }

  async function renderReflog() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    const ref = (currentRef || "HEAD").trim() || "HEAD";
    currentRef = ref;

    let data;
    let refNames = [];
    try {
      const [reflog, names] = await Promise.all([
        apiGet("/api/reflog?ref=" + encodeURIComponent(ref)),
        loadBranchNames(),
      ]);
      if (my !== gen) return;
      data = reflog;
      refNames = names;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load reflog", err);
      return;
    }

    if (data.ref) currentRef = data.ref;
    const entries = Array.isArray(data.entries) ? data.entries : [];

    const frag = document.createDocumentFragment();
    frag.append(buildToolbar(refNames));

    const card = el("div", "card");
    card.append(
      el(
        "div",
        "card-head",
        `<h3>${esc(currentRef)}</h3><span class="count">${entries.length} ${
          entries.length === 1 ? "entry" : "entries"
        }</span>`
      )
    );

    if (!entries.length) {
      card.append(
        el("div", "empty-state", `<span class="ico">\u{1F504}</span><span>No reflog entries for ${esc(currentRef)}</span>`)
      );
    } else {
      const list = el("div", "list-scroll");
      for (const entry of entries) list.append(entryRow(entry));
      const body = el("div", "card-body flush");
      body.append(list);
      card.append(body);
    }

    frag.append(card);
    content.replaceChildren(frag);
  }

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.reflog = renderReflog;
})();
