import { describe, it, expect, vi, afterEach } from 'vitest';
import { NostrRelay, selectMessage, parsePrivateKey, parseRelayUrls } from './index.js';
import handler from './index.js';

// ── WebSocket mock ─────────────────────────────────────────────────────────

// Use setTimeout(fn, 0) (not Promise.resolve) so fake-timer tests can control
// exactly when the connection/publish callbacks fire.
function createMockWebSocketClass({ connectBehavior = 'success', publishBehavior = 'success' } = {}) {
  return class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onerror = null;
      this.onclose = null;
      this._messageListeners = [];

      if (connectBehavior === 'success') {
        setTimeout(() => {
          this.readyState = 1; // OPEN
          this.onopen?.();
        }, 0);
      } else if (connectBehavior === 'error') {
        setTimeout(() => {
          this.onerror?.(new Error('Connection refused'));
        }, 0);
      }
      // 'timeout': nothing fires – the 10 s timer inside NostrRelay wins
    }

    send() {
      if (publishBehavior === 'success') {
        setTimeout(() => {
          this._messageListeners.forEach(fn =>
            fn({ data: JSON.stringify(['OK', 'eventid', true, 'accepted']) })
          );
        }, 0);
      } else if (publishBehavior === 'failure') {
        setTimeout(() => {
          this._messageListeners.forEach(fn =>
            fn({ data: JSON.stringify(['OK', 'eventid', false, 'blocked: rate-limited']) })
          );
        }, 0);
      }
      // 'timeout': nothing fires – the 5 s timer inside NostrRelay.publish wins
    }

    addEventListener(type, fn) {
      if (type === 'message') this._messageListeners.push(fn);
    }

    removeEventListener(type, fn) {
      if (type === 'message')
        this._messageListeners = this._messageListeners.filter(h => h !== fn);
    }

    close() {
      this.readyState = 3; // CLOSED
      this.onclose?.();
    }
  };
}

function setupWebSocketMock(opts = {}) {
  global.WebSocket = createMockWebSocketClass(opts);
}

// Known-good 32-byte secp256k1 private key (hex)
const TEST_PRIVATE_KEY = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

// Build a scheduledTime (ms) whose UTC+9 representation equals the given JST values.
// Base: 2024-01-01T00:00:00Z = Monday 09:00 JST  →  dayOfWeek 1 in UTC
function makeScheduledTime(jstHour, jstMinute, dayOfWeekJST) {
  const mondayUtcMs = new Date('2024-01-01T00:00:00Z').getTime();
  const daysFromMonday = (dayOfWeekJST - 1 + 7) % 7;
  const jstMs = jstHour * 3_600_000 + jstMinute * 60_000;
  const utcMs = jstMs - 9 * 3_600_000;
  return mondayUtcMs + daysFromMonday * 86_400_000 + utcMs;
}

function makeMinimalEvent() {
  return { id: 'abc', kind: 1, content: 'test', tags: [], created_at: 1, pubkey: 'pk', sig: 'sig' };
}

// ── selectMessage ──────────────────────────────────────────────────────────

describe('selectMessage', () => {
  it('returns the Monday special message on Monday at 06:55', () => {
    expect(selectMessage(6, 55, 1)).toBe("Let's conquer Mondy, conquer this week.");
  });

  it('does not return the Monday message at 06:55 on a non-Monday day', () => {
    expect(selectMessage(6, 55, 3)).toBe(
      'Let go, be free, do you have fun? And most importantly, spread love.'
    );
  });

  it.each([
    [7,  55, 'Wake your ass up!'],
    [8,  55, 'I have one question only. Are you ready to outwork today?'],
    [9,  55, 'Just checking, just checking'],
    [10, 55, 'Confidence take in, doubt let it out. Confidence take in, doubt let it out.'],
    [11, 55, 'If you are still sleeping, get your ass up!'],
    [12, 55, 'I see you big dog, I see you.'],
    [13, 55, 'Excellent work! Next shit is on you. Lead by example.'],
    [14, 55, 'One unit, one family, one pleoton. Take your neighbor with you.'],
    [15, 55, 'I like your style, I like it. Lock in, lock in.'],
    [16, 55, 'Beautiful work! Damn it!'],
  ])('returns correct message at %i:%i JST', (hour, minute, expected) => {
    expect(selectMessage(hour, minute, 3)).toBe(expected); // Wednesday, any non-Monday
  });

  it('still uses the hourly slot on Monday when the time is not 06:55', () => {
    expect(selectMessage(9, 55, 1)).toBe('Just checking, just checking');
  });

  it('returns the default message for an unmapped time', () => {
    expect(selectMessage(3, 0, 3)).toBe(
      'Let go, be free, do you have fun? And most importantly, spread love.'
    );
  });
});

// ── parsePrivateKey ────────────────────────────────────────────────────────

