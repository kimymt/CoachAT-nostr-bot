#!/bin/bash

# Nostr Bot Setup Script

echo "Setting up Nostr Bot..."

# 依存関係をインストール
echo "Installing dependencies..."
npm install

# 秘密鍵を生成（まだ設定されていない場合）
echo "Checking private key..."
if [ -z "$NOSTR_PRIVATE_KEY" ]; then
    echo "Generating new private key..."
    # 注意: 実際の運用では、安全に生成された秘密鍵を使用してください
    echo "Please set your NOSTR_PRIVATE_KEY using: wrangler secret put NOSTR_PRIVATE_KEY"
fi

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Set your private key: wrangler secret put NOSTR_PRIVATE_KEY"
echo "2. Customize your message in wrangler.toml"
echo "3. Test the bot: npm run dev"
echo "4. Deploy: npm run deploy"

