"use strict";

document.addEventListener("alpine:init", () => {
  const U = window.VU;

  Alpine.data("submodulesTab", () => ({
    loading: true,
    error: "",
    list: [],

    init() {
      this.$watch(() => this.$store.vu.refreshTick, () => this.load());
      this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      this.$store.vu.refreshOverview();
      try {
        const data = await U.apiGet("/api/submodules");
        this.list = Array.isArray(data.submodules) ? data.submodules : [];
      } catch (err) {
        this.error = err.message || String(err);
        this.list = [];
      } finally {
        this.loading = false;
      }
    },

    pillClass(status) {
      const s = String(status || "ok");
      if (s === "ok") return "pill green";
      if (s === "uninitialized" || s === "out-of-date") return "pill yellow";
      if (s === "conflict") return "pill red";
      return "pill";
    },

    rowSub(sm) {
      const bits = [];
      if (sm.hash) bits.push(sm.hash.length > 12 ? sm.hash.slice(0, 8) : sm.hash);
      if (sm.branch) bits.push(sm.branch);
      if (sm.url) bits.push(sm.url);
      if (sm.message) bits.push(sm.message);
      return bits.join(" · ");
    },

    async runAction(body, okMsg) {
      try {
        await U.apiPost("/api/submodules", body);
        this.$store.vu.toast(okMsg);
        await this.load();
      } catch (err) {
        this.$store.vu.toast(err.message || "submodule action failed", true);
      }
    },
  }));
});
