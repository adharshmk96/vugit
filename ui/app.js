"use strict";

const content = document.getElementById("content");
const tabsEl = document.getElementById("tabs");
let activeTab = "home";

/* ---------- helpers ---------- */
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
const hueFor = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
};

/* ---------- tab routing ---------- */
tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  [...tabsEl.children].forEach((t) => t.classList.toggle("is-active", t === btn));
  render();
});

document.getElementById("refresh-btn").addEventListener("click", render);
document.addEventListener("keydown", (e) => {
  if (e.key === "r" && !e.metaKey && !e.ctrlKey && e.target === document.body) render();
});

async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "request failed");
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "request failed");
  return data;
}

function openDialog(html) {
  const d = document.getElementById("vu-dialog");
  d.innerHTML = html;
  if (!d.open) d.showModal();
  return d;
}

function closeDialog() {
  const d = document.getElementById("vu-dialog");
  d.close();
  d.innerHTML = "";
}

function confirmAction(title, message, { danger = false, confirmLabel = "Confirm" } = {}) {
  return new Promise((resolve) => {
    const d = openDialog(`
      <form method="dialog" class="dlg">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="dlg-actions">
          <button value="cancel" class="btn" type="submit" formnovalidate>Cancel</button>
          <button value="ok" class="btn ${danger ? "btn-danger" : "btn-primary"}" type="submit">${esc(confirmLabel)}</button>
        </div>
      </form>`);
    d.addEventListener(
      "close",
      () => {
        resolve(d.returnValue === "ok");
        d.innerHTML = "";
      },
      { once: true }
    );
  });
}

