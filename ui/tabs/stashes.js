"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("stashesTab", () => ({
    loading: true,
    error: "",
    stashes: [],
    selectedRef: "",
    showData: null,
    showError: "",
    showLoading: false,
    showSeq: 0,
    busy: false,

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.$store.vu.refreshOverview();
      try {
        const data = await U.apiGet("/api/stashes");
        this.stashes = Array.isArray(data.stashes) ? data.stashes : [];
        if (this.selectedRef && !this.findStash(this.selectedRef)) {
          this.selectedRef = "";
          this.showData = null;
        }
        const selected = this.resolveSelected();
        this.selectedRef = selected ? selected.ref : "";
        if (this.selectedRef) this.loadShow(this.selectedRef);
      } catch (err) {
        this.error = err.message || String(err);
        this.stashes = [];
      } finally {
        this.loading = false;
      }
    },

    findStash(ref) {
      return this.stashes.find((s) => s.ref === ref) || null;
    },
    resolveSelected() {
      return this.findStash(this.selectedRef) || this.stashes[0] || null;
    },
    get selected() {
      return this.resolveSelected();
    },
    select(ref) {
      this.selectedRef = ref;
      this.loadShow(ref);
    },

    async loadShow(ref) {
      const seq = ++this.showSeq;
      this.showLoading = true;
      this.showError = "";
      try {
        const data = await U.apiGet("/api/stashes/show?ref=" + encodeURIComponent(ref));
        if (seq !== this.showSeq) return;
        this.showData = {
          ...data,
          files: Array.isArray(data.files) ? data.files : [],
          diffHtml: U.renderDiffHtml(data.diff),
        };
      } catch (err) {
        if (seq !== this.showSeq) return;
        this.showData = null;
        this.showError = err.message || String(err);
        this.$store.vu.toast(err.message || "failed to load stash diff", true);
      } finally {
        if (seq === this.showSeq) this.showLoading = false;
      }
    },

    async runAction(body, okMsg, opts) {
      if (this.busy) return false;
      this.busy = true;
      try {
        await U.apiPost("/api/stashes", body);
        if (opts && opts.select) this.selectedRef = opts.select;
        if (opts && opts.clear) this.selectedRef = "";
        this.showData = null;
        this.$store.vu.toast(okMsg);
        await this.load();
        return true;
      } catch (err) {
        this.$store.vu.toast(err.message || "action failed", true);
        return false;
      } finally {
        this.busy = false;
      }
    },

    async createStash() {
      const fields = await this.$store.vu.promptFields(
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
      await this.runAction(body, "Created stash", { clear: true });
    },

    async applyStash(s) {
      const ok = await this.$store.vu.confirmAction(
        "Apply stash",
        `Apply ${s.ref} to the working tree? The stash entry is kept.`,
        { confirmLabel: "Apply" }
      );
      if (!ok) return;
      await this.runAction({ action: "apply", ref: s.ref }, `Applied ${s.ref}`);
    },

    async popStash(s) {
      const ok = await this.$store.vu.confirmAction(
        "Pop stash",
        `Pop ${s.ref}? It will be applied and then dropped.`,
        { confirmLabel: "Pop" }
      );
      if (!ok) return;
      await this.runAction({ action: "pop", ref: s.ref }, `Popped ${s.ref}`, { clear: true });
    },

    async dropStash(s) {
      const ok = await this.$store.vu.confirmAction(
        "Drop stash",
        `Permanently drop ${s.ref}? This cannot be undone.`,
        { danger: true, confirmLabel: "Drop" }
      );
      if (!ok) return;
      await this.runAction({ action: "drop", ref: s.ref }, `Dropped ${s.ref}`, { clear: true });
    },

    async branchFromStash(s) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        `Branch from ${s.ref}`,
        [{ name: "branch", label: "New branch name", required: true, placeholder: "fix/from-stash" }],
        { confirmLabel: "Create branch" }
      );
      if (!fields) return;
      const branch = String(fields.branch || "").trim();
      if (!branch) {
        vu.toast("Branch name is required", true);
        return;
      }
      await this.runAction({ action: "branch", ref: s.ref, branch }, `Created branch ${branch} from ${s.ref}`, {
        clear: true,
      });
    },
  }));
});
