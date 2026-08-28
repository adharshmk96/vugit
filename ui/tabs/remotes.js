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

  let remotes = [];
  let selectedName = "";
  let gen = 0;
  let busy = false;

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.remotes = async function renderRemotes() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    let data;
    try {
      data = await apiGet("/api/remotes");
      if (my !== gen) return;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load remotes", err);
      return;
    }

    remotes = Array.isArray(data.remotes) ? data.remotes : [];
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
      el("div", "placeholder", `<div class="ico">\u{1F310}</div><h2>Loading remotes\u2026</h2>`)
    );
  }

  function findRemote(name) {
    return remotes.find((r) => r.name === name) || null;
  }

  function resolveSelected() {
    const still = findRemote(selectedName);
    if (still) return still;
    return remotes[0] || null;
  }

  function dash(v) {
    const s = String(v ?? "").trim();
    return s ? s : "\u2014";
  }

  function button(label, className, onClick) {
    const b = el("button", className, esc(label));
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  function paint() {
    const selected = resolveSelected();
    selectedName = selected ? selected.name : "";

    const frag = document.createDocumentFragment();
    frag.append(buildToolbar());

    if (!remotes.length) {
      frag.append(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F310}</span><span>No remotes configured</span>`
        )
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
    const form = el("form", "toolbar");
    form.append(el("div", "section-title", "Remotes"));

    const nameInp = el("input", "input");
    nameInp.name = "name";
    nameInp.placeholder = "name";
    nameInp.required = true;
    nameInp.autocomplete = "off";
    nameInp.style.width = "140px";
    nameInp.style.flex = "0 0 140px";

    const urlInp = el("input", "input");
    urlInp.name = "url";
    urlInp.type = "text";
    urlInp.placeholder = "https://\u2026 or git@host:repo.git";
    urlInp.required = true;
    urlInp.autocomplete = "off";
    urlInp.style.flex = "1 1 240px";
    urlInp.style.minWidth = "180px";
    urlInp.style.maxWidth = "520px";

    const submit = el("button", "btn btn-primary", "Add remote");
    submit.type = "submit";

    form.append(nameInp, urlInp, submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addRemote(nameInp.value, urlInp.value);
    });
    return form;
  }

  function fillList(panel, selected) {
    const scroll = el("div", "list-scroll");
    scroll.append(
      el("div", "card-head", `<h3>Remotes</h3><span class="count">${remotes.length}</span>`)
    );
    for (const r of remotes) scroll.append(remoteRow(r, selected));
    panel.replaceChildren(scroll);
  }

  function remoteRow(r, selected) {
    const active = selected && selected.name === r.name;
    const row = el("div", "row-item" + (active ? " is-active" : ""));
    row.dataset.name = r.name;

    const main = el("div", "row-main");
    const title = el("div", "row-title", esc(r.name));
    title.title = r.name;
    main.append(title);
    const sub = el("div", "row-sub");
    sub.textContent = r.url || r.fetchUrl || "";
    sub.title = sub.textContent;
    main.append(sub);

    const n = (r.heads || []).length;
    row.append(main);
    if (n) row.append(el("span", "pill", String(n) + (n === 1 ? " head" : " heads")));
    row.addEventListener("click", () => selectRemote(r.name));
    return row;
  }

  function selectRemote(name) {
    selectedName = name;
    content.querySelectorAll(".list-panel .row-item").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.name === name);
    });
    const detail = content.querySelector(".detail-panel");
    if (detail) fillDetail(detail, findRemote(name));
  }

  function fillDetail(panel, r) {
    if (!r) {
      panel.replaceChildren(
        el(
          "div",
          "placeholder",
          `<div class="ico">\u{1F310}</div><h2>Select a remote</h2><p>Choose a remote to fetch, pull, or push</p>`
        )
      );
      return;
    }

    const head = el("div", "detail-head");
    const titleRow = el("div", "branch-detail");
    titleRow.append(el("h3", null, esc(r.name)));
    const n = (r.heads || []).length;
    if (n) titleRow.append(el("span", "pill", String(n) + (n === 1 ? " head" : " heads")));
    head.append(titleRow);

    const body = el("div", "detail-body");
    const kv = el("div", "kv");
    kv.append(el("span", "k", "Name"), el("span", "v", esc(r.name)));
    kv.append(el("span", "k", "URL"), el("span", "v", esc(dash(r.url))));
    kv.append(el("span", "k", "Fetch URL"), el("span", "v", esc(dash(r.fetchUrl))));
    kv.append(el("span", "k", "Push URL"), el("span", "v", esc(dash(r.pushUrl))));
    body.append(kv);

    const headsTitle = el("div", "section-title");
    headsTitle.style.marginTop = "16px";
    headsTitle.textContent = "Tracking heads";
    body.append(headsTitle);

    const heads = r.heads || [];
    if (!heads.length) {
      body.append(
        el("div", "empty-state", `<span>No remote-tracking branches yet \u2014 fetch to update</span>`)
      );
    } else {
      const wrap = el("div");
      wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
      for (const h of heads) wrap.append(el("span", "pill", esc(h)));
      body.append(wrap);
    }

    const actions = el("div", "row-actions");
    actions.style.marginTop = "16px";
    actions.append(
      button("Fetch", "btn btn-sm", () => fetchRemote(r)),
      button("Prune", "btn btn-sm", () => pruneRemote(r)),
      button("Pull", "btn btn-sm", () => pullRemote(r)),
      button("Push", "btn btn-sm btn-primary", () => pushRemote(r)),
      button("Rename", "btn btn-sm", () => renameRemote(r)),
      button("Remove", "btn btn-sm btn-danger", () => removeRemote(r))
    );
    body.append(actions);
    panel.replaceChildren(head, body);
  }

  async function runAction(body, okMsg, opts) {
    if (busy) return false;
    busy = true;
    try {
      await apiPost("/api/remotes", body);
      if (opts && opts.select) selectedName = opts.select;
      if (opts && opts.clear) selectedName = "";
      toast(okMsg);
      await window.TabRenderers.remotes();
      return true;
    } catch (err) {
      toast(err.message || "action failed", true);
      return false;
    } finally {
      busy = false;
    }
  }

  async function addRemote(name, url) {
    name = String(name || "").trim();
    url = String(url || "").trim();
    if (!name || !url) {
      toast("Name and URL are required", true);
      return;
    }
    await runAction({ action: "add", name, url }, `Added remote ${name}`, { select: name });
  }

  async function renameRemote(r) {
    const fields = await promptFields(
      `Rename ${r.name}`,
      [{ name: "newName", label: "New name", required: true, value: r.name }],
      { confirmLabel: "Rename" }
    );
    if (!fields) return;
    const newName = String(fields.newName || "").trim();
    if (!newName) {
      toast("New name is required", true);
      return;
    }
    if (newName === r.name) return;
    await runAction({ action: "rename", name: r.name, newName }, `Renamed ${r.name} \u2192 ${newName}`, {
      select: newName,
    });
  }

  async function removeRemote(r) {
    const ok = await confirmAction(
      "Remove remote",
      `Remove remote “${r.name}”? Local tracking refs for this remote are also deleted.`,
      { danger: true, confirmLabel: "Remove" }
    );
    if (!ok) return;
    await runAction({ action: "remove", name: r.name }, `Removed ${r.name}`, {
      clear: selectedName === r.name,
    });
  }

  async function fetchRemote(r) {
    const fields = await promptFields(
      `Fetch ${r.name}`,
      [{ name: "prune", label: "Prune stale remote-tracking branches", type: "checkbox" }],
      { confirmLabel: "Fetch" }
    );
    if (!fields) return;
    const body = { action: "fetch", name: r.name };
    if (fields.prune) body.prune = true;
    await runAction(body, fields.prune ? `Fetched and pruned ${r.name}` : `Fetched ${r.name}`);
  }

  async function pruneRemote(r) {
    await runAction({ action: "prune", name: r.name }, `Pruned ${r.name}`);
  }

  async function pullRemote(r) {
    const fields = await promptFields(
      `Pull from ${r.name}`,
      [{ name: "branch", label: "Branch (optional)", placeholder: "current upstream" }],
      { confirmLabel: "Pull" }
    );
    if (!fields) return;
    const body = { action: "pull", name: r.name };
    const branch = String(fields.branch || "").trim();
    if (branch) body.branch = branch;
    await runAction(body, branch ? `Pulled ${r.name}/${branch}` : `Pulled from ${r.name}`);
  }

  async function pushRemote(r) {
    const fields = await promptFields(
      `Push to ${r.name}`,
      [
        { name: "branch", label: "Branch (optional)", placeholder: "current branch" },
        { name: "tags", label: "Include tags", type: "checkbox" },
        { name: "force", label: "Force with lease (--force-with-lease)", type: "checkbox" },
      ],
      { confirmLabel: "Push" }
    );
    if (!fields) return;
    if (fields.force) {
      const ok = await confirmAction(
        "Force push",
        `Push to “${r.name}” with --force-with-lease? This may overwrite remote commits that you no longer have locally.`,
        { danger: true, confirmLabel: "Force push" }
      );
      if (!ok) return;
    }
    const body = { action: "push", name: r.name };
    const branch = String(fields.branch || "").trim();
    if (branch) body.branch = branch;
    if (fields.tags) body.tags = true;
    if (fields.force) body.force = true;
    const bits = [r.name];
    if (branch) bits.push(branch);
    if (fields.tags) bits.push("tags");
    if (fields.force) bits.push("force-with-lease");
    await runAction(body, `Pushed to ${bits.join(" \u00b7 ")}`);
  }
})();
