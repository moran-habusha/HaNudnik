# HaNudnik — Product Specification

## Overview

A Progressive Web App (PWA) for managing a shared apartment. It helps roommates coordinate cleaning, bills, shopping, and schedules through a smart bot called **HaNudnik** — the digital roommate that nags you into action.

**Stack:** Next.js + React, Supabase (DB, Auth, Realtime, Storage), Vercel hosting, Web Push API, SerpAPI (Google Images search)
**Cost:** Fully free to build and use (SerpAPI free tier: 100 searches/month)

---

## Users & Apartments

### Registration
- User registers with display name + email + password (no phone field — not used)
- After registration: create a new apartment or join an existing one via invite link

### Invite System
- Any resident can generate an invite from "שינויים בדירה" → "הזמן דייר חדש"
- Modal shows current resident count (e.g. "2 דיירים מתוך 5, אפשר להזמין עוד 3")
- If apartment is full (5 residents) → error message only, no invite generated
- Generates a UUID in the `invites` table (apartment_id + created_by)
- Shows a pre-written Hebrew message ready to paste into WhatsApp:
  > היי! 🏠 הוזמנת להצטרף לדירה של [שם] באפליקציה HaNudnik. להצטרפות, פתח את האפליקציה ובחר "הצטרפות לדירה קיימת". קוד ההזמנה שלך: [UUID] (הקוד תקף ל-72 שעות)
- Copy button turns green with "הועתק! ✓" for 2.5 seconds after clicking
- Link expires after **72 hours**
- Max **5 residents** per apartment

### Roles & Permissions
- All residents are **equal** — no admin role
- **Removing a resident** requires approval from ALL other residents
- **Resident leaving** notifies all others; all must confirm before the change takes effect

### Apartment Types
- **Solo mode** (1 resident): HaNudnik speaks directly ("when will you do this?") — no "who's doing it" logic
- **Shared mode** (2–5 residents): full multi-resident logic

**Switching between modes:**
- Solo → Shared: triggered automatically when someone joins via invite. `apartments.mode` flips to `shared`. Bot sends transition message to original resident + onboarding to new resident.
- Shared → Solo: triggered when only 1 resident remains. Bot asks "will you invite someone?" → 72h grace window. If no one joins → auto-switch to solo. If resident picks "solo now" → immediate switch. Either way: bot sends transition message to remaining resident.
- Solo → Shared → Solo transitions are fully supported.
- `apartments.grace_until timestamptz` — set when last resident is asked; cleared on confirm or when new resident joins.

**Onboarding flow:**
1. New apartment created → always starts as `solo` → bot sends `ask_apartment_type` ("לבד או שותפים?")
2. User picks "לבד" → `send_onboarding_message_solo` (no gamification; includes note that joining residents will trigger a full explanation)
3. User picks "שותפים" → `send_onboarding_message` (full multi onboarding; apartment stays `solo` until someone joins)
4. Resident joins any apartment:
   - Was `solo` → `notify_solo_to_shared`: original gets **Solo→Shared transition** msg, new resident gets **multi onboarding**
   - Was `shared` → new resident gets **multi onboarding**, others get `notify_resident_joined`
5. Resident left and only 1 remains → `ask_going_solo` (72h grace) → on expiry or "going solo" button → `send_transition_shared_to_solo`

**4 bot message templates:**
| Template | Trigger | Recipient |
|---|---|---|
| `send_onboarding_message_solo` | new apt + picked "solo" | opener |
| `send_onboarding_message` | new apt + picked "multi" / joined existing | opener / new joiner |
| `send_transition_solo_to_shared` | someone joined a solo apt | original resident only |
| `send_transition_shared_to_solo` | last resident confirmed solo (immediate or grace expiry) | remaining resident |

### Inactivity & Deletion
- Apartment deleted after **3 months of no activity**
- Reminder timeline before deletion: 1 week inactive, 2 weeks, 1 month, 2 months, a few days before deletion
- Away periods (see Away Mode) do **not** count toward the inactivity timer
- Entire apartment away simultaneously → counts as a **pause**, not inactivity

---

## Away Mode

- Any resident can mark themselves as **away** with a return date (immediate or future start date)
- **Future away**: resident can schedule a trip in advance — `profiles.away_start_date` stores the planned departure. Auto-activates at midnight via `auto_activate_future_away()` cron.
- **Dashboard pill** shows 3 states: 🏠 בבית (gray) / 🧳 נסיעה ב-DD/MM (blue, future trip) / ✈️ בחופשה (amber, currently away)
- **AwayGuard**: when `is_away = true`, the app shows a lock screen (can only update return date or return now). Unlocks on `/auth` and `/setup`.
- HaNudnik stops sending reminders to that resident while away
- Fixed tasks belonging to an away resident **open up to all residents** while they're away
- On return: HaNudnik asks the resident to re-confirm each of their fixed tasks one by one
  - If the resident previously held a fixed task and wants to reclaim it after returning from away — **no approval from other residents required** (they already approved it originally)
- If the **entire apartment** is away simultaneously → counts as a pause, inactivity timer is paused

---

## Features

### 1. Bills Management

**Bill Types** (טאב "רשימת חשבונות לתשלום"):
- Each apartment has a list of bill types (חשמל, גז, מים, ועד בית, אינטרנט, ארנונה + custom)
- Default types created automatically in `create_apartment()`: חשמל (bimonthly_even), גז (bimonthly_odd), מים (bimonthly_even), ועד בית (monthly), אינטרנט (monthly), ארנונה (bimonthly_even)
- Each type has: name, frequency_type, notes (optional), fixed_amount (optional), is_active, emoji (optional)
- **Emoji**: stored as `bill_types.emoji text`; default emojis set by bill name on creation; emoji picker in add/edit bill form (UI pending); displayed in bills list next to bill name
- Frequency types: monthly / bimonthly_even / bimonthly_odd / quarterly / annual
- **Fixed amount**: if set, the quick-add modal pre-fills the amount (still editable). No change to display behavior — fixed bills still appear in "צפויים" like variable bills.
- Rent reminders: separate from bill types — per resident (personal) or per apartment, with payment_day, amount, renewal_date, notes. Personal rent visible only to that resident.

**Bills Tab** (טאב "חשבונות"):
- Block order: שכר דירה (unpaid current month only) → צפויים → ממתינים לתשלום → היסטוריה
- שכר דירה: shows current month's unpaid rent entries; once paid, moves to history. Past month unpaid rent falls into ממתינים לתשלום.
- צפויים: bill types whose cycle is current month and no bill entry exists yet; quick-add modal opens with amount pre-filled if fixed_amount is set
- ממתינים לתשלום: unpaid bill entries (non-rent, or past-month rent)
- היסטוריה: grouped by bill type (שכר דירה first), newest first per group; shows notes; edit/unmark payment per entry

**Quick-add modal** (from צפויים):
- Shows: bill name + month range
- Fields: amount (pre-filled if fixed_amount set, editable), due date (optional, defaults to last day of month)
- Buttons: ביטול / שולם כבר ✓ (creates + marks paid) / הוסף לרשימה (creates unpaid)

**Bot reminders:**
- `send_bill_due_reminders()`: every 3 days if bill not entered, every 2 days if unpaid — called from daily cron
- `send_rent_payment_reminders()`: daily from payment_day until rent is paid — personal rent → only to that resident; apartment rent → to all

**Data retention:**
- Bill records (type, dates, amount) are kept **forever** — no auto-delete

---

### 2. Shopping List

**Real-time sync** for all residents via Supabase Realtime.

**Adding a product:**
- Type a product name → autocomplete dropdown shows matching products from the apartment's product catalog (up to 5 suggestions, excludes products already on the active list)
- Autocomplete shows product image/icon, name, and note; products that exist in "נקנה" show a "מנקנה" label
- Tap autocomplete suggestion:
  - If product is in "נקנה" → opens re-add modal with quantity picker
  - Otherwise → opens image search modal with name, note, and image pre-filled
- No suggestion matches / new product → image search modal opens automatically (SerpAPI Google Images) with product name pre-filled
- Resident picks image → tap → full-size preview → confirm → saved as URL linked to the product
- Option: save without image

**Quantity:**
- Each product has a quantity (default 1), shown as ×N
- Quantity picked inside the image search modal when adding a new product

**Buying:**
- Tap ✓ קניתי → modal opens
- "קניתי ✓" button marks the full quantity as bought
- If quantity > 1: "יש חוסרים?" option → number picker (how many actually bought) → remainder stays on the list

**Delete:**
- Tap ✕ → warning modal: "סמן כלא צריך" (marks bought, moves to נקנה) or "מחק לצמיתות"
- "מחק לצמיתות": removes all `shopping_items` entries (active + history) so the product won't reappear in נקנה — but the product record (name, image, note) remains in the catalog so it still appears in autocomplete suggestions

**Product notes:**
- Each product can have an optional free-text note (e.g. "מותג X בלבד", "ב-2 ליטר")
- Note is stored on the `products` record (`products.note text`)
- Displayed below the product name in the active list and in autocomplete suggestions
- Set when adding a new product (field in the image search modal) or via edit

