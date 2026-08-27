"use strict";

(() => {
  const { el, esc, toast, apiGet, apiPost, setTopbar, content } = window.vu;

  let gen = 0;

  async function refreshTopbar() {
    try {
      const data = await apiGet("/api/overview");
      if (data && data.repo) setTopbar(data.repo);
    } catch {
      /* overview is optional */
    }
  }

  function pillFor(status) {
    const s = String(status || "ok");
    let cls = "pill";
    if (s === "ok") cls += " green";
    else if (s === "uninitialized" || s === "out-of-date") cls += " yellow";
    else if (s === "conflict") cls += " red";
    return el("span", cls, esc(s));
  }

  function showError(title, err) {
    content.replaceChildren(
      el("div", "notice", `<h2>${esc(title)}</h2><p>${esc(err.message || err)}</p>`)
    );
  }

  function showLoading() {
    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">\u{1F4E6}</div><h2>Loading submodules\u2026</h2>`)
    );
  }

  async function runAction(body, okMsg) {
    try {
      await apiPost("/api/submodules", body);
      toast(okMsg);
      await renderSubmodules();
    } catch (err) {
      toast(err.message || "submodule action failed", true);
    }
  }

  function toolbar() {
    const bar = el("div", "toolbar");
    bar.append(el("div", "section-title", "Submodules"));
    bar.append(el("span", "spacer"));

    const initAll = el("button", "btn", "Init all");
    initAll.type = "button";
    initAll.addEventListener("click", () => runAction({ action: "init" }, "Initialized submodules"));

    const updateAll = el("button", "btn btn-primary", "Update --init --recursive");
    updateAll.type = "button";
    updateAll.addEventListener("click", () =>
      runAction({ action: "update", init: true, recursive: true }, "Updated submodules")
    );

    const syncAll = el("button", "btn", "Sync");
    syncAll.type = "button";
    syncAll.addEventListener("click", () => runAction({ action: "sync" }, "Synced submodule URLs"));

    bar.append(initAll, updateAll, syncAll);
    return bar;
  }

  function submoduleRow(sm) {
    const row = el("div", "row-item");
    row.style.cursor = "default";

    const main = el("div", "row-main");
    main.append(el("div", "row-title", esc(sm.path || "")));

    const sub = el("div", "row-sub");
    const bits = [];
    if (sm.hash) bits.push(sm.hash.length > 12 ? sm.hash.slice(0, 8) : sm.hash);
    if (sm.branch) bits.push(sm.branch);
    if (sm.url) bits.push(sm.url);
    if (sm.message) bits.push(sm.message);
    sub.textContent = bits.join(" \u00b7 ");
    main.append(sub);

    const actions = el("div", "row-actions");
    const updateBtn = el("button", "btn btn-sm", "Update");
    updateBtn.type = "button";
    updateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      runAction({ action: "update", path: sm.path }, `Updated ${sm.path}`);
    });
    const syncBtn = el("button", "btn btn-sm", "Sync");
    syncBtn.type = "button";
    syncBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      runAction({ action: "sync", path: sm.path }, `Synced ${sm.path}`);
    });
    actions.append(updateBtn, syncBtn);

    row.append(main, pillFor(sm.status), actions);
    return row;
  }

  async function renderSubmodules() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    let data;
    try {
      data = await apiGet("/api/submodules");
      if (my !== gen) return;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load submodules", err);
      return;
    }

    const list = Array.isArray(data.submodules) ? data.submodules : [];
    const frag = document.createDocumentFragment();
    frag.append(toolbar());

    const card = el("div", "card");
    card.append(
      el(
        "div",
        "card-head",
        `<h3>Submodules</h3><span class="count">${list.length}</span>`
      )
    );

    if (!list.length) {
      card.append(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F4E6}</span><span>No submodules in this repository</span>`
        )
      );
    } else {
      const rows = el("div", "list-scroll");
      for (const sm of list) rows.append(submoduleRow(sm));
      const body = el("div", "card-body flush");
      body.append(rows);
      card.append(body);
    }

    frag.append(card);
    content.replaceChildren(frag);
  }

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.submodules = renderSubmodules;
})();
