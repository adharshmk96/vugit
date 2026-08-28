"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("remotesTab", () => ({
    loading: true,
    error: "",
    remotes: [],
    selectedName: "",
    newName: "",
    newUrl: "",
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
        const data = await U.apiGet("/api/remotes");
        this.remotes = Array.isArray(data.remotes) ? data.remotes : [];
        const selected = this.resolveSelected();
        this.selectedName = selected ? selected.name : "";
      } catch (err) {
        this.error = err.message || String(err);
        this.remotes = [];
      } finally {
        this.loading = false;
      }
    },

    findRemote(name) {
      return this.remotes.find((r) => r.name === name) || null;
    },
    resolveSelected() {
      return this.findRemote(this.selectedName) || this.remotes[0] || null;
    },
    get selected() {
      return this.resolveSelected();
    },
    select(name) {
      this.selectedName = name;
    },
    headsCount(r) {
      return ((r && r.heads) || []).length;
    },

    async runAction(body, okMsg, opts) {
      if (this.busy) return false;
      this.busy = true;
      try {
        await U.apiPost("/api/remotes", body);
        if (opts && opts.select) this.selectedName = opts.select;
        if (opts && opts.clear) this.selectedName = "";
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

    async addRemote() {
      const name = String(this.newName || "").trim();
      const url = String(this.newUrl || "").trim();
      if (!name || !url) {
        this.$store.vu.toast("Name and URL are required", true);
        return;
      }
      const ok = await this.runAction({ action: "add", name, url }, `Added remote ${name}`, { select: name });
      if (ok) {
        this.newName = "";
        this.newUrl = "";
      }
    },

    async renameRemote(r) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        `Rename ${r.name}`,
        [{ name: "newName", label: "New name", required: true, value: r.name }],
        { confirmLabel: "Rename" }
      );
      if (!fields) return;
      const newName = String(fields.newName || "").trim();
      if (!newName) {
        vu.toast("New name is required", true);
        return;
      }
      if (newName === r.name) return;
      await this.runAction({ action: "rename", name: r.name, newName }, `Renamed ${r.name} → ${newName}`, {
        select: newName,
      });
    },

    async removeRemote(r) {
      const ok = await this.$store.vu.confirmAction(
        "Remove remote",
        `Remove remote “${r.name}”? Local tracking refs for this remote are also deleted.`,
        { danger: true, confirmLabel: "Remove" }
      );
      if (!ok) return;
      await this.runAction({ action: "remove", name: r.name }, `Removed ${r.name}`, {
        clear: this.selectedName === r.name,
      });
    },

    async fetchRemote(r) {
      const fields = await this.$store.vu.promptFields(
        `Fetch ${r.name}`,
        [{ name: "prune", label: "Prune stale remote-tracking branches", type: "checkbox" }],
        { confirmLabel: "Fetch" }
      );
      if (!fields) return;
      const body = { action: "fetch", name: r.name };
      if (fields.prune) body.prune = true;
      await this.runAction(body, fields.prune ? `Fetched and pruned ${r.name}` : `Fetched ${r.name}`);
    },

    async pruneRemote(r) {
      await this.runAction({ action: "prune", name: r.name }, `Pruned ${r.name}`);
    },

    async pullRemote(r) {
      const fields = await this.$store.vu.promptFields(
        `Pull from ${r.name}`,
        [{ name: "branch", label: "Branch (optional)", placeholder: "current upstream" }],
        { confirmLabel: "Pull" }
      );
      if (!fields) return;
      const body = { action: "pull", name: r.name };
      const branch = String(fields.branch || "").trim();
      if (branch) body.branch = branch;
      await this.runAction(body, branch ? `Pulled ${r.name}/${branch}` : `Pulled from ${r.name}`);
    },

    async pushRemote(r) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
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
        const ok = await vu.confirmAction(
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
      await this.runAction(body, `Pushed to ${bits.join(" · ")}`);
    },
  }));
});
