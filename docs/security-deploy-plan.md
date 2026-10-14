# AURORA — production deploy va JWT rotatsiya rejasi

Tayyorlangan: 2026-10-14. Holat: hech narsa deploy qilinmagan, hech narsa commit qilinmagan. Har bir qadamni Kevin tasdiqlaydi va bajaradi.

Hech qachon chatga, logga yoki shu faylga yozilmaydigan narsalar: `SECRET_TOKEN`, Mongo URI'lar, Stripe kalitlari, webhook secret, Cloudinary kalitlari.

## 0. Nima deploy qilinadi

**Backend** — `~/Desktop/AURORA`, branch `security/graphql-upload-remediation` (commit qilinmagan, oldingi audit o'zgarishlari ham shu ish nusxasida):

| ID | O'zgarish | Deployga ta'siri |
|---|---|---|
| A1 | JWT `SECRET_TOKEN` bilan imzolanadi (`registerAsync`) | `SECRET_TOKEN` bo'lmasa API ishga tushmaydi |
| A3 | Login: nickname bo'yicha 10 xato / 15 daqiqa | Xotirada, restartda nolga tushadi |
| A4 | Production'da introspection va playground o'chiq | Faqat `NODE_ENV=production` bo'lsa ishlaydi |
| A9, A20, A21 | Xavfsizlik headerlari, shutdown hooks, 404/400 kodlari | — |
| A12 | `graphql-upload` 13 → 15.0.2 (busboy 1.x, `dicer` yo'q). Multipart tana faqat token tekshirilgandan keyin o'qiladi | Upload API o'zgarmagan |
| A18 | `lodash`, `multer` overrides | — |
| D3 | Indekslar: `comments_moderation_idx`, `booking_admin_list_idx`, `agents_member_history_idx` | 3-bo'lim |

**Frontend:**
- `~/Desktop/aurora-next` (`master`, commit qilinmagan): xavfsizlik headerlari, image optimizer o'chiq, i18n va boshqa o'zgarishlar.
- `~/Desktop/aurora-next-security` (git worktree, branch `security/next-16-swiper-14`): Next 16.4.0, Swiper 14.3.0, `swiper/modules` importlari, eski `libs/types/swiper.d.ts` o'chirilgan, `tsconfig.json` (`jsx: react-jsx`). `master`dagi homepage fayllari bilan merge'da konflikt bo'lishi mumkin: o'zgarish faqat 5 ta import qatori.

## 1. To'xtatuvchi shartlar (bular hal bo'lmaguncha deploy yo'q)

1. **Live API qaysi DB'ga yozadi?** Kod (`apps/aurora-api/src/database/database.module.ts`): `NODE_ENV=production` bo'lsa `MONGO_PROD` (`AURORA`), aks holda `MONGO_DEV` (`AURORA_DEV`).
   Oldingi tekshiruvda live'da introspection ochiq edi, ya'ni `NODE_ENV` production emas. Demak live hozir `AURORA_DEV`ga yozayotgan bo'lishi mumkin. Bu tasdiqlanmagan gipoteza.
   - Serverda (SSH, backend papkasida) faqat kalit nomlari va DB nomlarini ko'ring. Qiymatlarni hech kimga yubormang:
     ```bash
     grep -o '^[A-Z_]*=' .env                                                     # qaysi kalitlar bor (qiymatsiz)
     grep -E '^MONGO_(PROD|DEV)=' .env | sed -E 's#=.*/([^/?]+)(\?.*)?$#: \1#'    # faqat DB nomlari
     pm2 ls && pm2 env <id> | grep '^NODE_ENV'                                    # ishlayotgan jarayonning NODE_ENV qiymati
     pm2 show <id>                                                                # qaysi buyruq/skript bilan ishga tushirilgan
     ```
     `npm run start:prod` `NODE_ENV=production`ni o'zi qo'yadi. Live jarayon boshqa buyruq bilan ishga tushirilgan bo'lsa, u `MONGO_DEV`dan foydalanadi.
   - Agar live = `AURORA_DEV` bo'lsa, `NODE_ENV=production` qo'yish live'ni `AURORA`ga o'tkazadi (eskiroq ma'lumot, yangi foydalanuvchilar "yo'qoladi"). Bitta variantni tanlang:
     (a) `MONGO_PROD`ni hozirgi live DB'ga yo'naltirish;
     (b) avval `AURORA_DEV` → `AURORA` ko'chirish (backupdan keyin), keyin almashtirish.
2. **`SECRET_TOKEN`** serverdagi `.env`da (yoki PM2 env'da) bor va kuchli (kamida 32 tasodifiy bayt). Yangi kod usiz ishga tushmaydi (ataylab shunday qilingan).
   **A1 hozir live'da bormi?** O'z tokeningiz bilan, hech qayerga yubormasdan, lokal kompyuterda tekshiring. Tokenni chatga yozmang:
   ```bash
   read -s TOKEN   # production saytdagi o'z accessToken'ingiz: DevTools → Application → Local Storage → accessToken
   TOKEN="$TOKEN" node -e "const [h,p,s]=process.env.TOKEN.split('.');const c=require('crypto').createHmac('sha256','undefined').update(h+'.'+p).digest('base64url');console.log(c===s?'KRITIK: token \"undefined\" kaliti bilan imzolangan':'token \"undefined\" bilan imzolanmagan')"; unset TOKEN
   ```
   `KRITIK` chiqsa, har kim istalgan foydalanuvchi, jumladan admin nomidan token yasay oladi. Unda A1 deployi birinchi navbatda qilinadi va admin harakatlari ko'rib chiqiladi. Sabab: `.env`ni `ConfigModule` modullar import qilingandan keyin o'qiydi, eski kod esa kalitni import paytida o'qigan.
3. **Node versiyasi:** backend lokal Node 20.20.2 da sinovdan o'tgan. Frontend Next 16 uchun build va runtime Node ≥ 20.9 bo'lishi shart.
4. **Stripe:** live'da qaysi kalit ishlatilishi (live/test) va `STRIPE_WEBHOOK_SECRET` live endpoint'ga mosligi.
5. **CORS:** `CORS_ALLOWED_ORIGIN` production frontend domenini o'z ichiga olishi.

## 2. Zaxira (backup)

1. Atlas: live DB uchun on-demand snapshot (Cluster → Backup → Take Snapshot), yoki terminalda (URI'ni chatga emas, terminalga yozing):
   ```bash
   mongodump --uri "$LIVE_URI" --db <LIVE_DB> --out ./backup-$(date +%F)
   ```
2. Zaxirani tekshirish: boshqa nomli bazaga tiklash va kolleksiyalar sonini solishtirish.
   ```bash
   mongorestore --uri "$LIVE_URI" --nsFrom '<LIVE_DB>.*' --nsTo 'RESTORE_CHECK.*' ./backup-<sana>
   ```
   Tekshiruvdan keyin `RESTORE_CHECK`ni o'chiring.
3. Server (rollback uchun): hozirgi commit'ni yozib qo'ying (`git rev-parse HEAD`), build va env nusxasini saqlang: `cp -r dist dist.bak-$(date +%F)`, `cp .env .env.bak-$(date +%F) && chmod 600 .env.bak-*`. Frontend build'ini ham xuddi shunday saqlang.
4. Eski env qiymatlarini (ayniqsa eski `SECRET_TOKEN`ni) parol menejerida saqlang. Faqat rollback uchun kerak.

## 3. Indekslar (live yozuvlarni to'xtatmaydi)

Live DB'da `mongosh` orqali, bittadan:
```js
db.comments.createIndex({ commentStatus: 1, createdAt: -1, _id: -1 }, { name: 'comments_moderation_idx' })
db.bookings.createIndex({ createdAt: -1, _id: -1 }, { name: 'booking_admin_list_idx' })
db.agents.createIndex({ memberId: 1, createdAt: -1 }, { name: 'agents_member_history_idx' })
```
Tekshirish: `db.<kolleksiya>.getIndexes()`. Bekor qilish: `db.<kolleksiya>.dropIndex('<nom>')`.

## 4. JWT rotatsiya

1. Yangi secret: `openssl rand -base64 48`. Natijani faqat serverdagi `.env`ga (yoki PM2 env'ga) yozing: chatga, repo'ga yoki logga emas.
2. Ta'siri: barcha mavjud tokenlar bekor bo'ladi va hamma qayta login qiladi. Frontend `UNAUTHENTICATED` kelganda sessiyani tozalab "session expired" ko'rsatadi. Bu oqim upload gate'da ham saqlangan.
3. Live'dagi eski kodda A1 xatosi bo'lsa, tokenlar `"undefined"` kaliti bilan imzolangan. Ya'ni har kim istalgan foydalanuvchi uchun token yasay olgan. Shuning uchun A1 deploy va rotatsiya **bir oynada** qilinadi.
4. Tekshiruv: rotatsiyadan oldingi token bilan so'rov `UNAUTHENTICATED` qaytaradi (6-bo'lim).

## 5. Deploy tartibi

1. Qisqa texnik tanaffusni e'lon qiling (hamma qayta login qiladi).
2. Backup va uning tekshiruvi (2-bo'lim).
3. Serverdagi `.env`: 1-bo'limdagi DB qarori va yangi `SECRET_TOKEN`. Jarayon `NODE_ENV=production` bilan ishga tushadi (`npm run start:prod` yoki PM2 env'ida).
4. Backend deploy (commitlardan keyin): kodni yangilash, `npm ci && npm run build`, keyin `pm2 restart <app> --update-env`. Logda kutiladi: `API DB: <kutilgan DB nomi>` va `Nest application successfully started` (`pm2 logs <app>`). DB nomi kutilgandek bo'lmasa, darhol rollback.
5. Backend smoke test (6-bo'lim).
6. Frontend `master` deploy. Next 16 branch'ni alohida oynada, merge va QA'dan keyin deploy qiling.
7. Frontend smoke test.

## 6. Smoke testlar (production, test akkaunt bilan, to'lov qilinmaydi)

```bash
API=https://<live-api-domeni>/graphql
# 1) API tirik
curl -s -X POST "$API" -H 'Content-Type: application/json' -d '{"query":"{__typename}"}'
# kutiladi: {"data":{"__typename":"Query"}}

# 2) Introspection production'da yopiq (A4)
curl -s -X POST "$API" -H 'Content-Type: application/json' -d '{"query":"{__schema{queryType{name}}}"}'
# kutiladi: xato (introspection is not allowed)

# 3) Headerlar (A9)
curl -sI -X POST "$API" | grep -i -E 'x-content-type-options|x-frame-options|referrer-policy|x-powered-by'
# kutiladi: nosniff, DENY, no-referrer; x-powered-by yo'q

# 4) Anonim multipart parse'gacha rad etiladi (A12). tiny.png — har qanday kichik PNG
curl -s -H 'Apollo-Require-Preflight: true' \
  -F 'operations={"query":"mutation($file: Upload!, $target: String!){ imageUploader(file:$file, target:$target) }","variables":{"file":null,"target":"member"}}' \
  -F 'map={"0":["variables.file"]}' -F '0=@tiny.png;type=image/png' "$API"
# kutiladi: UNAUTHENTICATED, "Bearer token is not provided!"
```

Qo'lda tekshiriladiganlar:
- Test akkaunt bilan login ishlaydi. Rotatsiyadan oldingi token bilan so'rov `UNAUTHENTICATED` qaytaradi.
- Frontend: bosh sahifa va karusellar, `NEXT_LOCALE=ko` cookie bilan `/` → `/ko` redirect, login, mehmonxona sahifasi, checkout sahifasi ochilishi (to'lovsiz), chat ulanishi.
- Stripe Dashboard → Webhooks: deploydan keyingi yetkazishlar 2xx.

## 7. Rollback

Qachon: API ishga tushmasa, logda noto'g'ri DB nomi chiqsa, 5xx keskin ko'paysa, login umuman ishlamasa.

1. Oldingi build'ga qayting: `rm -rf dist && mv dist.bak-<sana> dist` (yoki oldingi commit'ni checkout qilib build qiling), `.env`ni `.env.bak-<sana>`dan tiklang, keyin `pm2 restart <app> --update-env`.
2. Env'ni avvalgi holatiga qaytaring (DB qarori, `NODE_ENV`). Eski `SECRET_TOKEN` faqat eski kod bilan kerak.
3. Eski kodga qaytish A1 zaifligini ham qaytaradi. Rollback vaqtinchalik bo'lsin va sababi tuzatilgach qayta deploy qilinsin.
4. Indekslarni olib tashlash shart emas, lekin kerak bo'lsa `dropIndex` bilan qilinadi. Bu deployda ma'lumot skriptlari ishlamaydi, shuning uchun DB restore faqat kutilmagan holatda (2-bo'limdagi zaxiradan).

## 8. Deploydan keyin (alohida qarorlar)

- Hisoblagichlar: `node scripts/aurora-recount-counters.cjs scan dev|prod` (faqat o'qiydi). `apply` faqat backupdan keyin.
- F6: `scripts/aurora-stay-dates.cjs`.
- $930 PENDING orphan to'lov: avval holatini o'qing — `node scripts/aurora-orphan-payments.cjs prod` va `... dev` (faqat o'qiydi, Stripe'ga faqat GET). `.env`dagi kalit TEST bo'lsa, LIVE to'lovni ko'rmaydi: "not found" hech narsani isbotlamaydi. Qaror (bekor qilish yoki refund) Stripe Dashboard'da, holatni ko'rgandan keyin, qo'lda qilinadi.
- Next 16'da `middleware.ts` ishlaydi, lekin deprecated. Keyinroq `proxy.ts`ga ko'chirish kerak.
