#!/bin/sh
# First-boot (and every boot): apply migrations, (re-)seed idempotently, serve.
set -e

echo "[entrypoint] applying migrations…"
node tools/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

echo "[entrypoint] seeding (idempotent)…"
node seed.cjs

echo "[entrypoint] starting server…"
exec node server.js
