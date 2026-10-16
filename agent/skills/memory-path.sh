#!/usr/bin/env bash
# memory-path.sh <familyId>
#
# The ONE place that turns a resolved familyId into this family's memory file
# path. Never construct a memory path by hand — call this and use its stdout
# verbatim for every memory read or write about that family. See memory.md for
# when and why.
set -euo pipefail

FAMILY_ID="${1:?usage: memory-path.sh <familyId>}"

# Whitelist, not a denylist: a familyId is a Prisma cuid (GET /api/family's
# family.id), so it is always plain alphanumeric. Anything else — "..", "/",
# empty — gets rejected instead of silently producing a path that could escape
# memory/ or collide with another family's file.
if [[ ! "${FAMILY_ID}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "memory-path: invalid familyId '${FAMILY_ID}' (expected the id from GET /api/family, e.g. a cuid)" >&2
  exit 1
fi

echo "memory/family-${FAMILY_ID}.md"
