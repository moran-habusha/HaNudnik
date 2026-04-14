import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ images: [] })

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    return NextResponse.json({ images: [], error: 'Missing SERPAPI_KEY' })
  }

  try {
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(q)}&api_key=${apiKey}&num=9&hl=he`
    const res = await fetch(url)
    const text = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text)
    } catch {
      return NextResponse.json({ images: [], error: 'SerpAPI returned non-JSON: ' + text.slice(0, 100) })
    }
    if (data.error) {
      return NextResponse.json({ images: [], error: data.error })
    }
    const images = ((data.images_results as { original: string }[]) ?? []).slice(0, 9).map(item => item.original)
    return NextResponse.json({ images })
  } catch (e) {
    return NextResponse.json({ images: [], error: String(e) })
  }
}
