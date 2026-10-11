# AVADO MEV-Boost

This is the AVADO package of [MEV-Boost](https://boost.flashbots.net/), the open-source middleware that lets a validator take block bids from many builders through relays.
It runs `mev-boost` on mainnet with a list of relays that this repository keeps current, so stakers get more bids without editing a long relay string by hand.

## The relay list: `relays.json`

`relays.json` is the single source of truth for the mainnet relays. Everything else is generated from it: `relays.md` (the table and the copy-paste relay string), the `RELAYS` default in the package, the list of shut-down hosts in `build/start.sh`, and the live list that the AVADO Admin shows.

Top-level fields:

| Field | Meaning |
|---|---|
| `schema` | Always `1`. |
| `updatedAt` | The date (`YYYY-MM-DD`) the list last changed. The Admin uses it to tell whether its own copy is older. |
| `network` | Always `mainnet`. |
| `relays` | One entry per relay, in the order they are shown. |

Each relay:

| Field | Meaning |
|---|---|
| `id` | A short lower-case name, unique in the file (for example `ultrasound`). |
| `name` | The name people see (for example `Ultra Sound`). |
| `url` | The relay URL as mev-boost takes it: `https://0x<public key>@<host>`. Hosts are unique. |
| `about` | An https link where people can read about the relay. |
| `filtering` | `none`, or `sanctions` when the relay leaves out transactions from sanctioned addresses. |
| `recommended` | `true` when "Use recommended" in the Admin should tick it. Only a `live` relay can be recommended. |
| `status` | `live`, or `retired` when the relay no longer answers. |
| `statusSince` | The date the status last changed. |
| `note` | A short sentence for people, or an empty string. |

`scripts/relays.schema.json` describes the same rules for editors; `node scripts/check-relays.mjs` checks them.

## The weekly check

Every Monday at 06:00 UTC the **Relay check** workflow (`.github/workflows/relay-check.yml`) runs `node scripts/probe.mjs`. It:

1. Asks every relay in the list, plus any relay that is new on the [ethstaker relay list](https://github.com/eth-educators/ethstaker-guides/blob/main/MEV-relay-list.md), whether it is up (`/eth/v1/builder/status`, three tries each).
2. Counts how many weekly checks in a row each live relay has failed, in `.relay-check/failures.json`. A relay is retired only after **three** failed weekly checks in a row; one or two misses are just warnings. A success resets the count. A retired relay keeps its count until it answers again, so a retirement that is not merged yet is made again the next week instead of being lost.
3. Brings a retired relay back as live when it answers again, but leaves it not recommended.
4. Adds a relay that is new on the ethstaker list as not recommended, and warns (without changing anything) when the ethstaker list shows a different public key for a relay we already have. A row on the ethstaker list that is not a valid relay URL (for example `http://`, or a path after the host) is left out with a warning, and the rest of the check goes on.
5. Checks the new list the same way the tests do, then opens or updates a pull request called **Relay check** with `relays.json`, `relays.md` and `.relay-check/failures.json`. The pull request text lists every relay, the changes and the warnings. A pull request opens whenever one of those three files changed, including when only a failure count went up. When none of them changed, no pull request is opened.

Some weeks the pull request only carries warnings (a relay missed one or two checks). Merging those is optional. Each run starts from the counts on the open `relay-check` branch, so missed checks keep adding up whether or not the warning-only pull request was merged.

The weekly pull request needs the repository setting **Allow GitHub Actions to create and approve pull requests** (Settings → Actions → General → Workflow permissions). A pull request opened by a workflow does not start the test workflow, so the check validates the list in the same run before it opens the pull request.

Nothing reaches the boxes until the owner reviews and merges that pull request. Whether a relay should be recommended is always the owner's decision: edit `recommended` in the pull request before merging.

To see what the check would do without changing any file: `node scripts/probe.mjs --dry-run`.

## How a merge reaches the boxes

When a change to `relays.json` lands on `main`, the **Publish relay list** workflow (`.github/workflows/publish-relays.yml`) checks the file and runs `node scripts/publish.mjs`. That writes the whole file to bo.ava.do as the value `mev-relays` and reads it back from `https://bo.ava.do/value/mev-relays` to make sure the new `updatedAt` is there. The repository always wins: every publish overwrites what bo.ava.do had.

The Relays card on the MEV-Boost page of the AVADO Admin reads that value, so boxes see the new list the next time the card is opened, without a package release. When bo.ava.do cannot be reached, the card falls back to the copy bundled with the Admin.

The publish workflow can also be started by hand from the Actions tab (Run workflow). It only publishes when started on `main`, so an unmerged list can never reach the boxes.

### The `BO_ADMIN_TOKEN` secret

Publishing needs a bo.ava.do admin token in the repository secret `BO_ADMIN_TOKEN` (Settings → Secrets and variables → Actions). Without it the publish job fails with "BO_ADMIN_TOKEN is not set" and the boxes keep the previous list.

## Adding or changing a relay by hand

1. Edit `relays.json`. Set `updatedAt` to today's date, and `statusSince` too when you change a relay's status.
2. Run `npm run render` to regenerate `relays.md`.
3. Run `npm test` and `npm run check`.
4. Open a pull request. Tests run on it; the package build is skipped because only the list changed. Merging publishes the list as described above.

## Preparing a package release

The relay defaults inside the package are only updated when a new version is released:

1. Branch from an up-to-date `main`.
2. Run `node scripts/render.mjs package`. It rewrites the `RELAYS` default in `dappnode_package.json` and `docker-compose.yml` and `DEAD_RELAY_HOSTS` in `build/start.sh` from `relays.json`.
3. Bump the version in `dappnode_package.json` and the image tag in `docker-compose.yml`.
4. Open a pull request. The build workflow builds the package; when it is merged (with a merge commit, never a squash, because the release job applies the build's diff) the release workflow publishes the new version. The owner moves it to production.

When the `RELAYS` default in `dappnode_package.json` no longer matches `relays.json`, the test workflow prints a warning line in its log (not in the job summary, and the job still passes); that is the reminder to prepare a release.

## Minimum bid

Since 0.0.19 the package sets no minimum bid (`EXTRA_OPTS=` is empty), so the validator takes the best bid a relay offers. Before 0.0.19 it shipped `-min-bid 0.05`, and since most bids are now lower than that, many blocks fell back to a block the box built itself. Existing installs keep the value they have until it is changed in the Admin.

## Development

Node 20 or newer, no dependencies.

```sh
npm test                           # unit tests (node --test)
npm run check                      # validate relays.json and check relays.md is up to date
npm run render                     # regenerate relays.md
node scripts/render.mjs package    # write the relay defaults into the package files
node scripts/probe.mjs --dry-run   # run the weekly check without writing anything
```
