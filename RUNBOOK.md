# Runbook — a new customer, end to end

Everything below is from a terminal. Two places are involved and they are deliberately separate:

```
~/code/work/dbt/training/<slug>/        the customer: their SQL, their dbt repo, their plan
~/code/work/dbt/training/_guides/dbt-interactive-guide/   the guide: one checkout, one content pack per customer
```

## One-time setup (already done, keep for a new machine)

```bash
git clone https://github.com/dltm-markwan/dbt_interactive_guide.git \
  ~/code/work/dbt/training/_guides/dbt-interactive-guide
cd ~/code/work/dbt/training/_guides/dbt-interactive-guide
npm install
```

The skill lives at `~/.agents/skills/dbt-lesson-prep`. It is user-invoked, so it only runs when you type it;
after editing the skill run `/reload` in pi or start a new session, or the old copy stays loaded.

## 1. Make the customer folder

```bash
mkdir -p ~/code/work/dbt/training/<slug>/source
cp "/path/to/their/Sample SQL.sql" ~/code/work/dbt/training/<slug>/source/
```

Nothing else. No `lesson.yml`, no repo — the skill writes those.

**One invocation, all three stages.** `/skill:dbt-lesson-prep` with no mode runs `build` → `plan` → `guide`
and stops after each to show you the counts and anything parked, so you can stop a stage going wrong before
the next one builds on it. The named modes re-run a single stage later.

## 2. Process their SQL and build the dbt repo

```bash
cd ~/code/work/dbt/training/<slug>
pi
```

then in pi:

```
/skill:dbt-lesson-prep build
```

It will confirm the config (customer name, dialect, sessions, instructor, dates) and write `lesson.yml`,
then produce `repo/` with the layers, `SQL-WALKTHROUGH.md`, `VERIFICATION.md` and a tag per session edge.
Read the two reports it ends with: statements built vs parked, and the audit verdict per tag.

Check it yourself before moving on:

```bash
cd repo && python3 ~/.agents/skills/dbt-lesson-prep/scripts/lint_walkthrough.py SQL-WALKTHROUGH.md
git tag
```

## 3. Rewrite the lesson plan

```
/skill:dbt-lesson-prep plan
```

Produces `<slug>.docx` in the customer folder. If your Drive folder is the customer folder, Drive syncs it
and it is already there — no upload, no copy. Open it in Drive (not Keynote: the fonts are only right in
Google Docs).

## 4. Build their guide

```
/skill:dbt-lesson-prep guide
```

It reads `repo/SQL-WALKTHROUGH.md`, writes `content/<slug>.json` in the guide checkout, runs the dry run and
fixes what the two reports flag, then builds. The reports are the whole job:

- `UNUSED` — a token that matched nothing: typo, or the guide no longer says it.
- `LEFTOVERS` — their-for-real names still visible as *jaffle*: almost always a compound such as
  `fct_orders_with_customers_details`. Add an explicit entry to the pack and run again.

## 5. Host it locally

Live-reloading, for building or presenting from your machine:

```bash
cd ~/code/work/dbt/training/_guides/dbt-interactive-guide
GUIDE_CUSTOMER=<slug> npm run dev
#   → http://localhost:5173/
```

A static build, for presenting offline:

```bash
GUIDE_CUSTOMER=<slug> GUIDE_BASE=./ npm run build
open dist/index.html
```

**One file, to send them** — this is the default, and where the file belongs:

```bash
cd ~/code/work/dbt/training/_guides/dbt-interactive-guide
GUIDE_CUSTOMER=<slug> npm run build:single
cp dist/index.html ~/code/work/dbt/training/<slug>/<slug>.html
#   → ~2 MB, everything inlined: JS, CSS and every image as a data URI
```

Keep it in the customer folder next to `<slug>.docx`, not in `dist/`. The guide checkout is shared by every
customer, so `dist/` is scratch space that the next build overwrites.

That single file opens from disk with no server and no network, so it can be emailed or dropped in a shared
folder. It is a build product, not a source of truth — regenerate it rather than editing it, and do not keep
it in git (it is 2 MB of inlined JavaScript and will churn on every change).

Two limits worth knowing: it cannot be cached the way a normal bundle can, and being one file means the
`icons.svg` and `favicon.svg` in `public/` are dropped — nothing references them, so today that is free, but
check if that ever changes.

`GUIDE_CUSTOMER` unset builds the original, unbranded guide — handy for comparing.

Sanity check that branding actually landed:

```bash
JS=$(ls -S dist/assets/*.js | head -1)
grep -oc '<one of their model names>' "$JS"          # present
grep -ocE '\b(stg_orders|fct_orders|dim_customers)\b' "$JS"   # gone
grep -oc 'border' "$JS"                              # same count as the unbranded build
```

That last one is the canary: if the class count moved, the mask broke and the page will render unstyled.

## 5b. Check the lot before you deliver

```bash
cd ~/code/work/dbt/training/<slug>
python3 ~/.agents/skills/dbt-lesson-prep/scripts/gate.py --customer .
```

One command, one verdict. It audits the repo at all eight tags, lints the walkthrough, checks the plan for
unfilled placeholders and leftover session 5/6 text, and checks the guide bundle for jaffle names and
external references. `OK` is the sign-off; `INCOMPLETE` means something was never produced.

It cannot judge whether a structural change to the plan was the *right* one — for that, read the
`paragraph count` delta it prints and confirm it matches what you deleted.

## 6. After each session

```
/skill:dbt-lesson-update
```

Brain-dump how it went; it updates the plan, writes the client email and the internal Slack post, and
appends to `lessons/SESSION-LEDGER.md`.

## Publishing, when you want it (not now)

```bash
branding/deploy.sh <slug>          # builds site/<slug>/ and pushes site/ to gh-pages
gh api -X POST repos/dltm-markwan/dbt_interactive_guide/pages \
  -f 'source[branch]=gh-pages' -f 'source[path]=/'
```

One site, one folder per customer: `https://dltm-markwan.github.io/dbt_interactive_guide/<slug>/`.

**Think before publishing.** The guide contains their real table and column names. A public Pages URL is
readable by anyone with the link, and it is indexed eventually. For customer work, prefer the local dev
server or the zip.

## Pulling upstream improvements

```bash
cd ~/code/work/dbt/training/_guides/dbt-interactive-guide
git fetch origin && git merge origin/main       # then re-run the build for each pack
node branding/rename.mjs --customer <slug>      # re-check UNUSED / LEFTOVERS after a merge
```

One checkout, never a fork per customer: the moment two copies exist, neither gets upstream fixes.