**Editing products:**
- Any resident can tap ✏️ on any product to:
  - Edit the product name
  - Edit the product note
  - Change the quantity
  - Update the image: search bar is always visible in the edit modal — resident can refine the query in real-time, pick from results → full-size preview → confirm
- Search does not open automatically in edit mode — only when resident initiates

**נקנה (bought) list:**
- Collapsible section below the active list
- Shows one entry per product (most recent)
- "הוסף שוב" button → quantity picker → added back to active list
- Products that are already on the active list are hidden from נקנה

**Product images:**
- Stored as URL only (no upload to Supabase Storage)
- Image search via SerpAPI Google Images (Israeli supermarket sites configured as priority sources)
- Tap any product image in the list → fullscreen view, tap background or ✕ to close

---

### 3. Cleaning & Daily Checklist

**Default tasks created automatically for every new apartment:**
- כלים (dishes)
- אשפה (trash)
- ספונג'ה (mopping)
- לטאטא את הבית (sweeping)
- ניקוי מטבח (kitchen cleaning)
- ניקוי שירותים (bathroom cleaning)
- החלפת מצעים (changing bed sheets)
- קניות (grocery shopping)
- כביסה (laundry wash) — special multi-stage task
- תלייה / ייבוש (hang / dry) — chained from כביסה
- קיפול כביסה (laundry fold) — chained from hang/dry

Tasks are created without a frequency — they don't appear in the daily checklist until a resident sets a frequency. Tasks with no frequency (`frequency_type = null`) are managed from the מטלות screen only.

**Emoji:** Each task can have an optional emoji (stored as `tasks.emoji text`). Basic default tasks get auto-assigned emojis on creation (e.g. כלים=🍽️, אשפה=🗑️, כביסה=🧺). Residents can change or clear the emoji when adding/editing a task via an emoji picker. The emoji is displayed before the task title in both the dashboard and מטלות screen.

**Recurring tasks — frequency options:**
- Daily
- Multiple times per day (see below)
- Specific days of the week (resident picks which days)
- Weekly (once a week, resident picks which day)
- Biweekly (resident picks day of week)
- Monthly (resident picks day of month)
- **לא רלוונטי** — resident can mark a default task as not relevant (sets frequency to null, removes it from daily checklist)

Laundry is included as a checklist task (see Section 4.5).

**Multiple times per day:**
- Resident picks which time slots apply: בוקר / צהריים / ערב / לילה (at least 2)
- For each slot, resident picks a specific time within the allowed range:
  - בוקר: 07:00–10:00
  - צהריים: 12:00–15:00
  - ערב: 17:00–20:00
  - לילה: 22:00–23:59
- Each slot is a separate instance — can be claimed independently by different residents
- Partial claiming: resident takes only some slots; remaining slots stay open for others
- Reminders: fire at the slot's defined time, then every hour on the hour within the range, until marked done
- Scoring: **1 point per slot** (not per task)
- Display on main screen: grouped card showing all slots with "X/Y נלקחו" counter

**Task states (two separate, independent states):**
1. `claimed` — "I'm on it": resident announces they're taking this task
2. `done` — completed: resident marks it finished

Claiming does not auto-complete. Both must be explicitly set.

**Reminder flow after claiming:**
- Regular tasks: resident picks a personal reminder time when claiming
- Multiple-times-per-day tasks: reminder time is pre-set from the task definition (no picker at claim time)
- HaNudnik reminds at that time — only if `done` is still not marked

**Main screen (dashboard):**
- Shows weekly scores (shared mode) + today's tasks only
- Navigation via sandwich menu (☰): קניות, חשבונות, לוח שנה, כביסה, מטלות, HaNudnik
- "אני על זה" only on the main screen, only on today's tasks
- VETO selection: only on main screen, only to weekly winner, for 24 hours after summary

**מטלות screen (task management):**
- Add / edit / delete tasks and frequencies
- Fixed task assignments (requires approval from all residents)
- Separate from the daily view

**Fixed tasks:**
- A task can be permanently assigned to one resident
- Assigning requires **approval from all other residents** (e.g. Ron wants to own "dishes" — everyone must approve)
- Fixed tasks always belong to that resident and always count toward their score
- If the assigned resident is **away**: task opens to everyone temporarily
- On return from away: resident can reclaim their fixed task without needing re-approval from others
- Fixed tasks earn points fresh every time they're completed

---

### 4. Laundry Special Requests

- All residents can **see** each other's laundry requests
- Each resident can only **edit their own** request (e.g. "need basketball clothes clean by Tuesday")
- Displayed as a section per resident — read-only for others
- Requests are marked **at machine start** (not at end) — combined in the activation modal
  - Checked items = done (saved to history immediately); unchecked items remain in request for next time
- **Laundry history**: shows the last 2 washes, grouped by resident — ✓ for done items, ↩ for kept items
  - Stored in `laundry_history` table (jsonb `entries` array per wash); `trim_laundry_history` trigger keeps only latest 2 per apartment
  - Each record stores: `apartment_id`, `finished_at` (= start time + duration), `entries: [{user_id, display_name, done[], kept[]}]`
  - History is saved when the machine is **started** (not when finished)

---

### 4.5 Laundry Multi-Stage Task

כביסה היא מטלה מיוחדת מרובת שלבים — שני סוגים לפי הגדרת הדירה (תלייה / מייבש).

**הגדרת שיטת ייבוש:** מוגדרת ברמת הדירה (`apartments.laundry_method = 'hang' | 'dry'`) — מוצגת כפתורי בחירה בכרטיס הכביסה במסך מטלות.

**כביסה + תלייה + קיפול (hang):**
- שלב 1: מטלת "כביסה" (`laundry_wash`) מופיעה בדשבורד → לוחצים "אני על זה" → "סמן כבוצע" → נפתח modal להפעלת מכונה (אורך תוכנית + סימון בקשות דיירים) → מטלת כביסה **נעלמת מיד**, נוצרת מטלת "תלייה" (`laundry_hang`) להיום
- שלב 2: "תלייה" — מציגה זמן סיום צפוי של המכונה ("⏱ מכונה מסיימת ב-XX:XX"); ניתן לתפוס, בוצע → נקודה → נוצרת **מחר** מטלת "קיפול כביסה" (`laundry_fold`); מחיקת רשומת `laundry_machine` מסוג 'wash'
- שלב 3: "קיפול כביסה" — ניתן לתפוס, בוצע → נקודה → נגמר

**כביסה + ייבוש + קיפול (dry):**
- שלב 1: מטלת "כביסה" → modal הפעלה (אורך תוכנית + סימון בקשות) → מטלת "ייבוש" (`laundry_dry`) נוצרת מיד
- שלב 2: "ייבוש" — מציגה זמן סיום המכונה; כפתור "הכנסתי למייבש ✓" פותח modal לבחירת אורך תוכנית ייבוש (45/60/75 דקות) → מטלת "קיפול" נוצרת **היום**; נשמרת רשומת `laundry_machine` מסוג 'dry'
- שלב 3: "קיפול כביסה" — מציג "⏱ מייבש מסיים ב-XX:XX"; בוצע → נקודה → מחיקת רשומת 'dry' → נגמר

**שרשור:** מבוצע ב-`complete_task()` DB function — בביצוע שלב N נוצר instance חדש לשלב N+1. כל שלבי הכביסה מוצגים בדשבורד כאשר קיים instance ליום הנוכחי.

**`finish_laundry_machine(p_apartment_id)`** RPC: נקרא **בהפעלת המכונה** (לא בסיום). אם קיים instance של `laundry_wash` להיום → קורא ל-`complete_task`; אחרת → יוצר instance לשלב הבא ישירות.

**`laundry_machine` table**: מחזיק סטטוס מכונה פעילה. עמודת `machine_type text default 'wash'` מבחינה בין כביסה ('wash') לייבוש ('dry'). רשומה נמחקת: כאשר מסמנים תלייה/ייבוש כבוצע (wash) או קיפול כבוצע (dry), או ידנית מכפתור ✕ במסך הכביסה.

**מסך כביסה** (`/laundry`):
- Banner "מכונה פועלת": מציג שעת הפעלה + שעת סיום צפויה + כפתור ✕ לסגירה ידנית
- כפתור "הפעלת מכונה": פותח modal משולב — בחירת אורך תוכנית + סימון בקשות הדיירים — הכל בחלון אחד

---

### 5. Shared Calendar

**תצוגה:**
- גריד חודשי, שבוע מתחיל ראשון → שבת
- שישי + שבת עם הדגשת רקע קלה
- ניווט חודשים (קודם / הבא), כולל חודשים עתידיים
- כל אירוע מוצג כ**פס צבעוני** מתחת למספר היום:
  - אירוע אישי = פס אחיד בצבע היוצר
  - אירוע משותף = פס מפוצל: חלק צבוע לכל מי שאישר, פסים אלכסוניים לממתין, מלא לכל שחקן

**צבעי דיירים:**
- פלטה של 5 צבעים פסטלים לפי סדר הצטרפות לדירה:
  1. `#C7CEEA` לבנדר
  2. `#B5EAD7` מנטה
  3. `#A8D8EA` תכלת
  4. `#FFD9A0` שמנת
  5. `#FFF5B1` צהוב