describe('parsePrivateKey', () => {
  it('returns a Uint8Array', () => {
    expect(parsePrivateKey(TEST_PRIVATE_KEY)).toBeInstanceOf(Uint8Array);
  });

  it('produces 32 bytes from a 64-char hex string', () => {
    expect(parsePrivateKey(TEST_PRIVATE_KEY).length).toBe(32);
  });

  it('parses individual byte values correctly', () => {
    const result = parsePrivateKey('0f' + '00'.repeat(31));
    expect(result[0]).toBe(15);
    expect(result[1]).toBe(0);
  });

  it('parses 0xff as 255', () => {
    expect(parsePrivateKey('ff' + '00'.repeat(31))[0]).toBe(255);
  });
});

// ── parseRelayUrls ─────────────────────────────────────────────────────────

describe('parseRelayUrls', () => {
  it('returns default relays when the env var is undefined', () => {
    expect(parseRelayUrls(undefined)).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('returns default relays when the env var is an empty string', () => {
    expect(parseRelayUrls('')).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('splits comma-separated URLs', () => {
    expect(parseRelayUrls('wss://a.com,wss://b.com')).toEqual(['wss://a.com', 'wss://b.com']);
  });

  it('trims whitespace from each URL', () => {
    expect(parseRelayUrls(' wss://a.com , wss://b.com ')).toEqual(['wss://a.com', 'wss://b.com']);
  });

  it('handles a single relay URL', () => {
    expect(parseRelayUrls('wss://only.relay')).toEqual(['wss://only.relay']);
  });
});

// ── NostrRelay ─────────────────────────────────────────────────────────────

describe('NostrRelay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connect()', () => {
    it('resolves when the relay accepts the connection', async () => {
      setupWebSocketMock({ connectBehavior: 'success' });
      const relay = new NostrRelay('wss://test.relay');
      await expect(relay.connect()).resolves.toBeUndefined();
    });

    it('rejects when the relay returns a connection error', async () => {
      setupWebSocketMock({ connectBehavior: 'error' });
      const relay = new NostrRelay('wss://test.relay');
      await expect(relay.connect()).rejects.toThrow();
    });

    it('rejects with "Connection timeout" after 10 seconds of no response', async () => {
      setupWebSocketMock({ connectBehavior: 'timeout' });
      vi.useFakeTimers();
      const relay = new NostrRelay('wss://test.relay');
      const promise = relay.connect();
      // Attach the rejection handler before advancing time so the rejection is never "unhandled"
      const assertion = expect(promise).rejects.toThrow('Connection timeout');
      await vi.advanceTimersByTimeAsync(10_001);
      await assertion;
    });
  });

  describe('publish()', () => {
    it('resolves with { success: true } when the relay sends OK true', async () => {
      setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
      const relay = new NostrRelay('wss://test.relay');
      await relay.connect();
      const result = await relay.publish(makeMinimalEvent());
      expect(result).toEqual({ success: true, message: 'accepted' });
    });

    it('rejects with the relay error reason when the relay sends OK false', async () => {
      setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'failure' });
      const relay = new NostrRelay('wss://test.relay');
      await relay.connect();
      await expect(relay.publish(makeMinimalEvent())).rejects.toThrow('blocked: rate-limited');
    });

    it('rejects immediately with "WebSocket not connected" before connect() is called', async () => {
      setupWebSocketMock({ connectBehavior: 'success' });
      const relay = new NostrRelay('wss://test.relay');
      await expect(relay.publish(makeMinimalEvent())).rejects.toThrow('WebSocket not connected');
    });

    it('rejects with "Publish timeout" after 5 seconds with no relay response', async () => {
      setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'timeout' });
      vi.useFakeTimers();
      const relay = new NostrRelay('wss://test.relay');
      const connectPromise = relay.connect();
      await vi.advanceTimersByTimeAsync(1); // fire mock's setTimeout(fn, 0)
      await connectPromise;
      const publishPromise = relay.publish(makeMinimalEvent());
      // Attach handler before advancing time to avoid unhandled rejection warning
      const assertion = expect(publishPromise).rejects.toThrow('Publish timeout');
      await vi.advanceTimersByTimeAsync(5_001);
      await assertion;
    });
  });

  describe('close()', () => {
    it('closes an open WebSocket without throwing', async () => {
      setupWebSocketMock({ connectBehavior: 'success' });
      const relay = new NostrRelay('wss://test.relay');
      await relay.connect();
      expect(() => relay.close()).not.toThrow();
    });

    it('is a no-op when called before connect()', () => {
      setupWebSocketMock();
      const relay = new NostrRelay('wss://test.relay');
      expect(() => relay.close()).not.toThrow();
    });
  });
});

// ── fetch handler ──────────────────────────────────────────────────────────

