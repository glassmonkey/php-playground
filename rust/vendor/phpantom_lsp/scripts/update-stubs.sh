#!/usr/bin/env bash
#
# Update the pinned phpstorm-stubs version in stubs.lock.
#
# Usage:
#   ./scripts/update-stubs.sh                        # update current repo to latest
#   ./scripts/update-stubs.sh AJenbo/phpstorm-stubs  # switch to a fork
#   ./scripts/update-stubs.sh AJenbo/phpstorm-stubs 0ea6b443...  # pin a specific commit
#
# The script will:
#   1. Read the current repo from stubs.lock (or use the argument).
#   2. Query the GitHub API for the latest commit on master (or use the argument).
#   3. Download the tarball for that commit.
#   4. Compute its SHA-256 hash.
#   5. Write the new stubs.lock file.
#   6. Delete the local stubs/ cache so the next build fetches fresh.

set -euo pipefail

LOCK_FILE="stubs.lock"

cd "$(dirname "$0")/.."

# ── Determine repo ──────────────────────────────────────────────────
# First argument overrides; otherwise read from existing stubs.lock.
if [[ ${1:-} ]]; then
    REPO="$1"
elif [[ -f "$LOCK_FILE" ]]; then
    REPO=$(grep '^repo' "$LOCK_FILE" | sed 's/.*= *"\(.*\)"/\1/' || true)
fi
REPO="${REPO:-JetBrains/phpstorm-stubs}"

# ── Determine commit ────────────────────────────────────────────────
# Second argument pins a specific commit; otherwise fetch latest master.
if [[ ${2:-} ]]; then
    COMMIT="$2"
    echo "Using provided commit ${COMMIT:0:10} on ${REPO}..."
else
    echo "Fetching latest commit SHA for ${REPO} master..."
    COMMIT=$(curl -sf \
        -H "Accept: application/vnd.github.v3+json" \
        -H "User-Agent: phpantom-lsp-update" \
        "https://api.github.com/repos/${REPO}/commits/master" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
fi

if [[ -z "$COMMIT" ]]; then
    echo "Error: failed to determine commit SHA" >&2
    exit 1
fi

SHORT="${COMMIT:0:10}"
TARBALL_URL="https://github.com/${REPO}/archive/${COMMIT}.tar.gz"

echo "Downloading tarball for ${REPO} @ ${SHORT}..."
TARBALL=$(mktemp)
trap 'rm -f "$TARBALL"' EXIT

curl -sfL -o "$TARBALL" "$TARBALL_URL"
if [[ ! -s "$TARBALL" ]]; then
    echo "Error: failed to download tarball" >&2
    exit 1
fi

echo "Computing SHA-256..."
HASH=$(sha256sum "$TARBALL" | cut -d' ' -f1)

echo "Writing ${LOCK_FILE}..."
cat > "$LOCK_FILE" <<EOF
# PHPantom stubs lock file — pinned phpstorm-stubs version.
#
# This file is checked into version control and read by build.rs to
# ensure reproducible builds with integrity-verified stubs.
#
# To update, run:  scripts/update-stubs.sh

# The GitHub repository to fetch stubs from.
# Use "JetBrains/phpstorm-stubs" for upstream, or a fork like
# "AJenbo/phpstorm-stubs" for fixes not yet merged upstream.
repo = "${REPO}"

# The pinned commit SHA.
commit = "${COMMIT}"

# SHA-256 hash of the GitHub-generated tarball for the commit above.
sha256 = "${HASH}"
EOF

echo "Removing stubs/ cache so next build fetches fresh..."
rm -rf stubs/

echo ""
echo "Done! Pinned to ${REPO} @ ${SHORT} (${HASH})"
echo "Run 'cargo build' to fetch and verify the new stubs."
