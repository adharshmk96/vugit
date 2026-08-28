"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.store("vu", {
    tab: "home",
    repo: {
      name: "—",
      branch: "—",
      head: "",
      upstream: "",
      ahead: 0,
      behind: 0,
      detached: false,
    },
    refreshTick: 0,
    toasts: [],
    dialog: {
      open: false,
      mode: "confirm",
      title: "",
      message: "",
      danger: false,
      confirmLabel: "OK",
      fields: [],
      values: {},
      resolve: null,
    },

    icon: U.icon,
    esc: U.esc,
    initials: U.initials,
    hueFor: U.hueFor,
    avatarStyle: U.avatarStyle,
    fmtDate: U.fmtDate,
    dash: U.dash,
    parseRefs: U.parseRefs,
    apiGet: U.apiGet,
    apiPost: U.apiPost,
    copyText: U.copyText,

    setTab(tab) {
      this.tab = tab;
    },

    applyRepo(repo) {
      if (!repo) return;
      this.repo = {
        name: repo.name || "—",
        branch: repo.branch || "—",
        head: repo.head || "",
        upstream: repo.upstream || "",
        ahead: repo.ahead || 0,
        behind: repo.behind || 0,
        detached: !!repo.detached,
      };
    },

    async refreshOverview() {
      try {
        const data = await U.apiGet("/api/overview");
        if (data && data.repo) this.applyRepo(data.repo);
      } catch {
        /* overview is optional for tabs */
      }
    },

    toast(msg, isError) {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, msg: String(msg || ""), isError: !!isError });
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 3200);
    },

    dismissToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },

    confirmAction(title, message, opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        this.dialog = {
          open: true,
          mode: "confirm",
          title,
          message,
          danger: !!opts.danger,
          confirmLabel: opts.confirmLabel || "Confirm",
          fields: [],
          values: {},
          resolve,
        };
      });
    },

    promptFields(title, fields, opts) {
      opts = opts || {};
      const values = {};
      for (const f of fields || []) {
        if (f.type === "checkbox") values[f.name] = !!f.value;
        else values[f.name] = f.value != null ? f.value : "";
      }
      return new Promise((resolve) => {
        this.dialog = {
          open: true,
          mode: "prompt",
          title,
          message: "",
          danger: !!opts.danger,
          confirmLabel: opts.confirmLabel || "OK",
          fields: fields || [],
          values,
          resolve,
        };
      });
    },

    fieldOptions(f) {
      return (f.options || []).map((o) =>
        typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label }
      );
    },

    submitDialog() {
      const d = this.dialog;
      if (!d.resolve) {
        this.closeDialog();
        return;
      }
      if (d.mode === "prompt") {
        const out = {};
        for (const f of d.fields) {
          if (f.required && f.type !== "checkbox") {
            const v = String(d.values[f.name] ?? "").trim();
            if (!v) {
              this.toast((f.label || f.name) + " is required", true);
              return;
            }
          }
          if (f.type === "checkbox") out[f.name] = !!d.values[f.name];
          else out[f.name] = d.values[f.name];
        }
        d.resolve(out);
      } else {
        d.resolve(true);
      }
      this.closeDialog();
    },

    cancelDialog() {
      const d = this.dialog;
      if (d.resolve) d.resolve(d.mode === "prompt" ? null : false);
      this.closeDialog();
    },

    closeDialog() {
      this.dialog.open = false;
      this.dialog.resolve = null;
      this.dialog.fields = [];
      this.dialog.values = {};
    },
  });

  Alpine.data("app", () => ({
    tabs: [
      { id: "home", label: "Home", icon: "home" },
      { id: "branches", label: "Branches", icon: "branch" },
      { id: "commits", label: "Commits", icon: "commit" },
      { id: "changes", label: "Changes", icon: "diff" },
      { id: "tags", label: "Tags", icon: "tag" },
      { id: "remotes", label: "Remotes", icon: "globe" },
      { id: "stashes", label: "Stashes", icon: "package" },
      { id: "reflog", label: "Reflog", icon: "history" },
      { id: "submodules", label: "Submodules", icon: "layers" },
      { id: "settings", label: "Settings", icon: "gear" },
    ],
    refreshing: false,

    get tab() {
      return this.$store.vu.tab;
    },
    get repo() {
      return this.$store.vu.repo;
    },
    get wide() {
      return !["home", "settings"].includes(this.tab);
    },

    init() {
      this.$store.vu.refreshOverview();
      this.$watch("$store.vu.dialog.open", (open) => {
        const d = this.$refs.dialog;
        if (!d) return;
        if (open && !d.open) d.showModal();
        else if (!open && d.open) d.close();
      });
    },

    onKey(e) {
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && e.target === document.body) {
        this.refresh();
      }
    },

    onDialogNativeClose() {
      if (this.$store.vu.dialog.open) this.$store.vu.cancelDialog();
    },

    setTab(id) {
      this.$store.vu.setTab(id);
    },

    async refresh() {
      this.refreshing = true;
      try {
        await this.$store.vu.refreshOverview();
        this.$store.vu.refreshTick++;
      } finally {
        setTimeout(() => {
          this.refreshing = false;
        }, 240);
      }
    },
  }));

  Alpine.data("homeTab", () => ({
    loading: true,
    error: "",
    data: null,
    openGroups: { staged: true, unstaged: true, untracked: true, conflicted: true },
    showAll: { staged: false, unstaged: false, untracked: false, conflicted: false },

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      try {
        const data = await U.apiGet("/api/overview");
        this.data = data;
        if (data && data.repo) this.$store.vu.applyRepo(data.repo);
      } catch (err) {
        this.error = err.message || String(err);
        this.data = null;
      } finally {
        this.loading = false;
      }
    },

    get stats() {
      return (this.data && this.data.stats) || {};
    },
    get status() {
      return U.normalizeStatus(this.data && this.data.status);
    },
    get commits() {
      return (this.data && this.data.commits) || [];
    },
    get remotes() {
      return (this.data && this.data.remotes) || [];
    },
    get stashes() {
      return (this.data && this.data.stashes) || [];
    },
    get repo() {
      return (this.data && this.data.repo) || this.$store.vu.repo;
    },
    get changedCount() {
      const st = this.status;
      return st.staged.length + st.unstaged.length + st.untracked.length + st.conflicted.length;
    },
    get groups() {
      const st = this.status;
      return [
        ["staged", "Staged", st.staged],
        ["unstaged", "Unstaged", st.unstaged],
        ["untracked", "Untracked", st.untracked],
        ["conflicted", "Conflicted", st.conflicted],
      ].filter((g) => g[2].length);
    },

    visibleFiles(key, list) {
      if (this.showAll[key]) return list;
      return list.slice(0, 8);
    },

    go(tab) {
      this.$store.vu.setTab(tab);
    },
  }));

  Alpine.data("settingsTab", () => ({
    loading: true,
    error: "",
    data: null,
    edits: {},
    saving: false,

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.edits = {};
      try {
        this.data = await U.apiGet("/api/settings");
      } catch (err) {
        this.error = err.message || String(err);
        this.data = null;
      } finally {
        this.loading = false;
      }
    },

    editKey(key, scope) {
      return String(key).toLowerCase() + " " + scope;
    },
    origValue(key, scope) {
      if (!this.data || !this.data.values) return "";
      const v = this.data.values[String(key).toLowerCase()] || {};
      return v[scope] || "";
    },
    curValue(key, scope) {
      const k = this.editKey(key, scope);
      return Object.prototype.hasOwnProperty.call(this.edits, k) ? this.edits[k] : this.origValue(key, scope);
    },
    setValue(key, scope, value) {
      const k = this.editKey(key, scope);
      if (value === this.origValue(key, scope)) {
        const next = { ...this.edits };
        delete next[k];
        this.edits = next;
      } else {
        this.edits = { ...this.edits, [k]: value };
      }
    },
    normBool(v) {
      v = String(v || "").toLowerCase();
      if (["true", "yes", "on", "1"].includes(v)) return "true";
      if (["false", "no", "off", "0"].includes(v)) return "false";
      return "";
    },
    isDirty(key, scope) {
      return Object.prototype.hasOwnProperty.call(this.edits, this.editKey(key, scope));
    },
    isEffective(key, scope) {
      const local = this.curValue(key, "local");
      const global = this.curValue(key, "global");
      const eff = local ? "local" : global ? "global" : null;
      return scope === eff;
    },
    get dirtyCount() {
      return Object.keys(this.edits).length;
    },
    get inRepo() {
      return !!(this.data && this.data.inRepo);
    },

    async save() {
      const changes = [];
      for (const [k, value] of Object.entries(this.edits)) {
        const [key, scope] = k.split(" ");
        changes.push({ key, scope, value });
      }
      if (!changes.length) return;
      this.saving = true;
      try {
        const data = await U.apiPost("/api/settings", { changes });
        this.data = data;
        this.edits = {};
        this.$store.vu.toast(`Applied ${changes.length} change${changes.length === 1 ? "" : "s"} via git config`);
      } catch (err) {
        this.$store.vu.toast(err.message || "save failed", true);
      } finally {
        this.saving = false;
      }
    },
  }));
});
