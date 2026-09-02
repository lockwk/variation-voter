# Changelog

All notable **user-facing** changes to Variation Voter are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This file tracks the product (the self-hosted Variation Voter app). The
`create-variation-voter` npm scaffolder has its own version, bumped only when
that tool's own behavior changes — see `create-variation-voter/`.

How this list is maintained: when a ticket ships a change a user can see, add a
one-line note under **[Unreleased]** in plain language, tagged with its ticket
ID. Internal-only work (refactors, infra, tests) does not go here. At release
time, `[Unreleased]` becomes a dated version heading and a fresh empty
`[Unreleased]` is started.

## [Unreleased]

### Added

- `npm run update-variation-voter` updates an existing self-host install to the latest release: it preserves your config and secrets, backs up any app files you edited to `.voter-backup/`, and refreshes the rest — then reminds you to run `npm install` and redeploy (KEV-202)

### Changed

- Refined the voter side panel: clearer header, comment cards, and layout (KEV-203/204/205)

### Removed

- Dropped the external-URL ("url") variation kind; variations are now image or embed only (KEV-182)
