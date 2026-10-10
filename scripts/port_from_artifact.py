"""Turn the Claude artifact page into the hosted index.html.

The plan page is built and changed as a Claude artifact. The website runs the
same page with a few additions: the page head (icons, app manifest), Supabase
(config.js, js/store.js), the "Who's using this?" name, and the History page.
This script takes a saved copy of the artifact page and puts those back in, so
the website can be brought up to date in one step whenever it falls behind.

Usage: python3 scripts/port_from_artifact.py <artifact.html> [index.html]
The snippets it inserts live in scripts/port/.
"""
import os, re, sys

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "port")


def bit(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read().rstrip("\n")


def swap(src, old, new, count=1):
    n = src.count(old)
    if n != count:
        sys.exit(f"Expected {count} of {old[:70]!r}, found {n}. The artifact page has changed; update this script.")
    return src.replace(old, new)


def port(src):
    # Strip any wrapper the artifact read added, keeping from <title> on.
    i = src.find("<title>")
    if i < 0:
        sys.exit("No <title> in the artifact page.")
    src = src[i:]
    for tag in ("</body>", "</html>"):
        src = src.replace(tag, "")
    src = src.rstrip() + "\n"

    # 1. Head: icons and manifest before, hosting CSS and scripts after the styles.
    src = bit("head.html") + "\n" + src
    src = swap(src, "\n</style>\n", "\n" + bit("hosted.css") + "\n</style>\n"
               '<script src="config.js"></script>\n'
               '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.min.js"></script>\n'
               '<script src="js/store.js"></script>\n</head>\n<body>\n')

    # 2. Name in the header, History under the Plan menu.
    src = re.sub(r'(<div class="brand">.*?)</div>', r'\1<span class="whoami" id="whoami" hidden></span></div>', src, count=1)
    src = re.sub(r'(<div class="subpanel" id="sub-plan" hidden>.*?)</div>', r'\1<a href="#history" data-sub>History</a></div>', src, count=1)
    src = re.sub(r'(const SUBS=\{.*?plan:\[[^\]]*)\]', r'\1,"history"]', src, count=1)

    # 3. History page and name dialog.
    src = swap(src, '<section class="page" id="p-style"', bit("history-section.html") + "\n\n" + bit("move-section.html") + '\n\n<section class="page" id="p-style"')
    src = swap(src, '<dialog id="viewer"', bit("who-dialog.html") + '\n\n<dialog id="viewer"')

    # 4. Photos come from the private Supabase bucket.
    src = swap(src, 'const blob=id=>"/_blob/"+id;', "const blob=id=>window.homeStore.blobUrl(id);")
    src = swap(src, "  decoLinks();\n}", '  decoLinks();\n  if(page==="history")renderHistory();\n}')
    src = swap(src, "function showState(msg){const b=$(\"#dbstate\");b.textContent=msg;b.hidden=!msg}",
               "function showState(msg){const b=$(\"#dbstate\");b.textContent=msg;b.hidden=!msg}\nwindow.homeSeedStatus=showState;")

    # 5. Start-up: ask for a name first; no artifact-only photo shrink.
    src = swap(src, "route();render();\n(async()=>{\n", "route();render();\n" + bit("hosted-functions.js") + "\n" + bit("move-functions.js") + "\n(async()=>{\n  await askName(false);showWho();\n")
    src = re.sub(r'showState\("The saved task list isn\'t available in this view\.[^"]*"\)',
                 'showState("Couldn\'t connect to the database. Check your internet connection and reload. If it keeps happening, the site\'s config.js may be missing.")', src, count=1)
    src = swap(src, "  setTimeout(()=>shrinkOnce(),4000);\n", "")

    # 6. Fixed pictures in the page (floor plans) also come from the bucket, once connected.
    src = re.sub(r'src="/_blob/([0-9a-f]+)"', r'src="data:," data-blobsrc="\1"', src)
    src = swap(src, '  try{assets=window.claude&&await window.claude.use("assets")}catch(e){assets=null}\n',
               '  try{assets=window.claude&&await window.claude.use("assets")}catch(e){assets=null}\n'
               '  document.querySelectorAll("[data-blobsrc]").forEach(i=>i.src=blob(i.dataset.blobsrc));\n')
    if "/_blob/" in src:
        sys.exit("A /_blob/ link is left in the page; add a rule for it.")

    return src + "</body>\n</html>\n"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        out = port(f.read())
    dest = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(HERE), "..", "index.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(out)
    print("Wrote", os.path.normpath(dest), len(out), "bytes")
