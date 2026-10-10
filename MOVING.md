# Moving from the Claude page to the website

The plan is built on the Claude page first. These steps bring the website up
to date with it. Run them all on the same day, and stop making changes on the
Claude page once you start, so nothing gets left behind.

## 1. Bring the page code across

Save the Claude page's HTML, then run

    python3 scripts/port_from_artifact.py <saved page.html>

It writes `index.html` with the website's extras put back in: the icons, the
Supabase connection, the "Who's using this?" name, the History page and the
one-off photo upload page. If the Claude page has changed in a way the script
doesn't expect, it stops and says which part to update.

## 2. Update the database

Apply any new files in `db/migrations/` in the Supabase SQL editor, in order.
`0006_items.sql` adds the furniture and decor list.

## 3. Move the data

Export every collection from the Claude page (tasks, areas, config, contacts,
documents, finishes, checklists, items) as one JSON file per document, laid
out as `<folder>/<collection>/<id>.json`. Then run

    python3 db/migrate_from_artifact.py <folder> import.sql

and run `import.sql` in the Supabase SQL editor. It replaces everything in one
go: if any line fails, nothing changes. The History page then shows one line
for the move instead of hundreds.

## 4. Move the photos

About 1,600 photos (400 MB) live on the Claude page. Save them as zip files
whose entries are named `<photo id>.<ext>`, then open the website at
`#move`, choose the zips and press Upload. Each photo keeps its id, so every
room, task, furniture item and sale picture finds it again. Running it twice
is safe.

## 5. Check and switch

Open a few spaces, the tasks list, the furniture list and the market
comparison on the website and check photos and numbers match. Then push to
`main` so Hostinger picks up the new page, and use the website from then on.
