import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// runs every 15 minutes — processes all pending scheduled_messages
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('process_scheduled_messages')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ processed: data })
}
