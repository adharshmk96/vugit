"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("changesTab", () => ({
    loading: true,
    error: "",
    data: null,
    status: U.normalizeStatus(null),
    selected: null,
    diffMode: "unified",
    commitDraft: "",
    amendDraft: false,
    signoffDraft: false,
    committing: false,
    lastDiff: "",
    diffHtml: "",
    diffError: "",
    diffLoading: false,
    diffGen: 0,
    hunks: [],
    fileHeaders: "",

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.$store.vu.refreshOverview();
      try {
        const data = await U.apiGet("/api/changes");
        this.data = data;
        this.status = U.normalizeStatus(data && data.status);
        if (this.selected && !this.findEntry(this.selected.group, this.selected.path)) {
          this.selected = this.findPathAnywhere(this.selected.path);
        }
        if (this.selected) this.loadDiff();
        else this.clearDiff();
      } catch (err) {
        this.error = err.message || String(err);
        this.data = null;
      } finally {
        this.loading = false;
      }
    },

    get total() {
      const st = this.status;
      return st.staged.length + st.unstaged.length + st.untracked.length + st.conflicted.length;
    },
    get groups() {
      const st = this.status;
      return [
        { key: "staged", title: "Staged", list: st.staged, bulk: "unstage" },
        { key: "unstaged", title: "Unstaged", list: st.unstaged, bulk: "stage" },
        { key: "untracked", title: "Untracked", list: st.untracked, bulk: "stage" },
        { key: "conflicted", title: "Conflicted", list: st.conflicted, bulk: "stage" },
      ].filter((g) => g.list.length);
    },
    get clean() {
      return this.status.clean || this.total === 0;
    },
    get hunkAction() {
      return this.selected && this.selected.group === "staged" ? "unstage" : "stage";
    },

    pathOf(entry) {
      return U.entryPath(entry);
    },
    findEntry(group, path) {
      const list = this.status[group] || [];
      return list.some((e) => U.entryPath(e) === path) ? { group, path } : null;
    },
    findPathAnywhere(path) {
      for (const group of ["staged", "unstaged", "untracked", "conflicted"]) {
        const hit = (this.status[group] || []).find((e) => U.entryPath(e) === path);
        if (hit) return { group, path, status: hit.status, code: hit.code };
      }
      return null;
    },
    isSelected(group, entry) {
      return this.selected && this.selected.group === group && this.selected.path === U.entryPath(entry);
    },
    selectFile(group, entry) {
      this.selected = { group, path: U.entryPath(entry), status: entry.status, code: entry.code };
      this.loadDiff();
    },

    clearDiff() {
      this.lastDiff = "";
      this.diffHtml = "";
      this.diffError = "";
      this.hunks = [];
      this.fileHeaders = "";
    },

    async loadDiff() {
      const sel = this.selected;
      if (!sel) {
        this.clearDiff();
        return;
      }
      const my = ++this.diffGen;
      this.diffLoading = true;
      this.diffError = "";
      this.clearDiff();
      try {
        const q = new URLSearchParams();
        q.set("path", sel.path);
        q.set("staged", sel.group === "staged" ? "1" : "0");
        q.set("untracked", sel.group === "untracked" ? "1" : "0");
        const res = await U.apiGet("/api/diff?" + q.toString());
        if (my !== this.diffGen) return;
        this.lastDiff = res && typeof res.diff === "string" ? res.diff : "";
        this.paintDiff();
      } catch (err) {
        if (my !== this.diffGen) return;
        this.diffError = err.message || "Failed to load diff";
      } finally {
        if (my === this.diffGen) this.diffLoading = false;
      }
    },

    setDiffMode(mode) {
      this.diffMode = mode;
      this.paintDiff();
    },

    paintDiff() {
      const text = String(this.lastDiff || "");
      this.hunks = [];
      this.fileHeaders = "";
      this.diffHtml = "";
      if (!this.selected) return;
      if (!text.trim()) {
        this.diffHtml = "";
        return;
      }
      if (U.looksBinary(text)) {
        this.diffHtml = `<div class="diff-meta">${U.esc(U.summarizeBinary(text))}</div>`;
        return;
      }
      const files = U.parseUnifiedDiff(text);
      const hunks = [];
      const headers = [];
      for (const file of files) {
        if (file.headerLines.length) headers.push(file.headerLines.join("\n"));
        for (const hunk of file.hunks) {
          hunks.push({
            header: hunk.header,
            html:
              this.diffMode === "side" ? U.renderSideHunkHtml(hunk) : `<div class="diff-view">${U.renderUnifiedHunkHtml(hunk)}</div>`,
            patch: U.buildHunkPatch(file.headerLines, hunk),
          });
        }
      }
      this.fileHeaders = headers.join("\n");
      this.hunks = hunks;
      if (!hunks.length) {
        this.diffHtml = files.some((f) => f.headerLines.length)
          ? `<div class="diff-meta">No hunks in this diff (binary, empty, or metadata-only change)</div>`
          : `<div class="diff-meta">${U.esc(text)}</div>`;
      }
    },

    async run(okMsg, body) {
      try {
        await U.apiPost("/api/changes", body);
        this.$store.vu.toast(okMsg);
        await this.load();
      } catch (err) {
        this.$store.vu.toast(err.message || String(err), true);
      }
    },

    async stagePaths(paths, label) {
      await this.run(label, { action: "stage", paths });
    },
    async unstagePaths(paths, label) {
      await this.run(label, { action: "unstage", paths });
    },
    async discardPath(path) {
      const ok = await this.$store.vu.confirmAction(
        "Discard changes",
        `Discard local changes to ${path}? This cannot be undone.`,
        { danger: true, confirmLabel: "Discard" }
      );
      if (!ok) return;
      await this.run(`Discarded ${path}`, { action: "discard", paths: [path] });
    },
    async stageHunk(hunk) {
      const action = this.hunkAction;
      await this.run(action === "stage" ? "Hunk staged" : "Hunk unstaged", { action, patch: hunk.patch });
    },
    async stashChanges() {
      const st = this.status;
      const fields = await this.$store.vu.promptFields(
        "Stash changes",
        [
          { name: "message", label: "Message", type: "text", placeholder: "WIP" },
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
      await this.run("Changes stashed", {
        action: "stash",
        message: fields.message || "",
        includeUntracked: !!fields.includeUntracked,
      });
    },
    async commit() {
      const message = this.commitDraft;
      const amend = this.amendDraft;
      const signoff = this.signoffDraft;
      if (!String(message || "").trim() && !amend) {
        this.$store.vu.toast("Commit message is required", true);
        return;
      }
      this.committing = true;
      try {
        await U.apiPost("/api/changes", { action: "commit", message: String(message || ""), amend, signoff });
        this.commitDraft = "";
        this.amendDraft = false;
        this.signoffDraft = false;
        this.$store.vu.toast(amend ? "Commit amended" : "Committed");
        await this.load();
      } catch (err) {
        this.$store.vu.toast(err.message || String(err), true);
      } finally {
        this.committing = false;
      }
    },
  }));
});
