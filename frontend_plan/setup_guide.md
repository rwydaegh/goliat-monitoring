# Quick Setup Guide

## Repo Naming

**Chosen name:** `goliat-dashboard`

**Rationale:** Clear, descriptive, emphasizes the web UI aspect. Alternatives considered:
- `goliat-monitoring` - more generic, doesn't emphasize orchestration
- `goliat-orchestrator` - accurate but longer, sounds heavy
- `goliat-control` - vague
- `goliat-hub` - generic

## Creating the Repository

### Using GitHub CLI (Recommended)

```bash
# Navigate to parent directory
cd "C:\Users\rwydaegh\OneDrive - UGent\rwydaegh\GOLIAT code"

# Create new directory for the project
mkdir goliat-dashboard
cd goliat-dashboard

# Initialize git
git init

# Create initial files (README, package.json, etc.)
# ... then commit ...

# Create repo on GitHub and push
gh repo create goliat-dashboard --public --source=. --remote=origin --push
```

### Using GitHub Web Interface

1. Go to github.com → New repository
2. Name: `goliat-dashboard`
3. Set public/private
4. Optionally initialize with README
5. Then locally:
```bash
cd "C:\Users\rwydaegh\OneDrive - UGent\rwydaegh\GOLIAT code\goliat-dashboard"
git init
git remote add origin https://github.com/yourusername/goliat-dashboard.git
git pull origin main  # if you initialized with README
# ... add files, commit ...
git push -u origin main
```

## Next Steps After Repo Creation

1. Initialize Next.js project: `npx create-next-app@latest . --typescript --tailwind --app`
2. Connect to Vercel: Import repo in Vercel dashboard
3. Set up Vercel Postgres: Add Postgres integration in Vercel
4. Set up Vercel Blob: Add Blob storage integration in Vercel
5. Follow Phase 1 of [implementation_plan.md](./implementation_plan.md)

## Directory Structure

The repo should be separate from the main `goliat` repository:
```
GOLIAT code/
├── goliat/              # Main GOLIAT Python project
└── goliat-dashboard/    # New Next.js dashboard project
```

This keeps dependencies separate and makes it easy to deploy to Vercel independently.
