# VERIFY — check it yourself before it goes live

**Rule:** If a step can spend money, leak a key, expose data, or act as you, prove it with your own eyes first. Everything else is free to tinker with. AI reports and green CI are leads, not proof.

## Before going live (run on the preview)
- [ ] `?demo=bookmarks` shows only sample data and makes zero X requests
- [ ] X sign-in screen asks only to *read*: no posting, liking, or DMs
- [ ] Your account signs in fine
- [ ] A second X account gets "This TrendForge instance is private"
- [ ] Signed out, `/api/bookmarks`, `/api/digest`, `/api/themes` all return 401
- [ ] One sync drops your X credits by about (posts read × current price)
- [ ] Spamming sync, search, or brief hits "too many requests"
- [ ] Your X profile shows no new posts, likes, or DMs
- [ ] GitHub code search for your secret's first 6 characters finds nothing
- [ ] `/api/cron/weekly-digest` in a plain tab returns 401

## If something breaks
1. Vercel: roll back to the last good production deploy
2. Vercel: change `SESSION_SECRET` and redeploy (signs everyone out)
3. X console: regenerate the client secret, then revoke the app in X settings
4. X billing: turn off auto-recharge

## Log
| Date | Step | Passed | Checked by |
|------|------|--------|------------|
