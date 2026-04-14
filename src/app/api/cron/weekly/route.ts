import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// runs daily — checks each apartment's summary_day and sends weekly summary if today matches
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // day of week: 0=Sun, 1=Mon ... 6=Sat  (matches JS getDay)
  const todayDay = new Date().getDay()

  const { data: apartments, error } = await supabase
    .from('apartments')
    .select('id, summary_day')
    .eq('summary_day', todayDay)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const apt of apartments ?? []) {
    // send weekly summary now
    await supabase.rpc('send_weekly_summary', { p_apartment_id: apt.id })

    // schedule veto reminder in 12 hours
    const remindAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'veto_reminder',
      scheduled_for: remindAt,
    })
  }

  return NextResponse.json({ ok: true, sent: apartments?.length ?? 0 })
}
