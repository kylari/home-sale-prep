/* Connects the page to Supabase.
   The page was first written against a simple document store
   (collection, doc, set, update, delete, onSnapshot). This file gives it the
   same calls, backed by the Supabase tables, so the page code barely changes.
   Fields the page sends that have no column are kept in each table's "extra". */
(function () {
  const CFG = window.HOME_CONFIG || {};
  const ACTOR_KEY = "home-actor";

  // Field maps: [name in the page, column in the database, kind]
  const MAPS = {
    tasks: [
      ["num","num","int"],["title","title"],["area","area","nullable"],["type","type"],["tier","tier","nullable"],
      ["who","who","nullable"],["status","status"],["due","due","nullable"],["costLow","cost_low","num"],
      ["costHigh","cost_high","num"],["actual","actual","num"],["estHours","est_hours","num"],["actHours","act_hours","num"],
      ["conf","conf","nullable"],["skills","skills"],["tags","tags","array"],["tools","tools","json"],["mats","mats","json"],
      ["links","links","json"],["steps","steps"],["quotes","quotes","json"],["after","after_ids","array"],
      ["contactId","contact_id","uuid"],["repeat","repeat_months","repeat"],["nextMade","next_made","bool"],
      ["materials","materials"],["notes","notes"]
    ],
    contacts: [["name","name"],["company","company"],["role","role"],["trade","trade"],["phone","phone"],["email","email"],["notes","notes"]],
    documents: [["title","title"],["category","category"],["have","have"],["area","area","nullable"],["issued","issued"],
      ["expires","expires"],["notes","notes"],["files","files","json"]],
    finishes: [["area","area","nullable"],["item","item"],["product","product"],["code","code"],["sheen","sheen"],["supplier","supplier"]],
    checklists: [["items","items","json"]],
    // Furniture and decor
    items: [["area","area","nullable"],["name","name"],["category","category"],["action","action"],["toArea","to_area"],
      ["status","status"],["ok","ok","bool"],["task","task"],["cost","cost"],["value","value"],["perMonth","per_month"],
      ["notes","notes"],["photo","photo","json"]],
    // Room page details, stored on the areas table
    areas: [["descAgreed","desc_agreed","bool"],["tasksAgreed","tasks_agreed","bool"],["chosen","chosen","nullable"],
      ["choiceNotes","choice_notes"],["options","options","json"],["current","current_photos","json"],["inspiration","inspiration","json"]]
  };
  const KEY = { tasks: "id", contacts: "id", documents: "id", finishes: "id", checklists: "id", areas: "slug", items: "id" };
  const UUID_KEYS = { contacts: 1, finishes: 1 };
  const SKIP = new Set(["id", "updatedAt", "createdAt", "updatedBy", "createdBy"]);

  function toDb(table, data) {
    const map = MAPS[table], row = {}, extra = {};
    const known = new Set(map.map(m => m[0]));
    for (const [k, col, kind] of map) {
      if (!(k in data)) { continue; }
      let v = data[k];
      if (kind === "num") v = v === "" || v == null || isNaN(+v) ? null : +v;
      else if (kind === "int") v = v === "" || v == null ? null : parseInt(v, 10);
      else if (kind === "nullable" || kind === "uuid") v = v === "" || v == null ? null : v;
      else if (kind === "repeat") v = v === "" || v == null ? null : parseInt(v, 10);
      else if (kind === "bool") v = !!v;
      else if (kind === "array") v = Array.isArray(v) ? v : [];
      else if (kind === "json") { if (v == null) continue; }
      else v = v == null ? "" : String(v);
      row[col] = v;
    }
    for (const k of Object.keys(data)) if (!known.has(k) && !SKIP.has(k)) extra[k] = data[k];
    return { row, extra };
  }
  function fromDb(table, r) {
    const out = {};
    for (const [k, col, kind] of MAPS[table]) {
      let v = r[col];
      if (kind === "repeat") v = v == null ? "" : String(v);
      else if (kind === "uuid" || kind === "nullable") v = v == null ? "" : v;
      else if (kind === "num" || kind === "int") v = v == null ? (kind === "int" ? null : 0) : Number(v);
      out[k] = v;
    }
    if (r.extra) Object.assign(out, r.extra);
    out.updatedAt = r.updated_at;
    out.updatedBy = r.updated_by_name || "";
    out.createdBy = r.created_by_name || "";
    return out;
  }

  let sb = null;
  function client() { return sb; }

  // Live updates: refetch the whole table when anything in it changes (the data is small).
  const listeners = {};
  function watch(table, fn) {
    (listeners[table] = listeners[table] || []).push(fn);
    if (listeners[table].length === 1) {
      sb.channel("t-" + table).on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(watch["_" + table]);
        watch["_" + table] = setTimeout(() => listeners[table].forEach(f => f()), 250);
      }).subscribe();
    }
  }
  const snap = docs => ({ docs: docs.map(([id, d]) => ({ id, exists: true, data: () => d })) });

  async function fetchTable(table) {
    const { data, error } = await sb.from(table).select("*");
    if (error) throw error;
    return data;
  }

  // ---- config/areas: groups and areas lists ----
  async function readConfig() {
    const [g, a] = await Promise.all([
      sb.from("area_groups").select("*").order("sort"),
      sb.from("areas").select("*").order("sort")
    ]);
    if (g.error) throw g.error; if (a.error) throw a.error;
    const gname = {}; g.data.forEach(x => gname[x.id] = x.name);
    const gsort = {}; g.data.forEach(x => gsort[x.id] = x.sort);
    const areas = a.data.slice().sort((x, y) => (gsort[x.group_id] ?? 1e9) - (gsort[y.group_id] ?? 1e9) || x.sort - y.sort)
      .map(x => ({ slug: x.slug, name: x.name, group: gname[x.group_id] || "", now: x.now_text || "", sale: x.sale_text || "" }));
    return { groups: g.data.map(x => x.name), areas };
  }
  async function writeConfig(cfg) {
    const groups = cfg.groups || [], areas = cfg.areas || [];
    // 1. groups: add new names, set order
    const cur = (await sb.from("area_groups").select("*")).data || [];
    const byName = {}; cur.forEach(x => byName[x.name] = x);
    for (let i = 0; i < groups.length; i++) {
      const n = groups[i];
      if (byName[n]) { if (byName[n].sort !== i) { const r = await sb.from("area_groups").update({ sort: i }).eq("id", byName[n].id); if (r.error) throw r.error; } }
      else { const r = await sb.from("area_groups").insert({ name: n, sort: i }).select().single(); if (r.error) throw r.error; byName[n] = r.data; }
    }
    // 2. areas: upsert in order
    const counters = {};
    const rows = areas.map(a => {
      const gid = byName[a.group] ? byName[a.group].id : null;
      counters[gid] = (counters[gid] || 0) + 1;
      return { slug: a.slug, name: a.name, group_id: gid, sort: counters[gid], now_text: a.now || "", sale_text: a.sale || "" };
    });
    // only write the areas that actually changed, so the history stays readable
    const curA = (await sb.from("areas").select("slug,name,group_id,sort,now_text,sale_text")).data || [];
    const old = {}; curA.forEach(x => old[x.slug] = x);
    const changed = rows.filter(r => { const o = old[r.slug]; return !o || ["name","group_id","sort","now_text","sale_text"].some(k => (o[k] ?? "") !== (r[k] ?? "")); });
    if (changed.length) { const r = await sb.from("areas").upsert(changed, { onConflict: "slug" }); if (r.error) throw r.error; }
    // 3. remove areas and groups no longer listed
    const keep = areas.map(a => a.slug);
    const goneA = curA.map(x => x.slug).filter(s => !keep.includes(s));
    if (goneA.length) { const r = await sb.from("areas").delete().in("slug", goneA); if (r.error) throw r.error; }
    const goneG = cur.filter(x => !groups.includes(x.name)).map(x => x.id);
    if (goneG.length) { const r = await sb.from("area_groups").delete().in("id", goneG); if (r.error) throw r.error; }
  }

  function collection(name) {
    if (name === "config") {
      return {
        onSnapshot(next, err) {
          const run = () => readConfig().then(c => next(snap([["areas", c]]))).catch(e => err && err(e));
          run(); watch("areas", run); watch("area_groups", run); return () => {};
        },
        doc(id) { return { set: d => writeConfig(d), update: d => writeConfig(d), delete: async () => {} }; }
      };
    }
    const table = name, key = KEY[table];
    if (!MAPS[table]) throw new Error("Unknown collection " + name);
    return {
      onSnapshot(next, err) {
        const run = () => fetchTable(table).then(rows => next(snap(rows.map(r => [r[key], fromDb(table, r)])))).catch(e => err && err(e));
        run(); watch(table, run); return () => {};
      },
      async add(data) {
        const id = UUID_KEYS[table] ? crypto.randomUUID() : "t-" + crypto.randomUUID().slice(0, 8);
        const { row, extra } = toDb(table, data);
        const r = await sb.from(table).insert(Object.assign({ [key]: id, extra }, row));
        if (r.error) throw r.error;
        return { id };
      },
      doc(id) {
        return {
          async set(data) {
            const { row, extra } = toDb(table, data);
            if (table === "areas") {
              // room details only; the area itself is created through config
              const defaults = { desc_agreed: false, tasks_agreed: false, chosen: null, choice_notes: "", options: {}, current_photos: [], inspiration: [] };
              const r = await sb.from("areas").update(Object.assign(defaults, row, { extra })).eq("slug", id);
              if (r.error) throw r.error; return;
            }
            const r = await sb.from(table).upsert(Object.assign({ [key]: id, extra }, row), { onConflict: key });
            if (r.error) throw r.error;
          },
          async update(data) {
            const { row, extra } = toDb(table, data);
            if (Object.keys(extra).length) {
              const cur = await sb.from(table).select("extra").eq(key, id).maybeSingle();
              row.extra = Object.assign({}, cur.data && cur.data.extra, extra);
            }
            const r = await sb.from(table).update(row).eq(key, id);
            if (r.error) throw r.error;
          },
          async delete() {
            const r = await sb.from(table).delete().eq(key, id);
            if (r.error) throw r.error;
          }
        };
      }
    };
  }

  // ---- files: private bucket, shown through short-lived signed links ----
  const BUCKET = "house";
  const signed = {}, pending = new Set();
  const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  let signTimer = null;
  function blobUrl(id) {
    if (!id) return PIXEL;
    const s = signed[id];
    if (s && s.until > Date.now()) return s.url;
    pending.add(id); clearTimeout(signTimer); signTimer = setTimeout(signPending, 30);
    return PIXEL + "#" + encodeURIComponent(id);
  }
  async function signPending() {
    const ids = [...pending]; pending.clear(); if (!ids.length || !sb) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(ids, 60 * 60 * 6);
    if (error || !data) return;
    data.forEach(x => { if (x.signedUrl) signed[x.path] = { url: x.signedUrl, until: Date.now() + 1000 * 60 * 60 * 5 }; });
    ids.forEach(id => {
      const ph = PIXEL + "#" + encodeURIComponent(id), s = signed[id]; if (!s) return;
      document.querySelectorAll("img").forEach(el => { if (el.getAttribute("src") === ph) el.setAttribute("src", s.url); });
      document.querySelectorAll("a").forEach(el => { if (el.getAttribute("href") === ph) el.setAttribute("href", s.url); });
    });
  }
  const assets = {
    async upload(blob, opts) {
      const type = (opts && opts.type) || blob.type || "application/octet-stream";
      const ext = type === "application/pdf" ? ".pdf" : /^image\//.test(type) ? "." + (type.split("/")[1] || "jpg").replace("jpeg", "jpg") : "";
      const path = new Date().toISOString().slice(0, 7) + "/" + crypto.randomUUID() + ext;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (error) throw error;
      return { id: path };
    },
    async delete(id) { const { error } = await sb.storage.from(BUCKET).remove([id]); if (error) throw error; }
  };

  // ---- who is using the app ----
  function actor() { try { return localStorage.getItem(ACTOR_KEY) || ""; } catch (_) { return ""; } }
  function setActor(n) { try { localStorage.setItem(ACTOR_KEY, n); } catch (_) {} }
  const ascii = s => s.replace(/[^\x20-\x7E]/g, "?");

  async function connect() {
    if (sb) return sb;
    if (!CFG.url || !CFG.key) throw new Error("config.js is missing. Upload it to the site folder.");
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, storageKey: "home-sale-prep-auth" },
      global: { headers: { "x-actor": ascii(actor() || "Unknown") } }
    });
    const s = await sb.auth.getSession();
    if (!s.data.session) {
      const r = await sb.auth.signInWithPassword({ email: CFG.email, password: CFG.password });
      if (r.error) throw r.error;
    }
    return sb;
  }

  // First run only: if the database is empty, load the data copied from the
  // old page (seed/initial-data.json) and tidy up the setup test records.
  async function seedIfEmpty(onStatus) {
    const c = await sb.from("area_groups").select("id", { count: "exact", head: true });
    if (c.error || c.count > 0) return false;
    let seed;
    try { const r = await fetch("seed/initial-data.json", { cache: "no-store" }); if (!r.ok) return false; seed = await r.json(); }
    catch (_) { return false; }
    onStatus && onStatus("Setting up for the first time. This takes a few seconds…");
    const must = r => { if (r.error) throw r.error; return r; };
    const g = must(await sb.from("area_groups").insert(seed.area_groups).select());
    const gid = {}; g.data.forEach(x => gid[x.name] = x.id);
    must(await sb.from("areas").insert(seed.areas.map(a => { const r = Object.assign({}, a, { group_id: gid[a.group] ?? null }); delete r.group; return r; })));
    for (const t of ["contacts", "tasks", "documents", "finishes", "checklists"]) {
      if (seed[t] && seed[t].length) must(await sb.from(t).upsert(seed[t], { onConflict: "id" }));
    }
    for (const [t, col, ids] of seed.cleanup || []) await sb.from(t).delete().in(col, ids);
    onStatus && onStatus("");
    return true;
  }

  async function history(limit) {
    const { data, error } = await sb.from("audit_log").select("id,at,actor,table_name,row_id,action,old_data,new_data")
      .order("id", { ascending: false }).limit(limit || 200);
    if (error) throw error;
    return data;
  }

  // Fetch a Pinterest pin's picture through the pin-image edge function.
  async function pinImage(url) {
    await connect();
    const { data, error } = await sb.functions.invoke("pin-image", { body: { url } });
    if (error) throw error;
    if (!(data instanceof Blob) || !/^image\//.test(data.type)) throw new Error("No picture returned");
    return data;
  }

  window.homeStore = { connect, collection, assets, blobUrl, actor, setActor, history, client, seedIfEmpty, pinImage };
  // Same entry point the page already calls.
  window.claude = {
    use: async n => { await connect(); if (n === "db") await seedIfEmpty(window.homeSeedStatus); return n === "db" ? { collection } : n === "assets" ? assets : null; }
  };
})();
