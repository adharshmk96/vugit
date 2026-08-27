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

/* ---------- render dispatch ---------- */
function render() {
  if (activeTab === "home") return renderHome();
  const labels = {
    branches: ["\u{1F33F}", "Branches", "checkout, create, merge, rebase, delete — coming next"],
    commits: ["\u{1F4DC}", "Commits", "graph log, diff viewer, cherry-pick, revert, reset"],
    changes: ["✏️", "Changes", "stage hunks, diff, commit, amend, discard"],
    tags: ["\u{1F3F7}️", "Tags", "create annotated/signed tags, delete, push"],
    remotes: ["\u{1F310}", "Remotes", "add, fetch, prune, pull, push"],
    stashes: ["\u{1F4E6}", "Stashes", "apply, pop, drop, branch from stash"],
    settings: ["⚙️", "Settings", "repo & global config, user identity, aliases"],
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

render();
