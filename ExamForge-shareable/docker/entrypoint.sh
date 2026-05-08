#!/bin/sh
set -eu

mkdir -p /app/data
npx prisma migrate deploy
npm run start
