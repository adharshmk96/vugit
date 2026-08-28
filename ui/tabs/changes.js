"use strict";

(() => {
  const vu = () => window.vu || {};

  let selected = null; // { group, path, status, code }
  let diffMode = "unified"; // "unified" | "side"
  let commitDraft = "";
  let amendDraft = false;
  let signoffDraft = false;
  let renderGen = 0;
  let diffGen = 0;
  let lastDiff = "";

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.changes = async function renderChanges() {
    const { el, esc, toast, apiGet, apiPost, confirmAction, promptFields, setTopbar, content } = vu();
    if (!content) return;

    const myGen = ++renderGen;
    content.classList.add("wide");
    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">✏️</div><h2>Loading changes…</h2>`)
    );

    try {
      const ovP = apiGet("/api/overview")
        .then((ov) => {
          if (ov && ov.repo && typeof setTopbar === "function") setTopbar(ov.repo);
        })
        .catch(() => {});

      const data = await apiGet("/api/changes");
      await ovP;
      if (myGen !== renderGen) return;

      const st = normalizeStatus(data && data.status);
      paint(data, st);
    } catch (err) {
      if (myGen !== renderGen) return;
      content.replaceChildren(
        el(
          "div",
          "notice",
          `<h2>Can't load changes</h2><p>${esc(err && err.message ? err.message : String(err))}</p>`
        )
      );
    }

    function paint(data, st) {
      const total =
        st.staged.length + st.unstaged.length + st.untracked.length + st.conflicted.length;

      if (selected && !findEntry(st, selected.group, selected.path)) {
        const moved = findPathAnywhere(st, selected.path);
        selected = moved;
      }

      const toolbar = el("div", "toolbar");
      toolbar.append(el("span", "section-title", "Working tree"));
      if (data.branch) toolbar.append(el("span", "pill", esc(data.branch)));
      if (data.head) toolbar.append(el("span", "hash", esc(data.head)));
      if (total) {
        toolbar.append(
          el(
            "span",
            "count",
            `${total} file${total === 1 ? "" : "s"}`
          )
        );
      }
      toolbar.append(el("span", "spacer"));

      if (st.clean || total === 0) {
        content.replaceChildren(
          toolbar,
          el(
            "div",
            "empty-state",
            `<span class="ico">✨</span><span>Working tree clean</span>`
          )
        );
        selected = null;
        lastDiff = "";
        return;
      }

      const stashBtn = button("Stash", "btn", async (e) => {
        e.preventDefault();
        const fields = await promptFields(
          "Stash changes",
          [
            {
              name: "message",
              label: "Message",
              type: "text",
              placeholder: "WIP",
            },
            {
              name: "includeUntracked",
              label: "Include untracked files",
              type: "checkbox",
              value: st.untracked.length > 0,
            },
          ],
          { confirmLabel: "Stash" }
        );
        if (!fields) return;
        await run("Changes stashed", {
          action: "stash",
          message: fields.message || "",
          includeUntracked: !!fields.includeUntracked,
        });
      });
      toolbar.append(stashBtn);

      const split = el("div", "split");
      const listPanel = el("div", "list-panel");
      const listScroll = el("div", "list-scroll");

      const groups = [
        ["staged", "Staged", st.staged, "unstage"],
        ["unstaged", "Unstaged", st.unstaged, "stage"],
        ["untracked", "Untracked", st.untracked, "stage"],
        ["conflicted", "Conflicted", st.conflicted, "stage"],
      ];

      for (const [key, title, list, bulk] of groups) {
        if (!list.length) continue;
        listScroll.append(renderGroup(key, title, list, bulk));
      }
      listPanel.append(listScroll);

      const detailPanel = el("div", "detail-panel");
      const detailHead = el("div", "detail-head");
      const detailBody = el("div", "detail-body flush list-scroll");
      detailPanel.append(detailHead, detailBody);

      split.append(listPanel, detailPanel);

      const commitBox = renderCommitBox();

      content.replaceChildren(toolbar, split, commitBox);

      if (selected) loadDiff(detailHead, detailBody);
      else showPickPrompt(detailHead, detailBody);
    }

    function renderGroup(key, title, list, bulk) {
      const g = el("div", "wt-group");
      const head = el("div", "wt-group-head");
      head.append(el("span", `dot ${key}`));
      head.append(el("span", null, title));
      head.append(el("span", "g-count", String(list.length)));

      const paths = list.map(entryPath);
      if (bulk === "stage") {
        head.append(
          button("Stage all", "btn btn-sm", (e) => {
            e.stopPropagation();
            return run(`Staged ${paths.length} file${paths.length === 1 ? "" : "s"}`, {
              action: "stage",
              paths,
            });
          })
        );
      } else if (bulk === "unstage") {
        head.append(
          button("Unstage all", "btn btn-sm", (e) => {
            e.stopPropagation();
            return run(`Unstaged ${paths.length} file${paths.length === 1 ? "" : "s"}`, {
              action: "unstage",
              paths,
            });
          })
        );
      }
      g.append(head);

      for (const entry of list) {
        g.append(renderFileRow(key, entry));
      }
      return g;
    }

    function renderFileRow(group, entry) {
      const path = entryPath(entry);
      const row = el("div", "row-item file-row");
      if (selected && selected.group === group && selected.path === path) {
        row.classList.add("is-active");
      }
      row.append(el("span", "code", esc(entry.code || "")));
      const main = el("div", "row-main");
      main.append(el("div", "row-title fname", esc(entry.path || path)));
      main.append(el("div", "row-sub tag", esc(entry.status || group)));
      row.append(main);

      const actions = el("div", "row-actions");
      if (group === "staged") {
        actions.append(
          button("Unstage", "btn btn-sm", (e) => {
            e.stopPropagation();
            return run(`Unstaged ${path}`, { action: "unstage", paths: [path] });
          })
        );
      } else {
        actions.append(
          button("Stage", "btn btn-sm", (e) => {
            e.stopPropagation();
            return run(`Staged ${path}`, { action: "stage", paths: [path] });
          })
        );
        actions.append(
          button("Discard", "btn btn-sm btn-danger", async (e) => {
            e.stopPropagation();
            const ok = await confirmAction(
              "Discard changes",
              `Discard local changes to ${path}? This cannot be undone.`,
              { danger: true, confirmLabel: "Discard" }
            );
            if (!ok) return;
            await run(`Discarded ${path}`, { action: "discard", paths: [path] });
          })
        );
      }
      row.append(actions);

      row.addEventListener("click", () => {
        selected = { group, path, status: entry.status, code: entry.code };
        const panel = content.querySelector(".detail-panel");
        if (!panel) return;
        content.querySelectorAll(".row-item.is-active").forEach((n) => n.classList.remove("is-active"));
        row.classList.add("is-active");
        const head = panel.querySelector(".detail-head");
        const body = panel.querySelector(".detail-body");
        loadDiff(head, body);
      });
      return row;
    }

    function renderCommitBox() {
      const box = el("div", "commit-box");
      const ta = document.createElement("textarea");
      ta.className = "input";
      ta.rows = 4;
      ta.placeholder = "Commit message";
      ta.value = commitDraft;
      ta.addEventListener("input", () => {
        commitDraft = ta.value;
      });
      box.append(ta);

      const row = el("div", "toolbar");
      const amendLbl = el("label", "dlg-check");
      const amendCb = document.createElement("input");
      amendCb.type = "checkbox";
      amendCb.checked = amendDraft;
      amendCb.addEventListener("change", () => {
        amendDraft = amendCb.checked;
      });
      amendLbl.append(amendCb, document.createTextNode(" Amend"));

      const signLbl = el("label", "dlg-check");
      const signCb = document.createElement("input");
      signCb.type = "checkbox";
      signCb.checked = signoffDraft;
      signCb.addEventListener("change", () => {
        signoffDraft = signCb.checked;
      });
      signLbl.append(signCb, document.createTextNode(" Sign-off"));

      row.append(amendLbl, signLbl, el("span", "spacer"));

      const commitBtn = button("Commit", "btn btn-primary", async () => {
        const message = ta.value;
        const amend = amendCb.checked;
        const signoff = signCb.checked;
        if (!String(message || "").trim() && !amend) {
          toast("Commit message is required", true);
          ta.focus();
          return;
        }
        commitBtn.disabled = true;
        try {
          await apiPost("/api/changes", {
            action: "commit",
            message: String(message || ""),
            amend,
            signoff,
          });
          commitDraft = "";
          amendDraft = false;
          signoffDraft = false;
          toast(amend ? "Commit amended" : "Committed");
          refreshTab();
        } catch (err) {
          toast((err && err.message) || String(err), true);
          commitBtn.disabled = false;
        }
      });
      row.append(commitBtn);
      box.append(row);
      return box;
    }

    function showPickPrompt(head, body) {
      head.replaceChildren(el("h3", null, "Diff"));
      lastDiff = "";
      body.replaceChildren(
        el(
          "div",
          "empty-state",
          `<span class="ico">✏️</span><span>Select a file to view its diff</span>`
        )
      );
    }

    async function loadDiff(head, body) {
      const sel = selected;
      if (!sel) {
        showPickPrompt(head, body);
        return;
      }
      const my = ++diffGen;
      lastDiff = "";
      renderDetailHead(head, sel, body);
      body.replaceChildren(el("div", "diff-meta", "Loading diff…"));

      try {
        const q = new URLSearchParams();
        q.set("path", sel.path);
        q.set("staged", sel.group === "staged" ? "1" : "0");
        q.set("untracked", sel.group === "untracked" ? "1" : "0");
        const res = await apiGet("/api/diff?" + q.toString());
        if (my !== diffGen) return;
        lastDiff = res && typeof res.diff === "string" ? res.diff : "";
        paintDiff(body, sel, lastDiff);
      } catch (err) {
        if (my !== diffGen) return;
        lastDiff = "";
        body.replaceChildren(
          el(
            "div",
            "empty-state",
            `<span class="ico">⚠️</span><span>${esc((err && err.message) || "Failed to load diff")}</span>`
          )
        );
      }
    }

    function renderDetailHead(head, sel, body) {
      head.replaceChildren();
      const title = el("h3", null, esc(sel.path));
      head.append(title);
      const meta = el("div", "row-actions");
      if (sel.code) meta.append(el("span", "pill", esc(sel.code)));
      if (sel.status) meta.append(el("span", "pill", esc(sel.status)));
      meta.append(el("span", "pill", esc(sel.group)));

      const unifiedBtn = button("Unified", "btn btn-sm" + (diffMode === "unified" ? " btn-primary" : ""), () => {
        diffMode = "unified";
        renderDetailHead(head, sel, body);
        paintDiff(body, sel, lastDiff);
      });
      const sideBtn = button("Side by side", "btn btn-sm" + (diffMode === "side" ? " btn-primary" : ""), () => {
        diffMode = "side";
        renderDetailHead(head, sel, body);
        paintDiff(body, sel, lastDiff);
      });
      meta.append(unifiedBtn, sideBtn);
      head.append(meta);
    }

    function paintDiff(body, sel, diffText) {
      body.replaceChildren();
      if (diffText == null) {
        body.append(
          el(
            "div",
            "empty-state",
            `<span class="ico">📄</span><span>No diff available</span>`
          )
        );
        return;
      }

      const text = String(diffText);
      if (!text.trim()) {
        body.append(
          el(
            "div",
            "empty-state",
            `<span class="ico">📄</span><span>No textual changes (empty, mode-only, or identical)</span>`
          )
        );
        return;
      }

      if (looksBinary(text)) {
        const wrap = el("div", "diff-view");
        wrap.append(el("div", "diff-meta", esc(summarizeBinary(text))));
        body.append(wrap);
        return;
      }

      const files = parseUnifiedDiff(text);
      const canHunk = true;
      const hunkAction = sel.group === "staged" ? "unstage" : "stage";
      let hunkCount = 0;

      for (const file of files) {
        const headerText = file.headerLines.join("\n");
        if (headerText.trim()) {
          const meta = el("div", "diff-meta");
          meta.innerHTML = file.headerLines.map((ln) => esc(ln)).join("<br>");
          body.append(meta);
        }

        if (!file.hunks.length) continue;

        for (const hunk of file.hunks) {
          hunkCount++;
          const block = el("div", "hunk-block");
          const hh = el("div", "hunk-head");
          hh.append(el("span", "diff-hunk", esc(hunk.header)));
          hh.append(el("span", "spacer"));
          if (canHunk) {
            const label = hunkAction === "stage" ? "Stage hunk" : "Unstage hunk";
            hh.append(
              button(label, "btn btn-sm", () => {
                const patch = buildHunkPatch(file.headerLines, hunk);
                return run(hunkAction === "stage" ? "Hunk staged" : "Hunk unstaged", {
                  action: hunkAction,
                  patch,
                });
              })
            );
          }
          block.append(hh);
          if (diffMode === "side") block.append(renderSideHunk(hunk));
          else block.append(renderUnifiedHunk(hunk));
          body.append(block);
        }
      }

      if (!hunkCount) {
        const wrap = el("div", "diff-view");
        wrap.append(
          el(
            "div",
            "diff-meta",
            files.some((f) => f.headerLines.length)
              ? "No hunks in this diff (binary, empty, or metadata-only change)"
              : esc(text)
          )
        );
        body.append(wrap);
      }
    }

    async function run(okMsg, body) {
      try {
        await apiPost("/api/changes", body);
        toast(okMsg);
        refreshTab();
      } catch (err) {
        toast((err && err.message) || String(err), true);
      }
    }
  };

  function refreshTab() {
    const r = vu().render;
    if (typeof r === "function") r();
    else if (window.TabRenderers && typeof window.TabRenderers.changes === "function") {
      window.TabRenderers.changes();
    }
  }

  function button(label, cls, onClick) {
    const { el } = vu();
    const b = el("button", cls || "btn", label);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function normalizeStatus(st) {
    st = st || {};
    return {
      clean: !!st.clean,
      staged: Array.isArray(st.staged) ? st.staged : [],
      unstaged: Array.isArray(st.unstaged) ? st.unstaged : [],
      untracked: Array.isArray(st.untracked) ? st.untracked : [],
      conflicted: Array.isArray(st.conflicted) ? st.conflicted : [],
    };
  }

  function unquoteGitPath(s) {
    s = String(s || "").trim();
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
      s = s.slice(1, -1).replace(/\\([\\"ntr])/g, (_, c) => {
        if (c === "n") return "\n";
        if (c === "t") return "\t";
        if (c === "r") return "\r";
        return c;
      });
    }
    return s;
  }

  function entryPath(entry) {
    let p = String((entry && entry.path) || "");
    const arrow = " -> ";
    const i = p.lastIndexOf(arrow);
    if (i !== -1) p = p.slice(i + arrow.length);
    return unquoteGitPath(p);
  }

  function findEntry(st, group, path) {
    const list = st[group] || [];
    return list.some((e) => entryPath(e) === path) ? { group, path } : null;
  }

  function findPathAnywhere(st, path) {
    for (const group of ["staged", "unstaged", "untracked", "conflicted"]) {
      const hit = (st[group] || []).find((e) => entryPath(e) === path);
      if (hit) return { group, path, status: hit.status, code: hit.code };
    }
    return null;
  }

  function looksBinary(diff) {
    const s = String(diff || "");
    if (!s) return false;
    if (s.includes("\0")) return true;
    if (/Binary files .+ differ/i.test(s)) return true;
    if (/^GIT binary patch/m.test(s)) return true;
    if (/^Binary file /m.test(s)) return true;
    return false;
  }

  function summarizeBinary(diff) {
    const s = String(diff || "");
    const m = s.match(/Binary files .+ differ/i) || s.match(/^Binary file .+$/m);
    if (m) return m[0];
    return "Binary file — no textual diff";
  }

  function parseUnifiedDiff(text) {
    const raw = String(text || "");
    const lines = raw.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();

    const files = [];
    let file = { headerLines: [], hunks: [] };
    let seenDiff = false;

    const pushFile = () => {
      if (file.headerLines.length || file.hunks.length) files.push(file);
      file = { headerLines: [], hunks: [] };
    };

    for (const line of lines) {
      if (line.startsWith("diff --git ")) {
        if (seenDiff || file.hunks.length) pushFile();
        seenDiff = true;
        file.headerLines.push(line);
        continue;
      }
      if (line.startsWith("@@")) {
        file.hunks.push({ header: line, lines: [] });
        continue;
      }
      if (file.hunks.length) file.hunks[file.hunks.length - 1].lines.push(line);
      else file.headerLines.push(line);
    }
    pushFile();
    return files;
  }

  function buildHunkPatch(headerLines, hunk) {
    const headers = (headerLines || []).slice();
    // git apply needs --- / +++ file headers. Keep the whole prelude.
    while (headers.length && headers[headers.length - 1] === "") headers.pop();
    const parts = [];
    if (headers.length) parts.push(headers.join("\n"));
    parts.push(hunk.header);
    if (hunk.lines && hunk.lines.length) parts.push(hunk.lines.join("\n"));
    let patch = parts.join("\n");
    if (!patch.endsWith("\n")) patch += "\n";
    return patch;
  }

  function parseHunkHeader(header) {
    const m = String(header || "").match(
      /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/
    );
    if (!m) return { oldStart: 0, newStart: 0 };
    return {
      oldStart: Number(m[1]),
      oldCount: m[2] != null ? Number(m[2]) : 1,
      newStart: Number(m[3]),
      newCount: m[4] != null ? Number(m[4]) : 1,
    };
  }

  function renderUnifiedHunk(hunk) {
    const { el, esc } = vu();
    const view = el("div", "diff-view");
    const { oldStart, newStart } = parseHunkHeader(hunk.header);
    let oldLn = oldStart;
    let newLn = newStart;
    for (const line of hunk.lines) {
      const ch = line[0];
      const row = el("div", "diff-line");
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
          el("span", "ln", String(oldLn++)),
          el("span", "ln", String(newLn++)),
          el("span", "code", esc(line))
        );
      }
      view.append(row);
    }
    if (!hunk.lines.length) {
      view.append(el("div", "diff-meta", "Empty hunk"));
    }
    return view;
  }

  function sideLine(kind, num, text) {
    const { el, esc } = vu();
    const row = el("div", "diff-line" + (kind ? " " + kind : ""));
    const n = num == null ? "" : String(num);
    if (kind === "diff-del") {
      row.append(el("span", "ln", n), el("span", "ln", ""), el("span", "code", esc(text)));
    } else if (kind === "diff-add") {
      row.append(el("span", "ln", ""), el("span", "ln", n), el("span", "code", esc(text)));
    } else {
      row.append(el("span", "ln", n), el("span", "ln", n), el("span", "code", esc(text)));
    }
    return row;
  }

  function renderSideHunk(hunk) {
    const { el } = vu();
    const wrap = el("div", "side-diff");
    const left = el("div", "col");
    const right = el("div", "col");
    left.append(el("div", "col-h", "Before"));
    right.append(el("div", "col-h", "After"));

    const { oldStart, newStart } = parseHunkHeader(hunk.header);
    let oldLn = oldStart;
    let newLn = newStart;
    const lines = hunk.lines || [];
    let i = 0;

    const blank = (side) => {
      const row = el("div", "diff-line");
      row.append(el("span", "ln", ""), el("span", "ln", ""), el("span", "code", ""));
      side.append(row);
    };

    while (i < lines.length) {
      const line = lines[i];
      const ch = line[0];
      if (ch === "-") {
        const dels = [];
        const adds = [];
        while (i < lines.length && lines[i][0] === "-") dels.push(lines[i++]);
        while (i < lines.length && lines[i][0] === "+") adds.push(lines[i++]);
        const n = Math.max(dels.length, adds.length);
        for (let k = 0; k < n; k++) {
          if (k < dels.length) left.append(sideLine("diff-del", oldLn++, dels[k]));
          else blank(left);
          if (k < adds.length) right.append(sideLine("diff-add", newLn++, adds[k]));
          else blank(right);
        }
      } else if (ch === "+") {
        blank(left);
        right.append(sideLine("diff-add", newLn++, line));
        i++;
      } else if (ch === "\\") {
        i++;
      } else {
        left.append(sideLine("", oldLn, line));
        right.append(sideLine("", newLn, line));
        oldLn++;
        newLn++;
        i++;
      }
    }

    wrap.append(left, right);
    return wrap;
  }
})();
