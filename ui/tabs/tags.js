"use strict";

(() => {
  const {
    el,
    esc,
    toast,
    apiGet,
    apiPost,
    confirmAction,
    promptFields,
    setTopbar,
    content,
  } = window.vu;

  let tags = [];
  let selectedName = "";
  let gen = 0;
  let busy = false;

  window.TabRenderers = window.TabRenderers || {};
  window.TabRenderers.tags = async function renderTags() {
    content.classList.add("wide");
    const my = ++gen;
    showLoading();
    refreshTopbar();

    let data;
    try {
      data = await apiGet("/api/tags");
      if (my !== gen) return;
    } catch (err) {
      if (my !== gen) return;
      showError("Can't load tags", err);
      return;
    }

    tags = Array.isArray(data.tags) ? data.tags : [];
    paint();
  };

  async function refreshTopbar() {
    try {
      const data = await apiGet("/api/overview");
      if (data && data.repo) setTopbar(data.repo);
    } catch {
      /* overview is optional */
    }
  }

  function showError(title, err) {
    content.replaceChildren(
      el("div", "notice", `<h2>${esc(title)}</h2><p>${esc(err.message || err)}</p>`)
    );
  }

  function showLoading() {
    content.replaceChildren(
      el("div", "placeholder", `<div class="ico">\u{1F3F7}\u{FE0F}</div><h2>Loading tags\u2026</h2>`)
    );
  }

  function findTag(name) {
    return tags.find((t) => t.name === name) || null;
  }

  function resolveSelected() {
    const still = findTag(selectedName);
    if (still) return still;
    return tags[0] || null;
  }

  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function dash(v) {
    const s = String(v ?? "").trim();
    return s ? s : "\u2014";
  }

  function button(label, className, onClick) {
    const b = el("button", window.vu.autoTone(className, label), window.vu.labelHtml(label));
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  function typePill(t) {
    return t.annotated
      ? el("span", "pill yellow", "annotated")
      : el("span", "pill", "lightweight");
  }

  async function remoteChoices() {
    try {
      const data = await apiGet("/api/remotes");
      return (data.remotes || []).map((r) => r.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function pickRemote(title, confirmLabel) {
    const names = await remoteChoices();
    const fields = names.length
      ? [{ name: "remote", label: "Remote", type: "select", options: names, value: names[0] }]
      : [{ name: "remote", label: "Remote", value: "origin", placeholder: "origin" }];
    return promptFields(title, fields, { confirmLabel });
  }

  function paint() {
    const selected = resolveSelected();
    selectedName = selected ? selected.name : "";

    const frag = document.createDocumentFragment();
    frag.append(buildToolbar());

    if (!tags.length) {
      frag.append(
        el(
          "div",
          "empty-state",
          `<span class="ico">\u{1F3F7}\u{FE0F}</span><span>No tags in this repository</span>`
        )
      );
      content.replaceChildren(frag);
      return;
    }

    const split = el("div", "split");
    const listPanel = el("div", "list-panel");
    const detailPanel = el("div", "detail-panel");
    fillList(listPanel, selected);
    fillDetail(detailPanel, selected);
    split.append(listPanel, detailPanel);
    frag.append(split);
    content.replaceChildren(frag);
  }

  function buildToolbar() {
    const bar = el("div", "toolbar");
    bar.append(el("div", "section-title", "Tags"));
    bar.append(el("span", "spacer"));
    bar.append(
      button("Create", "btn btn-primary", () => createTag()),
      button("Push all tags", "btn", () => pushAll())
    );
    return bar;
  }

  function fillList(panel, selected) {
    const scroll = el("div", "list-scroll");
    scroll.append(
      el("div", "card-head", `<h3>Tags</h3><span class="count">${tags.length}</span>`)
    );
    for (const t of tags) scroll.append(tagRow(t, selected));
    panel.replaceChildren(scroll);
  }

  function tagRow(t, selected) {
    const active = selected && selected.name === t.name;
    const row = el("div", "row-item" + (active ? " is-active" : ""));
    row.dataset.name = t.name;

    const main = el("div", "row-main");
    const title = el("div", "row-title", esc(t.name));
    title.title = t.name;
    main.append(title);
    const sub = el("div", "row-sub");
    sub.textContent = t.target || t.hash || "";
    main.append(sub);

    row.append(main, typePill(t));
    row.addEventListener("click", () => selectTag(t.name));
    return row;
  }

  function selectTag(name) {
    selectedName = name;
    content.querySelectorAll(".list-panel .row-item").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.name === name);
    });
    const detail = content.querySelector(".detail-panel");
    if (detail) fillDetail(detail, findTag(name));
  }

  function fillDetail(panel, t) {
    if (!t) {
      panel.replaceChildren(
        el(
          "div",
          "placeholder",
          `<div class="ico">\u{1F3F7}\u{FE0F}</div><h2>Select a tag</h2><p>Choose a tag from the list to inspect it</p>`
        )
      );
      return;
    }

    const head = el("div", "detail-head");
    const titleRow = el("div", "branch-detail");
    titleRow.append(el("h3", null, esc(t.name)));
    titleRow.append(typePill(t));
    head.append(titleRow);

    const body = el("div", "detail-body");
    const kv = el("div", "kv");
    kv.append(el("span", "k", "Name"), el("span", "v", esc(t.name)));
    kv.append(el("span", "k", "Hash"), el("span", "v hash", esc(dash(t.hash))));
    kv.append(el("span", "k", "Target"), el("span", "v hash", esc(dash(t.target))));
    kv.append(el("span", "k", "Type"), el("span", "v", t.annotated ? "annotated" : "lightweight"));
    kv.append(el("span", "k", "Tagger"), el("span", "v", esc(dash(t.tagger))));
    kv.append(el("span", "k", "Date"), el("span", "v", esc(dash(fmtDate(t.date) || t.date))));
    kv.append(el("span", "k", "Subject"), el("span", "v", esc(dash(t.subject || t.message))));
    body.append(kv);

    if (t.message && t.message !== t.subject) {
      const msg = el("p");
      msg.style.cssText = "margin-top:12px;color:var(--text-dim);white-space:pre-wrap;";
      msg.textContent = t.message;
      body.append(msg);
    }

    const actions = el("div", "row-actions");
    actions.style.marginTop = "16px";
    actions.append(
      button("Checkout", "btn btn-sm", () => checkoutTag(t)),
      button("Push", "btn btn-sm", () => pushTag(t)),
      button("Delete", "btn btn-sm btn-danger", () => deleteTag(t))
    );
    body.append(actions);
    panel.replaceChildren(head, body);
  }

  async function runAction(body, okMsg, opts) {
    if (busy) return false;
    busy = true;
    try {
      await apiPost("/api/tags", body);
      if (opts && opts.select) selectedName = opts.select;
      if (opts && opts.clear) selectedName = "";
      toast(okMsg);
      await window.TabRenderers.tags();
      return true;
    } catch (err) {
      toast(err.message || "action failed", true);
      return false;
    } finally {
      busy = false;
    }
  }

  async function createTag() {
    const fields = await promptFields(
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
      toast("Tag name is required", true);
      return;
    }
    const body = {
      action: "create",
      name,
      annotated: !!fields.annotated,
      signed: !!fields.signed,
    };
    const hash = String(fields.hash || "").trim();
    const message = String(fields.message || "").trim();
    if (hash) body.hash = hash;
    if (message) body.message = message;
    await runAction(body, `Created tag ${name}`, { select: name });
  }

  async function pushAll() {
    const fields = await pickRemote("Push all tags", "Push all");
    if (!fields) return;
    const remote = String(fields.remote || "").trim();
    const body = { action: "push-all" };
    if (remote) body.remote = remote;
    await runAction(body, remote ? `Pushed all tags to ${remote}` : "Pushed all tags");
  }

  async function pushTag(t) {
    const fields = await pickRemote(`Push ${t.name}`, "Push");
    if (!fields) return;
    const remote = String(fields.remote || "").trim();
    const body = { action: "push", name: t.name };
    if (remote) body.remote = remote;
    await runAction(body, `Pushed ${t.name}`);
  }

  async function deleteTag(t) {
    const ok = await confirmAction(
      "Delete tag",
      `Delete local tag “${t.name}”? Remote tags are not removed.`,
      { danger: true, confirmLabel: "Delete" }
    );
    if (!ok) return;
    await runAction({ action: "delete", name: t.name }, `Deleted ${t.name}`, {
      clear: selectedName === t.name,
    });
  }

  async function checkoutTag(t) {
    const ok = await confirmAction(
      "Checkout tag",
      `Check out tag “${t.name}”? This leaves the repository in a detached HEAD state.`,
      { confirmLabel: "Checkout" }
    );
    if (!ok) return;
    await runAction({ action: "checkout", name: t.name }, `Checked out ${t.name} (detached HEAD)`);
  }
})();
