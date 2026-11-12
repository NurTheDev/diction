# অ্যাডমিন ড্যাশবোর্ডে লগ ইন / Admin dashboard login

**এই workspace-এর বর্তমান প্রিভিউ ডাটাবেসের সঙ্গে সংযুক্ত নয়।** এখানে কোনো default admin email বা password নেই। নিরাপত্তার জন্য ডেমো password বা সবার জন্য খোলা admin access তৈরি করা হয়নি। `/bn/login`-এ যে সেবা বন্ধের বার্তা দেখায়, সেটি এই অপরিবর্তিত service-free preview-এর প্রত্যাশিত অবস্থা। `/bn/admin-preview` শুধু নকশার প্রিভিউ; লগ ইন বা বাস্তব CMS নয়।

## নিজস্ব test environment-এ অ্যাডমিন চালু করুন

1. ডাউনলোড করা ZIP খুলে `ATLAS-SETUP.md` অনুসরণ করুন। Node.js 22.13 বা নতুন সংস্করণ ব্যবহার করুন এবং **আলাদা test Atlas cluster** নিন। বাস্তব তথ্য ব্যবহারের আগে `DEPLOYMENT.md` পড়ুন।
2. Project folder-এ `npm ci` চালান। `.env.example` থেকে `.env.local` তৈরি করুন। আপনার নিজের কম্পিউটারে নিরাপদভাবে এই মানগুলো বসান:
   - `MONGODB_URI`: Atlas connection string; অ্যাপ `dictioncoaching` database ব্যবহার করে।
   - `NEXTAUTH_SECRET`: অন্তত ৩২ অক্ষরের ইউনিক secret।
   - `NEXTAUTH_URL` ও `AUTH_URL`: একই origin, local ব্যবহারে `http://localhost:3000`।
   - `SEED_ADMIN_EMAIL`: আপনি নিজের জন্য যে admin email বেছে নেবেন।
   - `SEED_ADMIN_PASSWORD`: আপনার বেছে নেওয়া শক্তিশালী password; অন্তত ১২ অক্ষর এবং সর্বোচ্চ ৭২ UTF-8 bytes।
   - `DATA_COLLECTION_ENABLED=false` রাখুন যতক্ষণ না প্রয়োজনীয় গোপনীয়তা ও নিরাপত্তা পর্যালোচনা সম্পন্ন হচ্ছে। এই flag সব admin mutation বন্ধ করে না।
3. `npm run atlas:check` চালিয়ে read-only connection পরীক্ষা করুন। এই পরীক্ষা write বা transaction যাচাই করে না।
4. ব্যাকআপ নিন, সঠিক **test cluster** নিশ্চিত করুন; এরপর initial seed চালান। এই ধাপে ডাটাবেসে লেখা হয়:

```bash
node --env-file=.env.local --import tsx scripts/seed.ts
npm run dev
```

5. Browser-এ `http://localhost:3000/bn/login` খুলুন। `.env.local`-এর `SEED_ADMIN_EMAIL` এবং `SEED_ADMIN_PASSWORD` দিয়ে লগ ইন করুন। সফল লগ ইন আপনাকে `/bn/admin`-এ পাঠাবে। এটি কেবল প্রথমবার account তৈরি হওয়ার ক্ষেত্রে প্রযোজ্য; একই email-এর account আগে থেকে থাকলে seed password বদলায় না।
6. শিক্ষক, শিক্ষার্থী ও অভিভাবকের জন্য admin workspace-এ আলাদা account তৈরি করতে হবে; সেই account-গুলো নিজ নিজ portal-এ যায়। আসল ব্যবহারকারীদের credential নিরাপদ মাধ্যমে দিন।

`PREVIEW_WITHOUT_SERVICES=1` ব্যবহার করে চালানো server-এ লগ ইন চালু হবে না, এমনকি `.env.local` তৈরি করলেও; সেটি বাদ দিয়ে server পুনরায় চালু করুন। Deployment-এ Vercel environment variables-এ secrets ব্যক্তিগতভাবে দিন এবং উভয় URL নিজের HTTPS origin-এ সেট করুন। Connection string বা password চ্যাটে দেবেন না।

## ভর্তি ফর্ম কেন বন্ধ?

Admission, trial booking এবং contact collection চালু করতে বৈধ server configuration ও `DATA_COLLECTION_ENABLED=true` লাগে। **এখনই এটি চালু করবেন না**: privacy/terms, offline guardian-consent verification, retention procedures, নিরাপত্তা ও বাস্তব integration পর্যালোচনা এখনো অসম্পূর্ণ। পরীক্ষার জন্য পৃথক database ও কাল্পনিক তথ্য ব্যবহার করুন। এই setting বাস্তব লগ ইন চালুর জন্য আবশ্যক নয়।

