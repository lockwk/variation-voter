# create-variation-voter

Scaffold a self-hosted [Variation Voter](https://github.com/OWNER/REPO) instance.

```bash
npx create-variation-voter my-voter
```

This downloads the Variation Voter app into `./my-voter` (no `git clone`
needed) and then walks you through a guided setup: it prompts for your Neon
`DATABASE_URL` and public base URL, generates an `ADMIN_TOKEN` and
`CRON_SECRET`, and writes it all to `my-voter/.env.local`.

After it finishes:

```bash
cd my-voter
npm install
npm run db:migrate
npm run dev
```

This is just the setup wrapper — it does not itself contain the app.
Variation Voter's application code lives in the private/main repository;
this package only fetches a copy of it and gets your local `.env.local`
ready.
