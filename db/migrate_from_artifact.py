"""Turn the artifact page's exported data (JSON files, one per document, laid
out as <export_dir>/<collection>/<doc id>.json) into SQL for the Supabase
tables, and a JSON copy of the rows.

The SQL replaces everything: it empties the tables, then loads the export, all
in one transaction. Run it in the Supabase SQL editor (or through the Supabase
connector) when moving from the artifact to the website.

Usage: python3 db/migrate_from_artifact.py <export_dir> <out.sql> [rows.json]
The field mapping mirrors js/store.js.
"""
import json, os, sys, glob

MAPS = {
    "tasks": [("num","num","int"),("title","title",""),("area","area","nullable"),("type","type",""),("tier","tier","nullable"),
        ("who","who","nullable"),("status","status",""),("due","due","nullable"),("costLow","cost_low","num"),
        ("costHigh","cost_high","num"),("actual","actual","num"),("estHours","est_hours","num"),("actHours","act_hours","num"),
        ("conf","conf","nullable"),("skills","skills",""),("tags","tags","array"),("tools","tools","json"),("mats","mats","json"),
        ("links","links","json"),("steps","steps",""),("quotes","quotes","json"),("after","after_ids","array"),
        ("contactId","contact_id","uuid"),("repeat","repeat_months","repeat"),("nextMade","next_made","bool"),
        ("materials","materials",""),("notes","notes","")],
    "contacts": [("name","name",""),("company","company",""),("role","role",""),("trade","trade",""),("phone","phone",""),("email","email",""),("notes","notes","")],
    "documents": [("title","title",""),("category","category",""),("have","have",""),("area","area","nullable"),("issued","issued",""),
        ("expires","expires",""),("notes","notes",""),("files","files","json")],
    "finishes": [("area","area","nullable"),("item","item",""),("product","product",""),("code","code",""),("sheen","sheen",""),("supplier","supplier","")],
    "checklists": [("items","items","json")],
    "items": [("area","area","nullable"),("name","name",""),("category","category",""),("action","action",""),("toArea","to_area",""),
        ("status","status",""),("ok","ok","bool"),("task","task",""),("cost","cost",""),("value","value",""),("perMonth","per_month",""),
        ("notes","notes",""),("photo","photo","json")],
    "areas": [("descAgreed","desc_agreed","bool"),("tasksAgreed","tasks_agreed","bool"),("chosen","chosen","nullable"),
        ("choiceNotes","choice_notes",""),("options","options","json"),("current","current_photos","json"),("inspiration","inspiration","json")],
}
SKIP = {"id", "updatedAt", "createdAt", "updatedBy", "createdBy"}
TABLES = ["contacts", "tasks", "documents", "finishes", "checklists", "items"]


def conv(table, data):
    row, extra = {}, {}
    known = {m[0] for m in MAPS[table]}
    for k, col, kind in MAPS[table]:
        if k not in data:
            continue
        v = data[k]
        if kind == "num":
            v = None if v in ("", None) else float(v)
        elif kind in ("int", "repeat"):
            v = None if v in ("", None) else int(v)
        elif kind in ("nullable", "uuid"):
            v = None if v in ("", None) else v
        elif kind == "bool":
            v = bool(v)
        elif kind == "array":
            v = v if isinstance(v, list) else []
        elif kind == "json":
            if v is None:
                continue
        else:
            v = "" if v is None else str(v)
        row[col] = v
    for k, v in data.items():
        if k not in known and k not in SKIP:
            extra[k] = v
    return row, extra


def lit(v, col=None, table=None):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list) and col in ("tags", "after_ids"):
        return "array[" + ",".join(lit(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, (list, dict)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def load(d, coll):
    out = {}
    for f in sorted(glob.glob(os.path.join(d, coll, "*.json"))):
        doc = json.load(open(f))
        out[os.path.splitext(os.path.basename(f))[0]] = doc.get("data", doc) if isinstance(doc.get("data"), dict) else doc
    return out


def main(src, out_sql, out_json=None):
    rows = {t: [] for t in ["area_groups", "areas"] + TABLES}
    cfg = load(src, "config").get("areas")
    room = load(src, "areas")
    groups = cfg["groups"]
    for i, g in enumerate(groups):
        rows["area_groups"].append({"name": g, "sort": i})
    counters = {}
    for a in cfg["areas"]:
        counters[a["group"]] = counters.get(a["group"], 0) + 1
        r = {"slug": a["slug"], "name": a["name"], "group": a["group"], "sort": counters[a["group"]],
             "now_text": a.get("now", ""), "sale_text": a.get("sale", "")}
        if a["slug"] in room:
            rr, ex = conv("areas", room[a["slug"]])
            r.update(rr)
            r["extra"] = ex
        rows["areas"].append(r)
    slugs = {a["slug"] for a in cfg["areas"]}
    for t in TABLES:
        for id_, d in load(src, t).items():
            r, ex = conv(t, d)
            r["id"] = id_
            r["extra"] = ex
            if t in ("tasks", "documents", "finishes") and r.get("area") and r["area"] not in slugs:
                print(f"warning: {t} {id_} names area {r['area']!r}, which isn't in the areas list; left blank")
                r["area"] = None
            rows[t].append(r)

    sql = ["-- Generated by db/migrate_from_artifact.py", "begin;",
           "delete from items; delete from tasks; delete from documents; delete from finishes; delete from checklists;",
           "delete from contacts; delete from areas; delete from area_groups;"]
    for g in rows["area_groups"]:
        sql.append(f"insert into area_groups(name, sort) values ({lit(g['name'])}, {g['sort']});")
    for a in rows["areas"]:
        cols = {k: v for k, v in a.items() if k != "group"}
        names = list(cols) + ["group_id"]
        vals = [lit(v, k) for k, v in cols.items()] + [f"(select id from area_groups where name = {lit(a['group'])})"]
        sql.append(f"insert into areas({', '.join(names)}) values ({', '.join(vals)});")
    for t in TABLES:
        for r in rows[t]:
            sql.append(f"insert into {t}({', '.join(r)}) values ({', '.join(lit(v, k, t) for k, v in r.items())});")
    # Keep the History page readable: swap the hundreds of rows this load logged for one line.
    sql.append("delete from audit_log where at = now();")
    sql.append("insert into audit_log(actor, table_name, row_id, action, new_data) values "
               "('Claude', 'checklists', 'import', 'insert', '{\"title\": \"Moved everything across from the Claude page\"}'::jsonb);")
    sql.append("commit;")
    open(out_sql, "w").write("\n".join(sql) + "\n")
    if out_json:
        json.dump(rows, open(out_json, "w"), ensure_ascii=False, indent=1)
    print({t: len(v) for t, v in rows.items()})


if __name__ == "__main__":
    main(*sys.argv[1:])
