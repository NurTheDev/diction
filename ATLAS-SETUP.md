# MongoDB Atlas সংযোগ: নিরাপদ নির্দেশিকা

এই প্রকল্প এখনো production-ready নয়। প্রথমে একটি **পৃথক test Atlas cluster/project** ব্যবহার করুন এবং শুধু পরীক্ষামূলক তথ্য দিন। প্রকৃত শিক্ষার্থী বা অভিভাবকের তথ্য সংগ্রহের আগে গোপনীয়তা, অভিভাবকের সম্মতি, নিরাপত্তা, ব্যাকআপ এবং বাস্তব ডিপ্লয়মেন্ট পর্যালোচনা সম্পন্ন করতে হবে। `PRIVACY-DRAFT.md` ও `DEPLOYMENT.md` দেখুন।

## ১. তথ্য ব্যক্তিগত রাখুন

- ডাটাবেসের পাসওয়ার্ড, পূর্ণ MongoDB URI, API key বা `.env.local`-এর বিষয়বস্তু চ্যাট, ইমেইল, স্ক্রিনশট, Git বা লগে দেবেন না।
- Atlas-এর **Database Access** থেকে আলাদা database user তৈরি করুন। তাকে কেবল `dictioncoaching` ডাটাবেসে `readWrite` দিন; Atlas project owner বা cluster-wide admin ব্যবহার করবেন না। Atlas account-এর লগইন পাসওয়ার্ড এবং database user-এর পাসওয়ার্ড এক নয়।
- **Network Access**-এ আপনার কম্পিউটার এবং ডিপ্লয়মেন্টের অনুমোদিত নেটওয়ার্ক যোগ করুন। সাধারণ Vercel serverless-এর জন্য একটি স্থায়ী outbound IP সাধারণত থাকে না; স্থায়ী egress বা যথাযথভাবে পর্যালোচিত বিকল্প নির্ধারণ করুন। `0.0.0.0/0` অনুমতি ঝুঁকি বাড়ায়—অবাধে চালু করবেন না। TLS ও শক্তিশালী, অনন্য credentials ব্যবহার করুন।
- অ্যাপ সবসময় `dictioncoaching` ডাটাবেস ব্যবহার করে। আলাদা test এবং production cluster/project ব্যবহার করুন; শুধু URI-তে অন্য নাম লিখে এই অ্যাপের database নাম বদলানো যায় না।

## ২. নিজের কম্পিউটারে কনফিগার করুন

Node.js 22.13+ ইনস্টল করে ডাউনলোড করা project folder-এ যান। `.env.example` কপি করে `.env.local` তৈরি করুন। ফাইলটি Git-এ উপেক্ষিত; তবুও পাঠানোর বা আপলোড করার আগে যাচাই করুন।

```bash
npm ci
cp .env.example .env.local
```

আপনার নিজের নিরাপদ text editor-এ `.env.local` খুলে Atlas থেকে পাওয়া সংযোগের তথ্য `MONGODB_URI`-তে বসান। নমুনাটি শুধু কাঠামো—এখানে নিজের গোপন তথ্য বসিয়ে কাউকে পাঠাবেন না:

```dotenv
MONGODB_URI=mongodb+srv://<database-user>:<database-password>@<cluster-host>/dictioncoaching?retryWrites=true&w=majority
```

Username/password-এ URI বিশেষ অক্ষর থাকলে সেগুলো locally percent-encode করুন (যেমন `@` → `%40`, `/` → `%2F`)। পাসওয়ার্ড shell command-এ লিখবেন না; shell history-তে থেকে যেতে পারে। প্রকৃত string কোথাও প্রকাশ করবেন না।

শুধু connection probe-এর জন্য `MONGODB_URI` যথেষ্ট। অ্যাপ চালাতে `NEXTAUTH_SECRET` অন্তত ৩২ অক্ষরের অনন্য গোপন মান এবং একই origin-এর `NEXTAUTH_URL` ও `AUTH_URL` প্রয়োজন। নিজের কম্পিউটারে `openssl rand -base64 32` দিয়ে secret তৈরি করে ব্যক্তিগতভাবে `.env.local`-এ রাখুন; কাউকে পাঠাবেন না। Local URL সাধারণত `http://localhost:3000`; deployment-এ দুটিতেই প্রকৃত HTTPS origin দিন। `DATA_COLLECTION_ENABLED=false` রাখুন। এই flag ভর্তি, trial, যোগাযোগ ও কিছু study-writing বন্ধ রাখে; এটি সব authenticated admin/portal mutation বন্ধ করে না।

## ৩. লেখা ছাড়া সংযোগ পরীক্ষা

```bash
npm run atlas:check
```

সফল হলে `Connection: OK`, `Database: dictioncoaching` এবং `Read permission: OK` দেখাবে। এই পরীক্ষা কোনো নথি লিখে না, URI/credential/raw error প্রকাশ করে না। এটি write permission, index তৈরি, transaction, ব্যাকআপ বা production নিরাপত্তা যাচাই করে না। ব্যর্থ হলে URI-এর গঠন, password encoding, database user, Network Access ও cluster সচল আছে কি না নিজের কম্পিউটারে যাচাই করুন। চাইলে শুধু **ব্যক্তিগত তথ্যবিহীন ফলাফল** জানাতে পারেন; কোনো URI, host, username, password বা error log পাঠাবেন না।

## ৪. পরবর্তী ধাপ

`npm run seed:check` কোনো DB write করে না। আসল seed ও authenticated workflow পরীক্ষা **write করে**: প্রথমে ব্যাকআপ নিন, পৃথক test cluster নিশ্চিত করুন এবং `DEPLOYMENT.md`-এর seed নির্দেশনা অনুসরণ করুন। এটি admin ও bundled public content তৈরি করতে পারে; আগে থেকে থাকা ডেটার সঙ্গে index সংঘর্ষ হতে পারে। পরীক্ষা শেষ না হওয়া পর্যন্ত production ও প্রকৃত ব্যক্তিগত তথ্য ব্যবহার করবেন না।

Vercel-এ ব্যবহার করতে Project Settings → Environment Variables-এ উপরের secret-গুলো ব্যক্তিগতভাবে দিন, Preview ও Production-এর জন্য পৃথক cluster/secret ব্যবহার করুন, এবং origin অনুযায়ী `NEXTAUTH_URL` ও `AUTH_URL` মিলিয়ে দিন। পরিবেশ পরিবর্তনের পর প্রয়োজনমতো redeploy করুন। বাস্তব Atlas, Vercel, email, Cloudinary ও AI সেবা এই workspace থেকে যাচাই করা হয়নি।

---

# English summary

Use a separate test Atlas project, a database user restricted to `readWrite` on `dictioncoaching`, TLS and carefully reviewed network access. Never share credentials or the full URI in chat. Copy `.env.example` to `.env.local`, set `MONGODB_URI` privately, then run `npm run atlas:check`. The probe performs a connection and read check only and redacts raw errors; it does not test writes, indexes, transactions or backups. Keep data collection disabled and avoid real personal data until the policy, consent, security and deployment reviews are complete. The application always selects `dictioncoaching`, so use separate clusters/projects for test and production. See `DEPLOYMENT.md` before any seed or write test.
