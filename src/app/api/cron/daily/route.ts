import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// runs at midnight — schedules morning nudges, 14:00, 17:00, and inactivity checks for all apartments
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // get all active apartments
  const { data: apartments, error } = await supabase
    .from('apartments')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // schedule morning nudges once for all residents across all apartments
  await supabase.rpc('schedule_morning_nudges_for_all')

  for (const apt of apartments ?? []) {
    // 07:00 — overnight missed task check (before morning nudge)
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'overnight_check',
      scheduled_for: new Date(new Date().setHours(7, 0, 0, 0)).toISOString(),
    })

    // 14:00 reminder
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'daily_14',
      scheduled_for: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
    })

    // 17:00 reminder
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'daily_17',
      scheduled_for: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(),
    })

    // 09:00 — inactivity check
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'inactivity',
      scheduled_for: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
    })

    // 19:00 — laundry reminder (function checks if tomorrow is laundry day)
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'laundry_19',
      scheduled_for: new Date(new Date().setHours(19, 0, 0, 0)).toISOString(),
    })

    // 22:00 — nightly reminder
    await supabase.from('scheduled_messages').insert({
      apartment_id: apt.id,
      user_id: null,
      type: 'nightly_22',
      scheduled_for: new Date(new Date().setHours(22, 0, 0, 0)).toISOString(),
    })
  }

  // auto-return users whose away_return_date is today or past
  await supabase.rpc('auto_return_from_away')

  // auto-activate future aways whose start_date is today
  await supabase.rpc('auto_activate_future_away')

  // auto-switch to solo after 72h grace if no new resident joined
  await supabase.rpc('check_solo_grace_expiry')

  // check rent renewal reminders (1 and 2 months before)
  await supabase.rpc('check_rent_renewal_reminders')

  // bill reminders (every 3 days missing / every 2 days unpaid)
  await supabase.rpc('send_bill_due_reminders')

  // rent payment reminders (daily from payment_day until paid)
  await supabase.rpc('send_rent_payment_reminders')

  // calendar event reminders
  await supabase.rpc('send_calendar_reminders')

  return NextResponse.json({ ok: true, apartments: apartments?.length ?? 0 })
}
