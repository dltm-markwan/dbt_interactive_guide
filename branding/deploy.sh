#!/usr/bin/env bash
# Build one customer's guide and publish it, alongside every other customer, to GitHub Pages.
#
#   branding/deploy.sh abc-ro            # build into site/abc-ro/ and publish the whole site
#   branding/deploy.sh abc-ro --no-push  # build only, leave it in site/
#   branding/deploy.sh --index           # rebuild only the landing page for what is in site/
#
# One repo, one Pages site, one folder per customer:
#   https://<owner>.github.io/<repo>/abc-ro/
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
REMOTE=$(git remote get-url fork 2>/dev/null || git remote get-url origin)
REPO=$(basename "$REMOTE" .git)
SLUG=""

for arg in "$@"; do
  case "$arg" in
    --no-push) NOPUSH=1 ;;
    --index) SLUG="__index__" ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) SLUG="$arg" ;;
  esac
done
[ -n "$SLUG" ] || { echo "usage: branding/deploy.sh <slug> [--no-push]" >&2; exit 2; }

index() {
  mkdir -p site
  {
    echo '<!doctype html><meta charset="utf-8"><title>dbt onboarding guides</title>'
    echo '<body style="font-family:system-ui,sans-serif;max-width:38rem;margin:4rem auto;line-height:1.6">'
    echo '<h1>dbt onboarding guides</h1><ul>'
    for d in site/*/; do
      [ -d "$d" ] || continue
      slug=$(basename "$d")
      [ -f "$d/index.html" ] || continue
      echo "<li><a href=\"./$slug/\">$slug</a></li>"
    done
    echo '</ul></body>'
  } > site/index.html
}

if [ "$SLUG" != "__index__" ]; then
  [ -f "content/$SLUG.json" ] || { echo "no content pack: content/$SLUG.json" >&2; exit 1; }
  echo "building $SLUG for /$REPO/$SLUG/"
  rm -rf dist
  GUIDE_CUSTOMER="$SLUG" GUIDE_BASE="/$REPO/$SLUG/" npm run build

  # a customer folder could not overwrite its own sibling folders
  mkdir -p "site/$SLUG"
  rsync -a --delete dist/ "site/$SLUG/" 2>/dev/null || { rm -rf "site/$SLUG"; cp -R dist "site/$SLUG"; }
  echo "built: site/$SLUG ($(du -sh "site/$SLUG" | cut -f1))"
fi

index

if [ -z "${NOPUSH:-}" ]; then
  [ -n "$REMOTE" ] || { echo "no git remote; built to site/ only" >&2; exit 1; }
  echo "publishing site/ to gh-pages on $REMOTE"
  tmp=$(mktemp -d)
  cp -R site/. "$tmp"/
  (
    cd "$tmp"
    git init -q
    git checkout -q -b gh-pages
    git add -A
    git -c user.name="$(git -C "$ROOT" config user.name)" \
        -c user.email="$(git -C "$ROOT" config user.email)" \
        commit -qm "Publish guide site"
    git push -qf "$REMOTE" gh-pages
  )
  rm -rf "$tmp"
  owner=$(echo "$REMOTE" | sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#')
  echo "live (once Pages is enabled on the gh-pages branch):"
  echo "  https://${owner}.github.io/${REPO}/${SLUG}/"
fi
