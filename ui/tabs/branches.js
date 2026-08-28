"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("branchesTab", () => ({
    loading: true,
    error: "",
    branches: [],
    selectedName: "",
    filterQuery: "",
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
        const data = await U.apiGet("/api/branches");
        this.branches = Array.isArray(data.branches) ? data.branches : [];
        const selected = this.resolveSelected();
        this.selectedName = selected ? selected.name : "";
      } catch (err) {
        this.error = err.message || String(err);
        this.branches = [];
      } finally {
        this.loading = false;
      }
    },

    isMainBranch(b) {
      const name = String((b && b.name) || "");
      return name === "main" || name.endsWith("/main");
    },
    currentBranch() {
      return this.branches.find((b) => b.current) || null;
    },
    findBranch(name) {
      return this.branches.find((b) => b.name === name) || null;
    },
    resolveSelected() {
      const still = this.findBranch(this.selectedName);
      if (still) return still;
      const cur = this.currentBranch();
      if (cur) return cur;
      return this.branches[0] || null;
    },
    splitRemoteName(name) {
      const s = String(name || "");
      const i = s.indexOf("/");
      if (i <= 0) return { remote: "", branch: s };
      return { remote: s.slice(0, i), branch: s.slice(i + 1) };
    },
    matchesFilter(b) {
      const q = this.filterQuery.trim().toLowerCase();
      if (!q) return true;
      return [b.name, b.hash, b.subject, b.author, b.upstream].some((x) =>
        String(x || "")
          .toLowerCase()
          .includes(q)
      );
    },
    get grouped() {
      const filtered = this.branches.filter((b) => this.matchesFilter(b));
      const local = filtered.filter((b) => !b.remote);
      const remoteGroups = [];
      const byRemote = new Map();
      for (const b of filtered.filter((b) => b.remote)) {
        const { remote } = this.splitRemoteName(b.name);
        const key = remote || "remote";
        if (!byRemote.has(key)) byRemote.set(key, []);
        byRemote.get(key).push(b);
      }
      for (const [name, list] of byRemote) remoteGroups.push({ name, list });
      return { local, remoteGroups, total: filtered.length };
    },
    get selected() {
      return this.resolveSelected();
    },
    select(name) {
      this.selectedName = name;
    },
    rowSub(b) {
      const bits = [];
      if (b.hash) bits.push(b.hash);
      if (b.subject) bits.push(b.subject);
      return bits.join("  ");
    },

    async runAction(body, okMsg, opts) {
      if (this.busy) return false;
      this.busy = true;
      try {
        await U.apiPost("/api/branches", body);
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

    async checkoutBranch(b) {
      await this.runAction({ action: "checkout", name: b.name }, `Checked out ${b.name}`, { select: b.name });
    },

    async createBranch(startHint) {
      const vu = this.$store.vu;
      const cur = this.currentBranch();
      const startDefault =
        startHint || (this.selectedName && this.selectedName !== (cur && cur.name) ? this.selectedName : "");
      const fields = await vu.promptFields(
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
        vu.toast("Branch name is required", true);
        return;
      }
      const start = String(fields.start || "").trim();
      const body = { action: "create", name };
      if (start) body.start = start;
      await this.runAction(body, `Created ${name}`, { select: name });
    },

    async renameBranch(b) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        "Rename branch",
        [{ name: "newName", label: "New name", required: true, value: b.name }],
        { confirmLabel: "Rename" }
      );
      if (!fields) return;
      const newName = String(fields.newName || "").trim();
      if (!newName) {
        vu.toast("New name is required", true);
        return;
      }
      if (newName === b.name) return;
      await this.runAction({ action: "rename", name: b.name, newName }, `Renamed to ${newName}`, { select: newName });
    },

    async setUpstream(b) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
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
        vu.toast("Upstream is required", true);
        return;
      }
      await this.runAction(
        { action: "set-upstream", name: b.name, upstream },
        `Upstream of ${b.name} set to ${upstream}`
      );
    },

    async pushBranch(b, remote) {
      const body = { action: "push", name: b.name };
      if (remote) body.remote = remote;
      await this.runAction(body, `Pushed ${b.name}` + (remote ? ` to ${remote}` : ""));
    },

    async pushCurrent() {
      const cur = this.currentBranch();
      if (!cur) {
        this.$store.vu.toast("No current branch to push (detached HEAD?)", true);
        return;
      }
      await this.pushBranch(cur);
    },

    async mergeBranch(b) {
      const vu = this.$store.vu;
      const cur = this.currentBranch();
      const into = cur ? cur.name : "the current branch";
      const ok = await vu.confirmAction("Merge branch", `Merge ${b.name} into ${into}?`, { confirmLabel: "Merge" });
      if (!ok) return;
      await this.runAction({ action: "merge", name: b.name }, `Merged ${b.name} into ${into}`);
    },

    async squashMergeToMain(b) {
      const ok = await this.$store.vu.confirmAction(
        "Squash merge to main",
        `Checkout main, squash ${b.name} into it, and commit? Working tree must be clean.`,
        { confirmLabel: "Squash merge" }
      );
      if (!ok) return;
      await this.runAction(
        { action: "squash-merge-main", name: b.name },
        `Squash-merged ${b.name} into main`,
        { select: "main" }
      );
    },

    async rebaseOnto(b) {
      const vu = this.$store.vu;
      const cur = this.currentBranch();
      const onto = b.name;
      const ok = await vu.confirmAction(
        "Rebase branch",
        `Rebase ${cur ? cur.name : "the current branch"} onto ${onto}? This rewrites commits.`,
        { danger: true, confirmLabel: "Rebase" }
      );
      if (!ok) return;
      await this.runAction({ action: "rebase", name: b.name }, `Rebased onto ${onto}`);
    },

    async deleteBranch(b, onRemote) {
      const vu = this.$store.vu;
      if (onRemote) {
        const { remote, branch } = this.splitRemoteName(b.name);
        const rem = remote || "origin";
        const ok = await vu.confirmAction(
          "Delete on remote",
          `Delete ${branch} from remote ${rem}? This cannot be undone.`,
          { danger: true, confirmLabel: "Delete on remote" }
        );
        if (!ok) return;
        await this.runAction(
          { action: "delete", name: branch, remote: rem },
          `Deleted ${branch} from ${rem}`,
          { clear: this.selectedName === b.name }
        );
        return;
      }

      const kind = b.remote ? "remote-tracking ref" : "local branch";
      const ok = await vu.confirmAction(
        "Delete " + kind,
        `Delete ${kind} ${b.name}?` + (b.remote ? " This only removes the local remote-tracking ref." : ""),
        { danger: true, confirmLabel: "Delete" }
      );
      if (!ok) return;

      if (this.busy) return;
      this.busy = true;
      try {
        await U.apiPost("/api/branches", { action: "delete", name: b.name });
      } catch (err) {
        this.busy = false;
        const msg = err.message || "delete failed";
        if (/not fully merged|not merged/i.test(msg)) {
          const force = await vu.confirmAction(
            "Force delete?",
            `${msg}\n\nForce-delete ${b.name}? Unmerged commits may become unreachable.`,
            { danger: true, confirmLabel: "Force delete" }
          );
          if (!force) {
            vu.toast(msg, true);
            return;
          }
          await this.runAction(
            { action: "delete", name: b.name, force: true },
            `Force-deleted ${b.name}`,
            { clear: this.selectedName === b.name }
          );
          return;
        }
        vu.toast(msg, true);
        return;
      }
      if (this.selectedName === b.name) this.selectedName = "";
      vu.toast(`Deleted ${b.name}`);
      this.busy = false;
      await this.load();
    },
  }));
});
