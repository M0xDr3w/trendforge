# VERIFY.md — prove it yourself before it goes live

This page is for Drew, the owner. It does not ask you to trust any AI tool,
CI badge, or code review. Every check below is something you can see with
your own eyes in a browser, the X developer console, or the Vercel dashboard.

## How we decide a step is safe

- Sort by worst case: can it spend money, leak a key, expose data, or act
  under your name? If none of those, it is learning zone — tinker freely
  (draft PRs, preview deploys, `?demo=bookmarks` sample data). If any apply,
  you need your own proof first.
- Write the pass condition down before you look, then check it.
- Test like a stranger: private window, a second X account, spam the button.
- Green CI and tool reports are leads, not proof.
- Guardrails that protect you even if everyone is wrong: keep prepaid X
  credits low, use keys you can regenerate in one click, know the Vercel
  instant rollback path, and keep the owner-only lock on in production
  (`X_ALLOWED_USER_IDS` set to just your X user id — an allow-list, meaning
  only listed accounts get in).
- Roll out in stages: demo, then preview, then production with only you
  allowed, then other people. Do not advance until the current stage passes.

## Checklist for PR #12 (Bookmark Forge)

Run these against the preview deploy, top to bottom.

- [ ] 1. Demo stays fake. Open the preview with `?demo=bookmarks` at the end
  of the address. Pass: every panel says sample data out loud — `DEMO
  FIXTURES` badges on the bookmark and digest panels, `SAMPLE DATA ·
  FICTIONAL ACCOUNTS` on the feed — and every account starts with
  `@sample_`. Open devtools (F12) → Network → type `x.com` in the filter.
  Pass: zero requests to X.
- [ ] 2. Consent screen is read-only. Click Sign in with X and read the X
  permission screen carefully. Pass: it lists only reading your bookmarks,
  reading posts, reading your profile, and staying signed in
  (`bookmark.read`, `tweet.read`, `users.read`, `offline.access`) — nothing
  about posting, liking, reposting, following, or DMs.
- [ ] 3. Owner sign-in works. Approve with your own X account. Pass: you land
  back on the app, see a "Signed in with X" message, and your handle shows
  next to a green SIGNED IN pill in the Bookmark Forge panel.
- [ ] 4. Strangers are refused. With `X_ALLOWED_USER_IDS` set to only your
  id, sign in with a second throwaway X account (private window works).
  Pass: you land back on the app and see "This TrendForge instance is
  private" — and no bookmarks ever appear for that account.
- [ ] 5. Signed-out eyes see nothing. In a private window (not signed in),
  the bookmark panel says SIGNED OUT and asks you to sign in; the digest
  panel says no digest yet. Now visit these three addresses directly, each
  in the address bar: `/api/bookmarks`, `/api/digest`, `/api/themes`.
  Pass: each one answers `401` with "Not signed in with X" — no bookmark
  text anywhere.
- [ ] 6. One sync costs what it says. In the X developer console, open the
  billing/credits page and write down the balance. Back in the app, click
  Sync bookmarks once. The success message names two numbers: how many
  posts were read, and the per-post cost. Multiply them yourself, then look
  up today's per-read price in the X console (prices change — trust the
  console, not this page). Pass: the balance drop roughly matches your own
  multiplication. Roughly, not to the cent.
- [ ] 7. Spam gets throttled. Still signed in, click Sync about ten times in
  a row, then hammer the assisted search and Generate brief buttons.
  Pass: you get a "rate limit exceeded" / "too many requests" message
  instead of silent spending — roughly: sync stops after about 10 tries per
  hour, digest/themes/assisted search after a few dozen.
- [ ] 8. Nothing gets posted. After using every feature, open your own X
  profile in a new tab. Pass: no new posts, no new likes, no new DMs. The
  app only ever reads (bookmarks, folders, your profile) — there is no
  button anywhere that publishes.
- [ ] 9. No secrets in git. On GitHub, open this repo and use code search
  for the first 6 characters of your X client secret. Pass: zero results.
  In the Vercel dashboard, open Settings → Environment Variables. Pass:
  every secret lives there and nowhere else.
- [ ] 10. The cron door is locked. In a plain browser tab (not signed in),
  visit `/api/cron/weekly-digest`. Pass: `401` "Cron unauthorized" — the
  weekly brief cannot be triggered without the `CRON_SECRET`.

## If something fails (the undo plan)

Do these in order until the bleeding stops.

1. Roll back Vercel first. Dashboard → your project → Deployments → find
   the last good Production deploy → open its menu → redeploy (or promote
   it back to Production). This is instant and does not touch X.
2. Kill the sessions instantly. In Vercel → Environment Variables, change
   `SESSION_SECRET` to a fresh random string and redeploy. Every sealed
   session in the database stops decrypting at once, so all sign-ins die
   immediately. (Backup path: Storage → your KV database → data browser →
   search for keys starting with `tf:sess:` and delete them.)
3. Cut off X access. In the X developer console → your app → Keys and
   tokens → regenerate the client secret, then update it in Vercel env.
   Then in X → Settings → Security and account access → Apps and sessions
   → revoke this app. Now nothing holds a working credential.
4. Stop the money. In the X developer billing section, turn auto-recharge
   off (or lower the prepaid balance) until you understand what happened.
5. Write down what failed in the log below before you fix anything.

## Log

| Date | Step | Checks passed | Checked by |
|------|------|---------------|------------|
|      |      |               |            |
|      |      |               |            |
|      |      |               |            |
