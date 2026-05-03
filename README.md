# CoachAT-nostr-bot
All contents of this repository are generated using LLMs by non-engineer. Please carefully verify the content and use it at your own responsibility.

## About
Unofficial Alex Toussaint bot running on the Nostr protocol using Cloudflare Worker

## Project Setup

**1. Organizing Project Files**
Place the provided project files in their appropriate directories. The project structure should resemble the following:

```
nostr-bot/
├── package.json
├── wrangler.toml
├── vitest.config.js
├── src/
│   ├── index.js
│   └── index.test.js
├── generate-keys.js
└── setup.sh
```

**2. Install Dependencies**
Run the following command in the project directory to install all required libraries:

```bash
npm install
```

This command will install the nostr-tools library along with any other dependencies. Alternatively, you can run `bash setup.sh` to install dependencies and print the next-step guidance in one go (optional).

**3. Authenticate Your Cloudflare Account**
Log in to your Cloudflare account using the Wrangler CLI:

```bash
wrangler login
```

This command will open your browser and prompt you to authenticate with your Cloudflare account.

### Generating and Configuring Your Private Key

**1. Generate a New Private Key**
Use the key generation script included in the project to create a new Nostr private key:

```bash
node generate-keys.js
```

This script will generate a cryptographically secure private key and corresponding public key, along with instructions on how to configure it.

**2. Configure Your Private Key**
Set the generated private key as an environment variable in Cloudflare Workers:

```bash
wrangler secret put NOSTR_PRIVATE_KEY
```

When prompted, enter the generated private key (in hexadecimal format).

**3. Verify Configuration**
To confirm that the configuration was successful, you can list all secrets using the following command:

```bash
wrangler secret list
```

### Configuring Relays

The bot reads the comma-separated `NOSTR_RELAYS` variable defined in the `[vars]` section of `wrangler.toml`. The default value is:

```
NOSTR_RELAYS = "wss://relay.damus.io,wss://nos.lol"
```

If `NOSTR_RELAYS` is missing, the Worker falls back to the same two relays at runtime. To use different relays, edit `wrangler.toml` before deployment.

## Schedule

The Worker is triggered by a cron defined in `wrangler.toml`:

```
crons = ["55 * * * *"]
```

It fires every hour at minute 55 (UTC). The handler converts the trigger time to JST and selects a message based on the JST hour and weekday:

- JST Mon 06:55 — `Let's conquer Mondy, conquer this week.`
- JST 07:55 through 16:55 — a distinct message for each hour (see `src/index.js`)
- Any other time — fallback message: `Let go, be free, do you have fun? And most importantly, spread love.`

Because the cron runs every hour at :55 (UTC), the bot posts around the clock; only the JST 06:55–16:55 window has dedicated messages, and other hours post the fallback.

## Development

```bash
npm run dev            # Run wrangler dev locally
npm test               # Run the Vitest test suite once
npm run test:watch     # Re-run tests on change
npm run test:coverage  # Run tests with coverage report
```

## Deployment

After secrets and relays are configured, deploy the Worker with:

```bash
npm run deploy
```

This runs `wrangler deploy` under the hood.

## HTTP Endpoints

After deployment, the Worker exposes the following endpoints for diagnostics:

- `GET /` — JSON listing of available endpoints
- `GET /test` — Manually invokes the scheduled handler and posts a message
- `GET /status` — Returns relay configuration, the derived public key, and whether `NOSTR_PRIVATE_KEY` is set
- `GET /ping` — Tests WebSocket connectivity to `wss://relay.damus.io`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
