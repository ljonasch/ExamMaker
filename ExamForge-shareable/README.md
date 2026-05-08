# ExamForge Shareable Bundle

This is a separate package of ExamForge for sharing with other people without touching the original local working project.

## Best way to share it

If you want the app to work reliably for people on iPhone, Android, Mac, Windows, and Linux, host this bundle once and give people the URL.

That way:

- you do the setup one time
- everyone else only needs a browser
- no one has to install Node, Docker, or Prisma locally

## Fastest hosted setup: Railway

This bundle is already prepared for a Docker-based Railway deploy.

### Minimal steps

1. Put the contents of this folder in its own GitHub repository.
2. In Railway, create a new project and deploy that repo.
3. Add a Volume and mount it at `/app/data`.
4. Add these environment variables in Railway:

```bash
DATABASE_URL="file:/app/data/examforge.db"
OPENAI_API_KEY="your-key-here"
OPENAI_MODEL="gpt-5.4-mini"
OPENAI_VISION_MODEL="gpt-4o-mini"
```

5. Redeploy if Railway does not do it automatically.
6. Open the Railway public URL and use the app.

### What this gives you

- one hosted ExamForge instance
- persistent SQLite storage across restarts and deploys
- a shareable web URL that works on desktop and mobile browsers

### Why the volume matters

ExamForge stores uploaded materials, generated exams, attempts, and usage records in SQLite. Without a mounted volume, that data would be lost on redeploy or restart.

Railway's docs say Dockerfile projects are built automatically from a root `Dockerfile`, and that apps writing to `./data` should mount the volume at `/app/data`.

## Local fallback: Docker

If someone wants to run their own private copy on Windows, macOS, or Linux, Docker is the simplest local option.

Requirements:

- Docker Desktop on Windows or macOS, or Docker Engine on Linux

Setup:

1. Copy `.env.example` to `.env`
2. Set `OPENAI_API_KEY` in `.env`
3. From this folder, run:

```bash
docker compose up --build
```

Then open:

- [http://localhost:3000](http://localhost:3000)

Stop the app with:

```bash
docker compose down
```

## Data persistence

For local Docker runs, the SQLite database is stored in:

- `./data/examforge.db`

That means uploaded course content, generated exams, attempts, and usage records survive container restarts.

## Environment variables

- `DATABASE_URL`: defaults to the container-friendly SQLite path in `.env.example`
- `OPENAI_API_KEY`: required
- `OPENAI_MODEL`: optional, defaults to `gpt-5.4-mini`
- `OPENAI_VISION_MODEL`: optional, defaults to `gpt-4o-mini`

## Optional non-Docker local run

If someone prefers local Node instead of Docker:

1. Install Node 20+
2. Copy `.env.example` to `.env`
3. Set `DATABASE_URL` to a local SQLite path such as:

```bash
DATABASE_URL="file:./prisma/dev.db"
```

4. Run:

```bash
npm install
npx prisma migrate deploy
npm run build
npm run start
```

## What is included

- Full Next.js app source
- Prisma schema and migrations
- Docker packaging files
- Separate shareable setup docs

## What is not included

- Your local `.env`
- Your local SQLite data
- `node_modules`
- local build artifacts
