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
    initials,
    hueFor,
  } = window.vu;

  let selectedName = "";
  let filterQuery = "";
  let gen = 0;
  let busy = false;
  let branches = [];

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.branches = async function renderBranches() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    let data;
    try {
      data = await apiGet("/api/branches");
      if (my !== gen) return;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load branches", err);
      return;
    }

    branches = Array.isArray(data.branches) ? data.branches : [];
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
      el("div", "placeholder", `<div class="ico">\u{1F33F}</div><h2>Loading branches\u2026</h2>`)
    );
  }

  function isMainBranch(b) {
    const name = String((b && b.name) || "");
    return name === "main" || name.endsWith("/main");
  }

  function currentBranch() {
    return branches.find((b) => b.current) || null;
  }

  function findBranch(name) {
    return branches.find((b) => b.name === name) || null;
  }

  function resolveSelected() {
    const still = findBranch(selectedName);
    if (still) return still;
    const cur = currentBranch();
    if (cur) return cur;
    return branches[0] || null;
  }

  function splitRemoteName(name) {
    const s = String(name || "");
    const i = s.indexOf("/");
    if (i <= 0) return { remote: "", branch: s };
    return { remote: s.slice(0, i), branch: s.slice(i + 1) };
  }

  function matchesFilter(b) {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return true;
    return [b.name, b.hash, b.subject, b.author, b.upstream].some((x) =>
      String(x || "")
        .toLowerCase()
        .includes(q)
    );
  }

  function groupedFiltered() {
    const filtered = branches.filter(matchesFilter);
    const local = filtered.filter((b) => !b.remote);
    const byRemote = new Map();
    for (const b of filtered.filter((b) => b.remote)) {
      const { remote } = splitRemoteName(b.name);
      const key = remote || "remote";
      if (!byRemote.has(key)) byRemote.set(key, []);
      byRemote.get(key).push(b);
    }
    return { local, byRemote, total: filtered.length };
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

  function trackPills(b) {
    const wrap = el("div", "row-actions");
    if (b.current) wrap.append(el("span", "pill green", "HEAD"));
    if (b.gone) wrap.append(el("span", "pill red", "gone"));
    if (b.ahead) wrap.append(el("span", "pill green", "\u2191" + b.ahead));
    if (b.behind) wrap.append(el("span", "pill yellow", "\u2193" + b.behind));
    if (b.remote) wrap.append(el("span", "pill", "remote"));
    return wrap;
  }

  function paint() {
    const selected = resolveSelected();
    selectedName = selected ? selected.name : "";

    const frag = document.createDocumentFragment();
    frag.append(buildToolbar());

    if (!branches.length) {
      frag.append(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F33F}</span><span>No branches in this repository</span>`
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
    const bar = el("div", "toolbar");

    const search = el("input", "input search");
    search.type = "search";
    search.placeholder = "Filter branches\u2026";
    search.value = filterQuery;
    search.setAttribute("autocomplete", "off");
    search.setAttribute("spellcheck", "false");
    search.addEventListener("input", () => {
      filterQuery = search.value;
      const panel = content.querySelector(".list-panel");
      if (panel) fillList(panel, findBranch(selectedName));
    });

    const createBtn = button("Create branch", "btn btn-primary", () => createBranch());
    const pushBtn = button("Push current", "btn", () => pushCurrent());
    if (!currentBranch()) pushBtn.disabled = true;

    bar.append(search, el("div", "spacer"), createBtn, pushBtn);
    return bar;
  }

  function fillList(panel, selected) {
    const { local, byRemote, total } = groupedFiltered();
    const scroll = el("div", "list-scroll");

    if (!total) {
      scroll.append(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F33F}</span><span>${
            filterQuery.trim() ? "No branches match that filter" : "No branches"
          }</span>`
        )
      );
      panel.replaceChildren(scroll);
      return;
    }

    if (local.length) {
      scroll.append(
        el("div", "card-head", `<h3>Local</h3><span class="count">${local.length}</span>`)
      );
      for (const b of local) scroll.append(branchRow(b, selected));
    }

    for (const [remote, list] of byRemote) {
      scroll.append(
        el("div", "card-head", `<h3>${esc(remote)}</h3><span class="count">${list.length}</span>`)
      );
      for (const b of list) scroll.append(branchRow(b, selected));
    }

    panel.replaceChildren(scroll);
  }

  function branchRow(b, selected) {
    const active = selected && selected.name === b.name;
    const row = el("div", "row-item" + (active ? " is-active" : ""));
    row.dataset.name = b.name;

    if (b.current) row.append(el("span", "current-dot"));

    const main = el("div", "row-main");
    const title = el("div", "row-title", esc(b.name));
    title.title = b.name;
    main.append(title);

    const sub = el("div", "row-sub");
    const bits = [];
    if (b.hash) bits.push(b.hash);
    if (b.subject) bits.push(b.subject);
    sub.textContent = bits.join("  ");
    if (b.subject) sub.title = b.subject;
    main.append(sub);

    row.append(main, trackPills(b));
    row.addEventListener("click", () => selectBranch(b.name));
    return row;
  }

  function selectBranch(name) {
    selectedName = name;
    content.querySelectorAll(".list-panel .row-item").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.name === name);
    });
    const detail = content.querySelector(".detail-panel");
    if (detail) fillDetail(detail, findBranch(name));
  }

  function fillDetail(panel, b) {
    if (!b) {
      panel.replaceChildren(
        el(
          "div",
          "placeholder",
          `<div class="ico">\u{1F33F}</div><h2>Select a branch</h2><p>Choose a branch from the list to inspect it</p>`
        )
      );
      return;
    }

    const head = el("div", "detail-head");
    const titleRow = el("div", "branch-detail");
    titleRow.append(el("h3", null, esc(b.name)));
    if (b.current) titleRow.append(el("span", "pill green", "current"));
    if (b.remote) titleRow.append(el("span", "pill", "remote"));
    if (b.gone) titleRow.append(el("span", "pill red", "gone"));
    if (b.ahead) titleRow.append(el("span", "pill green", "\u2191" + b.ahead));
    if (b.behind) titleRow.append(el("span", "pill yellow", "\u2193" + b.behind));
    head.append(titleRow);

    const body = el("div", "detail-body");
    const kv = el("div", "kv");
    kv.append(el("span", "k", "Name"), el("span", "v", esc(b.name)));
    kv.append(el("span", "k", "Hash"), el("span", "v hash", esc(dash(b.hash))));
    kv.append(el("span", "k", "Author"), authorCell(b));
    kv.append(el("span", "k", "Date"), el("span", "v", esc(dash(fmtDate(b.date) || b.date))));
    kv.append(el("span", "k", "Subject"), el("span", "v", esc(dash(b.subject))));
    kv.append(el("span", "k", "Upstream"), upstreamCell(b));
    body.append(kv);

    const actions = el("div", "row-actions");
    actions.style.marginTop = "16px";
    appendActions(actions, b);
    body.append(actions);

    panel.replaceChildren(head, body);
  }

  function authorCell(b) {
    const v = el("span", "v");
    if (!b.author) {
      v.textContent = "\u2014";
      return v;
    }
    const av = el("span", "avatar", esc(initials(b.author)));
    av.style.cssText =
      "width:18px;height:18px;font-size:9px;display:inline-grid;margin-right:8px;vertical-align:middle;background:hsl(" +
      hueFor(b.author) +
      " 55% 45%)";
    v.append(av, document.createTextNode(b.author));
    return v;
  }

  function upstreamCell(b) {
    const v = el("span", "v");
    if (!b.upstream) {
      v.textContent = "no upstream";
      return v;
    }
    v.append(document.createTextNode(b.upstream));
    if (b.gone) {
      v.append(document.createTextNode(" "));
      v.append(el("span", "pill red", "gone"));
    }
    return v;
  }

  function appendActions(actions, b) {
    if (!b.current) {
      actions.append(button("Checkout", "btn btn-sm btn-primary", () => checkoutBranch(b)));
    }
    if (!b.remote) {
      actions.append(button("Push", "btn btn-sm", () => pushBranch(b)));
      actions.append(button("Set upstream", "btn btn-sm", () => setUpstream(b)));
      actions.append(button("Rename", "btn btn-sm", () => renameBranch(b)));
    } else {
      actions.append(button("Create from here", "btn btn-sm", () => createBranch(b.name)));
    }
    if (!b.current) {
      actions.append(button("Merge", "btn btn-sm", () => mergeBranch(b)));
      actions.append(button("Rebase onto", "btn btn-sm", () => rebaseOnto(b)));
    }
    if (!isMainBranch(b)) {
      actions.append(button("Squash merge to main", "btn btn-sm", () => squashMergeToMain(b)));
    }
    if (b.current) return;
    if (b.remote) {
      actions.append(button("Delete local ref", "btn btn-sm btn-danger", () => deleteBranch(b, false)));
      actions.append(button("Delete on remote", "btn btn-sm btn-danger", () => deleteBranch(b, true)));
    } else {
      actions.append(button("Delete", "btn btn-sm btn-danger", () => deleteBranch(b, false)));
    }
  }

  async function runAction(body, okMsg, opts) {
    if (busy) return false;
    busy = true;
    try {
      await apiPost("/api/branches", body);
      if (opts && opts.select) selectedName = opts.select;
      if (opts && opts.clear) selectedName = "";
      toast(okMsg);
      await window.TabRenderers.branches();
      return true;
    } catch (err) {
      toast(err.message || "action failed", true);
      return false;
    } finally {
      busy = false;
    }
  }

  async function checkoutBranch(b) {
    await runAction({ action: "checkout", name: b.name }, `Checked out ${b.name}`, { select: b.name });
  }

  async function createBranch(startHint) {
    const cur = currentBranch();
    const startDefault = startHint || (selectedName && selectedName !== (cur && cur.name) ? selectedName : "");
    const fields = await promptFields(
      "Create branch",
      [
        { name: "name", label: "Branch name", required: true, placeholder: "feature/my-branch" },
        {
          name: "start",
          label: "Start point (optional)",
          placeholder: cur ? cur.name : "HEAD",
          value: startDefault,
        },
      ],
      { confirmLabel: "Create" }
    );
    if (!fields) return;
    const name = String(fields.name || "").trim();
    if (!name) {
      toast("Branch name is required", true);
      return;
    }
    const start = String(fields.start || "").trim();
    const body = { action: "create", name };
    if (start) body.start = start;
    await runAction(body, `Created ${name}`, { select: name });
  }

  async function renameBranch(b) {
    const fields = await promptFields(
      "Rename branch",
      [{ name: "newName", label: "New name", required: true, value: b.name }],
      { confirmLabel: "Rename" }
    );
    if (!fields) return;
    const newName = String(fields.newName || "").trim();
    if (!newName) {
      toast("New name is required", true);
      return;
    }
    if (newName === b.name) return;
    await runAction({ action: "rename", name: b.name, newName }, `Renamed to ${newName}`, { select: newName });
  }

  async function setUpstream(b) {
    const fields = await promptFields(
      "Set upstream",
      [
        {
          name: "upstream",
          label: "Upstream",
          required: true,
          value: b.upstream || "origin/" + b.name,
          placeholder: "origin/" + b.name,
        },
      ],
      { confirmLabel: "Set upstream" }
    );
    if (!fields) return;
    const upstream = String(fields.upstream || "").trim();
    if (!upstream) {
      toast("Upstream is required", true);
      return;
    }
    await runAction(
      { action: "set-upstream", name: b.name, upstream },
      `Upstream of ${b.name} set to ${upstream}`
    );
  }

  async function pushBranch(b, remote) {
    const body = { action: "push", name: b.name };
    if (remote) body.remote = remote;
    await runAction(body, `Pushed ${b.name}` + (remote ? ` to ${remote}` : ""));
  }

  async function pushCurrent() {
    const cur = currentBranch();
    if (!cur) {
      toast("No current branch to push (detached HEAD?)", true);
      return;
    }
    await pushBranch(cur);
  }

  async function mergeBranch(b) {
    const cur = currentBranch();
    const into = cur ? cur.name : "the current branch";
    const ok = await confirmAction(
      "Merge branch",
      `Merge ${b.name} into ${into}?`,
      { confirmLabel: "Merge" }
    );
    if (!ok) return;
    await runAction({ action: "merge", name: b.name }, `Merged ${b.name} into ${into}`);
  }

  async function squashMergeToMain(b) {
    const ok = await confirmAction(
      "Squash merge to main",
      `Checkout main, squash ${b.name} into it, and commit? Working tree must be clean.`,
      { confirmLabel: "Squash merge" }
    );
    if (!ok) return;
    await runAction(
      { action: "squash-merge-main", name: b.name },
      `Squash-merged ${b.name} into main`,
      { select: "main" }
    );
  }

  async function rebaseOnto(b) {
    const cur = currentBranch();
    const onto = b.name;
    const ok = await confirmAction(
      "Rebase branch",
      `Rebase ${cur ? cur.name : "the current branch"} onto ${onto}? This rewrites commits.`,
      { danger: true, confirmLabel: "Rebase" }
    );
    if (!ok) return;
    await runAction({ action: "rebase", name: b.name }, `Rebased onto ${onto}`);
  }

  async function deleteBranch(b, onRemote) {
    if (onRemote) {
      const { remote, branch } = splitRemoteName(b.name);
      const rem = remote || "origin";
      const ok = await confirmAction(
        "Delete on remote",
        `Delete ${branch} from remote ${rem}? This cannot be undone.`,
        { danger: true, confirmLabel: "Delete on remote" }
      );
      if (!ok) return;
      await runAction(
        { action: "delete", name: branch, remote: rem },
        `Deleted ${branch} from ${rem}`,
        { clear: selectedName === b.name }
      );
      return;
    }

    const kind = b.remote ? "remote-tracking ref" : "local branch";
    const ok = await confirmAction(
      "Delete " + kind,
      `Delete ${kind} ${b.name}?` + (b.remote ? " This only removes the local remote-tracking ref." : ""),
      { danger: true, confirmLabel: "Delete" }
    );
    if (!ok) return;

    if (busy) return;
    busy = true;
    try {
      await apiPost("/api/branches", { action: "delete", name: b.name });
    } catch (err) {
      busy = false;
      const msg = err.message || "delete failed";
      if (/not fully merged|not merged/i.test(msg)) {
        const force = await confirmAction(
          "Force delete?",
          `${msg}\n\nForce-delete ${b.name}? Unmerged commits may become unreachable.`,
          { danger: true, confirmLabel: "Force delete" }
        );
        if (!force) {
          toast(msg, true);
          return;
        }
        await runAction(
          { action: "delete", name: b.name, force: true },
          `Force-deleted ${b.name}`,
          { clear: selectedName === b.name }
        );
        return;
      }
      toast(msg, true);
      return;
    }
    if (selectedName === b.name) selectedName = "";
    toast(`Deleted ${b.name}`);
    busy = false;
    await window.TabRenderers.branches();
  }
})();
