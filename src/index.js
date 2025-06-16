import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';

// シンプルなWebSocket接続クラス
class NostrRelay {
  constructor(url) {
    this.url = url;
    this.ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        const timeout = setTimeout(() => {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`Connected to ${this.url}`);
          resolve();
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`Connection error to ${this.url}:`, error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log(`Disconnected from ${this.url}`);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async publish(event) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const message = JSON.stringify(['EVENT', event]);
      
      const timeout = setTimeout(() => {
        reject(new Error('Publish timeout'));
      }, 5000);

      // OKメッセージを待機
      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data[0] === 'OK') {
            clearTimeout(timeout);
            this.ws.removeEventListener('message', handleMessage);
            if (data[2] === true) {
              resolve({ success: true, message: data[3] || 'Published successfully' });
            } else {
              reject(new Error(data[3] || 'Publish failed'));
            }
          }
        } catch (e) {
          // JSONパースエラーは無視（他のメッセージの可能性）
        }
      };

      this.ws.addEventListener('message', handleMessage);
      this.ws.send(message);
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    console.log('Scheduled event triggered:', event.scheduledTime);
    
    try {
      // 環境変数から設定を取得
      let privateKey;
      if (env.NOSTR_PRIVATE_KEY) {
        privateKey = new Uint8Array(env.NOSTR_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      } else {
        privateKey = generateSecretKey();
        console.log('Warning: Using generated private key. Set NOSTR_PRIVATE_KEY for persistent identity.');
      }
      
      // より信頼性の高いリレーのみを使用
      const relayUrls = env.NOSTR_RELAYS ? 
        env.NOSTR_RELAYS.split(',').map(url => url.trim()) : 
        ['wss://relay.damus.io', 'wss://nos.lol'];
      
      console.log('Using relays:', relayUrls);
      
      // スケジュールされた時刻に基づいてメッセージを決定
      const scheduledDate = new Date(event.scheduledTime);
      const hourUTC = scheduledDate.getUTCHours();
      const minuteUTC = scheduledDate.getUTCMinutes();

      let message = 'Hello from Nostr bot!';

      const messagesByTime = {
        '22:0': 'Wake your ass up!',
        '0:0': 'I have one question only. Are you ready to outwork today?',
        '2:0': 'If you are still sleeping, get your ass up!',
        '8:0': 'Lead by example. Take your neighbors with you!',
        '8:30': 'It\'s only 30 mins left in 24 hrs day. Stay low, stay low!'
      };

      const timeKey = `${hourUTC}:${minuteUTC}`;
      if (messagesByTime[timeKey]) {
        message = messagesByTime[timeKey];
      }

      console.log(`Posting message for ${timeKey}: ${message}`);

      // Nostrイベントを作成
      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
      };
      
      const signedEvent = finalizeEvent(eventTemplate, privateKey);
      console.log('Event created with ID:', signedEvent.id);
      
      // 各リレーに順次接続して投稿
      const results = [];
      let successCount = 0;
      
      for (const relayUrl of relayUrls) {
        try {
          console.log(`Connecting to ${relayUrl}...`);
          const relay = new NostrRelay(relayUrl);
          
          await relay.connect();
          const result = await relay.publish(signedEvent);
          
          console.log(`✓ Successfully published to ${relayUrl}`);
          results.push({ relay: relayUrl, status: 'success', ...result });
          successCount++;
          
          relay.close();
          
          // リレー間で少し待機
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`✗ Failed to publish to ${relayUrl}:`, error.message);
          results.push({ 
            relay: relayUrl, 
            status: 'failed', 
            error: error.message 
          });
        }
      }
      
      console.log(`Published to ${successCount}/${relayUrls.length} relays`);
      
      return new Response(JSON.stringify({
        success: successCount > 0,
        message: `Event published to ${successCount}/${relayUrls.length} relays`,
        eventId: signedEvent.id,
        content: message,
        publishResults: results,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Error in scheduled function:', error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/test') {
      return this.scheduled({ scheduledTime: Date.now() }, env, ctx);
    }
    
    if (url.pathname === '/status') {
      const publicKey = env.NOSTR_PRIVATE_KEY ? 
        getPublicKey(new Uint8Array(env.NOSTR_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))) : 
        'Not set';
        
      return new Response(JSON.stringify({
        status: 'running',
        timestamp: new Date().toISOString(),
        relays: env.NOSTR_RELAYS ? env.NOSTR_RELAYS.split(',') : ['wss://relay.damus.io', 'wss://nos.lol'],
        hasPrivateKey: !!env.NOSTR_PRIVATE_KEY,
        publicKey: publicKey,
        version: '1.2.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/ping') {
      // 簡単な接続テスト
      const relayUrl = 'wss://relay.damus.io';
      try {
        const relay = new NostrRelay(relayUrl);
        await relay.connect();
        relay.close();
        
        return new Response(JSON.stringify({
          ping: 'success',
          relay: relayUrl,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          ping: 'failed',
          relay: relayUrl,
          error: error.message,
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response(JSON.stringify({
      message: 'Nostr Bot is running',
      endpoints: {
        '/test': 'Test posting functionality',
        '/status': 'Check bot status',
        '/ping': 'Test relay connection'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};