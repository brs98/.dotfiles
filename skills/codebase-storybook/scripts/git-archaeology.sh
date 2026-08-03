#!/usr/bin/env bash
# Deterministic fact sheet for storybook research. Interpretation (eras, epithets,
# why-narrative) stays with the agent; this collects the raw record in one pass.
#
# Usage: git-archaeology.sh <repo-dir> [pathspec]
#   git-archaeology.sh ~/work/fluid-mono "apps/fluid-checkout"
#
# Sections: creation, volume, contributors (with GitHub logins when `gh` can resolve
# them), monthly activity, largest commits, why-evidence commit subjects.
set -euo pipefail

REPO="${1:?usage: git-archaeology.sh <repo-dir> [pathspec]}"
PATHSPEC="${2:-.}"
cd "$REPO"

section() { printf '\n== %s ==\n' "$1"; }

section "CREATION (first commit touching path, rename-aware)"
git log --follow --diff-filter=A --format="%h %ad %an %s" --date=short -- "$PATHSPEC" | tail -5 || true

section "VOLUME"
printf 'total commits: %s\n' "$(git rev-list --count HEAD -- "$PATHSPEC")"
printf 'first..last dates: %s .. %s\n' \
  "$(git log --reverse --format=%ad --date=short -- "$PATHSPEC" | head -1)" \
  "$(git log -1 --format=%ad --date=short -- "$PATHSPEC")"

section "CONTRIBUTORS (all time)"
git shortlog -sn HEAD -- "$PATHSPEC" | head -15

section "CONTRIBUTORS (last 90 days)"
git shortlog -sn --since="90 days ago" HEAD -- "$PATHSPEC" | head -10

section "GITHUB LOGINS (top contributors; needs gh + github remote)"
remote_url=$(git remote get-url origin 2>/dev/null || echo "")
slug=$(printf '%s' "$remote_url" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
if command -v gh >/dev/null && [ -n "$slug" ]; then
  git shortlog -sn HEAD -- "$PATHSPEC" | head -10 | sed 's/^ *[0-9]*\t//' | while IFS= read -r author; do
    sha=$(git log --author="$author" --format=%H -1 -- "$PATHSPEC")
    info=$(gh api "repos/$slug/commits/$sha" --jq '(.author.login // "?") + " " + (.author.avatar_url // "?")' 2>/dev/null || echo "? ?")
    printf '%s | login: %s | avatar: %s | sha: %s\n' "$author" "${info%% *}" "${info#* }" "${sha:0:10}"
  done
else
  echo "(skipped: gh missing or origin is not GitHub — remote: ${remote_url:-none})"
fi

section "MONTHLY ACTIVITY (commits per month)"
git log --format="%ad" --date=format:%Y-%m -- "$PATHSPEC" | sort | uniq -c | tail -30

section "LARGEST COMMITS (import/refactor candidates)"
git log --format="%h|%ad|%an|%s" --date=short --shortstat -- "$PATHSPEC" \
  | awk -F'|' '/\|/{meta=$0} /files? changed/{ins=0; for(i=1;i<=NF;i++) if($i ~ /insertion/){split($i,a," "); ins=a[1]} print ins "\t" meta}' \
  | sort -rn | head -8

section "WHY-EVIDENCE (incident-flavored subjects)"
git log --format="%h %ad %s" --date=short -- "$PATHSPEC" \
  | grep -iE 'revert|fallback|leak|race|deprecat|harden|hotfix|incident|migrat|rewrite|workaround' | head -25 || true

section "NOTE"
echo "Squash-merge repos keep PR numbers in subjects: (#1234). A giant first commit"
echo "means the code predates this repo — read that commit body for the echo of the"
echo "predecessor repo's history (ticket prefixes, small PR numbers)."
