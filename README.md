# Highland Drive Sale Prep

The house sale plan for 25 Highland Drive: tasks, rooms and areas, documents,
contacts, finishes, market data and a change history. Plain HTML and
JavaScript with no build step.

## How it fits together

| Piece | What it does |
|---|---|
| `index.html` | The whole app: pages, styles and page logic |
| `js/store.js` | Connects the page to Supabase (data, photos, live updates, history) |
| `config.js` | Supabase address and the family login. **Not in GitHub.** Upload it to Hostinger by hand. Copy `config.example.js` to make it. |
| Supabase project `home-sale-prep` (Sydney) | Database, the shared family login, and the private `house` bucket for photos and files |
| Hostinger | Serves the site at https://home.sabav2v.com behind a Hostinger password, and pulls updates from this repo |
| `.github/workflows/backup.yml` | Every 3 days, copies every table into `backups/` and commits it. This also stops the free Supabase project from pausing. |
| `db/migrations/` | Every change made to the database, in order |
| `seed/initial-data.json` | The data copied from the first version of the page. Loaded once, the first time the app opens on an empty database. |

## Who did what

The first time someone opens the app on a device, it asks for their name and
remembers it. Every add, change and delete is logged with that name; see the
History page. Names are labels, not logins.

## One-time setup

### Hostinger (Business Web Hosting)

1. **Subdomain:** hPanel, Domains, Subdomains. Create `home` on `sabav2v.com`.
   Note the folder it creates.
2. **Git:** hPanel, Advanced, GIT. Repository `git@github.com:kylari/home-sale-prep.git`,
   branch `main`, install path = the subdomain's folder (it must be empty).
   Because the repo is private, copy the SSH key Hostinger shows and add it in
   GitHub under Settings, Deploy keys (read access only).
   Turn on Auto Deployment and add the webhook URL it gives you in GitHub under
   Settings, Webhooks (content type `application/json`).
3. **config.js:** File Manager, open the subdomain folder, upload `config.js`.
4. **Password:** hPanel, Advanced, Password Protect Directories. Choose the
   subdomain folder and set a username and password to share with the family.
5. **SSL:** check hPanel, Security, SSL shows the subdomain as secured.

### GitHub

Settings, Secrets and variables, Actions, New repository secret:
`FAMILY_PASSWORD` = the password from `config.js`. Then run the
"Back up data" workflow once from the Actions tab to check it works.

### Supabase (optional hardening)

Authentication, Sign In / Providers: turn off "Allow new users to sign up".
Only the family login is needed.

## Making changes

Edit the files, commit and push to `main`. Hostinger picks it up
automatically. Database changes go in a new numbered file in `db/migrations/`.
