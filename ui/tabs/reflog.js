"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("reflogTab", () => ({
    loading: true,
    error: "",
    currentRef: "HEAD",
    typedRef: "HEAD",
    refNames: [],
    entries: [],

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    get knownRefs() {
      const known = [];
      const seen = new Set();
      for (const name of ["HEAD", ...this.refNames, this.currentRef]) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        known.push(name);
      }
      return known;
    },

    async loadBranchNames() {
      try {
        const data = await U.apiGet("/api/branches");
        return (data.branches || []).map((b) => b.name).filter(Boolean);
      } catch {
        return [];
      }
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.$store.vu.refreshOverview();
      const ref = (this.currentRef || "HEAD").trim() || "HEAD";
      this.currentRef = ref;
      this.typedRef = ref;
      try {
        const [reflog, names] = await Promise.all([
          U.apiGet("/api/reflog?ref=" + encodeURIComponent(ref)),
          this.loadBranchNames(),
        ]);
        this.refNames = names;
        if (reflog.ref) {
          this.currentRef = reflog.ref;
          this.typedRef = reflog.ref;
        }
        this.entries = Array.isArray(reflog.entries) ? reflog.entries : [];
      } catch (err) {
        this.error = err.message || String(err);
        this.entries = [];
      } finally {
        this.loading = false;
      }
    },

    pickRef(name) {
      this.currentRef = name || "HEAD";
      this.typedRef = this.currentRef;
      this.load();
    },

    showTyped() {
      this.currentRef = String(this.typedRef || "").trim() || this.currentRef || "HEAD";
      this.load();
    },

    async resetTo(entry) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        "Reset to here",
        [
          {
            name: "mode",
            label: "Reset mode",
            type: "select",
            value: "hard",
            options: [
              { value: "soft", label: "soft — move HEAD, keep index and working tree" },
              { value: "mixed", label: "mixed — move HEAD, reset index, keep working tree" },
              { value: "hard", label: "hard — discard index and working tree (destructive)" },
            ],
          },
        ],
        { confirmLabel: "Continue", danger: true }
      );
      if (!fields) return;
      const mode = ["soft", "mixed", "hard"].includes(fields.mode) ? fields.mode : "hard";
      const short = entry.short || entry.hash;
      const ok = await vu.confirmAction(
        `Reset --${mode} to ${short}`,
        `This will run git reset --${mode} to ${short}` +
          (entry.selector ? ` (${entry.selector})` : "") +
          `. Hard reset discards uncommitted changes.`,
        { danger: true, confirmLabel: "Reset" }
      );
      if (!ok) return;
      try {
        await U.apiPost("/api/reflog", { action: "reset", hash: entry.hash, mode });
        vu.toast(`Reset --${mode} to ${short}`);
        await this.load();
      } catch (err) {
        vu.toast(err.message || "reset failed", true);
      }
    },

    async checkoutEntry(entry) {
      const vu = this.$store.vu;
      const short = entry.short || entry.hash;
      const ok = await vu.confirmAction(
        "Checkout commit",
        `Check out ${short}` +
          (entry.subject ? ` — ${entry.subject}` : "") +
          `? This leaves the repository in a detached HEAD state.`,
        { confirmLabel: "Checkout" }
      );
      if (!ok) return;
      try {
        await U.apiPost("/api/reflog", { action: "checkout", hash: entry.hash });
        vu.toast(`Checked out ${short} (detached HEAD)`);
        await this.load();
      } catch (err) {
        vu.toast(err.message || "checkout failed", true);
      }
    },
  }));
});
