# Tweet Auto-Deleter: PRD & Engineering Plan

## Overview

Build a scheduled script that automatically deletes the authenticated user's tweets older than 7 days. The script runs daily via GitHub Actions and stays within X/Twitter API free tier limits.

## Goals

1. Maintain a rolling 7-day window of tweets (anything older gets deleted)
2. Fully automated—no manual intervention required
3. Stay within free tier API limits
4. Simple, maintainable codebase

## User Profile

- Posts 5-15 tweets per week
- Has a free tier X/Twitter developer account with API credentials
- Familiar with JavaScript and GitHub

---

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Fetch the authenticated user's tweets |
| FR-2 | Identify tweets with `created_at` timestamp older than 7 days |
| FR-3 | Delete each identified tweet |
| FR-4 | Run automatically once every 24 hours |
| FR-5 | On rate limit errors, delete what's possible and exit gracefully (no retry/wait) |
| FR-6 | Log deleted tweet IDs to console (for GitHub Actions logs) |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | No local data persistence or backup of deleted tweets |
| NFR-2 | No dry-run mode required |
| NFR-3 | All secrets stored in GitHub Actions secrets (never in code) |
| NFR-4 | Single dependency: `twitter-api-v2` npm package |
| NFR-5 | Script should complete within 5 minutes under normal conditions |

---

## X/Twitter API Constraints (Free Tier)

### Relevant Endpoints

| Operation | Endpoint | Rate Limit | Window |
|-----------|----------|------------|--------|
| Get user's tweets | `GET /2/users/:id/tweets` | 1 request | 15 minutes |
| Delete tweet | `DELETE /2/tweets/:id` | 17 requests | 24 hours |

### Monthly Caps