- הצבע נקבע אוטומטית בהצטרפות — הצבע הפנוי הבא לפי סדר
- ניתן לשינוי, אך לא יתכנו שני דיירים עם אותו צבע

**מקרא** — מוצג מתחת לגריד עם שם כל דייר ונקודת הצבע שלו

**לחיצה על יום** → מודאל עם רשימת האירועים:
- כל אירוע: כותרת + שם היוצר + שעה (אם הוגדרה)
- אירוע משותף: פס אנכי מפוצל + רשימת משתתפים עם סטטוס ✓ / פסים אלכסוניים (ממתין)
- לחיצה על אירוע שלך → כפתורי עריכה / מחיקה
- כפתור "הוסף אירוע ליום זה"

**אירוע:**
- כותרת קצרה (חובה)
- תאריך + שעה אופציונלית
- הערות אופציונליות (נראות רק בפתיחת האירוע הספציפי)
- הזמנת משתתפים (אופציונלי) — צ'קבוקסים עם צבע כל דייר

**הזמנת משתתפים:**
- המוזמנים מקבלים הודעת בוט לאישור/דחייה
- ✓ אישר = חלק צבוע בפס
- פסים אלכסוניים = ממתין לאישור
- עריכה/מחיקה — רק של האירועים שיצרת

**Away Mode & Calendar indicators:**
- Calendar legend shows ✈️ + return date for currently-away residents (or "לא נמצא" if no return date); shows 🧳 + departure date for residents with a scheduled trip within the next 2 weeks
- Grid cells: 🧳 + resident name shown on departure day (within 2-week window); 🏠 + resident name shown on return day

---

## HaNudnik — The Digital Roommate

### Core Behavior
- Each resident has a **personal chat with HaNudnik**
- Bot **always initiates** conversations — residents respond via **pre-built buttons only** (no free text input, zero API cost)
- Bot is aware of all residents' actions in real-time via Supabase Realtime
- **Solo mode**: bot speaks directly to the resident — "when will you do this?" instead of "who's doing this?"

### Notifications

**Delivery:**
- HaNudnik bot chat **serves as the inbox** — no separate notification bell/inbox page needed. Bot history is retained for **1 week** (older `bot_messages` deleted by cron). Bot page opens to the **first unread message** (not bottom of chat).
- Push notifications are sent with a **2–3 minute delay** after the triggering event

**Smart replacement (within the delay window):**
- If someone claims a task within the 2–3 min window → a **replacement push** is sent to others:
  _"you're off the hook, X claimed it 😄"_
  (uses Web Push API `tag` field to replace the unread notification)

**After push is delivered:**
- If the push was already delivered before the replacement → resident opens the app and sees the **updated bot message** in their chat instead

---

## Task Claiming & Forfeiting

| Action | Effect |
|---|---|
| Claim ("I'm on it") | Task locked to resident; they pick reminder time (30min / 45min / 1hr) |
| Done | Completion mark; awards points |
| Forfeit (unclaim) | **−0.5 points** penalty; HaNudnik notifies others with **×1.5 points** offer |
| No one claimed by 14:00 | Bot sends reminder to all residents |
| No one claimed by 17:00 | Bot sends **×2 points** offer to all |
| Missed task (claimed but not done overnight) | At 07:00: bot asks resident — "done, forgot to mark" (×1 pts) or "didn't finish" (→ overdue ×1.5 today) — **only if not already handled at 22:00** |
| 22:00 nightly reminder | Bot checks: claimed-but-not-done tasks + unclaimed tasks → sends per-resident (see below) |
| multiple_daily missed overnight | Closed silently — no carryover, no points |

**Bot messages:**
- On forfeit: "ויתרו על [מטלה] — כדאי לתפוס מהר ב-150%!"
- Morning nudge solo: "בוקר טוב! יש לך N מטלות לביצוע להיום 📋" + "מה ברשימה?" → dashboard; if 0 tasks → "אין מטלות להיום 🎉"
- Morning nudge multi: "הגיע הזמן לתפוס מטלות להיום 💪" + "הירשם/י למטלות" → dashboard; if all claimed → "כל המטלות כבר נלקחו 👍"
- 14:00 solo: if tasks without reminder exist → "עדיין נשארו N מטלות בלי תזכורת" + "תן לי לקבוע תזכורות" → dashboard; if all have reminders → nothing sent
- 14:00 multi: if all claimed → "כל המטלות כבר נלקחו 👍"; if open tasks → "עדיין נשארו N מטלות פנויות. קדימה!" + "תראה לי" → dashboard
- 17:00 solo: same as 14:00 solo
- 17:00 multi: if open tasks → "17:00 - יש עוד N מטלות שלא נלקחו. הן לא יתבצעו לבד 😅" + "תראה לי" → dashboard
- 07:00 overnight check: "[מטלה] לא בוצע אתמול - מה עשית עם זה?" — only sent for instances not already forfeited via nightly_sleep; "סיימתי, שכחתי לסמן ✓" (×1) or "לא הספקתי" (→ overdue ×1.5 today)
- **22:00 nightly reminder** (per resident, only if something to report):
  > _(claimed-but-not-done tasks — solo & multi):_
  > "יש לך עוד קצת משימות לסגור לפני שהיום נגמר 🌙" + task list (double newline between tasks)
  > `✅ תן לי לראות` → bot sends each task separately with "✅ בוצע" button → marks done
  > solo: `תעביר למחר, תן לי לישון` → `nightly_sleep_my_tasks()` — tasks move to tomorrow ×1 (no penalty, no points in solo)
  > multi: `⏰ שירדו לי נקודות, תן לי לישון` → `nightly_sleep_my_tasks()` — −0.5 per task, tasks move to tomorrow ×1.5
  >
  > _(unclaimed tasks — multi only):_
  > "נשארו N משימות שאף אחד לא לקח היום:" + task list (double newline between tasks)
  > `תן לי לסמן` → dashboard
  > `שיעבור למחר מבחינתי` → noop (tasks carry over naturally via `ensure_today_instances`)

