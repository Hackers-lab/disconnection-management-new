#!/bin/bash

# This script controls whether Vercel should build the commit or skip it.
# Vercel system environment variables:
# - VERCEL_GIT_COMMIT_REF: The branch name being built (e.g., "main", "multi-tenant")
# - EXPECTED_BRANCH: An optional custom environment variable you can set in the Vercel project settings.

# Default to "main" branch if EXPECTED_BRANCH is not defined.
TARGET_BRANCH=${EXPECTED_BRANCH:-main}

echo "System Check:"
echo "  Current branch:  $VERCEL_GIT_COMMIT_REF"
echo "  Expected branch: $TARGET_BRANCH"

if [ "$VERCEL_GIT_COMMIT_REF" = "$TARGET_BRANCH" ]; then
  echo "✅ Branch matches. Proceeding with Vercel build."
  exit 1 # Exit code 1 tells Vercel to build
else
  echo "🛑 Branch mismatch. Skipping Vercel build."
  exit 0 # Exit code 0 tells Vercel to cancel the build
fi
