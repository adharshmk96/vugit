"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("tagsTab", () => ({
    loading: true,
    error: "",
    tags: [],
    selectedName: "",
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
        const data = await U.apiGet("/api/tags");
        this.tags = Array.isArray(data.tags) ? data.tags : [];
        const selected = this.resolveSelected();
        this.selectedName = selected ? selected.name : "";
      } catch (err) {
        this.error = err.message || String(err);
        this.tags = [];
      } finally {
        this.loading = false;
      }
    },

    findTag(name) {
      return this.tags.find((t) => t.name === name) || null;
    },
    resolveSelected() {
      return this.findTag(this.selectedName) || this.tags[0] || null;
    },
    get selected() {
      return this.resolveSelected();
    },
    select(name) {
      this.selectedName = name;
    },

    async remoteChoices() {
      try {
        const data = await U.apiGet("/api/remotes");
        return (data.remotes || []).map((r) => r.name).filter(Boolean);
      } catch {
        return [];
      }
    },
    async pickRemote(title, confirmLabel) {
      const names = await this.remoteChoices();
      const fields = names.length
        ? [{ name: "remote", label: "Remote", type: "select", options: names, value: names[0] }]
        : [{ name: "remote", label: "Remote", value: "origin", placeholder: "origin" }];
      return this.$store.vu.promptFields(title, fields, { confirmLabel });
    },

    async runAction(body, okMsg, opts) {
      if (this.busy) return false;
      this.busy = true;
      try {
        await U.apiPost("/api/tags", body);
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

    async createTag() {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        "Create tag",
        [
          { name: "name", label: "Tag name", required: true, placeholder: "v1.0.0" },
          { name: "hash", label: "Target commit (optional)", placeholder: "HEAD or hash" },
          { name: "message", label: "Message", type: "textarea", placeholder: "Release notes" },
          { name: "annotated", label: "Annotated tag", type: "checkbox", value: true },
          { name: "signed", label: "GPG-signed", type: "checkbox" },
        ],
        { confirmLabel: "Create" }
      );
      if (!fields) return;
      const name = String(fields.name || "").trim();
      if (!name) {
        vu.toast("Tag name is required", true);
        return;
      }
      const body = { action: "create", name, annotated: !!fields.annotated, signed: !!fields.signed };
      const hash = String(fields.hash || "").trim();
      const message = String(fields.message || "").trim();
      if (hash) body.hash = hash;
      if (message) body.message = message;
      await this.runAction(body, `Created tag ${name}`, { select: name });
    },

    async pushAll() {
      const fields = await this.pickRemote("Push all tags", "Push all");
      if (!fields) return;
      const remote = String(fields.remote || "").trim();
      const body = { action: "push-all" };
      if (remote) body.remote = remote;
      await this.runAction(body, remote ? `Pushed all tags to ${remote}` : "Pushed all tags");
    },

    async pushTag(t) {
      const fields = await this.pickRemote(`Push ${t.name}`, "Push");
      if (!fields) return;
      const remote = String(fields.remote || "").trim();
      const body = { action: "push", name: t.name };
      if (remote) body.remote = remote;
      await this.runAction(body, `Pushed ${t.name}`);
    },

    async deleteTag(t) {
      const ok = await this.$store.vu.confirmAction(
        "Delete tag",
        `Delete local tag “${t.name}”? Remote tags are not removed.`,
        { danger: true, confirmLabel: "Delete" }
      );
      if (!ok) return;
      await this.runAction({ action: "delete", name: t.name }, `Deleted ${t.name}`, {
        clear: this.selectedName === t.name,
      });
    },

    async checkoutTag(t) {
      const ok = await this.$store.vu.confirmAction(
        "Checkout tag",
        `Check out tag “${t.name}”? This leaves the repository in a detached HEAD state.`,
        { confirmLabel: "Checkout" }
      );
      if (!ok) return;
      await this.runAction({ action: "checkout", name: t.name }, `Checked out ${t.name} (detached HEAD)`);
    },
  }));
});
