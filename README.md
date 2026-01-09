# Un-Tweet

Automatically delete your tweets older than 7 days. Runs daily via GitHub Actions.

## How It Works

- Fetches your most recent 100 tweets
- Deletes any tweets older than 7 days
- Archives deleted tweets to `archive.json` before deletion
- Logs deleted tweet content to GitHub Actions logs
- Runs automatically once per day at 00:00 UTC
- Stays within X/Twitter API free tier limits (17 deletes per day)

## Example Output

```
=== Un-Tweet: Auto-delete old tweets ===
Retention period: 7 days

Using provided user ID: 287787522
Fetching tweets...
Found 5 tweets in timeline.
Found 2 tweets older than 7 days.

Deleting old tweets...
Deleted: 1983722664687759873 (2025-10-30T02:28:33.000Z)
  "This is the content of the deleted tweet..."
Deleted: 1980811935924048238 (2025-10-22T01:42:21.000Z)
  "Another tweet that was deleted..."

=== Summary ===
Tweets deleted: 2/2
Done!
```

## Setup

### 1. Get Twitter API Credentials

1. Go to the [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a new project and app (or use an existing one)
3. Set app permissions to **Read and Write**
4. Go to "Keys and Tokens" and generate:
   - API Key (Consumer Key)
   - API Secret (Consumer Secret)
   - Access Token
   - Access Token Secret

### 2. Find Your User ID (Free Tier Only)

The free tier may not support the `users/me` endpoint. To find your user ID:

1. Go to [tweeterid.com](https://tweeterid.com/) or similar
2. Enter your Twitter username
3. Copy the numeric user ID

### 3. Add GitHub Secrets

In your repository, go to **Settings > Secrets and variables > Actions** and add:

| Secret Name | Value |
|------------|-------|
| `TWITTER_API_KEY` | Your API Key |
| `TWITTER_API_SECRET` | Your API Secret |
| `TWITTER_ACCESS_TOKEN` | Your Access Token |
| `TWITTER_ACCESS_SECRET` | Your Access Token Secret |
| `TWITTER_USER_ID` | Your numeric user ID (optional, but recommended for free tier) |

### 4. Enable GitHub Actions

Go to the **Actions** tab in your repository and enable workflows if prompted.

### 5. Test It

Click **Actions > Delete Old Tweets > Run workflow** to trigger a manual run.

## Local Testing

```bash
# Install dependencies
npm install

# Set environment variables
export TWITTER_API_KEY="your_key"
export TWITTER_API_SECRET="your_secret"
export TWITTER_ACCESS_TOKEN="your_token"
export TWITTER_ACCESS_SECRET="your_token_secret"
export TWITTER_USER_ID="your_user_id"

# Dry run (won't delete anything)
DRY_RUN=true npm start

# Actually delete tweets
npm start
```

## API Limits (Free Tier)

| Operation | Limit |
|-----------|-------|
| Fetch tweets | 1 request / 15 minutes |
| Delete tweets | 17 requests / 24 hours |

With daily runs, this handles up to 17 tweets per day (119/week), well above typical posting rates.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `DAYS_TO_KEEP` | `7` | Delete tweets older than this many days |
| `DRY_RUN` | `false` | Set to `true` to preview without deleting |

To change the retention period, add `DAYS_TO_KEEP` to your GitHub secrets or set it in the workflow file.

## Troubleshooting

**"Failed to get user ID from API"**
- Add `TWITTER_USER_ID` to your GitHub secrets

**"Rate limit reached"**
- Normal behavior if you have many old tweets. Remaining tweets will be deleted in subsequent runs.

**"Missing required environment variables"**
- Ensure all 4 Twitter secrets are set in GitHub repository settings

## Tweet Archive

Deleted tweets are saved to `archive.json` in the repository before deletion. Each archived tweet includes:

- `id` — Tweet ID
- `text` — Full tweet content
- `created_at` — When the tweet was posted
- `deleted_at` — When it was deleted
- `public_metrics` — Likes, retweets, replies, quotes
- `entities` — Hashtags, mentions, URLs
- `source` — Client used to post (e.g., "Twitter Web App")
- `conversation_id` — Thread ID if part of a thread
- `in_reply_to_user_id` — Who you replied to
- `referenced_tweets` — Original tweet if RT/quote/reply
- `lang` — Detected language

The archive is automatically committed to the repo after each run.