- **500 posts/month** (not relevant—we're only deleting)
- **100 reads/month** (critical constraint)

### Implications

1. Each run can fetch tweets once (1 read request)
2. Each run can delete up to 17 tweets
3. With ~30 runs/month, we use ~30 of our 100 monthly reads
4. User posts 5-15 tweets/week = max ~2/day average, well under 17 delete limit

---

## Technical Specification

### Language & Runtime

- **Node.js** (v18+ for native fetch support)
- **Package manager:** npm
- **Single dependency:** `twitter-api-v2` (handles OAuth 1.0a, pagination, rate limits)

### Authentication

Use **OAuth 1.0a User Context** (required for delete operations).

Required credentials (stored as GitHub Secrets):
- `TWITTER_API_KEY` — Consumer Key (API Key)
- `TWITTER_API_SECRET` — Consumer Secret (API Secret)
- `TWITTER_ACCESS_TOKEN` — User Access Token
- `TWITTER_ACCESS_SECRET` — User Access Token Secret

### Core Logic (Pseudocode)

```
1. Initialize Twitter client with OAuth 1.0a credentials
2. Get authenticated user's ID
3. Fetch user's recent tweets (max 100 per request)
4. Filter tweets where created_at < (now - 7 days)
5. For each old tweet:
   a. Attempt delete
   b. On success: log tweet ID
   c. On rate limit error (429): log warning and exit loop
   d. On other error: log error and continue
6. Exit with code 0 (success) regardless of partial completion
```

### Date Handling

- Use native JavaScript `Date` objects
- Compare: `new Date(tweet.created_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)`
- Twitter returns `created_at` in ISO 8601 format

### Error Handling Strategy

| Error Type | Action |
|------------|--------|
| Auth failure (401) | Exit with error code 1, log message |
| Rate limit (429) | Log warning, stop deleting, exit with code 0 |
| Tweet not found (404) | Log info (already deleted?), continue |
| Other API error | Log error, continue to next tweet |
| Network error | Exit with error code 1 |

---

## File Structure

```
tweet-deleter/
├── .github/
│   └── workflows/
│       └── delete-old-tweets.yml    # GitHub Actions workflow
├── src/
│   └── index.js                     # Main script
├── package.json                     # Dependencies and scripts
├── package-lock.json                # Lockfile (generated)
├── .gitignore                       # Ignore node_modules
└── README.md                        # Setup instructions
```

---

## Implementation Details

### 1. `package.json`

```json
{
  "name": "tweet-deleter",
  "version": "1.0.0",
  "description": "Auto-delete tweets older than 7 days",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "twitter-api-v2": "^1.15.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2. `src/index.js` — Main Script

Implement the following:

```javascript
// 1. Import TwitterApi from 'twitter-api-v2'

// 2. Read credentials from environment variables:
//    - TWITTER_API_KEY
//    - TWITTER_API_SECRET  
//    - TWITTER_ACCESS_TOKEN
//    - TWITTER_ACCESS_SECRET

// 3. Validate all credentials exist, exit with error if not

// 4. Initialize client:
//    const client = new TwitterApi({
//      appKey: TWITTER_API_KEY,
//      appSecret: TWITTER_API_SECRET,
//      accessToken: TWITTER_ACCESS_TOKEN,
//      accessSecret: TWITTER_ACCESS_SECRET,
//    });

// 5. Get authenticated user:
//    const me = await client.v2.me();
//    const userId = me.data.id;

// 6. Fetch user's tweets:
//    const tweets = await client.v2.userTimeline(userId, {
//      max_results: 100,
//      'tweet.fields': ['created_at'],
//    });

// 7. Calculate cutoff date (7 days ago)

// 8. Filter old tweets

// 9. Loop through old tweets and delete:
//    for (const tweet of oldTweets) {
//      try {
//        await client.v2.deleteTweet(tweet.id);
//        console.log(`Deleted: ${tweet.id}`);
//      } catch (error) {
//        if (error.code === 429) {
//          console.warn('Rate limit reached, stopping');
//          break;
//        }
//        // Handle other errors...
//      }
//    }

// 10. Log summary and exit
```

### 3. `.github/workflows/delete-old-tweets.yml`

```yaml
name: Delete Old Tweets

on:
  schedule:
    # Run daily at 00:00 UTC
    - cron: '0 0 * * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  delete-tweets:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run delete script
        env:
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET: ${{ secrets.TWITTER_API_SECRET }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_SECRET: ${{ secrets.TWITTER_ACCESS_SECRET }}
        run: npm start
```

### 4. `.gitignore`

```
node_modules/
.env
```

### 5. `README.md`

Include:
- What the script does
- Setup steps:
  1. Fork/clone repo
  2. Create X/Twitter developer app (link to developer portal)
  3. Generate OAuth 1.0a credentials with read+write permissions
  4. Add secrets to GitHub repository settings
  5. Enable GitHub Actions
- How to manually trigger a run
- Expected behavior and limitations

---

## Setup Instructions for User

### Step 1: Create GitHub Repository

Create a new private repository (public works too, but private is safer).

### Step 2: Get Twitter API Credentials

1. Go to https://developer.x.com/en/portal/dashboard
2. Create or select a project/app
3. Ensure app has **Read and Write** permissions
4. Generate OAuth 1.0a credentials:
   - API Key (Consumer Key)
   - API Secret (Consumer Secret)
   - Access Token
   - Access Token Secret

### Step 3: Add GitHub Secrets

In repo: Settings → Secrets and variables → Actions → New repository secret

Add these 4 secrets:
- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`

### Step 4: Enable Actions

Go to Actions tab and enable workflows if prompted.

### Step 5: Test

Use "Run workflow" button to manually trigger and verify it works.

---

## Testing Checklist

| Test Case | Expected Result |
|-----------|-----------------|
| No tweets older than 7 days | Script completes, logs "No tweets to delete" |
| 1-5 old tweets | All deleted, IDs logged |
| 17+ old tweets | First 17 deleted, rate limit logged, exits gracefully |
| Invalid credentials | Exits with error code 1, clear error message |
| Tweet already deleted (404) | Logs info, continues to next |
| Network failure | Exits with error code 1 |
| Manual workflow trigger | Runs successfully |
| Scheduled trigger | Runs at 00:00 UTC daily |

---

## Security Considerations

1. **Never commit credentials** — All secrets via GitHub Secrets
2. **Private repo recommended** — Logs may contain tweet IDs
3. **Minimal permissions** — App only needs Read+Write (not DMs)
4. **No external services** — Only GitHub Actions and Twitter API

---

## Future Enhancements (Out of Scope)

These are NOT part of this implementation but noted for potential future work:

- Configurable retention period (env variable)
- Dry-run mode
- Tweet backup/export before deletion
- Notification on failure (email/webhook)
- Support for multiple accounts

---

## Summary for Coding Agent

**Build a Node.js script that:**

1. Authenticates with Twitter API v2 using OAuth 1.0a (4 env vars)
2. Fetches the authenticated user's tweets (up to 100)
3. Deletes any tweets older than 7 days
4. Handles rate limits gracefully (stop and exit 0)
5. Runs via GitHub Actions on a daily cron schedule

**Key constraints:**
- Single file: `src/index.js`
- Single dependency: `twitter-api-v2`
- No persistence, no dry-run, no backups
- Exit 0 on success or rate limit; Exit 1 only on auth/network failure

**Deliverables:**
1. `package.json`
2. `src/index.js`
3. `.github/workflows/delete-old-tweets.yml`
4. `.gitignore`
5. `README.md`
