"use strict";

(() => {
  const state = {
    branch: "",
    author: "",
    path: "",
    selected: "",
  };

  function vu() {
    return window.vu;
  }

  function layoutGraph(commits) {
    const layout = new Map();
    let lanes = [];

    for (const c of commits) {
      const parents = (c.parents || []).filter(Boolean);
      let col = lanes.indexOf(c.hash);
      if (col < 0) {
        col = lanes.indexOf(null);
        if (col < 0) {
          col = lanes.length;
          lanes.push(c.hash);
        } else {
          lanes[col] = c.hash;
        }
      }

      const before = lanes.slice();
      const next = lanes.slice();
      const first = parents[0] || null;
      next[col] = first;

      if (first) {
        const dup = next.findIndex((h, i) => i !== col && h === first);
        if (dup >= 0) next[col] = null;
      }

      for (let i = 1; i < parents.length; i++) {
        const p = parents[i];
        if (next.indexOf(p) >= 0) continue;
        const hole = next.indexOf(null);
        if (hole >= 0) next[hole] = p;
        else next.push(p);
      }

      const parentCols = [];
      for (const p of parents) {
        let dest = next.indexOf(p);
        if (dest < 0) dest = before.indexOf(p);
        if (dest >= 0) parentCols.push(dest);
      }

      const n = Math.max(before.length, next.length, col + 1, 1);
      const top = [];
      const bot = [];
      for (let i = 0; i < n; i++) {
        top.push(i === col ? "*" : before[i] ? "|" : " ");
        bot.push(" ");
      }
      for (let i = 0; i < n; i++) {
        if (i !== col && before[i] && next[i] && before[i] === next[i]) bot[i] = "|";
      }
      for (const dest of parentCols) {
        if (dest === col) {
          bot[col] = "|";
          continue;
        }
        const ch = dest > col ? "\\" : "/";
        const step = dest > col ? 1 : -1;
        if (bot[col] === " ") bot[col] = ch;
        for (let i = col + step; i !== dest; i += step) {
          if (i < 0 || i >= n) break;
          if (bot[i] === " ") bot[i] = ch;
        }
        if (dest >= 0 && dest < n && bot[dest] === " ") bot[dest] = ch;
      }

      layout.set(c.hash, { col, ascii: top.join(" ") + "\n" + bot.join(" ") });
      lanes = next;
      while (lanes.length && lanes[lanes.length - 1] == null) lanes.pop();
    }
    return layout;
  }

  function renderDiff(diff, esc, el) {
    const view = el("div", "diff-view");
    view.style.maxHeight = "min(70vh, 720px)";
    if (!diff || !String(diff).trim()) {
      view.append(el("div", "diff-meta", "No diff for this commit."));
      return view;
    }

    let oldLn = 0;
    let newLn = 0;
    const lines = String(diff).replace(/\r\n/g, "\n").split("\n");
    for (const raw of lines) {
      const line = raw;
      if (line.startsWith("@@")) {
        const m = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)/);
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
        line.startsWith("+++") ||
        line.startsWith("---") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode") ||
        line.startsWith("similarity index") ||
        line.startsWith("rename from") ||
        line.startsWith("rename to") ||
        line.startsWith("copy from") ||
        line.startsWith("copy to") ||
        line.startsWith("Binary files") ||
        line.startsWith("\\")
      ) {
        view.append(el("div", "diff-meta", esc(line)));
        continue;
      }
      if (line.startsWith("+")) {
        const row = el("div", "diff-line diff-add");
        row.append(el("span", "ln", ""), el("span", "ln", String(newLn++)), el("span", "code", esc(line)));
        view.append(row);
        continue;
      }
      if (line.startsWith("-")) {
        const row = el("div", "diff-line diff-del");
        row.append(el("span", "ln", String(oldLn++)), el("span", "ln", ""), el("span", "code", esc(line)));
        view.append(row);
        continue;
      }
      const row = el("div", "diff-line");
      row.append(
        el("span", "ln", oldLn > 0 ? String(oldLn++) : ""),
        el("span", "ln", newLn > 0 ? String(newLn++) : ""),
        el("span", "code", esc(line))
      );
      view.append(row);
    }
    return view;
  }

  async function copyText(text) {
    const value = String(text || "");
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy failed");
    }
  }

  function kvRow(el, k, vNode) {
    const wrap = document.createDocumentFragment();
    wrap.append(el("div", "k", k), vNode);
    return wrap;
  }

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.commits = async function renderCommits() {
    const { el, esc, toast, apiGet, apiPost, confirmAction, promptFields, setTopbar, content, initials, hueFor, refBadges } =
      vu();

    content.classList.add("wide");

    apiGet("/api/overview")
      .then((data) => {
        if (data && data.repo) setTopbar(data.repo);
      })
      .catch(() => {});

    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">\u{1F4DC}</div><h2>Loading commits\u2026</h2>`)
    );

    let data;
    try {
      const q = new URLSearchParams({ max: "200" });
      if (state.branch) q.set("branch", state.branch);
      if (state.author) q.set("author", state.author);
      if (state.path) q.set("path", state.path);
      data = await apiGet("/api/commits?" + q.toString());
    } catch (err) {
      content.replaceChildren(
        el("div", "notice", `<h2>Can't load commits</h2><p>${esc(err.message)}</p>`)
      );
      return;
    }

    const commits = data.commits || [];
    const graph = layoutGraph(commits);

    if (state.selected && !commits.some((c) => c.hash === state.selected || c.short === state.selected)) {
      state.selected = "";
    }
    if (!state.selected && commits.length) {
      const head = commits.find((c) => c.isHead) || commits[0];
      state.selected = head.hash;
    }

    const frag = document.createDocumentFragment();

    const form = el("form", "toolbar");
    const branchInp = el("input", "input search");
    branchInp.type = "text";
    branchInp.name = "branch";
    branchInp.placeholder = "Branch";
    branchInp.value = state.branch;
    branchInp.setAttribute("aria-label", "Branch");

    const authorInp = el("input", "input search");
    authorInp.type = "text";
    authorInp.name = "author";
    authorInp.placeholder = "Author";
    authorInp.value = state.author;
    authorInp.setAttribute("aria-label", "Author");

    const pathInp = el("input", "input search");
    pathInp.type = "text";
    pathInp.name = "path";
    pathInp.placeholder = "Path";
    pathInp.value = state.path;
    pathInp.setAttribute("aria-label", "Path");

    const applyBtn = el("button", "btn btn-primary", "Apply");
    applyBtn.type = "submit";

    const count = el("span", "count", `${commits.length} commit${commits.length === 1 ? "" : "s"}`);
    form.append(branchInp, authorInp, pathInp, applyBtn, el("span", "spacer"), count);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      state.branch = branchInp.value.trim();
      state.author = authorInp.value.trim();
      state.path = pathInp.value.trim();
      renderCommits();
    });
    frag.append(form);

    const split = el("div", "split split-wide");
    const listPanel = el("div", "list-panel");
    const listScroll = el("div", "list-scroll");

    if (!commits.length) {
      listScroll.append(
        el("div", "empty-state", `<span class="ico">\u{1F55B}</span><span>No commits match these filters</span>`)
      );
    }

    for (const c of commits) {
      const active = c.hash === state.selected;
      const row = el("div", "graph-row" + (active ? " is-active" : "") + (c.isHead ? " is-head" : ""));
      row.dataset.hash = c.hash;

      const lanes = el("div", "graph-lanes");
      const info = graph.get(c.hash);
      lanes.textContent = info ? info.ascii : "*";

      const av = el("div", "avatar", esc(initials(c.author)));
      av.style.background = `hsl(${hueFor(c.email || c.author || "")} 55% 45%)`;
      av.title = (c.author || "?") + (c.email ? " <" + c.email + ">" : "");

      const main = el("div", "commit-main");
      main.append(el("div", "commit-subject", esc(c.subject || "(no subject)")));
      const meta = el("div", "commit-meta");
      meta.append(el("span", "hash", esc(c.short || c.hash || "")));
      meta.append(el("span", null, esc(c.author || "")));
      if (c.refs) meta.append(refBadges(c.refs));
      main.append(meta);

      row.append(lanes, av, main, el("div", "commit-date", esc(c.relDate || "")));
      row.addEventListener("click", () => {
        if (state.selected === c.hash) {
          showDetail(c.hash);
          return;
        }
        state.selected = c.hash;
        listScroll.querySelectorAll(".graph-row.is-active").forEach((n) => n.classList.remove("is-active"));
        row.classList.add("is-active");
        showDetail(c.hash);
      });
      listScroll.append(row);
    }

    listPanel.append(listScroll);

    const detailPanel = el("div", "detail-panel");
    split.append(listPanel, detailPanel);
    frag.append(split);
    content.replaceChildren(frag);

    async function runAction(body, successMsg) {
      try {
        await apiPost("/api/commits", body);
        toast(successMsg);
        await renderCommits();
      } catch (err) {
        toast(err.message || "action failed", true);
      }
    }

    function defaultMessage(d) {
      const sub = d.subject || "";
      const body = (d.body || "").trim();
      return body ? sub + "\n\n" + body : sub;
    }

    async function onCheckout(d) {
      const ok = await confirmAction(
        "Checkout commit",
        `Check out ${d.short || d.hash}? This leaves HEAD detached from the current branch.`,
        { confirmLabel: "Checkout" }
      );
      if (!ok) return;
      await runAction({ action: "checkout", hash: d.hash }, "Checked out " + (d.short || d.hash));
    }

    async function onCherryPick(d) {
      const ok = await confirmAction(
        "Cherry-pick",
        `Cherry-pick ${d.short || d.hash} onto the current branch?`,
        { confirmLabel: "Cherry-pick" }
      );
      if (!ok) return;
      await runAction({ action: "cherry-pick", hash: d.hash }, "Cherry-picked " + (d.short || d.hash));
    }

    async function onRevert(d) {
      const ok = await confirmAction(
        "Revert commit",
        `Create a revert of ${d.short || d.hash} on the current branch?`,
        { danger: true, confirmLabel: "Revert" }
      );
      if (!ok) return;
      await runAction({ action: "revert", hash: d.hash }, "Reverted " + (d.short || d.hash));
    }

    async function onReset(d) {
      const fields = await promptFields(
        "Reset to " + (d.short || d.hash),
        [
          {
            name: "mode",
            label: "Reset mode",
            type: "select",
            value: "mixed",
            options: [
              { value: "soft", label: "soft — keep index and worktree" },
              { value: "mixed", label: "mixed — reset index, keep worktree" },
              { value: "hard", label: "hard — discard index and worktree" },
            ],
          },
        ],
        { confirmLabel: "Continue", danger: true }
      );
      if (!fields) return;
      const mode = String(fields.mode || "mixed");
      const hard = mode === "hard";
      const ok = await confirmAction(
        hard ? "Hard reset" : "Reset HEAD",
        hard
          ? `Hard reset to ${d.short || d.hash}? Uncommitted changes in the index and working tree will be discarded. This cannot be undone easily.`
          : `Reset HEAD to ${d.short || d.hash} (${mode})?`,
        { danger: hard, confirmLabel: hard ? "Hard reset" : "Reset" }
      );
      if (!ok) return;
      await runAction(
        { action: "reset", hash: d.hash, mode },
        `Reset (${mode}) to ` + (d.short || d.hash)
      );
    }

    async function onBranch(d) {
      const fields = await promptFields(
        "Branch here",
        [{ name: "name", label: "Branch name", required: true, placeholder: "feature/name" }],
        { confirmLabel: "Create branch" }
      );
      if (!fields || !String(fields.name || "").trim()) return;
      const name = String(fields.name).trim();
      await runAction({ action: "branch", hash: d.hash, name }, "Created branch " + name);
    }

    async function onTag(d) {
      const fields = await promptFields(
        "Tag here",
        [
          { name: "name", label: "Tag name", required: true, placeholder: "v1.0.0" },
          { name: "annotated", label: "Annotated tag", type: "checkbox", value: true },
          { name: "message", label: "Message", type: "textarea", placeholder: "Tag message" },
        ],
        { confirmLabel: "Create tag" }
      );
      if (!fields || !String(fields.name || "").trim()) return;
      const name = String(fields.name).trim();
      const body = {
        action: "tag",
        hash: d.hash,
        name,
        annotated: !!fields.annotated,
      };
      const msg = String(fields.message || "").trim();
      if (msg) body.message = msg;
      await runAction(body, "Created tag " + name);
    }

    async function onUpdateAuthor(d) {
      const fields = await promptFields(
        "Update author",
        [
          { name: "author", label: "Name", required: true, value: d.author || "" },
          { name: "email", label: "Email", type: "email", required: true, value: d.email || "" },
          {
            name: "date",
            label: "Author date (optional)",
            value: d.date || "",
            placeholder: "ISO-8601 date, leave blank to keep",
          },
        ],
        { confirmLabel: "Continue", danger: true }
      );
      if (!fields) return;
      const author = String(fields.author || "").trim();
      const email = String(fields.email || "").trim();
      if (!author || !email) {
        toast("Name and email are required", true);
        return;
      }
      const ok = await confirmAction(
        "Rewrite commit author",
        "Updating the author rewrites git history (amend on HEAD, or filter-branch otherwise). Anyone who already pulled this commit will need to reconcile. Continue?",
        { danger: true, confirmLabel: "Rewrite author" }
      );
      if (!ok) return;
      const body = { action: "update-author", hash: d.hash, author, email };
      const date = String(fields.date || "").trim();
      if (date) body.date = date;
      await runAction(body, "Updated author on " + (d.short || d.hash));
    }

    async function onReword(d) {
      const fields = await promptFields(
        "Reword commit",
        [
          {
            name: "message",
            label: "Commit message",
            type: "textarea",
            required: true,
            value: defaultMessage(d),
          },
        ],
        { confirmLabel: "Reword" }
      );
      if (!fields) return;
      const message = String(fields.message || "").trim();
      if (!message) {
        toast("Message is required", true);
        return;
      }
      await runAction({ action: "reword", hash: d.hash, message }, "Reworded " + (d.short || d.hash));
    }

    async function onCopy(d) {
      try {
        await copyText(d.hash || d.short || "");
        toast("Copied " + (d.hash || d.short));
      } catch (err) {
        toast(err.message || "Copy failed", true);
      }
    }

    function actionBar(d) {
      const bar = el("div", "row-actions");
      const defs = [
        ["Checkout", () => onCheckout(d), ""],
        ["Cherry-pick", () => onCherryPick(d), ""],
        ["Revert", () => onRevert(d), "btn-danger"],
        ["Reset", () => onReset(d), "btn-danger"],
        ["Tag here", () => onTag(d), ""],
        ["Branch here", () => onBranch(d), ""],
        ["Copy hash", () => onCopy(d), ""],
        ["Update author", () => onUpdateAuthor(d), ""],
      ];
      if (d.isHead) defs.push(["Reword", () => onReword(d), ""]);
      for (const [label, fn, extra] of defs) {
        const b = el("button", "btn btn-sm" + (extra ? " " + extra : ""), label);
        b.type = "button";
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          fn();
        });
        bar.append(b);
      }
      return bar;
    }

    function paintDetail(d) {
      const head = el("div", "detail-head");
      head.append(el("h3", null, esc(d.subject || "(no subject)")));
      head.append(actionBar(d));

      const body = el("div", "detail-body");
      const kv = el("div", "kv");

      const hashV = el("div", "v hash", esc(d.hash || ""));
      kv.append(kvRow(el, "Hash", hashV));

      kv.append(kvRow(el, "Author", el("div", "v", esc(d.author || ""))));
      kv.append(kvRow(el, "Email", el("div", "v", esc(d.email || ""))));
      kv.append(kvRow(el, "Date", el("div", "v", esc(d.date || d.relDate || ""))));
      if (d.relDate && d.date) kv.append(kvRow(el, "Relative", el("div", "v", esc(d.relDate))));
      if (d.refs) {
        const refsV = el("div", "v");
        refsV.append(refBadges(d.refs));
        kv.append(kvRow(el, "Refs", refsV));
      }

      const parents = d.parents || [];
      const parentsV = el("div", "v");
      if (!parents.length) {
        parentsV.textContent = "(root commit)";
      } else {
        parents.forEach((p, i) => {
          if (i) parentsV.append(document.createTextNode(" "));
          const b = el("button", "btn btn-sm", esc((p || "").slice(0, 7)));
          b.type = "button";
          b.title = p;
          b.addEventListener("click", () => {
            state.selected = p;
            listScroll.querySelectorAll(".graph-row").forEach((n) => {
              const on = n.dataset.hash === p;
              n.classList.toggle("is-active", on);
              if (on) n.scrollIntoView({ block: "nearest" });
            });
            showDetail(p);
          });
          parentsV.append(b);
        });
      }
      kv.append(kvRow(el, "Parents", parentsV));
      body.append(kv);

      if (d.body) {
        const box = el("div", "commit-box");
        box.append(el("div", "section-title", "Message"));
        box.append(el("div", null, esc(d.body).replace(/\n/g, "<br>")));
        body.append(box);
      }

      const files = d.files || [];
      const filesTitle = el("div", "section-title", `Files (${files.length})`);
      filesTitle.style.marginTop = "18px";
      body.append(filesTitle);
      if (!files.length) {
        body.append(el("div", "empty-state", `<span>No files in this commit</span>`));
      } else {
        const list = el("div", "wt-groups");
        for (const f of files) {
          list.append(el("div", "file-row", `<span class="fname">${esc(f)}</span>`));
        }
        body.append(list);
      }

      const diffTitle = el("div", "section-title", "Diff");
      diffTitle.style.marginTop = "18px";
      body.append(diffTitle);
      body.append(renderDiff(d.diff, esc, el));

      detailPanel.replaceChildren(head, body);
    }

    async function showDetail(hash) {
      detailPanel.replaceChildren(
        el("div", "detail-head", `<h3>${esc(hash.slice(0, 7))}</h3>`),
        el("div", "detail-body", "Loading\u2026")
      );
      try {
        const d = await apiGet("/api/commits/show?hash=" + encodeURIComponent(hash));
        if (state.selected !== hash && state.selected !== d.hash) return;
        state.selected = d.hash || hash;
        paintDetail(d);
      } catch (err) {
        if (state.selected !== hash) return;
        detailPanel.replaceChildren(
          el("div", "detail-head", `<h3>Commit</h3>`),
          el("div", "detail-body", `<p>${esc(err.message)}</p>`)
        );
      }
    }

    if (state.selected) showDetail(state.selected);
    else {
      detailPanel.replaceChildren(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F4DC}</span><span>Select a commit to inspect its diff and run actions</span>`
        )
      );
    }
  };
})();
