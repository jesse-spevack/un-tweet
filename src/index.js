import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get project root directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = join(__dirname, '..', 'archive.json');

// Configuration
const DAYS_TO_KEEP = parseInt(process.env.DAYS_TO_KEEP || '7', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';

// Read credentials from environment
const {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  TWITTER_USER_ID, // Optional: fallback if v2.me() doesn't work on free tier
} = process.env;

// Validate required credentials
const requiredVars = {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
};

const missing = Object.entries(requiredVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Initialize Twitter client with OAuth 1.0a
const client = new TwitterApi({
  appKey: TWITTER_API_KEY,
  appSecret: TWITTER_API_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

// Archive functions
function loadArchive() {
  if (!existsSync(ARCHIVE_PATH)) {
    return { tweets: [], meta: { created_at: new Date().toISOString(), total_deleted: 0 } };
  }
  try {
    const data = readFileSync(ARCHIVE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('Could not load archive, starting fresh:', error.message);
    return { tweets: [], meta: { created_at: new Date().toISOString(), total_deleted: 0 } };
  }
}

function saveArchive(archive) {
  archive.meta.last_updated = new Date().toISOString();
  archive.meta.total_deleted = archive.tweets.length;
  writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  console.log(`Archive saved: ${archive.tweets.length} total tweets`);
}

function archiveTweet(archive, tweet) {
  archive.tweets.push({
    id: tweet.id,
    text: tweet.text,
    created_at: tweet.created_at,
    deleted_at: new Date().toISOString(),
    public_metrics: tweet.public_metrics || null,
    entities: tweet.entities || null,
    source: tweet.source || null,
    conversation_id: tweet.conversation_id || null,
    in_reply_to_user_id: tweet.in_reply_to_user_id || null,
    referenced_tweets: tweet.referenced_tweets || null,
    lang: tweet.lang || null,
  });
}

async function getUserId() {
  // Use provided user ID if available (fallback for free tier limitations)
  if (TWITTER_USER_ID) {
    console.log(`Using provided user ID: ${TWITTER_USER_ID}`);
    return TWITTER_USER_ID;
  }

  // Try to get user ID from API
  try {
    const me = await client.v2.me();
    console.log(`Authenticated as: ${me.data.username} (${me.data.id})`);
    return me.data.id;
  } catch (error) {
    console.error('Failed to get user ID from API.');
    console.error('If using free tier, set TWITTER_USER_ID environment variable.');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function fetchTweets(userId) {
  try {
    const tweets = await client.v2.userTimeline(userId, {
      max_results: 100,
      'tweet.fields': [
        'created_at',
        'text',
        'public_metrics',
        'entities',
        'source',
        'conversation_id',
        'in_reply_to_user_id',
        'referenced_tweets',
        'lang',
      ],
    });

    if (!tweets.data?.data) {
      console.log('No tweets found.');
      return [];
    }

    return tweets.data.data;
  } catch (error) {
    if (error.code === 429 || error.data?.status === 429) {
      console.error('Rate limit hit while fetching tweets. Try again later.');
      process.exit(1);
    }
    console.error(`Failed to fetch tweets: ${error.message}`);
    process.exit(1);
  }
}

function filterOldTweets(tweets, daysToKeep) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  return tweets.filter((tweet) => {
    const tweetDate = new Date(tweet.created_at);
    return tweetDate < cutoffDate;
  });
}

async function deleteTweets(tweets, archive) {
  let deleted = 0;
  let rateLimited = false;

  for (const tweet of tweets) {
    try {
      const truncatedText = tweet.text.length > 100
        ? tweet.text.slice(0, 100) + '...'
        : tweet.text;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would delete: ${tweet.id} (${tweet.created_at})`);
        console.log(`  "${truncatedText}"`);
        deleted++;
        continue;
      }

      await client.v2.deleteTweet(tweet.id);
      console.log(`Deleted: ${tweet.id} (${tweet.created_at})`);
      console.log(`  "${truncatedText}"`);

      // Archive the deleted tweet
      archiveTweet(archive, tweet);
      deleted++;

      // Small delay between deletes to be gentle on the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      // Check for rate limit (429)
      if (error.code === 429 || error.data?.status === 429 || error.rateLimit?.remaining === 0) {
        console.warn('Rate limit reached. Stopping deletions.');
        rateLimited = true;
        break;
      }

      // Tweet already deleted or not found (404)
      if (error.code === 404 || error.data?.status === 404) {
        console.log(`Tweet ${tweet.id} not found (already deleted?)`);
        continue;
      }

      // Other errors - log and continue
      console.error(`Failed to delete tweet ${tweet.id}: ${error.message}`);
    }
  }

  return { deleted, rateLimited };
}

async function main() {
  console.log('=== Un-Tweet: Auto-delete old tweets ===');
  console.log(`Retention period: ${DAYS_TO_KEEP} days`);
  if (DRY_RUN) {
    console.log('*** DRY RUN MODE - No tweets will be deleted ***');
  }
  console.log('');

  // Load existing archive
  const archive = loadArchive();
  console.log(`Archive loaded: ${archive.tweets.length} previously deleted tweets`);

  // Get user ID
  const userId = await getUserId();

  // Fetch tweets
  console.log('Fetching tweets...');
  const tweets = await fetchTweets(userId);
  console.log(`Found ${tweets.length} tweets in timeline.`);

  // Filter old tweets
  const oldTweets = filterOldTweets(tweets, DAYS_TO_KEEP);
  console.log(`Found ${oldTweets.length} tweets older than ${DAYS_TO_KEEP} days.`);

  if (oldTweets.length === 0) {
    console.log('No tweets to delete. Done!');
    return;
  }

  // Delete old tweets
  console.log('');
  console.log('Deleting old tweets...');
  const { deleted, rateLimited } = await deleteTweets(oldTweets, archive);

  // Save archive if we deleted anything
  if (deleted > 0 && !DRY_RUN) {
    saveArchive(archive);
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`Tweets deleted: ${deleted}/${oldTweets.length}`);
  if (rateLimited) {
    console.log('Note: Stopped early due to rate limit. Remaining tweets will be deleted in the next run.');
  }
  console.log('Done!');
}

// Run
main().catch((error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
