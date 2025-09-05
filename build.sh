#!/bin/bash
set -e

echo "=== BUILD DEBUG ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "TypeScript version: $(npx tsc --version)"

echo "=== Building with TypeScript ==="
npx tsc -p tsconfig.json

echo "=== Build completed successfully ==="