- **Laundry reminder** (sent to **all residents**, the day before the laundry task's scheduled day, at 19:00):
  > מחר צריך לעשות כביסה 🧺
  > זה הזמן שלך לעשות סדר בבגדים ולהכניס בקשות באפליקציה עד הערב.
  > `הכנס/י בקשה →` _(deep link to /laundry)_

---

## Gamification

### Anti-abuse rules
- **Forfeit penalty tested ✅ (09/04/2026):** cancel after >30 min → −0.5 points, `points_multiplier = 1.5`, notify all active residents
- **Uncomplete is self-only**: enforced in `uncomplete_task()` — raises exception if `done_by != auth.uid()`
- **No re-farming**: `scores.task_instance_id` unique constraint + `on conflict on constraint scores_user_instance_unique do update` in `complete_task()` — prevents duplicate score rows per instance
- `uncompleted_by` column tracks who cancelled — used by `get_tasks` to deprioritize uncompleted instances per slot; cleared when task is re-completed

### Points

| Event | Points |
|---|---|
| Task completed | 1 |
| Fixed task completed | 1 (fresh each time) |
| Missed overnight (done, forgot to mark) | 1 |
| Overdue carried task completed | ×1.5 |
| Double-points offer claimed (17:00 or forfeit) | ×1.5 |
| Forfeit penalty | −0.5 |

### Weekly Cycle

**Summary day:**
- Residents choose which day of the week to receive the weekly summary
- The **first time** the day is set (apartment has no summary day yet) → any single resident can set it, no approval needed
- Any **change** after the initial setting → requires approval from **all residents** every time

**Weekly reset:**
- Weekly scores reset at the end of each summary day
- Data is saved before reset for monthly tracking

**Weekly winner — VETO reward:**
- Winner chooses **1 task** to opt out of for the **current week** (picked at the start of the new week after winning)
- That task is **locked for the winner** — they cannot do it (and won't earn points from it)
- Other residents can still claim and complete that task — they see `🛡️ וטו של [שם]` on the card
- Winner loses the points they would have earned from that task
- Veto is stored with `week_start = current_week` and visible immediately in the dashboard

### Monthly Cycle

- Points are tracked on a **calendar month basis** — regardless of when residents started using the app
- Monthly summary shown at the end of the calendar month
- **Monthly winner reward:** VETO — same mechanic as weekly winner. Winner picks 1 task exempt for 7 days from moment of pick. Sent on 1st of month via `send_monthly_summary`. Offer expires 24h after sending; if not picked → no veto that month.
- Monthly data resets after the summary screen is shown

---

## Data Retention

| Data | Retention |
|---|---|
| Task history | 2 weeks |
| Bills (type, due date, amount) | Forever |
| Weekly scores | Reset weekly, saved for monthly tracking |
| Monthly scores | Reset after monthly summary |
| Apartment (inactive) | Deleted after 3 months of inactivity |

---

## Build Status

### Done
- Auth (register/login with email + password + gender)
- Apartment creation via `create_apartment` DB function (bypasses RLS)
- Apartment join via invite link
- Dashboard: weekly scores, today's tasks only, VETO modal; ⚙️ gear icon in header opens apartment settings (name edit, invite, remove resident, leave) — sandwich menu removed
- Dashboard: Away Mode toggle (✈️/🏠 pill in header) + modal with date picker; `set_away()` / `return_from_away()` RPCs; nudge functions skip `is_away=true` users; `auto_return_from_away()` runs at midnight via cron
- Dashboard: overdue label "נדחה מ-X" on tasks with `overdue_from` date
- Dashboard: multiple_daily slots — done slots move to הושלמו section; pending slots remain grouped in today's tasks
- Bottom navigation bar (`BottomNav` component): 4 main tabs (בית, מטלות, בוט, קניות) + ☰ overlay (חשבונות, כביסה, לוח שנה, היסטוריה); unread bot badge; hides on /auth and /setup
- Shopping list with Realtime sync + product image search (SerpAPI): add with image search, quantity, partial buy (shortage flow), delete warning modal, autocomplete from נקנה, re-add flow, fullscreen image view, edit modal with on-demand image search and live query editing; "מחק לצמיתות" deletes all shopping_items rows for the product (active + history) so it won't reappear in נקנה; re-adding a previously-known product opens the image modal with existing image pre-selected (instead of adding instantly)
- Bills management (add, mark paid, delete with confirmation, month/year tracking)
- Laundry special requests (per-resident, edit own, bullet formatting, read-only for others)
- מטלות screen: add/edit/delete tasks, all frequency types including multiple_daily (slots + time pickers), fixed task request flow (📌 button + pending state + approval via bot + displayed on task card)
- Shared calendar: monthly grid, shared events, invitee split bars, bot invite flow
- HaNudnik bot page: full chat UI, realtime, all button handlers, submenu support
- Bot message system: all automated messages with gender-aware Hebrew copy
- Scheduled messages system: `scheduled_messages` table + `process_scheduled_messages` RPC
- Cron jobs: `/api/cron/process` (15min), `/api/cron/daily` (midnight), `/api/cron/weekly`, `/api/cron/monthly`
- Overnight missed task check: 07:00 daily — claim yesterday → done (×1) or overdue (×1.5 today)
- multiple_daily tasks: closed silently overnight, no carryover
- Forfeit notifies others with ×1.5 points
- Default tasks created automatically in `create_apartment()` DB function (12 tasks: כלים, אשפה, ספונג'ה, לטאטא, ניקוי מטבח, ניקוי שירותים, החלפת מצעים, קניות + 4 laundry subtypes)
- Tasks with `frequency_type = null` don't appear in daily checklist (`ensure_today_instances` skips them)
- Laundry multi-stage chaining: `complete_task()` creates next-stage instance automatically based on `apartments.laundry_method`
- Task ordering in dashboard: overdue → forfeit → my tasks → open → veto → others' tasks → done
- מטלות screen: biweekly/monthly now show day-of-week picker; laundry task card shows hang/dry/לא רלוונטי buttons
- Calendar: pending participant bars shown as flat gray (#d1d5db), confirmed as full color
- VETO modal: deduplicates `multiple_daily` tasks (same task_id shown once)
- VETO system redesigned: `vetos` table now has `source` ('weekly'|'monthly'), `offer_expires_at` (24h window to pick), `expires_at` (weekly=end of week, monthly=7 days from pick), `month_start date`; unique indexes per source type; `task_id` nullable (NULL = pending, not yet picked)
- VETO winner banner: shows up to 24h after week end; after picking veto → winner banner auto-dismissed, weekly summary banner (same 24h window) shown instead; non-winners see only the summary banner
- Monthly VETO: sent on 1st of month; winner picks 1 task exempt for 7 days; if weekly+monthly winners coincide (Sunday=1st), both modals open sequentially (1/2 → 2/2 badge); same task cannot be picked for both vetos; task picked by another player shown as "נבחר ע"י [שם]"
- `needs_veto_pick()` returns jsonb array of pending sources; `set_veto(task_id, source)` updates pending row + sends confirmation bot message (gender-aware) to chooser + alert to others; `get_active_vetos()` uses `expires_at > now()` and returns `source` + `expires_at`
- multiple_daily slot order in מטלות screen: always chronological (בוקר → צהריים → ערב → לילה)
- Frequency options: removed "כל X ימים" — supported types: daily, multiple_daily, specific_days, weekly, biweekly, monthly
- Shopping edit modal: image picker inline in grid (ring + checkmark), single save button
- Leave apartment: "עזוב דירה" button in ⚙️ apartment settings modal (red, subtle); confirm modal; notifies all other residents via bot; clears `apartment_id` from profile
- Bot notifications: `send_weekly_summary` (winner gets veto CTA, others get scores), `send_monthly_summary`, `notify_veto_chosen` (confirmation to chooser + alert to others), `notify_fixed_task_approved`, `notify_fixed_task_rejected` (with rejector names), `notify_resident_joined`, `notify_resident_left`, `notify_away` (different text if has fixed tasks), `notify_returned_from_away` (sent to returning resident only)
- `set_away` and `return_from_away` now call bot notification functions automatically
- `approve_fixed_task` and `reject_fixed_task` now call bot notification functions automatically
- `set_veto` now calls `notify_veto_chosen` automatically
- `joinApartment` in setup page: calls `notify_resident_joined` after joining; if apartment was solo → auto-switches mode to `shared` and calls `notify_solo_to_shared` instead
- Invite UI: "הזמן דייר חדש" button in "שינויים בדירה" modal; shows resident count; generates invite in `invites` table; displays ready-to-paste WhatsApp message with copy button (green "הועתק! ✓" feedback for 2.5s); blocks if apartment is full (5/5)
- Onboarding message: `send_onboarding_message(user_id, apartment_id)` — sent after apartment creation and after joining (shared mode); gender-aware Hebrew; covers tasks, bills, laundry, shopping, gamification, calendar, away mode; button navigates to dashboard. First screen new users see is `/bot`.
- Away Mode — future away: `profiles.away_start_date` column; `set_away(p_return_date, p_start_date)` handles immediate or future; `cancel_future_away()` clears scheduled trip; `auto_activate_future_away()` runs at midnight cron
- AwayGuard: client component wrapping layout — checks `is_away` on every pathname change; shows lock screen (update return date / return now) when away; skips `/auth` and `/setup`
- Dashboard away pill: 3 states (🏠 בבית / 🧳 נסיעה ב-DD/MM / ✈️ בחופשה); away modal handles all 3 states including edit future trip
- Calendar: legend shows ✈️ + return date for away residents, 🧳 + departure date for upcoming trips (2-week window); grid cells show 🧳 + resident name on departure day, 🏠 + resident name on return day
- Fade-out animations (300ms opacity): tasks (delete), shopping (buy full qty / delete), bills (mark paid + unmark payment — confirmation modal added)
- Calendar: event bars in grid now use per-participant segments (solid if confirmed, diagonal stripes if pending); thin black divider between segments; same in day modal split bar
- Calendar colors: derived from join order (index in `profiles` sorted by `joined_at`) — no DB write needed, RLS was blocking cross-profile updates
- Calendar reminders: per-user per-event, stored as `int[]` in `calendar_events.reminder_days_before` (creator) and `calendar_invitees.reminder_days_before` (invitees); up to 4 reminders; selectable from day modal and from add/edit modal; `send_calendar_reminders()` runs daily from cron
- Logout removed: no logout button; session persists in localStorage; Web Push will deliver bot messages even when app is closed
- Nightly 22:00 reminder: `send_nightly_reminder(apartment_id)` — per resident, only if claimed-but-not-done tasks or unclaimed tasks exist; two separate messages per section; button handlers: `nightly_mark_my` / `nightly_sleep` (noop) / `nightly_mark_unclaimed` / `nightly_skip` (noop)
- Laundry reminder: `send_laundry_reminder(apartment_id)` — sent at 19:00 the day before laundry day (based on `frequency_type`/`frequency_value`), to all non-away residents; always sent regardless of whether laundry was already done
- Anti-abuse: `uncomplete_task()` enforces self-only uncomplete; `complete_task()` uses `on conflict on constraint scores_user_instance_unique do update`; `uncompleted_by` cleared on re-complete
- Uncomplete flow: confirmation modal (own task = deduct points; other's task = send bot request); `/bot` page handles `approve_uncomplete` action → calls `uncomplete_task`
- `get_tasks` rebuilt: lateral+row_number per (task, slot, done/pending); overdue pending instances included; prioritizes non-uncompleted instances per slot
- Dashboard Realtime: subscribes to `task_instances` table changes → `fetchTasksWithFade()` — identifies changed tasks by state (claimed/done/forfeited), fades them out (300ms) before re-render
- Dashboard page loading: `pageLoading` state prevents empty-state flash; all main data fetches parallelized with `Promise.all`; shopping/laundry/calendar hidden with `visibility: hidden` until data arrives
- Bot page: renders with `visibility: hidden` until messages loaded + scrolled to bottom via `requestAnimationFrame` — user sees only bottom of chat on open
- VETO modal: uses `get_veto_candidates()` DB function — filters to next week's tasks only (biweekly/monthly checked against last_due), excludes laundry sub-tasks (`is_laundry=true`), excludes hang/dry task not matching `apartments.laundry_method`, shows repeat count per task; laundry sub-tasks inherit repeat count from כביסה main task
- מטלות screen: כביסה (laundry_wash subtype) pinned first if has frequency, pinned last if frequency=null; position change animated with fade-out
- Calendar: declined invitees shown as dark gray (#9ca3af) in grid bars and modal; sorted last in bar segments; pending = diagonal stripes; confirmed = full color; modal shows ✕ + strikethrough name for declined
- Auth: default screen is register (not login)
- Push notifications architecture: `ios_message` column added to `bot_messages`; all bot functions updated with separate Android/iOS copy; Service Worker (to be built at deployment) will select message by platform and add `actions` (Android only); platform stored in `push_subscriptions` table at subscription time
- All bot message functions updated with Android/iOS split + solo/shared split: `send_morning_nudge`, `send_daily_14`, `send_daily_17`, `send_task_reminder`, `send_nightly_reminder`, `send_overnight_check`, `send_laundry_reminder`, `send_veto_reminder`, `send_weekly_summary`, `send_bill_reminder`, `send_rent_reminder` (new), `process_scheduled_messages` (updated to handle `rent_payment_reminder`)
- preview-solo.html: onboarding screens added (auth login + register, choose create/join, create apartment, bot asks solo/shared, bot confirms solo, join with invite code); Push notification screens added (Android lock screen style — morning nudge + task reminder with action buttons)
- preview-4players.html: Push notification screens added (iPhone lock screen style — morning nudge + task reminder without action buttons)
- preview-solo.html + preview-4players.html: bot screens fixed (nightly check copy, forfeit alert); veto modal shows weekly task count badge (×N) per task
- Dark mode: removed `@media (prefers-color-scheme: dark)` from globals.css — app always renders in light mode
- `next.config.ts`: `devIndicators: false` to hide dev toolbar on mobile
- Bug fix: `ensure_today_instances` — `specific_days` tasks now matched with `cfg->'days' @> to_jsonb(dow)` (was `? dow::text` which failed for integer arrays)
- Tasks emoji: `tasks.emoji text` column; default emojis set for built-in tasks; `get_all_tasks` and `get_tasks` updated to return emoji; emoji picker in add/edit modal; emoji displayed before title in dashboard and מטלות screen
- Bills emoji: `bill_types.emoji text` column + default emojis by name; emoji picker in add/edit bill form (done); emoji displayed in bills list
- Laundry: per-item checkboxes (key = `userId::lineIndex`); `laundry_history` table with jsonb entries; `trim_laundry_history` trigger keeps latest 2 per apartment; history UI in `/laundry` page
- `finish_laundry_machine(p_apartment_id)` RPC: checks for existing `laundry_wash` instance today → `complete_task` if found; otherwise creates next-stage instance directly
- Laundry machine flow redesigned: history + request marking saved at **start** (not end); `finish_laundry_machine` called on activation; `laundry_machine.machine_type` column ('wash'|'dry') added; dashboard shows end time on hang/dry/fold task cards; dryer duration modal in dashboard when completing `laundry_dry`; wash activation modal available from dashboard (same combined modal as /laundry: duration + request marking per resident)
- Dashboard loading: skeleton loaders (pulsing gray bars) for weekly scores + today's tasks during page load
- Dashboard empty state: "ככה לא מנהלים דירה גבר/גברת!" (gender-aware) when no tasks today
- History page: `get_weekly_history` + `get_monthly_history` use GROUP BY + SUM; residents with 0 points shown with "–" prefix in gray; fixed duplicate-key bug (scores table has multiple rows per user per week)
- Dashboard: laundry/dryer machine timer banner — blue banner between scores and tasks showing 🫧/♨️, machine type, countdown ("נשאר X דקות · מסתיים ב-HH:MM"), updates every 60s via `useEffect` + `setInterval`; "פתח" button navigates to /laundry
- Dashboard: overdue task cards rendered with red border (`border-red-300`) instead of gray
- `ensure_today_instances`: now sets `overdue_from` on today's new instance when a prior incomplete instance exists (UPDATE pass before cleanup DELETE); then deletes old incomplete instances for tasks scheduled again today (anti-gaming — prevents intentional carryover for multiplier abuse)
- Forfeit score realtime: `cancelClaim` now explicitly calls `fetchScores()` after penalty (SECURITY DEFINER functions don't reliably trigger Supabase Realtime on `scores` table)
- `ensure_today_instances`: claimed-but-incomplete instances from previous days are preserved (not deleted) so `send_overnight_check` can find them at 07:00; only unclaimed incomplete instances are deleted when the task reappears today
- Away mode — fixed task release: `set_away` now clears `fixed_user_id` and stores it in `previous_fixed_user_id` on immediate away; `return_from_away` sends a per-task bot message asking if resident wants it back; 48h scheduled message expires the offer and notifies if unanswered; `reclaim_fixed_task` / `release_fixed_task` RPCs handle bot button actions; no re-approval from others needed to reclaim
- `request_fixed_task`: old 1-param overload dropped (dead code); active 2-param version (with `p_requester_id`) is correct
- Inactivity deletion: `check_inactivity(apartment_id)` implemented — skips if all residents away; uses last `done_at` as activity marker; sends milestone warnings at 7/14/30/60/83 days; deletes apartment at 90 days; milestone deduplication via `bot_messages.triggered_by` check; called daily at 09:00 via existing `inactivity` scheduled_messages type
- `task_instances` duplicate bug fix: added partial unique indexes `(task_id, due_date) WHERE slot IS NULL` and `(task_id, due_date, slot) WHERE slot IS NOT NULL`; `ensure_today_instances` updated to use `ON CONFLICT DO NOTHING` instead of `NOT EXISTS` checks (prevents race condition when multiple users open app simultaneously)
- Laundry screen: starting machine awards points — new `complete_wash_task(p_apartment_id)` RPC finds (or creates) today's `laundry_wash` instance, claims it if unclaimed, and calls `complete_task`; called from `/laundry` `startMachine()` alongside existing `finish_laundry_machine`
- Laundry task lock: hang/dry/fold tasks appear immediately after previous stage completes, but "סמן כבוצע" is disabled while the preceding machine is still running (`isLaundryTaskLocked` checks machine end time vs now); claiming ("אני על זה" / "קבע תזכורת") is always available from the moment the task appears
- Laundry screen: dryer machine banner shown in red (`bg-red-50 border-red-200`) instead of blue; initial page load now selects `machine_type` column
- Away mode — return flow: `return_from_away` now calls `notify_returned_from_away` (welcome-back bot message to returning resident) before sending fixed-task reclaim messages; `notify_returned_from_away` was already implemented but was never called from `return_from_away`
- Away modal: after confirming immediate away, page auto-reloads (`window.location.reload()`) to show AwayGuard lock screen
- `send_bot_message`: uses `clock_timestamp()` instead of default `now()` for `created_at` — ensures correct insertion order within a single transaction (fixes reversed message order on mobile)
- `return_from_away`: removed notification to other residents ("X returned home") — only the returning resident receives messages
- `notify_away`: fixed `fixed_assignee` → `fixed_user_id`; fixed null return date crash; uses `display_name` instead of `name`; explicit casts for `send_bot_message` params
- `set_away`: old 1-param overload dropped; rewrote 2-param version calling `notify_away` with correct 3 params
- Fixed task flow: `request_fixed_task` and `approve_fixed_task` skip away residents; `send_bot_message` overload ambiguity resolved by dropping old 6-param `(uuid,uuid,text,text,uuid,jsonb)` overload
- Dashboard task order: (1) נדחו מיום אחר (red border) → (2) נלקחו על ידי → (3) multiple_daily → (4) פתוחות → (5) של אחרים (fixed to others / claimed by others) → (6) הושלמו
- Dashboard: completed tasks (הושלמו) show `done_at` time next to name (`מורן · 17:04`); sorted newest-first
- Dashboard: ties in weekly score — current user always appears first
- Dashboard: fixed tasks belonging to another resident show no "אני על זה" button (only when that resident is away does `fixed_user_id` become null and the task open up)
- Dashboard multi-slot card: unclaimed slots have blue background (`bg-blue-50`) with white bordered "אני על זה" button; claimed-by-others slots have gray+opacity (`bg-gray-50 opacity-60`); done slots move to הושלמו section (not shown in card)
- Dashboard: gap (`mt-2`) added between pending tasks section and multi-slot section; "של אחרים" section rendered separately after multi-slot
- Dashboard multi-slot: if ALL slots in a group are claimed by others → card moves to "של אחרים" section (first position), with `transition-all duration-500` fade-in
- Dashboard: completing the "קניות" task shows a reminder modal with "סימנתי כבר" / "לרשימת הקניות ←" buttons; triggered by `task_subtype = 'shopping'`
- `get_tasks()` SQL function: added `'shopping'` to the allowed task_subtype filter (alongside `laundry_wash`); fixed return column names to match `Task` type (`frequency`, `frequency_config`); fixed `points_multiplier` type to `numeric`; `create_apartment()` updated to set `task_subtype = 'shopping'` for the קניות task
- `request_uncomplete_task`: sends bot message to the task completer asking for approval; message includes task title and requester name/gender; buttons: "כן, בטל" (`approve_uncomplete`) / "לא" (`noop`)

- `notify_away`: updated message to use gender inflection ("יצאה/יצא", "שלה/שלו"); added `triggered_by = 'away_notify'`; message: "✈️ [שם] יצאה/יצא לחופשה עד DD/MM. המטלות הקבועות שלה/שלו ייפתחו לשאר הדיירים."
- Dashboard laundry machine banner: changed wash emoji from 🫧 (unsupported on Windows 10) to 🌊; dryer remains ♨️
- `return_from_away`: clicking "חזרתי" twice sends duplicate messages — button should be disabled after first press (known UX issue, not yet fixed)
- `notify_forfeit` / `notify_forfeit_to_others`: fixed message "ב200%" → "ב-150%" (matches actual multiplier); replaced "היום" with slot label (morning→בוקר, noon→צהריים, evening→ערב) or DD/MM for non-slot tasks
- `send_bill_reminder`: fixed `bill_type_id` → `bill_type` column name; fixed `text = uuid` type mismatch with explicit cast; `bill_pay` bot action now navigates to `/bills`
- Bills page: `get_expected_bills()` now returns `emoji` column; שכר דירה shows 🔑 emoji hardcoded; `bill_pay` action added to bot page handler
- Bills page: "הוספת חשבון" modal — "חשבון חדש" tab now shows full type form (שם, אימוגי, תדירות, סכום, הערה) without separate amount/date fields; "חשבון קיים" select shows emoji next to name; modal opens on "חשבון קיים" by default; title changes to "סוג חשבון חדש" in new mode; no duplicate amount field
- Bills page: edit bill modal — removed "בטל תשלום" button (accessible via row button in history)
- `send_weekly_summary`: added medal emojis (🥇🥈🥉) to score lines; fixed integer points display (no decimal); fixed gender inflection for winner message ("את פטורה"/"אתה פטור")
- Bot page: `go_veto` action now opens veto modal inline (no redirect to dashboard); `set_veto` called directly; messages refreshed after confirmation
- `check_inactivity`: updated milestone message texts (7/14/30/60/83 days)
- `notify_apartment_renamed`: fixed gender inflection — `שינה/תה` → `שינה`/`שינתה` based on changer's `gender` field
- `notify_resident_joined`: fixed recipient gender inflection — `תהיה/תהי נחמד/ה` → `תהיה נחמד`/`תהיי נחמדה` per recipient gender
- `notify_resident_left` (4-param): fixed — excluded leaving user from recipients; fixed `תשרדו` → `תשרוד`/`תשרדי` per recipient gender; old 2-param overload obsolete
- `send_laundry_reminder`: button label gender-inflected — `הכנסי`/`הכנס` per recipient gender
- `return_from_away`: fixed `רוצ` → `רוצה` (same for both genders)
- `send_rent_payment_reminders`: fixed `bill_type_id` → `bill_type`, `paid` → `is_paid`, removed non-existent `metadata` column; bot handlers `rent_paid`/`rent_not_yet` added
- `send_nightly_reminder`: included `multiple_daily` tasks with slot label (בוקר/צהריים/ערב); singular/plural fix ("נשארה משימה אחת"/"נשארו N משימות"); task list formatted with newlines; unclaimed buttons changed to "תראה לי מה נשאר ←" (`go_tasks`) + "שיעבור למחר מבחינתי" (`nightly_skip`)
- `send_nightly_unclaimed_task_list`: included `multiple_daily` tasks with slot label; added "בעצם זה לא קרה" (`nightly_skip`) button per task
- Bot page: negative actions (`nightly_skip`, `nightly_sleep`, `overnight_overdue`, `bill_not_yet`, `rent_not_yet`, `calendar_decline`, `release_fixed_task`, `reject_removal`, `noop`) now render red badge (`__rejected__`) instead of green (`__done__`)

- Solo mode — dashboard task cards: reminder time shown after setting (🔔 תזכורת ב-HH:MM) below task title; multi-slot claimed slots show "ביטול" button always + "קבעי תזכורת" only when no reminder set yet
- Solo mode — completed tasks: `done_by_name` hidden (only time shown); applies to regular tasks, done slots, and done section
- Solo mode — fixed task labels: "קבוע: [name]" label hidden in dashboard (my tasks + others' tasks sections); "📌 קבוע" badge hidden in מטלות screen
- Solo mode — calendar: legend (color + name per resident) hidden when only 1 resident (`profiles.length > 1`)
- Solo mode — history: 📊 history button hidden from weekly scores section; "היסטוריה" entry hidden from "עוד" menu in BottomNav
- Solo mode — BottomNav "עוד" menu: uses `flex justify-center` (not grid) so 3 items center correctly; each button `w-20` fixed width
- Solo mode — laundry screen: activate banner subtitle → "לחצי כאן כדי לסמן הפעלת מכונה"; "הבקשה שלי" → "התזכורות שלי"; empty state → "לא הוספו תזכורות"
- Solo mode — bills: rent reminder modal hides "דייר" dropdown; `user_id` auto-set to current user
- Solo mode — rent button: "שולם ✓" → "סמן כשולם ✓" (both `unpaid_rent_reminders` and `unpaid_rent_bills` sections)
- Solo mode — away modal: description hides "שאר הדיירים יקבלו הודעה." (solo has no other residents)
- Solo mode — `set_away`: skips `previous_fixed_user_id` update (no fixed tasks in solo)
- Solo mode — `return_from_away`: skips fixed task reclaim loop; `notify_returned_from_away` sends different message: "או, טוב שחזרת/חזרתי! הבית לא הרגיש אותו דבר בלי מישהו/מישהי לנדנד לו/לה 🏠🤓"
- Solo mode — `leave_apartment`: releases fixed tasks (`fixed_user_id = null`) before disconnecting profile
- Gender-aware texts updated: away modal button "יוצא/יוצאת לחופשה ✈️", "תכנן/תכנני נסיעה 🧳", "לא תקבל/תקבלי נדנודים"; apartment settings "הזמן/הזמיני דייר חדש", "עזוב/עזבי דירה", "הסר/הסירי דייר מהדירה"; AwayGuard lock screen already gender-aware
- "נאדג'ים" → "נדנודים" throughout dashboard away modal
- Solo mode — future away view: "שאר הדיירים יקבלו הודעה ביום היציאה." hidden in solo
- Solo mode — `send_laundry_reminder`: solo body uses "תזכורות" instead of "בקשות"; button: "וואי תזכיר לי לכבס את ה.. ←"; iOS message mentions תזכורות
- Laundry emoji: 🌊/🫧 → 🧺 everywhere — dashboard machine banner, laundry page banner ("🧺 מכונה פועלת"), activate button ("הפעלת מכונה 🧺"), confirm button ("הפעלתי 🧺"); dryer remains ♨️

### ⚠️ Tested features (09/04/2026)
- Forfeit penalty scores update realtime ✅
- Laundry fold task after hang ✅
- Fixed task request → approval (all residents) ✅
- Fixed task request → rejection (with rejector name) ✅
- Fixed task owner goes away → task opens to all ✅
- Fixed task owner returns → task reclaimed ✅
- Away mode: `notify_away` sends to all active residents with correct gender ✅
- Return from away: welcome-back bot message received ✅
- Laundry flow: wash → dryer → קיפול ✅; machine status banner ✅; task locks while machine runs ✅
- Veto system: offer modal appears; task selected → "לא זמין (וטו)" shown; notifications sent with gender inflection ✅
- Uncomplete request: bot message sent to completer with task name + requester name ✅
- Forfeit flow: penalty −0.5, multiplier ×1.5, notify others ✅
- Approve uncomplete: bot message sent → lclicking "כן, בטל" → task reopens, points deleted ✅
- Overdue tasks: appear with red border and "נדחה מ-DD/MM" ✅
- Bill reminders: "לא הוזן" + "לא שולם" both correct ✅; `bill_pay` action navigates to /bills ✅
- Weekly summary: medal emojis, integer points, gender inflection, veto CTA ✅; veto modal opens inline in bot ✅
- Monthly summary: medal emojis, integer points, gender inflection ✅
- Inactivity check: all milestones (7/14/30/60/83 days) send correct messages ✅
- Apartment rename notification: gender-inflected ("שינה"/"שינתה") ✅
- Resident joined/left notifications: gender-inflected for both joiner and recipients ✅
- Laundry reminder: button gender-inflected per recipient ✅
- Rent payment reminder: full flow (schedule → send_rent_reminder → bot message) ✅
- Nightly reminder: claimed-not-done (case 1) + unclaimed (case 2) both correct ✅; multi-daily tasks included with slot name ✅; nightly_skip + nightly_sleep buttons tested ✅
- Morning nudge: leads to dashboard ✅; 14:00 + 17:00 reminders: leads to dashboard ✅
- Calendar: create event ✅; shared event with invitees ✅; calendar_confirm → confirmed (full color bar) ✅; calendar_decline → declined (light gray + ✕) ✅; split bar per participant in modal ✅
- Calendar invite bot message: fixed — `baseAction` parsing; gender-aware buttons; "צפה באירוע ←" navigates to event modal ✅; nav buttons don't disable message ✅
- Calendar RSVP in modal: confirm/decline buttons with pending state; "שמור שינויים" sends one notification to creator + confirmed invitees ✅; RSVP change notification received by יונתן ✅
- Shopping list: add product + image search, quantity, partial buy, autocomplete, re-add, edit, delete, fullscreen image, realtime sync ✅
- Rent renewal reminder: informational message only (no buttons) — verified correct ✅

- `notify_forfeit` / `notify_forfeit_to_others`: fixed message "ב200%" → "ב-150%" (matches actual multiplier); replaced "היום" with slot label (morning→בוקר, noon→צהריים, evening→ערב) or DD/MM for non-slot tasks
- Weekly summary + veto: tested full flow — summary sent, veto modal opened inline in bot, task selected, "וטו שבועי נרשם! את פטורה מ..." confirmation (female-gendered) ✅
- Resident removal: `request_resident_removal` gender-inflected message+buttons per recipient; `reject_removal` gender-inflected ("דחה"/"דחתה"); `approve_removal` sends gender-inflected removal confirmation; both functions now release fixed tasks, vetos, and open claims on removal ✅
- History page (`/history`): `get_weekly_history` + `get_monthly_history` updated — added `is_former boolean`, `gender text` to return types; ex-residents shown with "(עזב/ה)" tag; current week filtered out (shown only in dashboard); current month filtered out (only completed months shown); sort order based on message-send time (weekly: week_start+7d, monthly: first of next month) so cross-month weeks appear above monthly summary, monthly above pure-month weeks ✅
- Fixed task request: `request_fixed_task` fixed — gender-inflected message+buttons per recipient ("אתה מאשר?"/"את מאשרת?", "מאשר"/"מאשרת", "מתנגד"/"מתנגדת") ✅
- Fixed task approval → requester gets "✅ [task] היא עכשיו המשימה הקבועה שלך, לנצח!" (female-inflected) ✅
- Fixed task rejection → requester gets "❌ הבקשה שלך לקחת את [task] כמשימה קבועה נדחתה על ידי [name]" ✅
- `releaseFixed` in tasks page: fixed to call `release_fixed_task` RPC instead of direct `tasks` update (ensures `is_fixed` flag reset) ✅
- `request_uncomplete_task`: updated to include slot label in task name ("אוכל לרובי (בוקר)" etc.) for multiple_daily tasks ✅
- Uncomplete points: `uncomplete_task` deletes score row (`delete from scores where task_instance_id = p_instance_id`) — verified correct ✅
- `overnight_complete`: fixed — added `is_done = true` to UPDATE; added `month`/`year` to scores INSERT (were missing → insert failed silently) ✅
- `overnight_overdue`: fixed — removed broken `ON CONFLICT (task_id, due_date, slot)` (no such constraint); replaced with explicit SELECT + UPDATE/INSERT logic; daily/multiple_daily: only forfeit old instance (fresh one already exists); non-daily: set ×1.5 + original overdue_from on today's instance ✅
- `send_overnight_check`: fixed — added `JOIN profiles p ON p.id = ti.claimed_by` + `AND p.apartment_id = p_apartment_id` guard to prevent sending messages to ex-residents ✅
- `ensure_today_instances`: major rewrite — (1) daily/multiple_daily: always fresh, no rollover; (2) non-daily on scheduled day: delete overdue carry-over + insert fresh; (3) non-daily not on scheduled day: rollover undone unclaimed instances to today with original overdue_from + ×1.5; (4) biweekly/every_x_days/monthly NOT EXISTS check now only counts completed/forfeited instances (not pending overdue) so next occurrence correctly resets; order: INSERT scheduled → INSERT rollover → DELETE old → UPDATE overdue_from ✅

### ⚠️ Tested features — shared→solo cycle (10/04/2026)
- Resident removal: confirm modal added (gender-inflected "בטוחה/בטוח", "כן, הסירי/הסר") ✅
- Remove modal: 2-resident warning text shown in red ✅
- `approve_removal` updated: calls `ask_going_solo` automatically when 1 resident remains ✅
- `send_transition_shared_to_solo` received after going solo ✅
- "חזרתי הביתה" button: stays disabled after click (no double-fire) ✅

⚠️ **לבדוק אחרי הזמנת דייר חדש:** הסרה + `ask_going_solo` בוט + אישור + `send_transition_shared_to_solo`

### ⚠️ Tested features — solo mode (10/04/2026)
- Dashboard in solo: no weekly scores, no ×1.5 badge, no veto, no forfeit to others ✅
- "אני על זה" → "קבע/י תזכורת 🔔" (gender-inflected) in solo ✅
- "לקחתי על עצמי" hidden in solo ✅
- Multi-daily slots in solo: "קבע/י תזכורת 🔔" → opens reminder modal → shows "סמן כבוצע ✓" + "דחה" + "קבע/י תזכורת 🔔" after claiming ✅
- Claim modal confirm button: "קבע/י תזכורת ✓" in solo ✅
- `send_nightly_reminder` in solo: sends message for unclaimed tasks too (not only claimed-not-done) ✅

### ⚠️ Tested features — solo mode (14/04/2026)
- Laundry flow in solo: machine activate → hang task appears unlocked for claiming ✅
- `send_laundry_reminder` solo version: "תזכורות" instead of "בקשות", correct button ✅
- Bot daily messages in solo (morning nudge, 14:00, 17:00, 22:00): gender-inflected, correct solo copy ✅
- `check_solo_grace_expiry`: mode → solo + `grace_until` cleared + `send_transition_shared_to_solo` sent ✅
- `ask_going_solo`: updated message "הדירה הדיגיטלית שלנו הופכת לטיסת סולו?" ✅
- `will_invite` button: sends `send_will_invite_explanation` bot message with invite instructions + "הזמן/י עכשיו ⚙️" → dashboard ✅
- `nightly_sleep` (22:00): now calls `nightly_sleep_my_tasks()` — multi: −0.5 per task + ×1.5 tomorrow; solo: tasks move to tomorrow ×1, no penalty ✅
- `send_nightly_mine_task_list`: updated — solo shows ALL open tasks (not just claimed); includes multiple_daily tasks with slot label ✅
- `send_nightly_reminder`: task lists use double newline between items; unclaimed buttons: "תן לי לסמן" → dashboard + "שיעבור למחר מבחינתי" → noop ✅
- `send_overnight_check`: only fires for instances not already forfeited via nightly_sleep ✅
- Laundry emoji: 🧺 everywhere (was 🌊/🫧); dryer remains 🌀 ✅
- BottomNav bot button: image instead of 🤖 emoji; "הנודניק" label; opacity-60 when inactive ✅
- Bot page header: HaNudnik Character image instead of 🤖 emoji ✅
- Laundry machine dismiss: confirm dialog before cancelling ✅
- Laundry task lock: only "סמן כבוצע" locked while machine runs; claiming always available ✅
- Laundry hang path: wash → תלייה → קיפול נוצר למחר ✅
- Bot unread badge: fixed — when already on bot page, new messages marked read instantly via CustomEvent ✅
- Future away (🧳): schedule trip, edit date, cancel ✅
- Solo → shared transition: new resident joins via invite → `notify_solo_to_shared` called correctly, mode = shared ✅
- Bug fix: `notify_solo_to_shared` now updates `apartments.mode = 'shared'` inside SECURITY DEFINER function (was failing silently via RLS)
- Bug fix: `joinApartment` reads apartment mode after updating profile (not before) — avoids RLS blocking the read
- Bug fix: bot page limit raised 100 → 200 messages
- Multiple daily in shared mode: both residents claim different slots, reminder modal opens for all ✅; `add_task` fixed to include `created_by = auth.uid()` ✅
- Realtime added: bills page (bills + bill_types tables), tasks page, laundry page (requests + machine + history), dashboard (laundry_machine banner), calendar (events + invitees) ✅
- Bills: unmark payment now shows confirmation modal (was calling directly) ✅
- Laundry cancel machine: new `cancel_laundry_machine()` RPC — deletes next-stage task instances, optionally restores requests from history, deletes history record, deletes machine row ✅
- Calendar invite notifications: moved to `send_calendar_invite_notifications()` SECURITY DEFINER (client-side insert was blocked by RLS) ✅
- Calendar edit: newly added invitees get bot message with updated title ✅
- Bug fix: invite join — `inviteCode.replace(/\s+/g, '')` instead of `.trim()` — fixes "קישור לא תקין" when copy-pasted invite code has extra spaces or newlines ✅
- Splash screen: `page.tsx` shows `#BBBBF7` background + HaNudnik Logo for min 1.5s (auth check runs in parallel); `manifest.json` background_color updated to match ✅
- Auth page: HaNudnik character image added above title ✅
- `ask_apartment_type`: fixed message format — `!` after name + `E'\n'` before body text ✅
- `send_onboarding_message_solo`: fixed `|| chr(10) ||` appearing as literal text inside string — replaced with `E'\n'` ✅
- Chat history cleared on join: `joinApartment` now deletes `bot_messages` for the user before joining a new apartment ✅
- Service worker: `SwRegister` component — registers `/sw.js`, auto-reloads on `controllerchange`, calls `reg.update()` on `visibilitychange`/`focus` to detect new deploys automatically ✅
- Scroll fix: removed `pb-16` from `body` in layout; added `h-16` spacer div inside `BottomNav` (only renders when nav is visible) — eliminates unnecessary scroll on auth/setup/splash screens ✅

### In Progress / Next (priority order)

**בדיקות לפני דיפלויד:**
1. **[BUG] סימון הודעות בבוט כנקראות** — תוקן: bot מסמן is_read=true + שולח CustomEvent לחלון; BottomNav מאזין ומאפס את הבאדג' ✅
2. **שלב ד — הזמנה ומעבר מסולו למולטי** — יצירת קישור + הצטרפות דייר חדש → mode חוזר ל-shared ✅
3. **Leave apartment** — עזיבה עצמית: לחיצה על "עזוב דירה" → `leave_apartment()` RPC → משימות/וטואים/תביעות משתחררות → הודעת "אוי לא" + `ask_going_solo` לנשארים ✅
4. **Future away flow** — תזמון 🧳, עריכת תאריך, ביטול ✅ (crons בדיקה אחרי דיפלויד)
5. **Laundry hang path** — wash → תלייה → קיפול נוצר למחר (בניגוד ל-dry שנוצר היום) ✅
6. **Laundry history** — עובד ✅
7. **Multiple daily בשיתוף** — claiming slots ע"י 2 דיירים שונים ✅
8. **notify_resident_joined** — מורן מקבלת הודעה כשעידן מצטרף לדירה שכבר מולטי ✅
9. **לפני דיפלויד:**
   - **תיקון כל ה— ל-** בכל הודעות הבוט + UI ✅ (SQL functions + קבצי tsx)
   - מחיקת test users + דירה ישנה ✅
   - `create_apartment` תוקן — הוסף `created_by = auth.uid()` לכל המטלות ✅

**דיפלויד:**
10. **Vercel deployment** — האפליקציה באוויר ב-`hanudnik.vercel.app` ✅
    - Crons הועברו מ-Vercel ל-Supabase pg_cron (Vercel Hobby מגביל ל-cron אחד ביום)
    - PWA install: הוספה למסך הבית דרך כרום → "הוסף למסך הבית" ✅

**בדיקות אחרי דיפלויד:**
11. **פוש אנדרואיד** — הודעה מגיעה ✅; badge icon מותאם (monochrome) ✅; לחיצה פותחת בוט ✅; כפתורי פעולה — לא נבדק עדיין
12. **Calendar reminders cron** — `send_calendar_reminders` תוקנה (כפתור go_calendar + related_id) + נוספה ל-pg_cron ✅; נבדק ידנית ✅
13. **Crons ב-Supabase pg_cron** — כל ה-crons נוספו ✅: `auto_activate_future_away`, `auto_return_from_away`, `ensure_today_instances`, `schedule_morning_nudges_for_all`, `process_scheduled_messages` (כל 15 דקות), overnight 07:00, inactivity+bills+calendar 09:00, 14:00, 17:00, laundry 19:00, nightly 22:00, weekly (שישי), monthly (1 לחודש)
14. **App download link** — נוסף לקישור ההזמנה: `https://hanudnik.vercel.app` ✅

**Push notifications — מומש ✅ (15/04/2026):**
- VAPID keys נוצרו + נשמרו ב-Vercel + Supabase Edge Function secrets
- טבלת `push_subscriptions` (user_id, endpoint, p256dh, auth, platform)
- Edge Function `send-push` — מופעלת ב-Database Webhook על INSERT ב-bot_messages
- SW: push handler + notificationclick (פותח /bot); badge icon monochrome
- Client: `PushSubscribe` component בדף הבוט — בכל כניסה בודק `pushManager.getSubscription()` ושומר לDB (ללא localStorage flag)
- נבדק ✅ — פוש מגיע לאנדרואיד; לחיצה פותחת /bot
- אוטומטי (crons) — נבדק ✅ (16/04/2026); `schedule-morning-nudges` תוקן מ-00:00 ל-07:00 ישראל (04:00 UTC)

**כפתורי action בפוש (16/04/2026) ✅:**
- כפתור action בהתראה → פותח `/bot?action=X&msg=Y` → בוט מבצע את הaction אוטומטית
- בוט: `useSearchParams` קורא params + `useEffect` מפעיל `handleAction` בטעינה
- גילוי: Chrome אנדרואיד עם `dir:rtl` מציג כפתורים בסדר הפוך ויזואלית אבל `event.action` מתאים לסדר המערך → חוסר התאמה. פתרון: הסרת `dir:rtl` מאפשרויות ההתראה ✅
- מגבלה: כפתור אחד בהתראה (הראשון ברשימה); שאר הכפתורים זמינים בתוך הבוט

**תיקונים (16/04/2026):**
- Calendar: הוסף dialog אישור לפני מחיקת אירוע (מגדרי) ✅
- `complete_task` RPC: מסמן `done_at = now()` (לא `is_done`) — זה הfield שקובע אם המשימה בוצעה ✅
- `schedule-morning-nudges` cron: תוקן ל-`0 4 * * *` (07:00 ישראל) ✅
- `schedule_morning_nudges_for_all`: תוקן לשמש timezone ישראל — `(current_date + '8 hours') AT TIME ZONE 'Asia/Jerusalem'`; לפני התיקון הנאדניק הגיע ב-11:00 ✅
- `schedule_task_reminder`: נוצרה פונקציה חסרה — מאפשרת תזכורות למטלות לעבוד ✅
- Dashboard הושלמו: מוזגו `doneTasks` ו-`doneSlots` לרשימה אחת ממוינת לפי `done_at` ✅
- `send_nightly_reminder`: תוקן CASE של slot — נוסף `when 'night' then 'לילה'`; לפני כן slot=night הציג "night" באנגלית ✅

**תיקונים ממתינים:**
- האפליקציה זורקת משתמשים החוצה לפעמים — מתאפס אחרי רענון/כניסה מחדש; צריך לבדוק מה גורם לריסט הsession
- מסך splash בטלפון לא מציג את שם האפליקציה — `HaNudnik Logo.png` נטען אך הטקסט לא נראה; ייתכן שאנדרואיד מציג splash משלו (מ-icon-512.png) לפני שהדף נטען

### לוז בדיקות — מחזור הוצאת/הזמנת דיירים
יש לבצע ברצף על דירת הטסט (בסדר הזה):

**שלב א — הוצאת דיירים (shared → נשאר דייר אחד)**
- הוצאת דייר → `notify_resident_left` נשלחת לשאר (לא לעוזב)
- אם נשאר דייר יחיד → בוט שולח `ask_going_solo` עם כפתורים
- משימות קבועות של העוזב משתחררות
- נקודות נשמרות

**שלב ב — מעבר ממולטי לסולו**
- לחיצה על "דירת יחיד 🏠" → `confirm_going_solo`
- `apartments.mode` הופך ל-`solo`
- בדיקה: הדשבורד מתנהג כמו סולו (אין ×1.5, אין ויתור לאחרים)

**שלב ג — בדיקות בסולו (לא חופפות למולטי)**
- לוח כביסה — flow סולו (ללא בקשות מדיירים אחרים)
- `send_laundry_reminder` בסולו — כפתור "וואי תזכיר לי לכבס"
- `send_nightly_reminder` בסולו — הודעה אחרת (אין "unclaimed" לאחרים)
- `check_solo_grace_expiry` — path של דייר יחיד שנשאר (mode → solo)
- bot: הודעות מגדריות בסולו

**שלב ד — הזמנת דיירים ומעבר מסולו למולטי**
- יצירת קישור הזמנה
- הצטרפות דייר חדש → `notify_resident_joined` נשלחת
- `apartments.mode` חוזר ל-`shared`, `grace_until` מתאפס
- בדיקה: הדשבורד חזר למצב מולטי (ויתור, ×1.5, רשימת דיירים)

---

## Technical Notes

- **Auth:** Supabase Auth (email + password — no phone field)
- **Database:** Supabase Postgres
- **File storage:** Product images stored as **URLs only** (no upload to Supabase Storage) — fetched via SerpAPI and saved as URL strings in the DB
- **Realtime:** Supabase Realtime (shopping list, bot awareness)
- **Push notifications:** Web Push API via service worker
- **Push replacement:** Web Push `tag` field to replace unread notifications
- **Image search:** SerpAPI (Google Images) — free tier: 100 searches/month; Israeli supermarket sites configured as priority sources; images stored as URLs (no upload)
- **Hosting:** Vercel
- **Frontend:** Next.js + React
- **PWA:** Service worker, installable, offline-capable where relevant
- **Bot UI:** Button-only responses — no free-text input (zero API cost)
- **`send_bot_message` canonical signature (7 params):** `(user_id uuid, apt_id uuid, message text, buttons jsonb, triggered_by text, related_id uuid, ios_message text)` — `buttons` is 4th, `triggered_by` is 5th. All callers (SQL functions) must use this order.
- **`vetos` table:** unique constraint on `(user_id, apartment_id, week_start)` — required for `ON CONFLICT` upsert in `set_veto()`
