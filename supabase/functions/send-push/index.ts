import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails(
  'mailto:moran235habusha@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    if (!record?.user_id) {
      return new Response('no user_id', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', record.user_id)

    console.log('user_id:', record.user_id, 'subs found:', subs?.length ?? 0)

    if (!subs?.length) {
      return new Response('no subscriptions', { status: 200 })
    }

    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }

      const isIos = sub.platform === 'ios'
      const body = (isIos ? record.ios_message : null) || record.message || 'הנודניק שלח לך הודעה'

      const buttons = record.buttons
        ? (typeof record.buttons === 'string' ? JSON.parse(record.buttons) : record.buttons) as Array<{ label: string }>
        : []

      const notifPayload = JSON.stringify({
        title: 'HaNudnik 🏠',
        body,
        badge: 'https://hanudnik.vercel.app/icon-badge.png',
        tag: record.triggered_by || 'hanudnik',
        data: { url: '/bot' },
        ...(!isIos && buttons.length > 0 ? {
          actions: buttons.slice(0, 2).map((b) => ({ action: 'open', title: b.label }))
        } : {})
      })

      try {
        await webpush.sendNotification(pushSub, notifPayload)
        console.log('push sent to', sub.endpoint.slice(0, 50))
      } catch (e: unknown) {
        console.error('push error:', e)
        const err = e as { statusCode?: number }
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