---

## English summary

The current preview has no connected database and no default admin password. To sign in, privately configure a separate test Atlas cluster and the core environment variables in `.env.local`; set your own `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; run the seed command above; start the server **without** `PREVIEW_WITHOUT_SERVICES=1`; and visit `/bn/login`. Existing account passwords are never reset by re-running the seed. Do not share credentials in chat. Admissions remain disabled until the privacy, consent, retention, security and deployment requirements are reviewed. See `ATLAS-SETUP.md`, `PRIVACY-DRAFT.md` and `DEPLOYMENT.md`.

## ড্যাশবোর্ড ব্যবহার

- **Trial slots:** Admin → Trial slots-এ শ্রেণি, বিষয় ও আসন দিন। শুরুর তারিখ, শুরুর সময়, শেষের তারিখ ও শেষের সময় বাংলাদেশ সময়ে দিন; শুরু ভবিষ্যতে এবং শেষ তার পরে হতে হবে। একই শ্রেণি ও বিষয়ের একই সময়ে দ্বিতীয় স্লট হবে না। ক্যালেন্ডার বন্ধ হওয়া আপনার ব্রাউজারের নিয়ন্ত্রণে।
- **Teacher ও batch:** Academics-এর account ফর্মে শিক্ষক নির্বাচন করে সম্মতিপ্রাপ্ত শিক্ষকের নাম, ইমেইল ও অন্তত ১২ অক্ষরের পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করুন। তারপর নিচে batch ফর্মে সেই অ্যাকাউন্ট নির্বাচন করুন। ওয়েবসাইটের faculty পরিচিতি এবং শিক্ষক লগইন অ্যাকাউন্ট আলাদা। পাসওয়ার্ড নিরাপদ উপায়ে দিন ও পরিবর্তন করতে বলুন।
- **ছবি:** faculty, লেখা/গ্যালারি, homepage banner ও settings-এ সরাসরি ছবি নির্বাচন করুন। আপলোড শেষ হলে ফর্মে Save চাপুন। ছবি সর্বোচ্চ ৪ MiB PNG/JPG/WebP এবং সর্বসাধারণ দেখতে পাবে; ব্যক্তিগত ডকুমেন্ট আপলোড করবেন না। ব্যবহৃত নয় এমন আপলোড Media থেকে মুছুন। Cloudinary না থাকলে ছবির ডাটা MongoDB-তে থাকবে, তাই storage ও backup পর্যবেক্ষণ করুন।
- নতুন কনটেন্টের slug/key নিজে দেওয়ার দরকার নেই; পুরোনো লিংক অপরিবর্তিত থাকে।
- Admission/trial booking পরীক্ষা করতে আলাদা test database-এ সেটিংস দিয়ে কাল্পনিক তথ্য ব্যবহার করুন। বাস্তব ব্যবহার শুরুর আগে উপরে বর্ণিত privacy, consent ও security কাজ শেষ করুন। সঠিক ক্লাস ও বিষয়ের ভবিষ্যৎ স্লট তৈরি না করলে booking তালিকা ফাঁকা থাকবে।

## AI Study Buddy ও অনলাইন ভর্তি

- Admin sidebar-এ **AI Study Buddy** থেকে Gemini সেটআপের অবস্থা দেখুন; key সেখানে দেখানো বা সংরক্ষণ করা হয় না। নিরাপদে নিজের server environment-এ key দিন; `AI-SETUP.md` অনুসরণ করুন।
- ব্যবহারকারী ও অভিভাবকের অনুমতি, গোপনীয়তা, AI নিরাপত্তা এবং Google-এর শর্ত, খরচ ও quota পর্যালোচনা শেষ না হওয়া পর্যন্ত ফিচার চালু করবেন না। অ্যাপের চেকবক্স অফলাইন অনুমতি যাচাই করে না।
- শিক্ষার্থী লগ ইন করে dashboard → **AI Study Buddy** ব্যবহার করবে। পাবলিক ওয়েবসাইটে More → **AI Study Buddy** থেকেও পরিচিতি ও লগ ইন লিংক আছে। এখানে শুধু লেখা যায়; ব্যক্তিগত তথ্য লিখবেন না।
- Admin sidebar-এ **Admission & booking setup**-এ সেবার পরিবেশগত অবস্থা ও আসনযুক্ত ভবিষ্যৎ স্লটের সংখ্যা দেখায়। সঠিক শ্রেণি ও বিষয়ের স্লট তৈরি করুন। এটি নিরাপত্তা পর্যালোচনার বিকল্প নয়।
