/* =============================================================================
   Lone State Builders Co — landing page logic
   - Supabase client (v2)
   - Resumable uploads to Storage (TUS) — handles large files
   - Lead record written to `leads` table
============================================================================= */

(() => {
  const cfg = window.LSB_CONFIG;
  const sb =
    window.supabase && cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const form = document.getElementById("bid-form");
  const fileInput = document.getElementById("file-input");
  const dropzone = document.getElementById("dropzone");
  const browseBtn = document.getElementById("browse-btn");
  const filelist = document.getElementById("filelist");
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("submit-status");
  const toastEl = document.getElementById("toast");

  // files: [{ id, file, progress, status: 'queued'|'uploading'|'done'|'error', path, error }]
  const files = [];
  let uidCounter = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtBytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  };
  const extOf = (name) => {
    const m = /\.([^.]+)$/.exec(name);
    return m ? m[1].toUpperCase() : "FILE";
  };
  const slugify = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);

  function toast(msg, kind = "") {
    toastEl.textContent = msg;
    toastEl.className = `toast is-on ${kind ? "is-" + kind : ""}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toastEl.className = "toast"), 4200);
  }

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = `upload__status ${kind ? kind : ""}`;
  }

  // ── File list rendering ─────────────────────────────────────────────────
  function renderFiles() {
    filelist.innerHTML = "";
    files.forEach((f) => {
      const li = document.createElement("li");
      li.dataset.id = f.id;

      const icon = document.createElement("div");
      icon.className = "ficon";
      icon.textContent = extOf(f.file.name);

      const meta = document.createElement("div");
      meta.className = "fmeta";
      const fname = document.createElement("div");
      fname.className = "fname";
      fname.textContent = f.file.name;
      const fsub = document.createElement("div");
      let subKind = "";
      let subTxt = fmtBytes(f.file.size);
      if (f.status === "uploading") subTxt = `${fmtBytes(f.file.size)} · uploading ${Math.round(f.progress)}%`;
      if (f.status === "done") { subTxt = `${fmtBytes(f.file.size)} · uploaded`; subKind = "ok"; }
      if (f.status === "error") { subTxt = `${f.error || "upload failed"}`; subKind = "err"; }
      fsub.className = `fsub ${subKind}`;
      fsub.textContent = subTxt;
      meta.appendChild(fname);
      meta.appendChild(fsub);

      const prog = document.createElement("div");
      prog.className = "fprog";
      const bar = document.createElement("span");
      bar.style.width = `${f.progress || 0}%`;
      prog.appendChild(bar);

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "frm";
      rm.setAttribute("aria-label", `Remove ${f.file.name}`);
      rm.innerHTML = "&times;";
      rm.onclick = () => {
        const i = files.findIndex((x) => x.id === f.id);
        if (i >= 0) files.splice(i, 1);
        renderFiles();
      };

      li.appendChild(icon);
      li.appendChild(meta);
      li.appendChild(prog);
      li.appendChild(rm);
      filelist.appendChild(li);
    });
  }

  // ── File intake ─────────────────────────────────────────────────────────
  function addFiles(fl) {
    [...fl].forEach((file) => {
      // validate type
      if (!cfg.ACCEPTED.test(file.name)) {
        toast(`${file.name}: unsupported type — use PDF, DWG or ZIP`, "err");
        return;
      }
      if (file.size > cfg.MAX_FILE_BYTES) {
        toast(`${file.name}: exceeds 750 MB limit`, "err");
        return;
      }
      files.push({
        id: ++uidCounter,
        file,
        progress: 0,
        status: "queued",
      });
    });
    renderFiles();
  }

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", (e) => {
    addFiles(e.target.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("is-drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // ── Resumable upload via TUS (works for large files) ────────────────────
  // https://supabase.com/docs/guides/storage/uploads/resumable-uploads
  let tusLoader = null;
  function loadTus() {
    if (window.tus) return Promise.resolve();
    if (tusLoader) return tusLoader;
    tusLoader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return tusLoader;
  }

  async function uploadOne(entry, folder) {
    await loadTus();
    entry.status = "uploading";
    renderFiles();

    const objectName = `${folder}/${Date.now()}-${slugify(entry.file.name.replace(/\.[^.]+$/, ""))}.${extOf(entry.file.name).toLowerCase()}`;

    return new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(entry.file, {
        endpoint: `${cfg.SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: cfg.BUCKET,
          objectName,
          contentType: entry.file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024, // Supabase requires fixed 6MB chunks for TUS
        onError: (err) => {
          entry.status = "error";
          entry.error = (err && err.message) || "upload failed";
          renderFiles();
          reject(err);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          entry.progress = (bytesUploaded / bytesTotal) * 100;
          renderFiles();
        },
        onSuccess: () => {
          entry.status = "done";
          entry.progress = 100;
          entry.path = objectName;
          renderFiles();
          resolve();
        },
      });

      // Check for previous uploads to resume
      upload.findPreviousUploads().then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      });
    });
  }

  async function uploadAll(folder) {
    const queue = files.filter((f) => f.status !== "done");
    for (const entry of queue) {
      try {
        await uploadOne(entry, folder);
      } catch (err) {
        throw new Error(`Failed on ${entry.file.name}: ${err.message || err}`);
      }
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!sb) {
      setStatus("Supabase not configured.", "err");
      toast("Supabase is not configured. Check config.js.", "err");
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email) {
      setStatus("Name and email are required.", "err");
      return;
    }

    submitBtn.disabled = true;
    const origLabel = submitBtn.innerHTML;

    try {
      // 1. Upload files to Storage (folder per submission)
      const folder = `${new Date().toISOString().slice(0, 10)}/${slugify(
        (data.company || data.name) + "-" + Date.now().toString(36)
      )}`;

      if (files.length) {
        submitBtn.innerHTML = "<span>Uploading blueprints…</span>";
        setStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
        await uploadAll(folder);
      }

      // 2. Insert lead row
      submitBtn.innerHTML = "<span>Sending…</span>";
      setStatus("Sending your request…");

      const row = {
        name: data.name,
        company: data.company || null,
        email: data.email,
        phone: data.phone || null,
        project_location: data.project_location || null,
        project_type: data.project_type || null,
        opening_count: data.opening_count || null,
        timeline: data.timeline || null,
        notes: data.notes || null,
        file_paths: files.filter((f) => f.status === "done").map((f) => f.path),
        file_count: files.length,
        total_bytes: files.reduce((a, b) => a + b.file.size, 0),
        source: "landing",
        user_agent: navigator.userAgent,
      };

      const { data: inserted, error } = await sb
        .from(cfg.LEADS_TABLE)
        .insert([row])
        .select("id")
        .single();
      if (error) throw error;

      // 2a. Fire the edge function → sends welcome + team emails via SendGrid.
      //     Non-blocking from the user's POV: if email fails we still thank them.
      try {
        await sb.functions.invoke("send-lead-emails", {
          body: { lead_id: inserted?.id },
        });
      } catch (mailErr) {
        console.warn("Email notification failed:", mailErr);
      }

      // 3. Done
      setStatus("Received — we'll be in touch within one business day.", "ok");
      toast("Request sent. Thank you!", "ok");
      form.reset();
      files.length = 0;
      renderFiles();
      submitBtn.innerHTML = "<span>Sent ✓</span>";
      setTimeout(() => {
        submitBtn.innerHTML = origLabel;
        submitBtn.disabled = false;
      }, 3500);
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Something went wrong.", "err");
      toast(err.message || "Upload or submission failed.", "err");
      submitBtn.innerHTML = origLabel;
      submitBtn.disabled = false;
    }
  });
})();
