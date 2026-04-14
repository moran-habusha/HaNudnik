import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// runs on 1st of each month — sends monthly summary to all apartments
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date()
  if (today.getDate() !== 1) {
    return NextResponse.json({ skipped: 'not 1st of month' })
  }

  const supabase = createServiceClient()

  const { data: apartments, error } = await supabase
    .from('apartments')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const apt of apartments ?? []) {
    await supabase.rpc('send_monthly_summary', { p_apartment_id: apt.id })
  }

  return NextResponse.json({ ok: true, sent: apartments?.length ?? 0 })
}
