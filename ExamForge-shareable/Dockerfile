FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY prisma ./prisma
COPY next-env.d.ts ./next-env.d.ts
COPY next.config.mjs ./next.config.mjs
COPY postcss.config.mjs ./postcss.config.mjs
COPY tailwind.config.ts ./tailwind.config.ts
COPY tsconfig.json ./tsconfig.json
COPY docker ./docker

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev
RUN mkdir -p /app/data && chmod +x /app/docker/entrypoint.sh

EXPOSE 3000

CMD ["sh", "/app/docker/entrypoint.sh"]
