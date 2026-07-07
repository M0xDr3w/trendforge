// Vercel serverless function to proxy X API calls securely
// Set X_BEARER_TOKEN in Vercel env vars.
// Recommended: App-only Bearer Token from https://developer.x.com (your app → Keys and tokens)
// Or generate with: curl -u "KEY:SECRET" --data 'grant_type=client_credentials' https://api.x.com/oauth2/token
// (The access_token in the response is the bearer value)

export default async function handler(req, res) {
  const { query = 'AI', max_results = '20' } = req.query;
  const parsed = parseInt(max_results, 10)
  const mr = Math.min(100, Math.max(10, Number.isFinite(parsed) ? parsed : 20))

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'X_BEARER_TOKEN not configured' });
  }

  try {
    const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${mr}&tweet.fields=public_metrics,created_at,author_id,conversation_id&expansions=author_id&user.fields=username`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: 'X API error', details: errorText });
    }

    const data = await response.json();

    const posts = (data.data || []).map((tweet, i) => {
      const user = (data.includes?.users || []).find(u => u.id === tweet.author_id) || {};
      const text = tweet.text || '';
      const likes = tweet.public_metrics?.like_count || 0;
      const retweets = tweet.public_metrics?.retweet_count || 0;

      // Improved simple sentiment heuristic
      const lower = text.toLowerCase();
      let sentiment = 0.15;
      const pos = (lower.match(/(good|great|love|win|amazing|excited|🔥|based|ship|nice|solid|progress)/g) || []).length;
      const neg = (lower.match(/(bad|fail|hate|crash|terrible|sad|😢|broken|issue|problem|down|layoff)/g) || []).length;
      if (pos > neg) sentiment = Math.min(0.85, 0.3 + pos * 0.15);
      if (neg > pos) sentiment = Math.max(-0.7, -0.2 - neg * 0.12);
      if (pos > 0 && neg > 0) sentiment = (pos - neg) * 0.1; // mixed

      return {
        id: Date.now() + i,
        text,
        username: user.username || 'xuser',
        timestamp: tweet.created_at || new Date().toISOString(),
        likes,
        retweets,
        sentiment: Number(sentiment.toFixed(2)),
      };
    });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}
