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
├── src/
│   └── index.js
├── generate-keys.js
└── setup.sh
```

**2. Install Dependencies**
Run the following command in the project directory to install all required libraries:

```bash
npm install
```

This command will install the nostr-tools library along with any other dependencies.

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