describe('fetch handler', () => {
  const req = (path) => new Request(`https://bot.example.com${path}`);

  it('GET / returns an endpoint listing', async () => {
    const res = await handler.fetch(req('/'), {}, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.endpoints).toBeDefined();
    expect(Object.keys(body.endpoints)).toEqual(['/test', '/status', '/ping']);
  });

  it('GET /status without a private key reports hasPrivateKey: false', async () => {
    const res = await handler.fetch(req('/status'), {}, {});
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.hasPrivateKey).toBe(false);
    expect(body.publicKey).toBe('Not set');
  });

  it('GET /status with a private key reports hasPrivateKey: true and a 64-char public key', async () => {
    const res = await handler.fetch(req('/status'), { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY }, {});
    const body = await res.json();
    expect(body.hasPrivateKey).toBe(true);
    expect(body.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('GET /status reflects custom relays from the environment', async () => {
    const res = await handler.fetch(req('/status'), { NOSTR_RELAYS: 'wss://r1.test,wss://r2.test' }, {});
    const body = await res.json();
    expect(body.relays).toEqual(['wss://r1.test', 'wss://r2.test']);
  });

  it('GET /ping returns { ping: "success" } when the relay connects', async () => {
    setupWebSocketMock({ connectBehavior: 'success' });
    const res = await handler.fetch(req('/ping'), {}, {});
    const body = await res.json();
    expect(body.ping).toBe('success');
  });

  it('GET /ping returns status 500 and { ping: "failed" } when the relay is unreachable', async () => {
    setupWebSocketMock({ connectBehavior: 'error' });
    const res = await handler.fetch(req('/ping'), {}, {});
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ping).toBe('failed');
    expect(body.error).toBeDefined();
  });

  it('GET /test triggers scheduled() and returns a signed event ID', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.fetch(req('/test'), { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY }, {});
    const body = await res.json();
    expect(body.eventId).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── scheduled handler ──────────────────────────────────────────────────────

describe('scheduled handler', () => {
  it('publishes to all configured relays on full success', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const env = { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY, NOSTR_RELAYS: 'wss://r1.test,wss://r2.test' };
    const res = await handler.scheduled({ scheduledTime: makeScheduledTime(9, 55, 3) }, env, {});
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.publishResults).toHaveLength(2);
    expect(body.publishResults.every(r => r.status === 'success')).toBe(true);
  });

  it('selects the correct message based on JST time', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.scheduled(
      { scheduledTime: makeScheduledTime(7, 55, 3) },
      { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY },
      {}
    );
    expect((await res.json()).content).toBe('Wake your ass up!');
  });

  it('posts the Monday special message on Monday at 06:55 JST', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.scheduled(
      { scheduledTime: makeScheduledTime(6, 55, 1) },
      { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY },
      {}
    );
    expect((await res.json()).content).toBe("Let's conquer Mondy, conquer this week.");
  });

  it('sets success: false and records errors when all relays fail', async () => {
    setupWebSocketMock({ connectBehavior: 'error' });
    const env = { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY, NOSTR_RELAYS: 'wss://r1.test,wss://r2.test' };
    const res = await handler.scheduled({ scheduledTime: makeScheduledTime(9, 55, 3) }, env, {});
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.publishResults).toHaveLength(2);
    expect(body.publishResults.every(r => r.status === 'failed')).toBe(true);
    expect(body.publishResults.every(r => typeof r.error === 'string')).toBe(true);
  });

  it('continues to remaining relays when one fails mid-loop', async () => {
    // First relay fails (connect error), second succeeds.
    // We achieve this by toggling behavior on the second WS instance.
    let instanceCount = 0;
    const OrigSuccess = createMockWebSocketClass({ connectBehavior: 'success', publishBehavior: 'success' });
    const OrigFail    = createMockWebSocketClass({ connectBehavior: 'error' });

    global.WebSocket = class ToggleMock {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        instanceCount++;
        const Impl = instanceCount === 1 ? OrigFail : OrigSuccess;
        return new Impl(url);
      }
    };

    const env = { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY, NOSTR_RELAYS: 'wss://r1.test,wss://r2.test' };
    const res = await handler.scheduled({ scheduledTime: makeScheduledTime(9, 55, 3) }, env, {});
    const body = await res.json();
    expect(body.publishResults[0].status).toBe('failed');
    expect(body.publishResults[1].status).toBe('success');
    expect(body.success).toBe(true); // at least one succeeded
  });

  it('generates a key and still publishes when NOSTR_PRIVATE_KEY is not set', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.scheduled({ scheduledTime: makeScheduledTime(9, 55, 3) }, {}, {});
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.eventId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses the two default relays when NOSTR_RELAYS is not set', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.scheduled(
      { scheduledTime: makeScheduledTime(9, 55, 3) },
      { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY },
      {}
    );
    expect((await res.json()).publishResults).toHaveLength(2);
  });

  it('response includes a 64-char hex eventId and an ISO timestamp', async () => {
    setupWebSocketMock({ connectBehavior: 'success', publishBehavior: 'success' });
    const res = await handler.scheduled(
      { scheduledTime: makeScheduledTime(9, 55, 3) },
      { NOSTR_PRIVATE_KEY: TEST_PRIVATE_KEY },
      {}
    );
    const body = await res.json();
    expect(body.eventId).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
