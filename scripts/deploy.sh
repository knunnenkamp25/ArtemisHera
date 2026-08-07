#!/usr/bin/env bash
# Create the ArtemisHera GitHub repo, push, and enable GitHub Pages.
# Run once from the repo root after authenticating: gh auth login
set -euo pipefail

OWNER="${1:-knunnenkamp25}"
REPO="ArtemisHera"

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null; then
  echo "GitHub CLI not found. Install it: brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "Creating $OWNER/$REPO (public)…"
gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --push

echo "Enabling GitHub Pages on main / root…"
gh api -X POST "repos/$OWNER/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$OWNER/$REPO/pages" \
       -f "source[branch]=main" -f "source[path]=/" >/dev/null

echo
OWNER_LC=$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')
echo "Done. The site will be live in about a minute at:"
echo "  https://$OWNER_LC.github.io/$REPO/"
echo
echo "If the owner is an org (e.g. Pantheon-Insight), pass it as an argument:"
echo "  ./scripts/deploy.sh Pantheon-Insight"