function promptFields(title, fields, { confirmLabel = "OK", danger = false } = {}) {
  // fields: [{name, label, type, value, placeholder, required, options:[]}]
  return new Promise((resolve) => {
    const inputs = fields
      .map((f) => {
        const req = f.required ? "required" : "";
        if (f.type === "select") {
          const opts = (f.options || [])
            .map((o) => {
              const v = typeof o === "string" ? o : o.value;
              const l = typeof o === "string" ? o : o.label;
              return `<option value="${esc(v)}" ${v === f.value ? "selected" : ""}>${esc(l)}</option>`;
            })
            .join("");
          return `<label class="dlg-field"><span>${esc(f.label)}</span><select name="${esc(f.name)}" class="input" ${req}>${opts}</select></label>`;
        }
        if (f.type === "textarea") {
          return `<label class="dlg-field"><span>${esc(f.label)}</span><textarea name="${esc(f.name)}" class="input" rows="4" ${req} placeholder="${esc(
            f.placeholder || ""
          )}">${esc(f.value || "")}</textarea></label>`;
        }
        if (f.type === "checkbox") {
          return `<label class="dlg-check"><input type="checkbox" name="${esc(f.name)}" ${f.value ? "checked" : ""}/> ${esc(f.label)}</label>`;
        }
        return `<label class="dlg-field"><span>${esc(f.label)}</span><input class="input" name="${esc(f.name)}" type="${esc(
          f.type || "text"
        )}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}" ${req} /></label>`;
      })
      .join("");
    const d = openDialog(`
      <form method="dialog" class="dlg">
        <h3>${esc(title)}</h3>
        ${inputs}
        <div class="dlg-actions">
          <button value="cancel" class="btn" type="submit" formnovalidate>Cancel</button>
          <button value="ok" class="btn ${danger ? "btn-danger" : "btn-primary"}" type="submit">${esc(confirmLabel)}</button>
        </div>
      </form>`);
    const form = d.querySelector("form");
    form.addEventListener("submit", (e) => {
      if (d.returnValue === "cancel" || e.submitter?.value === "cancel") return;
      const fd = new FormData(form);
      const out = {};
      for (const f of fields) {
        if (f.type === "checkbox") out[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
        else out[f.name] = fd.get(f.name);
      }
      d._result = out;
    });
    d.addEventListener(
      "close",
      () => {
        const ok = d.returnValue === "ok";
        const result = ok ? d._result || {} : null;
        d.innerHTML = "";
        resolve(result);
      },
      { once: true }
    );
  });
}

window.vu = {
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
  refBadges,
  render,
};

window.TabRenderers = window.TabRenderers || {};

/* ---------- render dispatch ---------- */
function render() {
  content.classList.toggle("wide", !["home", "settings"].includes(activeTab));
  if (activeTab === "home") return renderHome();
  if (activeTab === "settings") return renderSettings();
  const fn = window.TabRenderers[activeTab];
  if (typeof fn === "function") return fn();
  const labels = {
    branches: ["\u{1F33F}", "Branches", "checkout, create, merge, rebase, delete"],
    commits: ["\u{1F4DC}", "Commits", "graph log, diff viewer, cherry-pick, revert, reset"],
    changes: ["✏️", "Changes", "stage hunks, diff, commit, amend, discard"],
    tags: ["\u{1F3F7}️", "Tags", "create annotated/signed tags, delete, push"],
    remotes: ["\u{1F310}", "Remotes", "add, fetch, prune, pull, push"],
    stashes: ["\u{1F4E6}", "Stashes", "apply, pop, drop, branch from stash"],
    reflog: ["\u{1F504}", "Reflog", "HEAD history, reset to entry"],
    submodules: ["\u{1F4E6}", "Submodules", "status, update, sync"],
  };
  const [ico, title, sub] = labels[activeTab] || ["", activeTab, ""];
  content.replaceChildren(
    el("div", "placeholder", `<div class="ico">${ico}</div><h2>${title}</h2><p>${esc(sub)}</p>`)
  );
}

/* ---------- topbar ---------- */
function setTopbar(repo) {
  document.getElementById("repo-name").textContent = repo.name || "—";
  document.getElementById("branch-name").textContent = repo.branch || "—";
  const sync = document.getElementById("sync-pill");
  if (repo.detached) {
    sync.hidden = false;
    sync.innerHTML = `<span>detached HEAD</span>`;
  } else if (repo.ahead || repo.behind) {
    sync.hidden = false;
    sync.innerHTML =
      (repo.ahead ? `<span class="ahead">↑${repo.ahead}</span>` : "") +
      (repo.behind ? `<span class="behind">↓${repo.behind}</span>` : "");
  } else {
    sync.hidden = true;
  }
}

/* ---------- home ---------- */
function skeletonHome() {
  const frag = document.createDocumentFragment();
  const row = el("div", "stat-row");
  for (let i = 0; i < 6; i++) row.append(el("div", "stat skeleton", "&nbsp;"));
  frag.append(row);
  const grid = el("div", "grid");
  const l = el("div", "col"),
    r = el("div", "col");
  l.append(el("div", "card skeleton sk-card"), el("div", "card skeleton sk-card"));
  r.append(el("div", "card skeleton sk-card"));
  grid.append(l, r);
  frag.append(grid);
  content.replaceChildren(frag);
}

async function renderHome() {
  skeletonHome();
  let data;
  try {
    const res = await fetch("/api/overview");
    data = await res.json();
    if (!res.ok) throw new Error(data.error || "request failed");
  } catch (err) {
    content.replaceChildren(
      el(
        "div",
        "notice",
        `<h2>Can't load repository</h2><p>${esc(err.message)}</p>`
      )
    );
    return;
  }

  setTopbar(data.repo);

  const frag = document.createDocumentFragment();
  frag.append(statRow(data.stats));

  const grid = el("div", "grid");
  const left = el("div", "col");
  left.append(currentBranchCard(data.repo), workingTreeCard(data.status));
  const right = el("div", "col");
  right.append(commitsCard(data.commits), remotesCard(data.remotes), stashesCard(data.stashes));
  grid.append(left, right);
  frag.append(grid);

  content.replaceChildren(frag);
}

function statRow(s) {
  const items = [
    [s.commits, "commits"],
    [s.localBranches, "branches"],
    [s.remoteBranches, "remote"],
    [s.tags, "tags"],
    [s.stashes, "stashes"],
    [s.contributors, "authors"],
  ];
  const row = el("div", "stat-row");
  for (const [v, label] of items) {
    row.append(
      el("div", "stat", `<div class="stat-value">${v ?? 0}</div><div class="stat-label">${label}</div>`)
    );
  }
  return row;
}

function currentBranchCard(repo) {
  const card = el("div", "card");
  card.append(el("div", "card-head", `<h3>Current branch</h3><span class="count">${esc(repo.head || "")}</span>`));
  const body = el("div", "card-body");

  const detail = el("div", "branch-detail");
  detail.append(el("span", "big", esc(repo.branch)));
  if (repo.upstream) detail.append(el("span", "up", "→ " + esc(repo.upstream)));
  else if (!repo.detached) detail.append(el("span", "up", "no upstream set"));
  body.append(detail);

  if (repo.detached) {
    body.append(el("div", "in-sync", `<span>⚠️ Detached HEAD — not on a branch</span>`));
  } else if (repo.ahead || repo.behind) {
    const d = el("div", "divergence");
    if (repo.ahead)
      d.append(
        el("div", "diverge-item ahead", `<span class="n">↑${repo.ahead}</span><span class="lbl">to push</span>`)
      );
    if (repo.behind)
      d.append(
        el("div", "diverge-item behind", `<span class="n">↓${repo.behind}</span><span class="lbl">to pull</span>`)
      );
    body.append(d);
  } else if (repo.upstream) {
    body.append(el("div", "in-sync", `<span>✓ Up to date with ${esc(repo.upstream)}</span>`));
  }

  card.append(body);
  return card;
}

function workingTreeCard(st) {
  st = st || {};
  for (const k of ["staged", "unstaged", "untracked", "conflicted"]) st[k] = st[k] || [];
  const total =
    st.staged.length + st.unstaged.length + st.untracked.length + st.conflicted.length;
  const card = el("div", "card");
  card.append(el("div", "card-head", `<h3>Working tree</h3><span class="count">${total} changed</span>`));

  if (st.clean) {
    card.append(
      el(
        "div",
        "empty-state",
        `<span class="ico">✨</span><span>Working tree clean</span>`
      )
    );
    return card;
  }

  const groups = el("div", "wt-groups");
  const spec = [
    ["staged", "Staged", st.staged],
    ["unstaged", "Unstaged", st.unstaged],
    ["untracked", "Untracked", st.untracked],
    ["conflicted", "Conflicted", st.conflicted],
  ];
  for (const [key, title, list] of spec) {
    if (!list.length) continue;
    const g = el("div", "wt-group");
    g.append(
      el(
        "div",
        "wt-group-head",
        `<span class="dot ${key}"></span><span>${title}</span><span class="g-count">${list.length}</span>`
      )
    );
    for (const f of list.slice(0, 8)) {
      g.append(
        el(
          "div",
          "file-row",
          `<span class="code">${esc(f.code)}</span><span class="fname">${esc(f.path)}</span><span class="tag">${esc(
            f.status
          )}</span>`
        )
      );
    }
    if (list.length > 8)
      g.append(el("div", "file-row", `<span class="code"></span><span class="fname">+${list.length - 8} more</span>`));
    groups.append(g);
  }
  const body = el("div", "card-body flush");
  body.append(groups);
  card.append(body);
  return card;
}

function commitsCard(commits) {
  const card = el("div", "card");
  card.append(
    el("div", "card-head", `<h3>Recent commits</h3><span class="count">${(commits || []).length}</span>`)
  );
  if (!commits || !commits.length) {
    card.append(el("div", "empty-state", `<span class="ico">\u{1F55B}</span><span>No commits yet</span>`));
    return card;
  }
  const list = el("div", "commit-list");
  for (const c of commits) {
    const row = el("div", "commit");
    const av = el("div", "avatar", esc(initials(c.author)));
    av.style.background = `hsl(${hueFor(c.email || c.author)} 55% 45%)`;

    const main = el("div", "commit-main");
    main.append(el("div", "commit-subject", esc(c.subject)));
    const meta = el("div", "commit-meta");
    meta.append(el("span", "hash", esc(c.short)));
    meta.append(el("span", null, esc(c.author)));
    if (c.refs) meta.append(refBadges(c.refs));
    main.append(meta);

    row.append(av, main, el("div", "commit-date", esc(c.relDate)));
    list.append(row);
  }
  const body = el("div", "card-body flush");
  body.append(list);
  card.append(body);
  return card;
}

function refBadges(refs) {
  const wrap = el("span", "ref-badges");
  for (let r of refs.split(",").map((s) => s.trim()).filter(Boolean)) {
    let cls = "ref-badge";
    if (r.startsWith("HEAD")) {
      cls += " head";
      r = r.replace("HEAD -> ", "");
    } else if (r.startsWith("tag: ")) {
      cls += " tag";
      r = r.slice(5);
    } else if (r.includes("/")) {
      cls += " remote";
    }
    wrap.append(el("span", cls, esc(r)));
  }
  return wrap;
}

function remotesCard(remotes) {
  const card = el("div", "card");
  card.append(
    el("div", "card-head", `<h3>Remotes</h3><span class="count">${(remotes || []).length}</span>`)
  );
  if (!remotes || !remotes.length) {
    card.append(el("div", "empty-state", `<span class="ico">\u{1F310}</span><span>No remotes configured</span>`));
    return card;
  }
  const list = el("div", "line-list");
  for (const r of remotes) {
    list.append(
      el(
        "div",
        "line-item",
        `<span class="name">${esc(r.name)}</span><span class="sub">${esc(r.url)}</span>`
      )
    );
  }
  const body = el("div", "card-body flush");
  body.append(list);
  card.append(body);
  return card;
}

function stashesCard(stashes) {
  const card = el("div", "card");
  card.append(
    el("div", "card-head", `<h3>Stashes</h3><span class="count">${(stashes || []).length}</span>`)
  );
  if (!stashes || !stashes.length) {
    card.append(el("div", "empty-state", `<span class="ico">\u{1F4E6}</span><span>No stashes</span>`));
    return card;
  }
  const list = el("div", "line-list");
  for (const s of stashes) {
    list.append(
      el(
        "div",
        "line-item",
        `<span class="name">${esc(s.ref)}</span><span class="sub">${esc(s.message)}</span><span class="badge">${esc(
          s.branch || ""
        )}</span>`
      )
    );
  }
  const body = el("div", "card-body flush");
  body.append(list);
  card.append(body);
  return card;
}

/* ---------- settings ---------- */
let settingsData = null;
const settingsEdits = new Map(); // "key scope" -> new value

const editKey = (key, scope) => key + " " + scope;
const normBool = (v) => {
  v = String(v || "").toLowerCase();
  if (["true", "yes", "on", "1"].includes(v)) return "true";
  if (["false", "no", "off", "0"].includes(v)) return "false";
  return "";
};

function origValue(key, scope) {
  const v = settingsData.values[key.toLowerCase()] || {};
  return v[scope] || "";
}
function curValue(key, scope) {
  const k = editKey(key.toLowerCase(), scope);
  return settingsEdits.has(k) ? settingsEdits.get(k) : origValue(key, scope);
}

async function renderSettings() {
  content.replaceChildren(el("div", "placeholder", `<div class="ico">⚙️</div><h2>Loading settings…</h2>`));
  try {
    const res = await fetch("/api/settings");
    settingsData = await res.json();
    if (!res.ok) throw new Error(settingsData.error || "request failed");
  } catch (err) {
    content.replaceChildren(el("div", "notice", `<h2>Can't load settings</h2><p>${esc(err.message)}</p>`));
    return;
  }
  settingsEdits.clear();

  const frag = document.createDocumentFragment();

  const intro = el("div", "settings-intro");
  intro.innerHTML = settingsData.inRepo
    ? `Editing <strong>global</strong> config and <strong>local</strong> config for <code>${esc(
        settingsData.repoPath
      )}</code>. Local overrides global.`
    : `Not inside a git repository — only <strong>global</strong> config can be edited.`;
  frag.append(intro);

  for (const group of settingsData.groups) {
    const card = el("div", "card settings-card");
    card.append(el("div", "card-head", `<h3>${esc(group.name)}</h3>`));
    const body = el("div", "card-body flush");

    body.append(
      el(
        "div",
        "setting-row setting-row--head",
        `<span></span><span class="scope-h">Global</span><span class="scope-h">Local</span>`
      )
    );

    for (const def of group.settings) body.append(settingRow(def));
    card.append(body);
    frag.append(card);
  }

  const bar = el("div", "settings-bar", `<span class="dirty-count"></span>`);
  const discard = el("button", "btn", "Discard");
  const save = el("button", "btn btn-primary", "Save changes");
  discard.addEventListener("click", renderSettings);
  save.addEventListener("click", () => saveSettings(save));
  bar.append(discard, save);
  frag.append(bar);

  content.replaceChildren(frag);
  refreshDirtyUI();
}

function settingRow(def) {
  const row = el("div", "setting-row");
  const info = el("div", "setting-info");
  info.append(el("div", "setting-label", esc(def.label)));
  info.append(el("div", "setting-desc", esc(def.desc)));
  info.append(el("code", "setting-key", esc(def.key)));
  row.append(info);

  for (const scope of ["global", "local"]) {
    const disabled = scope === "local" && !settingsData.inRepo;
    row.append(scopeControl(def, scope, disabled));
  }
  return row;
}

function scopeControl(def, scope, disabled) {
  const cell = el("div", "scope-cell");
  cell.dataset.key = def.key.toLowerCase();
  cell.dataset.scope = scope;
  const val = curValue(def.key, scope);

  const commit = (newVal) => {
    const k = editKey(def.key.toLowerCase(), scope);
    if (newVal === origValue(def.key, scope)) settingsEdits.delete(k);
    else settingsEdits.set(k, newVal);
    refreshDirtyUI();
  };

  if (def.type === "bool") {
    const seg = el("div", "seg");
    for (const [lbl, v] of [["Unset", ""], ["On", "true"], ["Off", "false"]]) {
      const b = el("button", "seg-btn", lbl);
      b.type = "button";
      b.dataset.v = v;
      if (normBool(val) === v && !(v === "" && val)) b.classList.add("on");
      if (disabled) b.disabled = true;
      b.addEventListener("click", () => {
        [...seg.children].forEach((c) => c.classList.toggle("on", c === b));
        commit(v);
      });
      seg.append(b);
    }
    cell.append(seg);
  } else if (def.type === "select") {
    const sel = el("select", "input");
    sel.append(new Option("— not set —", ""));
    for (const opt of def.options) sel.append(new Option(opt, opt));
    if (val && ![...sel.options].some((o) => o.value === val)) sel.append(new Option(val + " (custom)", val));
    sel.value = val;
    sel.disabled = disabled;
    sel.addEventListener("change", () => commit(sel.value));
    cell.append(sel);
  } else {
    const inp = el("input", "input");
    inp.type = "text";
    inp.value = val;
    inp.placeholder = disabled ? "" : def.placeholder || "";
    inp.disabled = disabled;
    inp.addEventListener("input", () => commit(inp.value.trim()));
    cell.append(inp);
  }
  return cell;
}

function refreshDirtyUI() {
  const cells = content.querySelectorAll(".scope-cell");
  const byKey = {};
  cells.forEach((c) => {
    (byKey[c.dataset.key] ||= []).push(c);
    const k = editKey(c.dataset.key, c.dataset.scope);
    c.classList.toggle("is-dirty", settingsEdits.has(k));
  });
  for (const key in byKey) {
    const local = curValue(key, "local");
    const global = curValue(key, "global");
    const effScope = local ? "local" : global ? "global" : null;
    byKey[key].forEach((c) => c.classList.toggle("is-effective", c.dataset.scope === effScope));
  }

  const bar = content.querySelector(".settings-bar");
  if (!bar) return;
  const n = settingsEdits.size;
  bar.classList.toggle("show", n > 0);
  bar.querySelector(".dirty-count").textContent = n === 1 ? "1 unsaved change" : `${n} unsaved changes`;
}

async function saveSettings(btn) {
  const changes = [];
  for (const [k, value] of settingsEdits) {
    const [key, scope] = k.split(" ");
    changes.push({ key, scope, value });
  }
  if (!changes.length) return;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "save failed");
    settingsData = data;
    settingsEdits.clear();
    renderSettings();
    toast(`Applied ${changes.length} change${changes.length === 1 ? "" : "s"} via git config`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Save changes";
    toast("Error: " + err.message, true);
  }
}

function toast(msg, isError) {
  const t = el("div", "toast" + (isError ? " toast--error" : ""), esc(msg));
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

render();
