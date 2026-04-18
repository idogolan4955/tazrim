# תזרים — מערכת ניהול תזרים מזומנים

מערכת Next.js לניהול תזרים עסקי: חשבונות בנק, הוצאות חוזרות, שיקים דחויים, הלוואות שפיצר, רכש חזוי ומאזן.

## סטאק

- Next.js 15 (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- NextAuth (Credentials) עם תפקידי `ADMIN` / `PARTNER`
- Recharts לגרפים
- פריסה ל־Render דרך `render.yaml`

## תפקידי משתמשים

- **ADMIN** — גישה מלאה לכל הדפים וה־API.
- **PARTNER** — גישה רק לדף הראשי (סקירה ומאזן), ללא עריכה.

## פיתוח מקומי

```bash
cp .env.example .env
# עדכן DATABASE_URL ו־NEXTAUTH_SECRET

npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

פתח http://localhost:3000 והתחבר עם פרטי המשתמשים מ־`.env`.

## פריסה ל־Render

1. דחוף את הריפו ל־GitHub.
2. ב־Render: "New" → "Blueprint" → בחר את הריפו.
3. Render יקרא את `render.yaml` ויקים DB + Web Service.
4. לאחר היצירה, הגדר את ה־`NEXTAUTH_URL` לכתובת האפליקציה, ואת ה־ADMIN_EMAIL / ADMIN_PASSWORD / PARTNER_EMAIL / PARTNER_PASSWORD.
5. לאחר הדיפלוי הראשון, הרץ את ה־seed:
   - `render shell tazrim-web`
   - `npm run db:seed`

## ריבית בנק ישראל

הריבית נמשכת בניסיון ראשון מה־API של בנק ישראל (`edge.boi.gov.il`). אם הבקשה נכשלת — נשלוף מהמטמון (`Setting` table), ולאחרונה — מ־`BOI_BASE_RATE_FALLBACK`. ניתן לעדכן ידנית בעמוד "הלוואות".

פריים = BOI + 1.5%.

## עמודי המערכת

- `/` — סקירה כלכלית: יתרה נוכחית ותחזית 1/3/6/12 חודשים + גרף תזרים מאוחד + מאזן מקוצר.
- `/accounts` — חשבונות בנק (CRUD).
- `/accounts/[id]` — עמוד חשבון: עדכון יתרת פתיחה + תנועות.
- `/recurring` — פעולות חוזרות (הלוואות, שכר, ספקים...).
- `/future` — שיקים דחויים / נכיון / לפירעון + תחזיות סליקה חד־פעמיות.
- `/loans` — הלוואות שפיצר, פריים חי, חישוב החזר חודשי אוטומטי, יצירת פעולה חוזרת אוטומטית.
- `/purchasing` — הזנת מכירות חודשיות → תקציב רכש חזוי.
- `/status` — מאזן עסקי מפורט + מלאי + כרטסת לקוחות.
