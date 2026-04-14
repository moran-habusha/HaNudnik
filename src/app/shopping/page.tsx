'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type ShoppingItem = {
  id: string
  name: string
  quantity: number
  is_bought: boolean
  product_id: string | null
  products: { image_url: string | null; note: string | null } | null
}

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [boughtItems, setBoughtItems] = useState<ShoppingItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [apartmentId, setApartmentId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [imageResults, setImageResults] = useState<string[]>([])
  const [searchingImages, setSearchingImages] = useState(false)
  const [confirmNoImage, setConfirmNoImage] = useState(false)
  const [imageQuery, setImageQuery] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [showBought, setShowBought] = useState(false)
  const [newItemQty, setNewItemQty] = useState(1)
  const [reAddItem_, setReAddItem] = useState<ShoppingItem | null>(null)
  const [reAddQty, setReAddQty] = useState(1)
  const [buyingItem, setBuyingItem] = useState<ShoppingItem | null>(null)
  const [boughtQty, setBoughtQty] = useState(1)
  const [showShortage, setShowShortage] = useState(false)
  const [editingActive, setEditingActive] = useState<ShoppingItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editActiveQty, setEditActiveQty] = useState(1)
  const [deletingItem, setDeletingItem] = useState<ShoppingItem | null>(null)
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null)
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const [pendingNote, setPendingNote] = useState('')
  const [editNote, setEditNote] = useState('')
  const [reAddNote, setReAddNote] = useState('')
  const [fullscreenNote, setFullscreenNote] = useState<string | null>(null)
  const [deletingBoughtItem, setDeletingBoughtItem] = useState<ShoppingItem | null>(null)
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; image_url: string | null; note: string | null }[]>([])
  const router = useRouter()
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('apartment_id')
        .eq('id', user.id)
        .single()

      if (!profile?.apartment_id) { router.push('/setup'); return }
      setApartmentId(profile.apartment_id)
      subscribeRealtime(profile.apartment_id)
      fetchItems(profile.apartment_id).then(() => setPageLoading(false))
      fetchAllProducts(profile.apartment_id)
    }
    load()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function fetchAllProducts(aptId: string) {
    const { data } = await supabase.from('products').select('id, name, image_url, note').eq('apartment_id', aptId).order('name')
    setAllProducts(data ?? [])
  }

  async function fetchItems(aptId: string) {
    const { data: active } = await supabase
      .from('shopping_items')
      .select('id, name, quantity, is_bought, product_id, products(image_url, note)')
      .eq('apartment_id', aptId)
      .eq('is_bought', false)
      .order('created_at', { ascending: true })
    setItems((active ?? []) as ShoppingItem[])

    const activeProductIds = new Set((active ?? []).map(i => i.product_id).filter(Boolean))

    const { data: bought } = await supabase
      .from('shopping_items')
      .select('id, name, quantity, is_bought, product_id, products(image_url, note)')
      .eq('apartment_id', aptId)
      .eq('is_bought', true)
      .order('bought_at', { ascending: false })
      .limit(30)

    // הצג רק מוצר אחד לכל product_id, ולא אם כבר ברשימה הפעילה
    const seen = new Set<string>()
    const filtered = (bought ?? []).filter(item => {
      const key = item.product_id ?? item.name
      if (seen.has(key) || activeProductIds.has(item.product_id)) return false
      seen.add(key)
      return true
    })
    setBoughtItems(filtered as ShoppingItem[])
  }

  function subscribeRealtime(aptId: string) {
    channelRef.current = supabase
      .channel('shopping-' + aptId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shopping_items',
        filter: 'apartment_id=eq.' + aptId,
      }, () => fetchItems(aptId))
      .subscribe()
  }

  async function addItem() {
    if (!newItem.trim() || !apartmentId || !userId) return

    const name = newItem.trim()
    const boughtMatch = boughtItems.find(i => i.name.toLowerCase() === name.toLowerCase())
    if (boughtMatch) {
      setReAddItem(boughtMatch)
      setReAddQty(1)
      setNewItem('')
      return
    }

    setLoading(true)

    const { data: existing } = await supabase
      .from('products')
      .select('id, name, image_url, note')
      .eq('apartment_id', apartmentId)
      .ilike('name', newItem.trim())
      .single()

    if (existing) {
      // מוצר מוכר — פתח מודל עם התמונה הקיימת מסומנת + אפשרות לשנות
      setPendingName(existing.name)
      setPendingNote(existing.note ?? '')
      setImageQuery(existing.name)
      setSelectedImage(existing.image_url ?? null)
      setNewItem('')
      setConfirmNoImage(false)
      searchImages(existing.name) // טען תוצאות ברקע למקרה שרוצים להחליף
    } else {
      // מוצר חדש — פתח חיפוש תמונה לפני שמירה
      setPendingName(newItem.trim())
      setPendingNote('')
      setImageQuery(newItem.trim())
      setNewItem('')
      setConfirmNoImage(false)
      searchImages(newItem.trim())
    }
    setLoading(false)
  }

  async function searchImages(query: string) {
    setSearchingImages(true)
    setImageResults([])
    try {
      const res = await fetch(`/api/image-search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.error) console.error('Image search error:', data.error, data.details)
      setImageResults(data.images ?? [])
    } catch (e) {
      console.error('Image search fetch error:', e)
      setImageResults([])
    }
    setSearchingImages(false)
  }

  async function saveProductAndItem(imageUrl: string | null) {
    if (!pendingName || !apartmentId || !userId) return

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({ apartment_id: apartmentId, name: pendingName, added_by: userId, image_url: imageUrl, note: pendingNote || null })
      .select()
      .single()

    let finalProduct = product
    if (!finalProduct) {
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('apartment_id', apartmentId)
        .ilike('name', pendingName)
        .single()
      if (existing) {
        await supabase.from('products').update({ image_url: imageUrl, note: pendingNote || null }).eq('id', existing.id)
      }
      finalProduct = existing
    }

    const { error: itemError } = await supabase.from('shopping_items').insert({
      apartment_id: apartmentId,
      name: pendingName,
      quantity: newItemQty,
      added_by: userId,
      product_id: finalProduct?.id ?? null,
    })
    if (itemError) console.error('shopping_item insert error:', itemError)
    setNewItemQty(1)
    setPendingNote('')
    setPendingName(null)
    setImageResults([])
    setConfirmNoImage(false)
    if (apartmentId) { fetchItems(apartmentId); fetchAllProducts(apartmentId) }
  }

  function withFade(id: string, action: () => Promise<void>) {
    setFadingOut(s => new Set(s).add(id))
    setTimeout(async () => {
      await action()
      setFadingOut(s => { const n = new Set(s); n.delete(id); return n })
    }, 300)
  }

  function openBuy(item: ShoppingItem) {
    setBuyingItem(item)
    setBoughtQty(item.quantity)
  }

  async function confirmBuy(item: ShoppingItem, qty: number) {
    setBuyingItem(null)
    setShowShortage(false)
    if (qty >= item.quantity) {
      withFade(item.id, async () => {
        await supabase
          .from('shopping_items')
          .update({ is_bought: true, bought_by: userId, bought_at: new Date().toISOString() })
          .eq('id', item.id)
        if (apartmentId) fetchItems(apartmentId)
      })
    } else {
      await supabase
        .from('shopping_items')
        .update({ quantity: item.quantity - qty })
        .eq('id', item.id)
      if (apartmentId) fetchItems(apartmentId)
    }
  }

  function openReAdd(item: ShoppingItem) {
    setReAddItem(item)
    setReAddQty(1)
    setReAddNote(item.products?.note ?? '')
  }

  async function confirmReAdd() {
    if (!reAddItem_ || !apartmentId || !userId) return
    if (reAddItem_.product_id) {
      await supabase.from('products').update({ note: reAddNote || null }).eq('id', reAddItem_.product_id)
    }
    await supabase.from('shopping_items').insert({
      apartment_id: apartmentId,
      name: reAddItem_.name,
      quantity: reAddQty,
      added_by: userId,
      product_id: reAddItem_.product_id,
    })
    setReAddItem(null)
    if (apartmentId) fetchItems(apartmentId)
  }

  function openEditActive(item: ShoppingItem) {
    setEditingActive(item)
    setEditName(item.name)
    setEditActiveQty(item.quantity)
    setEditNote(item.products?.note ?? '')
    setImageQuery(item.name)
    setImageResults([])
    setSelectedImage(null)
  }

  async function saveEditActive(imageUrl?: string) {
    if (!editingActive) return
    const updates: Record<string, unknown> = {}
    if (editName.trim() && editName.trim() !== editingActive.name) updates.name = editName.trim()
    if (editActiveQty !== editingActive.quantity) updates.quantity = editActiveQty
    if (editingActive.product_id) {
      const productUpdates: Record<string, unknown> = { note: editNote || null }
      if (imageUrl) productUpdates.image_url = imageUrl
      if (editName.trim()) productUpdates.name = editName.trim()
      await supabase.from('products').update(productUpdates).eq('id', editingActive.product_id)
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('shopping_items').update(updates).eq('id', editingActive.id)
    }
    setEditingActive(null)
    setImageResults([])
    if (apartmentId) fetchItems(apartmentId)
  }

  async function deleteMarkBought(item: ShoppingItem) {
    setDeletingItem(null)
    withFade(item.id, async () => {
      await supabase
        .from('shopping_items')
        .update({ is_bought: true, bought_by: userId, bought_at: new Date().toISOString() })
        .eq('id', item.id)
      if (apartmentId) fetchItems(apartmentId)
    })
  }

  async function deletePermanent(item: ShoppingItem) {
    setDeletingItem(null)
    withFade(item.id, async () => {
      // delete all shopping_items entries for this product (active + history) so it won't reappear in נקנה
      // keep the product in the products table so it still appears in autocomplete
      if (item.product_id) {
        await supabase.from('shopping_items').delete().eq('apartment_id', apartmentId!).eq('product_id', item.product_id)
      } else {
        await supabase.from('shopping_items').delete().eq('id', item.id)
      }
      if (apartmentId) { fetchItems(apartmentId); fetchAllProducts(apartmentId) }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
        <h1 className="font-bold text-gray-900">🛒 רשימת קניות</h1>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Add item */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="הוסף מוצר..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={addItem}
              disabled={loading || !newItem.trim()}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >{loading ? '...' : 'הוסף'}</button>
          </div>
          {/* Autocomplete from all products */}
          {newItem.trim().length > 0 && (() => {
            const q = newItem.trim().toLowerCase()
            const activeNames = new Set(items.map(i => i.name.toLowerCase()))
            const suggestions = allProducts.filter(p =>
              p.name.toLowerCase().includes(q) && !activeNames.has(p.name.toLowerCase())
            ).slice(0, 5)
            if (suggestions.length === 0) return null
            return (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {suggestions.map(p => {
                  const boughtMatch = boughtItems.find(i => i.product_id === p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (boughtMatch) { openReAdd(boughtMatch); setNewItem('') }
                        else {
                          setPendingName(p.name)
                          setPendingNote(p.note ?? '')
                          setSelectedImage(p.image_url ?? null)
                          setImageQuery(p.name)
                          setConfirmNoImage(false)
                          setNewItem('')
                          searchImages(p.name)
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-right"
                    >
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                        : <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">🛒</div>
                      }
                      <span className="text-sm text-gray-700">{p.name}</span>
                      {p.note && <span className="text-xs text-gray-400 truncate max-w-[120px]">{p.note}</span>}
                      {boughtMatch && <span className="text-xs text-gray-400 mr-auto">מנקנה</span>}
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* Active items */}
        <div className="space-y-2">
          {items.length === 0 && !pageLoading && (
            <div className="text-center text-gray-400 text-sm py-8">הרשימה ריקה</div>
          )}
          {items.map(item => (
            <div key={item.id} className={`bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 transition-opacity duration-300 ${fadingOut.has(item.id) ? 'opacity-0' : 'opacity-100'}`}>
              {item.products?.image_url ? (
                <button onClick={() => { setFullscreenImage(item.products!.image_url); setFullscreenNote(item.products?.note ?? null) }} className="flex-shrink-0">
                  <img src={item.products.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                </button>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🛒</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400">× {item.quantity}</p>
                {item.products?.note && <p className="text-xs text-gray-400 truncate">{item.products.note}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditActive(item)} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded">✏️</button>
                <button onClick={() => openBuy(item)} className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded font-medium">✓ קניתי</button>
                <button onClick={() => setDeletingItem(item)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Bought items */}
        {boughtItems.length > 0 && (
          <div>
            <button
              onClick={() => setShowBought(v => !v)}
              className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-1"
            >
              {showBought ? '▾' : '▸'} נקנה ({boughtItems.length})
            </button>
            {showBought && (
              <div className="space-y-2 mt-2">
                {boughtItems.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 opacity-60">
                    {item.products?.image_url ? (
                      <button onClick={() => { setFullscreenImage(item.products!.image_url); setFullscreenNote(item.products?.note ?? null) }} className="flex-shrink-0">
                        <img src={item.products.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                      </button>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🛒</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500 line-through truncate">{item.name}</p>
                      {item.products?.note && <p className="text-xs text-gray-400 truncate mt-0.5">{item.products.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEditActive(item)} className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded">✏️</button>
                      <button onClick={() => openReAdd(item)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded font-medium">+ הוסף שוב</button>
                      <button onClick={() => setDeletingBoughtItem(item)} className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1 rounded">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* New product image modal */}
      {pendingName && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">בחר תמונה ל{pendingName}</h2>
              <button onClick={() => { setPendingName(null); setImageResults([]); setSelectedImage(null) }} className="text-gray-400">✕</button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-500">כמות:</span>
              <button onClick={() => setNewItemQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50">−</button>
              <span className="text-lg font-bold w-6 text-center">{newItemQty}</span>
              <button onClick={() => setNewItemQty(q => q + 1)} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50">+</button>
            </div>
            <textarea
              value={pendingNote}
              onChange={e => setPendingNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none mb-3"
              placeholder="הערה (אופציונלי) - למשל: ביוחננוף, מותג X..."
            />
            <div className="flex gap-2 mb-3">
              <input
                value={imageQuery}
                onChange={e => setImageQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchImages(imageQuery)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="חפש תמונה..."
              />
              <button
                onClick={() => searchImages(imageQuery)}
                disabled={searchingImages}
                className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
              >חפש</button>
            </div>
            {searchingImages && <div className="text-center text-gray-400 text-sm py-4">מחפש תמונות...</div>}
            {!searchingImages && imageResults.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">לא נמצאו תמונות</div>
            )}
            {selectedImage ? (
              <div className="flex flex-col items-center gap-4">
                <img src={selectedImage} alt="" className="w-full rounded-xl object-cover max-h-64" />
                <div className="flex gap-2 w-full">
                  <button onClick={() => setSelectedImage(null)} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm">חזרה לחיפוש</button>
                  <button onClick={() => { saveProductAndItem(selectedImage); setSelectedImage(null) }} className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold">אשר ✓</button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {imageResults.map((url, i) => (
                    <button key={i} onClick={() => setSelectedImage(url)} className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-gray-900 bg-gray-50">
                      <img src={url} alt="" className="w-full h-full object-contain" />
                    </button>
                  ))}
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3">
                  {!confirmNoImage ? (
                    <button onClick={() => setConfirmNoImage(true)} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2">שמור ללא תמונה</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmNoImage(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">ביטול</button>
                      <button onClick={() => saveProductAndItem(null)} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium">אשר - שמור ללא תמונה</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Partial buy modal */}
      {buyingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex justify-end mb-2">
              <button onClick={() => { setBuyingItem(null); setShowShortage(false) }} className="text-gray-400">✕</button>
            </div>
            <div className="flex flex-col items-center gap-1 py-4">
              {buyingItem.products?.image_url && (
                <img src={buyingItem.products?.image_url} alt={buyingItem.name} className="w-20 h-20 rounded-xl object-cover mb-2" />
              )}
              <p className="text-2xl font-bold text-gray-900">{buyingItem.name}</p>
              <p className="text-xl text-gray-500">× {buyingItem.quantity}</p>
            </div>
            <button
              onClick={() => { confirmBuy(buyingItem, buyingItem.quantity); setShowShortage(false) }}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold mb-3"
            >קניתי ✓</button>
            {!showShortage ? (
              buyingItem.quantity > 1 && (
              <button
                onClick={() => { setShowShortage(true); setBoughtQty(Math.max(1, buyingItem.quantity - 1)) }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
              >יש חוסרים?</button>
              )
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-sm text-gray-500 mb-3 text-center">כמה קנית בפועל?</p>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <button onClick={() => setBoughtQty(q => Math.max(0, q - 1))} className="w-10 h-10 rounded-full border border-gray-200 text-xl flex items-center justify-center hover:bg-gray-50">−</button>
                  <span className="text-2xl font-bold w-10 text-center">{boughtQty}</span>
                  <button onClick={() => setBoughtQty(q => Math.min(buyingItem.quantity - 1, q + 1))} className="w-10 h-10 rounded-full border border-gray-200 text-xl flex items-center justify-center hover:bg-gray-50">+</button>
                </div>
                <p className="text-xs text-gray-400 text-center mb-3">
                  {buyingItem.quantity - boughtQty > 0
                    ? `${buyingItem.name} × ${buyingItem.quantity - boughtQty} יחזור לרשימה`
                    : 'הכל נקנה'}
                </p>
                <button
                  onClick={() => { confirmBuy(buyingItem, boughtQty); setShowShortage(false) }}
                  className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold"
                >אשר חוסר</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Re-add with quantity modal */}
      {reAddItem_ && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">הוסף שוב - {reAddItem_.name}</h2>
              <button onClick={() => setReAddItem(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">כמה צריך לקנות?</p>
            <div className="flex items-center justify-center gap-4 mb-3">
              <button onClick={() => setReAddQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-full border border-gray-200 text-xl flex items-center justify-center hover:bg-gray-50">−</button>
              <span className="text-2xl font-bold w-10 text-center">{reAddQty}</span>
              <button onClick={() => setReAddQty(q => q + 1)} className="w-10 h-10 rounded-full border border-gray-200 text-xl flex items-center justify-center hover:bg-gray-50">+</button>
            </div>
            <textarea
              value={reAddNote}
              onChange={e => setReAddNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none mb-3"
              placeholder="הערה (אופציונלי)"
            />
            <div className="flex gap-2">
              <button onClick={() => setReAddItem(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={confirmReAdd} className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium">הוסף לרשימה</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete warning modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">מה לעשות עם "{deletingItem.name}"?</h2>
              <button onClick={() => setDeletingItem(null)} className="text-gray-400">✕</button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => deleteMarkBought(deletingItem)}
                className="w-full bg-gray-100 text-gray-800 rounded-xl py-3 text-sm font-medium hover:bg-gray-200"
              >סמן כלא צריך</button>
              <button
                onClick={() => deletePermanent(deletingItem)}
                className="w-full bg-red-50 text-red-600 rounded-xl py-3 text-sm font-medium hover:bg-red-100"
              >מחק לצמיתות</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit active item modal */}
      {editingActive && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]" dir="rtl">
            {/* Fixed top */}
            <div className="p-4 pb-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">עריכת מוצר</h2>
                <button onClick={() => { setEditingActive(null); setImageResults([]); setSelectedImage(null) }} className="text-gray-400">✕</button>
              </div>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="שם המוצר"
              />
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">כמות:</span>
                <button onClick={() => setEditActiveQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50">−</button>
                <span className="text-lg font-bold w-6 text-center">{editActiveQty}</span>
                <button onClick={() => setEditActiveQty(q => q + 1)} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50">+</button>
              </div>
              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                placeholder="הערה (אופציונלי)"
              />
              <div className="flex gap-2">
                <input
                  value={imageQuery}
                  onChange={e => setImageQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchImages(imageQuery)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="חפש תמונה..."
                />
                <button
                  onClick={() => searchImages(imageQuery)}
                  disabled={searchingImages}
                  className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
                >{imageResults.length === 0 && !searchingImages ? '🖼 חפש' : 'חפש'}</button>
              </div>
            </div>

            {/* Scrollable image area */}
            <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
              {searchingImages && <div className="text-center text-gray-400 text-sm py-4">מחפש תמונות...</div>}
              {!searchingImages && imageResults.length === 0 && imageQuery && (
                <div className="text-center text-gray-400 text-sm py-4">לא נמצאו תמונות</div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {imageResults.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(selectedImage === url ? null : url)}
                    className={`aspect-square rounded-lg overflow-hidden bg-gray-50 relative ${selectedImage === url ? 'ring-2 ring-gray-900' : 'hover:ring-2 hover:ring-gray-300'}`}
                  >
                    <img src={url} alt="" className="w-full h-full object-contain" />
                    {selectedImage === url && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px]">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Fixed bottom */}
            <div className="p-4 pt-2 flex gap-2">
              <button onClick={() => { setEditingActive(null); setImageResults([]); setSelectedImage(null) }} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={() => { saveEditActive(selectedImage ?? undefined); setSelectedImage(null) }} className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium">שמור שינויים</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete bought item confirm */}
      {deletingBoughtItem && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">למחוק "{deletingBoughtItem.name}" לצמיתות?</h2>
              <button onClick={() => setDeletingBoughtItem(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">המוצר יימחק מהרשימה ומההיסטוריה לצמיתות.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingBoughtItem(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={() => { const item = deletingBoughtItem; setDeletingBoughtItem(null); deletePermanent(item) }}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium"
              >מחק לצמיתות</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen image */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-4"
          onClick={() => { setFullscreenImage(null); setFullscreenNote(null) }}
        >
          <button
            className="absolute top-4 left-4 text-white text-2xl w-10 h-10 flex items-center justify-center"
            onClick={() => { setFullscreenImage(null); setFullscreenNote(null) }}
          >✕</button>
          <img
            src={fullscreenImage}
            alt=""
            className="max-w-full max-h-[75vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          {fullscreenNote && (
            <p
              className="mt-4 text-white text-sm text-center max-w-sm bg-black/40 rounded-xl px-4 py-2"
              onClick={e => e.stopPropagation()}
            >{fullscreenNote}</p>
          )}
        </div>
      )}

    </div>
  )
}
