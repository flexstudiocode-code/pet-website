/* ==========================================================================
   Paw & Glow — Site Manager (client CMS) logic
   ==========================================================================
   - Server mode:  edits saved to content.json via POST /api/config
   - Static mode:  if /api/config is unreachable, loads content.json directly
                   and falls back to Export (download) / Import (upload).
   ========================================================================== */

(function () {
  "use strict";

  var state = {
    content: null,
    serverMode: false,
    passcode: sessionStorage.getItem("cmsPasscode") || "",
    dirty: false,
    saving: false
  };

  /* ---------------- helpers ---------------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) {
      return o && typeof o === "object" ? o[k] : undefined;
    }, obj);
  }

  function setPath(obj, path, val) {
    var parts = path.split(".");
    var last = parts.pop();
    var o = obj;
    parts.forEach(function (k) {
      if (typeof o[k] !== "object" || o[k] === null) o[k] = {};
      o = o[k];
    });
    o[last] = val;
  }

  function toast(msg, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3600);
  }

  function markDirty(d) {
    state.dirty = d !== false;
    var el = $("#saveState");
    if (state.dirty) {
      el.textContent = "Unsaved changes…";
      el.classList.add("dirty");
    } else {
      el.textContent = state.serverMode ? "All changes saved" : "Ready";
      el.classList.remove("dirty");
    }
  }

  window.addEventListener("beforeunload", function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  function api(path, body) {
    return fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r
        .json()
        .then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        })
        .catch(function () {
          return { ok: r.ok, status: r.status, data: {} };
        });
    });
  }

  /* ---------------- boot ---------------- */

  function init() {
    fetch("/api/config", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("no api");
        return r.json();
      })
      .then(function (content) {
        state.serverMode = true;
        state.content = content;
        startLogin();
      })
      .catch(function () {
        /* Static hosting fallback: read content.json directly (absolute
           path so it works from /admin as well as /admin.html). */
        fetch("/content.json", { cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("no content.json");
            return r.json();
          })
          .then(function (content) {
            state.serverMode = false;
            state.content = content;
            enterEditor();
            toast(
              "Server mode is off — edit here, then use Export and upload content.json to your host",
              "err"
            );
          })
          .catch(function () {
            toast("Could not load content.json", "err");
          });
      });
  }

  function startLogin() {
    if (state.passcode) {
      api("/api/verify", { passcode: state.passcode }).then(function (res) {
        if (res.ok) {
          enterEditor();
        } else {
          showLogin();
        }
      });
    } else {
      showLogin();
    }
  }

  var loginBound = false;
  function showLogin() {
    $("#login").classList.remove("hidden");
    if (loginBound) return;
    loginBound = true;
    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var code = $("#passcode").value.trim();
      api("/api/verify", { passcode: code }).then(function (res) {
        if (res.ok) {
          state.passcode = code;
          sessionStorage.setItem("cmsPasscode", code);
          enterEditor();
        } else {
          $("#loginError").textContent = "That passcode isn't right — try again.";
          $("#passcode").select();
        }
      });
    });
  }

  function enterEditor() {
    $("#login").classList.add("hidden");
    $("#editor").classList.remove("hidden");
    if (!state.serverMode) {
      var btn = $("#btnSave");
      btn.disabled = true;
      btn.textContent = "Server offline";
    }
    populate();
    bindUI();
    markDirty(false);
  }

  /* ---------------- form <-> state ---------------- */

  function populate() {
    $all("[data-cfg]").forEach(function (el) {
      var val = getPath(state.content, el.getAttribute("data-cfg"));
      el.value = val === undefined || val === null ? "" : val;
    });
    $all("[data-list]").forEach(function (container) {
      renderList(container);
    });
    var nameEl = $("#topbarName");
    var name = getPath(state.content, "brand.name");
    if (name) nameEl.textContent = name;
  }

  function collect() {
    var content = {};
    $all("[data-cfg]").forEach(function (el) {
      setPath(content, el.getAttribute("data-cfg"), el.value.trim());
    });
    $all("[data-list]").forEach(function (container) {
      setPath(content, container.getAttribute("data-list"), listItems(container));
    });
    return content;
  }

  /* ---------------- list editors ---------------- */

  function listConfig(container) {
    var fields = null;
    if (container.getAttribute("data-fields")) {
      fields = JSON.parse(container.getAttribute("data-fields"));
    }
    return {
      fields: fields,
      itemType: container.getAttribute("data-item-type") || "object",
      label: container.getAttribute("data-item-label") || "Item"
    };
  }

  function listItems(container) {
    var items = getPath(state.content, container.getAttribute("data-list"));
    if (!Array.isArray(items)) {
      setPath(state.content, container.getAttribute("data-list"), []);
      return [];
    }
    return items;
  }

  function renderList(container) {
    var cfg = listConfig(container);
    var items = listItems(container);
    container.innerHTML = "";
    items.forEach(function (item, i) {
      container.appendChild(buildItemEl(container, cfg, item, i));
    });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "add-btn";
    add.textContent = "+ Add " + cfg.label.toLowerCase();
    add.addEventListener("click", function () {
      var items = listItems(container);
      var empty = cfg.itemType === "string" ? "" : {};
      if (cfg.fields) {
        cfg.fields.forEach(function (f) {
          if (!empty[f.key]) empty[f.key] = "";
        });
      }
      items.push(empty);
      markDirty();
      renderList(container);
    });
    container.appendChild(add);
  }

  function buildItemEl(container, cfg, item, i) {
    var card = document.createElement("div");
    card.className = "list-item";

    var head = document.createElement("div");
    head.className = "list-item-head";
    var title = document.createElement("span");
    title.className = "list-item-title";
    title.textContent = itemTitle(cfg, item, i);
    head.appendChild(title);

    var actions = document.createElement("div");
    actions.className = "list-item-actions";
    actions.appendChild(iconBtn("↑", "Move up", function () { moveItem(container, i, -1); }));
    actions.appendChild(iconBtn("↓", "Move down", function () { moveItem(container, i, 1); }));
    actions.appendChild(iconBtn("✕", "Remove", function () { removeItem(container, i); }));
    head.appendChild(actions);
    card.appendChild(head);

    var fieldsWrap = document.createElement("div");
    fieldsWrap.className = "list-item-fields";

    if (cfg.itemType === "string") {
      fieldsWrap.appendChild(
        textField(container, i, cfg.label, "text", item || "", null)
      );
    } else {
      cfg.fields.forEach(function (f) {
        if (f.type === "image") {
          fieldsWrap.appendChild(
            imageField(container, i, f.key, item[f.key] || "", f.label)
          );
        } else {
          fieldsWrap.appendChild(
            textField(container, i, f.label, f.type || "text", item[f.key] || "", f.key)
          );
        }
      });
    }
    card.appendChild(fieldsWrap);
    return card;
  }

  function itemTitle(cfg, item, i) {
    if (cfg.itemType === "string") {
      var s = String(item || "").trim();
      return s ? s : "Item " + (i + 1);
    }
    var first = cfg.fields && cfg.fields[0] && item[cfg.fields[0].key];
    if (first && String(first).trim()) return String(first).trim();
    return "Item " + (i + 1);
  }

  function iconBtn(label, title, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  }

  function textField(container, index, label, type, value, key) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var lab = document.createElement("label");
    lab.textContent = label;
    wrap.appendChild(lab);
    var el = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    if (type === "textarea") {
      el.rows = 2;
    } else {
      el.type = "text";
    }
    el.value = value;
    el.addEventListener("input", function () {
      updateItem(container, index, key, el.value);
    });
    wrap.appendChild(el);
    return wrap;
  }

  function updateItem(container, index, key, value) {
    var items = listItems(container);
    if (!items[index]) return;
    if (key) items[index][key] = value;
    else items[index] = value;
    markDirty();
    var card = container.children[index];
    if (card) {
      var cfg = listConfig(container);
      var titleEl = card.querySelector(".list-item-title");
      if (titleEl) titleEl.textContent = itemTitle(cfg, items[index], index);
    }
  }

  function moveItem(container, i, dir) {
    var items = listItems(container);
    var j = i + dir;
    if (j < 0 || j >= items.length) return;
    var tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
    markDirty();
    renderList(container);
  }

  function removeItem(container, i) {
    var items = listItems(container);
    items.splice(i, 1);
    markDirty();
    renderList(container);
  }

  function imageField(container, index, key, value, label) {
    var wrap = document.createElement("div");
    wrap.className = "img-field";

    var thumb = document.createElement("img");
    thumb.className = "img-thumb";
    thumb.alt = "Photo preview";
    if (value) {
      thumb.src = value;
    } else {
      thumb.classList.add("placeholder");
      thumb.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }

    var inner = document.createElement("div");

    var field = document.createElement("div");
    field.className = "field";
    var lab = document.createElement("label");
    lab.textContent = label || "Image URL";
    var input = document.createElement("input");
    input.type = "url";
    input.value = value || "";
    input.placeholder = "https://…  or  /uploads/photo.jpg";
    input.addEventListener("input", function () {
      var url = input.value.trim();
      updateItem(container, index, key, url);
      if (url) {
        thumb.src = url;
        thumb.classList.remove("placeholder");
      } else {
        thumb.classList.add("placeholder");
      }
    });
    field.appendChild(lab);
    field.appendChild(input);
    inner.appendChild(field);

    var actions = document.createElement("div");
    actions.className = "img-actions";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-upload";
    btn.textContent = "Upload photo";
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    btn.addEventListener("click", function () {
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      uploadImage(fileInput.files[0], function (err, url) {
        if (err) {
          toast("Upload failed: " + err, "err");
          return;
        }
        input.value = url;
        updateItem(container, index, key, url);
        thumb.src = url;
        thumb.classList.remove("placeholder");
        toast("Photo uploaded", "ok");
      });
    });
    actions.appendChild(btn);
    actions.appendChild(fileInput);
    inner.appendChild(actions);

    wrap.appendChild(thumb);
    wrap.appendChild(inner);
    return wrap;
  }

  function uploadImage(file, done) {
    if (!state.serverMode) {
      done("uploads need the server running");
      return;
    }
    fetch(
      "/api/upload?name=" +
        encodeURIComponent(file.name) +
        "&passcode=" +
        encodeURIComponent(state.passcode),
      { method: "POST", body: file }
    )
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (res) {
        if (res.ok && res.d.url) done(null, res.d.url);
        else done((res.d && res.d.error) || "upload failed");
      })
      .catch(function () {
        done("network error");
      });
  }

  /* ---------------- actions ---------------- */

  function save() {
    if (!state.serverMode) {
      toast("Server mode is off — use Export instead", "err");
      return;
    }
    if (state.saving) return;
    state.saving = true;
    var btn = $("#btnSave");
    btn.disabled = true;
    btn.textContent = "Saving…";

    api("/api/config", { passcode: state.passcode, content: collect() })
      .then(function (res) {
        if (res.ok) {
          markDirty(false);
          toast("Saved — your website is updated", "ok");
        } else if (res.status === 401) {
          state.passcode = "";
          sessionStorage.removeItem("cmsPasscode");
          toast("Session expired — please log in again", "err");
          showLogin();
        } else {
          toast(
            "Could not save: " +
              (res.data && res.data.error ? res.data.error : "server error"),
            "err"
          );
        }
      })
      .catch(function () {
        toast("Network error — is the server running?", "err");
      })
      .then(function () {
        state.saving = false;
        btn.disabled = false;
        btn.textContent = "Save changes";
      });
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(collect(), null, 2)], {
      type: "application/json"
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "content.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          throw new Error("bad shape");
        }
        state.content = data;
        populate();
        markDirty();
        toast("Imported — review, then press Save", "ok");
      } catch (e) {
        toast("That file isn't valid content.json", "err");
      }
    };
    reader.readAsText(file);
  }

  function bindUI() {
    $all(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $all(".nav-item").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        $all(".panel").forEach(function (p) {
          p.classList.remove("active");
        });
        var target = $("#panel-" + btn.getAttribute("data-panel"));
        if (target) target.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    $("#btnSave").addEventListener("click", save);
    $("#btnExport").addEventListener("click", exportJSON);
    $("#btnImport").addEventListener("click", function () {
      $("#importFile").click();
    });
    $("#importFile").addEventListener("change", function () {
      if (this.files && this.files[0]) importJSON(this.files[0]);
      this.value = "";
    });
    $("#btnLogout").addEventListener("click", function () {
      state.passcode = "";
      state.dirty = false;
      sessionStorage.removeItem("cmsPasscode");
      $("#editor").classList.add("hidden");
      $("#passcode").value = "";
      $("#loginError").textContent = "";
      showLogin();
    });

    $all("[data-cfg]").forEach(function (el) {
      el.addEventListener("input", markDirty);
    });
  }

  init();
})();
