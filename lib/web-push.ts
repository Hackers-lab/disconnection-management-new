import webpush from 'web-push'
import { createClient, type Client } from '@libsql/client'

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BLhrpLQ5VV3pPOXpzRjH0vKf8iisSztaRu5duHcpk86mPYNGjWksIgwygr7Oba5vUNSf3T9XW0gZWme1SVBKvlw'
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'fQvjluiiQuZj9XEQu79KJPQ9BIP4-kmCXr3DtDLvc78'
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:je.kushidaccc@gmail.com'

try {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
} catch (e) {
  console.warn('[web-push] Initialization warning:', e)
}

let tursoClient: Client | null = null
let pushTableReady = false

function getTursoClient(): Client | null {
  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    process.env.LIBSQL_URL ||
    process.env.STORAGE_DATABASE_URL
  const authToken =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    process.env.STORAGE_AUTH_TOKEN
  if (!url) return null
  if (!tursoClient) {
    tursoClient = createClient({ url, authToken })
  }
  return tursoClient
}

export async function ensurePushTable(): Promise<Client | null> {
  const client = getTursoClient()
  if (!client) return null
  if (pushTableReady) return client

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        ccc_code TEXT,
        role TEXT,
        endpoint TEXT UNIQUE,
        p256dh TEXT,
        auth TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `)
    pushTableReady = true
  } catch (err) {
    console.warn('[web-push] Error creating push_subscriptions table:', err)
  }
  return client
}

export interface PushSubscriptionPayload {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface PushUserInfo {
  userId: string
  username: string
  cccCode: string
  role: string
}

export async function savePushSubscription(sub: PushSubscriptionPayload, user: PushUserInfo) {
  const client = await ensurePushTable()
  if (!client) return { success: false, error: 'DB not available' }

  try {
    const id = `sub_${user.userId}_${Buffer.from(sub.endpoint.slice(-16)).toString('hex')}`
    const now = Date.now()

    await client.execute({
      sql: `
        INSERT INTO push_subscriptions (id, user_id, username, ccc_code, role, endpoint, p256dh, auth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id,
          username = excluded.username,
          ccc_code = excluded.ccc_code,
          role = excluded.role,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          updated_at = excluded.updated_at;
      `,
      args: [id, user.userId, user.username, user.cccCode, user.role, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now, now],
    })

    return { success: true }
  } catch (err: any) {
    console.error('[web-push] Failed to save subscription:', err)
    return { success: false, error: err?.message }
  }
}

export interface SendPushNotificationOptions {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
  targetCcc?: string
  targetUserId?: string
  targetRole?: string
  senderName?: string
}

export async function sendPushNotification(opts: SendPushNotificationOptions) {
  const client = await ensurePushTable()
  if (!client) return { success: false, sentCount: 0, error: 'Database unavailable' }

  try {
    let sql = 'SELECT * FROM push_subscriptions WHERE 1=1'
    const args: any[] = []

    if (opts.targetUserId) {
      sql += ' AND user_id = ?'
      args.push(opts.targetUserId)
    } else {
      if (opts.targetCcc && opts.targetCcc !== 'all') {
        sql += ' AND ccc_code = ?'
        args.push(opts.targetCcc)
      }
      if (opts.targetRole && opts.targetRole !== 'all') {
        sql += ' AND role = ?'
        args.push(opts.targetRole)
      }
    }

    const result = await client.execute({ sql, args })
    const subscriptions = result.rows as any[]

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sentCount: 0, message: 'No matching subscribers found' }
    }

    const payload = JSON.stringify({
      title: opts.title,
      body: opts.body,
      icon: opts.icon || '/icon-192.png',
      badge: opts.badge || '/icon-192.png',
      url: opts.url || '/dashboard',
      tag: opts.tag || 'broadcast-alert',
      timestamp: Date.now(),
      sender: opts.senderName || 'Admin Alert'
    })

    let sentCount = 0
    let expiredCount = 0

    const sendPromises = subscriptions.map(async (row) => {
      const pushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: 'high'
        })
        sentCount++
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredCount++
          await client.execute({
            sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
            args: [row.endpoint]
          }).catch(() => {})
        }
      }
    })

    await Promise.allSettled(sendPromises)

    return {
      success: true,
      sentCount,
      expiredRemoved: expiredCount,
      totalSubscribers: subscriptions.length
    }
  } catch (err: any) {
    console.error('[web-push] Broadcast error:', err)
    return { success: false, sentCount: 0, error: err?.message }
  }
}
