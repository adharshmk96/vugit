"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("commitsTab", () => ({
    loading: true,
    error: "",
    branch: "",
    author: "",
    path: "",
    selected: "",
    commits: [],
    detail: null,
    detailError: "",
    detailLoading: false,
    detailGen: 0,

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.$store.vu.refreshOverview();
      try {
        const q = new URLSearchParams({ max: "200" });
        if (this.branch) q.set("branch", this.branch);
        if (this.author) q.set("author", this.author);
        if (this.path) q.set("path", this.path);
        const data = await U.apiGet("/api/commits?" + q.toString());
        const commits = data.commits || [];
        const graph = U.layoutGraph(commits);
        this.commits = commits.map((c) => ({
          ...c,
          ascii: (graph.get(c.hash) && graph.get(c.hash).ascii) || "*",
          badges: U.parseRefs(c.refs),
          initials: U.initials(c.author),
          hue: U.hueFor(c.email || c.author || ""),
        }));
        if (this.selected && !this.commits.some((c) => c.hash === this.selected || c.short === this.selected)) {
          this.selected = "";
        }
        if (!this.selected && this.commits.length) {
          const head = this.commits.find((c) => c.isHead) || this.commits[0];
          this.selected = head.hash;
        }
        if (this.selected) this.showDetail(this.selected);
        else {
          this.detail = null;
          this.detailError = "";
        }
      } catch (err) {
        this.error = err.message || String(err);
        this.commits = [];
      } finally {
        this.loading = false;
      }
    },

    applyFilters() {
      this.branch = String(this.branch || "").trim();
      this.author = String(this.author || "").trim();
      this.path = String(this.path || "").trim();
      this.load();
    },

    select(c) {
      this.selected = c.hash;
      this.showDetail(c.hash);
    },

    async showDetail(hash) {
      const my = ++this.detailGen;
      this.detailLoading = true;
      this.detailError = "";
      try {
        const d = await U.apiGet("/api/commits/show?hash=" + encodeURIComponent(hash));
        if (my !== this.detailGen) return;
        if (this.selected !== hash && this.selected !== d.hash) return;
        this.selected = d.hash || hash;
        this.detail = {
          ...d,
          badges: U.parseRefs(d.refs),
          files: d.files || [],
          parents: d.parents || [],
          diffHtml: U.renderDiffHtml(d.diff),
        };
      } catch (err) {
        if (my !== this.detailGen) return;
        this.detail = null;
        this.detailError = err.message || String(err);
      } finally {
        if (my === this.detailGen) this.detailLoading = false;
      }
    },

    defaultMessage(d) {
      const sub = d.subject || "";
      const body = (d.body || "").trim();
      return body ? sub + "\n\n" + body : sub;
    },

    async runAction(body, successMsg) {
      try {
        await U.apiPost("/api/commits", body);
        this.$store.vu.toast(successMsg);
        await this.load();
      } catch (err) {
        this.$store.vu.toast(err.message || "action failed", true);
      }
    },

    async onCheckout(d) {
      const ok = await this.$store.vu.confirmAction(
        "Checkout commit",
        `Check out ${d.short || d.hash}? This leaves HEAD detached from the current branch.`,
        { confirmLabel: "Checkout" }
      );
      if (!ok) return;
      await this.runAction({ action: "checkout", hash: d.hash }, "Checked out " + (d.short || d.hash));
    },

    async onCherryPick(d) {
      const ok = await this.$store.vu.confirmAction(
        "Cherry-pick",
        `Cherry-pick ${d.short || d.hash} onto the current branch?`,
        { confirmLabel: "Cherry-pick" }
      );
      if (!ok) return;
      await this.runAction({ action: "cherry-pick", hash: d.hash }, "Cherry-picked " + (d.short || d.hash));
    },

    async onRevert(d) {
      const ok = await this.$store.vu.confirmAction(
        "Revert commit",
        `Create a revert of ${d.short || d.hash} on the current branch?`,
        { danger: true, confirmLabel: "Revert" }
      );
      if (!ok) return;
      await this.runAction({ action: "revert", hash: d.hash }, "Reverted " + (d.short || d.hash));
    },

    async onReset(d) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
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
      const ok = await vu.confirmAction(
        hard ? "Hard reset" : "Reset HEAD",
        hard
          ? `Hard reset to ${d.short || d.hash}? Uncommitted changes in the index and working tree will be discarded. This cannot be undone easily.`
          : `Reset HEAD to ${d.short || d.hash} (${mode})?`,
        { danger: hard, confirmLabel: hard ? "Hard reset" : "Reset" }
      );
      if (!ok) return;
      await this.runAction({ action: "reset", hash: d.hash, mode }, `Reset (${mode}) to ` + (d.short || d.hash));
    },

    async onBranch(d) {
      const fields = await this.$store.vu.promptFields(
        "Branch here",
        [{ name: "name", label: "Branch name", required: true, placeholder: "feature/name" }],
        { confirmLabel: "Create branch" }
      );
      if (!fields || !String(fields.name || "").trim()) return;
      const name = String(fields.name).trim();
      await this.runAction({ action: "branch", hash: d.hash, name }, "Created branch " + name);
    },

    async onTag(d) {
      const fields = await this.$store.vu.promptFields(
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
      const body = { action: "tag", hash: d.hash, name, annotated: !!fields.annotated };
      const msg = String(fields.message || "").trim();
      if (msg) body.message = msg;
      await this.runAction(body, "Created tag " + name);
    },

    async onUpdateAuthor(d) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
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
        vu.toast("Name and email are required", true);
        return;
      }
      const ok = await vu.confirmAction(
        "Rewrite commit author",
        "Updating the author rewrites git history (amend on HEAD, or filter-branch otherwise). Anyone who already pulled this commit will need to reconcile. Continue?",
        { danger: true, confirmLabel: "Rewrite author" }
      );
      if (!ok) return;
      const body = { action: "update-author", hash: d.hash, author, email };
      const date = String(fields.date || "").trim();
      if (date) body.date = date;
      await this.runAction(body, "Updated author on " + (d.short || d.hash));
    },

    async onReword(d) {
      const vu = this.$store.vu;
      const fields = await vu.promptFields(
        "Reword commit",
        [
          {
            name: "message",
            label: "Commit message",
            type: "textarea",
            required: true,
            value: this.defaultMessage(d),
          },
        ],
        { confirmLabel: "Reword" }
      );
      if (!fields) return;
      const message = String(fields.message || "").trim();
      if (!message) {
        vu.toast("Message is required", true);
        return;
      }
      await this.runAction({ action: "reword", hash: d.hash, message }, "Reworded " + (d.short || d.hash));
    },

    async onCopy(d) {
      try {
        await U.copyText(d.hash || d.short || "");
        this.$store.vu.toast("Copied " + (d.hash || d.short));
      } catch (err) {
        this.$store.vu.toast(err.message || "Copy failed", true);
      }
    },

    goParent(p) {
      this.selected = p;
      this.showDetail(p);
      this.$nextTick(() => {
        const row = this.$root.querySelector(`.graph-row[data-hash="${CSS.escape(p)}"]`);
        if (row) row.scrollIntoView({ block: "nearest" });
      });
    },
  }));
});
