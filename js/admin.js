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
    github: loadGithub(),
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
      el.textContent = state.serverMode || state.github ? "All changes saved" : "Ready";
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
            if (state.github) {
              toast("Static hosting detected — Save now commits changes to GitHub", "ok");
            } else {
              showStaticBanner();
              toast(
                "This host can't save directly — connect GitHub in Publishing to make Save publish your edits",
                "err"
              );
            }
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
    enableSaveForMode();
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
    if (state.github) {
      githubUpload(file, done);
      return;
    }
    if (!state.serverMode) {
      done("uploads need the server running — or connect GitHub in Publishing");
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

  /* ---------------- GitHub publishing (static hosts) ---------------- */

  function loadGithub() {
    try {
      var saved = JSON.parse(localStorage.getItem("cmsGitHub"));
      if (saved && saved.repo && saved.token) return saved;
    } catch (e) {}
    return null;
  }

  function persistGithub(cfg) {
    if (cfg) localStorage.setItem("cmsGitHub", JSON.stringify(cfg));
    else localStorage.removeItem("cmsGitHub");
    state.github = cfg;
  }

  function ghAuth(token) {
    var h = {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  function ghPath(path) {
    return path
      .split("/")
      .map(encodeURIComponent)
      .join("/");
  }

  function parseRes(r) {
    return r
      .json()
      .then(function (d) {
        return { status: r.status, data: d };
      })
      .catch(function () {
        return { status: r.status, data: {} };
      });
  }

  function verifyToken(token, done) {
    fetch("https://api.github.com/user", { headers: ghAuth(token) })
      .then(parseRes)
      .then(function (res) {
        done(null, res);
      })
      .catch(function (e) {
        done(e && e.message ? e.message : "network error");
      });
  }

  function ghGet(cfg, done) {
    var url =
      "https://api.github.com/repos/" +
      cfg.repo +
      "/contents/" +
      ghPath(cfg.path) +
      "?ref=" +
      encodeURIComponent(cfg.branch);
    fetch(url, { headers: ghAuth(cfg.token) })
      .then(parseRes)
      .then(function (res) {
        done(null, res);
      })
      .catch(function (e) {
        done(e && e.message ? e.message : "network error");
      });
  }

  function apiErr(res) {
    if (res.status === 401 || res.status === 403) return "auth";
    return (res.data && res.data.message) || "GitHub returned " + res.status;
  }

  function setGhStatus(msg, kind) {
    var el = $("#githubStatus");
    el.textContent = msg;
    el.className =
      "github-status" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  }

  function readGhForm() {
    var repo = $("#ghRepo")
      .value.trim()
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    if (!repo) {
      setGhStatus("Enter the repository as owner/name.", "err");
      return null;
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      setGhStatus("The repository should look like owner/name.", "err");
      return null;
    }
    return {
      repo: repo,
      branch: $("#ghBranch").value.trim() || "main",
      path: $("#ghPath").value.trim() || "content.json",
      token: $("#ghToken").value.trim()
    };
  }

  function testGithub() {
    var cfg = readGhForm();
    if (!cfg) return;
    setGhStatus("Testing…", "");
    ghGet(cfg, function (err, res) {
      if (err) return setGhStatus("Can't reach GitHub: " + err, "err");
      if (res.status === 200) {
        if (cfg.token) {
          /* A read-only GET succeeds on public repos even with a bogus
             token (GitHub treats it as anonymous), so verify the token
             itself against /user before claiming it works. */
          verifyToken(cfg.token, function (err2, res2) {
            if (err2) return setGhStatus("Can't reach GitHub: " + err2, "err");
            if (res2.status === 200) {
              setGhStatus(
                "✓ Connected — " +
                  cfg.repo +
                  " @" +
                  cfg.branch +
                  " is reachable and the token is valid. Press Connect to finish.",
                "ok"
              );
            } else {
              setGhStatus(
                "The token looks invalid (GitHub rejected it) — check it's copied fully and hasn't expired.",
                "err"
              );
            }
          });
        } else {
          setGhStatus(
            "The repository is reachable, but no token was entered — saving won't work without one.",
            "err"
          );
        }
      } else if (res.status === 401 || res.status === 403) {
        setGhStatus(
          "Token rejected — check its permissions (it needs Contents: Read and write on this repo).",
          "err"
        );
      } else if (res.status === 404) {
        setGhStatus("Not found — check the repository, branch and file path.", "err");
      } else {
        setGhStatus(
          "Unexpected response (" + res.status + "): " + (res.data.message || ""),
          "err"
        );
      }
    });
  }

  function connectGithub() {
    var cfg = readGhForm();
    if (!cfg) return;
    if (!cfg.token) {
      setGhStatus("Enter a token to connect.", "err");
      return;
    }
    setGhStatus("Connecting…", "");
    verifyToken(cfg.token, function (err, res) {
      if (err) return setGhStatus("Can't reach GitHub: " + err, "err");
      if (res.status !== 200) {
        return setGhStatus(
          "The token was rejected — check it's copied fully and hasn't expired.",
          "err"
        );
      }
      ghGet(cfg, function (err2, res2) {
        if (err2) return setGhStatus("Can't reach GitHub: " + err2, "err");
        if (res2.status !== 200) {
          return setGhStatus(
            "Connection failed — the repository wasn't found; press Test connection for details.",
            "err"
          );
        }
        state.github = {
          repo: cfg.repo,
          branch: cfg.branch,
          path: cfg.path,
          token: cfg.token,
          sha: (res2.data && res2.data.sha) || null
        };
        persistGithub(state.github);
        initGithubUI();
        enableSaveForMode();
        setGhStatus(
          "Connected — your edits now save to GitHub. If the first save fails, the token is missing Contents: write access.",
          "ok"
        );
        if (!state.serverMode) {
          toast("Save changes will now publish to " + state.github.repo, "ok");
        } else {
          toast(
            "Note: Save now publishes to GitHub — the local server file is left untouched",
            "ok"
          );
        }
      });
    });
  }

  function disconnectGithub() {
    persistGithub(null);
    $("#ghToken").value = "";
    initGithubUI();
    enableSaveForMode();
    if (!state.serverMode) showStaticBanner();
    setGhStatus("Disconnected — use Export to download content.json manually.", "ok");
  }

  function setLastSync() {
    localStorage.setItem("cmsGitHubLastSync", new Date().toISOString());
    renderLastSync();
  }

  function renderLastSync() {
    var t = localStorage.getItem("cmsGitHubLastSync");
    $("#ghLastSync").textContent = t
      ? "Last published " +
        new Date(t).toLocaleString() +
        " — the live site rebuilds within about a minute."
      : "";
  }

  function initGithubUI() {
    if (state.github) {
      $("#githubFields").classList.add("hidden");
      $("#githubConnected").classList.remove("hidden");
      $("#ghSummary").textContent =
        state.github.repo + " @" + state.github.branch + " (" + state.github.path + ")";
      renderLastSync();
      var banner = $("#staticBanner");
      if (banner) banner.classList.add("hidden");
    } else {
      $("#githubFields").classList.remove("hidden");
      $("#githubConnected").classList.add("hidden");
    }
  }

  function showStaticBanner() {
    var banner = $("#staticBanner");
    if (banner) banner.classList.remove("hidden");
  }

  function enableSaveForMode() {
    var btn = $("#btnSave");
    if (state.github || state.serverMode) {
      btn.disabled = false;
      btn.textContent = "Save changes";
    } else {
      btn.disabled = true;
      btn.textContent = "Set up publishing";
    }
  }

  function pushToGithub(content, done) {
    var gh = state.github;
    var encoded;
    try {
      encoded = btoa(
        unescape(encodeURIComponent(JSON.stringify(content, null, 2) + "\n"))
      );
    } catch (e) {
      return done("could not encode the content");
    }

    function doPut(sha, cb) {
      var body = {
        message: "Update site content via CMS",
        content: encoded,
        branch: gh.branch
      };
      if (sha) body.sha = sha;
      fetch(
        "https://api.github.com/repos/" + gh.repo + "/contents/" + ghPath(gh.path),
        {
          method: "PUT",
          headers: ghAuth(gh.token),
          body: JSON.stringify(body)
        }
      )
        .then(parseRes)
        .then(function (res) {
          cb(null, res);
        })
        .catch(function (e) {
          cb(e && e.message ? e.message : "network error");
        });
    }

    function saveSha(res, doneCb) {
      if (!state.github) return doneCb("disconnected");
      state.github.sha = res.data.content.sha;
      persistGithub(state.github);
      return doneCb(null, res.data.content.html_url);
    }

    doPut(gh.sha, function (err, res) {
      if (err) return done(err);
      if (res.status === 200 || res.status === 201) return saveSha(res, done);
      if (res.status === 409) {
        /* Someone else updated the file since we loaded it — fetch the
           latest SHA and retry once. */
        return ghGet(gh, function (e2, res2) {
          if (e2) return done(e2);
          if (res2.status !== 200 || !res2.data.sha) {
            return done("conflict — the file changed elsewhere; refresh and try again");
          }
          doPut(res2.data.sha, function (e3, res3) {
            if (e3) return done(e3);
            if (res3.status === 200 || res3.status === 201) return saveSha(res3, done);
            done(apiErr(res3));
          });
        });
      }
      done(apiErr(res));
    });
  }

  function githubUpload(file, done) {
    var gh = state.github;
    if (!gh) return done("no GitHub connection");
    if (file.size > 10 * 1024 * 1024) {
      return done("photo is larger than 10 MB");
    }
    var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    var path = "uploads/" + Date.now() + "-" + safe;
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      var base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      fetch(
        "https://api.github.com/repos/" + gh.repo + "/contents/" + ghPath(path),
        {
          method: "PUT",
          headers: ghAuth(gh.token),
          body: JSON.stringify({
            message: "Add photo via CMS",
            content: base64,
            branch: gh.branch
          })
        }
      )
        .then(parseRes)
        .then(function (res) {
          if (res.status === 200 || res.status === 201) {
            var url =
              "https://raw.githubusercontent.com/" +
              gh.repo +
              "/" +
              encodeURIComponent(gh.branch) +
              "/" +
              ghPath(path);
            done(null, url);
          } else {
            var e = apiErr(res);
            done(e === "auth" ? "the GitHub token can't write to the repo" : e);
          }
        })
        .catch(function (e) {
          done(e && e.message ? e.message : "network error");
        });
    };
    reader.onerror = function () {
      done("could not read the file");
    };
    reader.readAsDataURL(file);
  }

  /* ---------------- actions ---------------- */

  function nowStamp() {
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      p(d.getMonth() + 1) +
      "-" +
      p(d.getDate()) +
      " " +
      p(d.getHours()) +
      ":" +
      p(d.getMinutes()) +
      ":" +
      p(d.getSeconds())
    );
  }

  function save() {
    if (state.saving) return;
    var btn = $("#btnSave");
    var content = collect();

    /* GitHub mode (static hosts like Vercel): commit content.json to the
       repo — the host's auto-deploy makes the change live. */
    if (state.github) {
      content.lastEdited = nowStamp();
      state.saving = true;
      btn.disabled = true;
      btn.textContent = "Saving to GitHub…";
      pushToGithub(content, function (err) {
        state.saving = false;
        btn.disabled = false;
        btn.textContent = "Save changes";
        if (err) {
          if (err === "auth") {
            toast(
              "GitHub token was rejected — reconnect it in the Publishing section",
              "err"
            );
          } else {
            toast("Could not save: " + err, "err");
          }
        } else {
          markDirty(false);
          setLastSync();
          toast("Saved to GitHub — your website updates in about a minute", "ok");
        }
      });
      return;
    }

    if (!state.serverMode) {
      toast("Nothing connected — use Export and upload content.json to your host", "err");
      return;
    }
    if (state.saving) return;
    state.saving = true;
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

  function switchPanel(name) {
    $all(".nav-item").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-panel") === name);
    });
    $all(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindUI() {
    $all(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchPanel(btn.getAttribute("data-panel"));
      });
    });

    $("#btnGotoPublish").addEventListener("click", function () {
      switchPanel("publish");
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

    $("#btnGhTest").addEventListener("click", testGithub);
    $("#btnGhConnect").addEventListener("click", connectGithub);
    $("#btnGhDisconnect").addEventListener("click", disconnectGithub);
    initGithubUI();

    $all("[data-cfg]").forEach(function (el) {
      el.addEventListener("input", markDirty);
    });
  }

  init();
})();
