# Remi Online — Multiplayer Indonesian Rummy

Real-time multiplayer Remi (Ceki) built with Next.js + Socket.IO + Node.js/Express.

## Struktur

```
ceki/
├── client/   Next.js (pages router) + Tailwind CSS frontend
├── server/   Express + Socket.IO backend (authoritative game logic)
└── shared/   Deck, meld validation, scoring rules — used by both sides
```

## Menjalankan secara lokal

Butuh Node.js 18+. Buka dua terminal:

```bash
# Terminal 1 — backend (port 4000)
cd server
npm install
npm run dev        # atau: npm start

# Terminal 2 — frontend (port 3000)
cd client
npm install
npm run dev
```

Buka `http://localhost:3000`. Untuk main dengan teman di jaringan lain, deploy
`server/` (mis. Render/Railway) dan `client/` (mis. Vercel), lalu set env var:

- Client: `NEXT_PUBLIC_SERVER_URL=https://your-server-domain`
- Server: `CLIENT_ORIGIN=https://your-client-domain`, `PORT` (opsional)

## Apa yang sudah diimplementasikan

- Lobby: buat room (kode 6 karakter), join via kode/link, share link, setting
  jumlah pemain (2–4) & target poin (500/1000), waiting room dengan status host.
- Deck 55 kartu (52 + 3 Joker), 7 kartu awal, draw pile & discard pile.
- Giliran: ambil dari deck ATAU dari discard pile (maks. 7 kartu dari ujung
  atas). Mengambil dari discard pile mengharuskan pemain memilih sendiri ≥2
  kartu pendukung, yang boleh berasal dari tangan MAUPUN dari kartu lain yang
  ikut ke-ambil dari tumpukan (karena tidak bisa skip). Contoh: buangan
  kelihatan 6,3,2,4,6,7,8 dari lama ke baru, tangan ada 6,6 — ambil sampai 6
  paling dalam (7 kartu sekaligus) dan gabungkan dengan 6 kedua yang ikut
  terambil → jadi kombinasi 6-6-6-6 di meja, sisanya (3,2,4,7,8) masuk ke
  tangan sebagai kartu lepas, lalu tetap wajib buang 1. Kombinasi hasil ambil
  ini langsung "naik ke meja" (laid down, terlihat semua pemain) dan tidak
  balik ke tangan. Joker tidak bisa dibuang.
- Kalau seluruh kartu di tangan sudah naik ke meja lewat mekanisme di atas dan
  kartu terakhir yang tersisa baru saja dibuang, ronde otomatis berakhir
  ("closed-meja") tanpa perlu Ceki — lihat bagian asumsi desain.
- Pengambilan pertama seorang pemain dari discard pile di tiap ronde harus
  berupa run (urut), kecuali kombinasinya mengandung As — As bebas diambil
  kapan saja, dan begitu sukses (baik lewat run maupun kombinasi ber-As),
  pemain itu "terbuka" untuk boleh ambil kombinasi set/seri biasa di
  pengambilan-pengambilan berikutnya pada ronde yang sama.
- Validasi Run/Set dengan Joker wildcard, sepenuhnya di server
  (`shared/combinations.js`), termasuk pencarian partisi sempurna (backtracking
  + bitmask memoization) untuk cek closed-card dan skor akhir.
- Ceki: server otomatis mendeteksi kapan tangan pemain "tinggal 1 kartu lagi",
  mengirim flag ke client untuk menampilkan tombol Ceki. Announce Ceki
  divalidasi ulang di server.
- Closed card skenario 1 (tutupan, ambil dari deck) dan skenario 2 (kejebur,
  klaim kartu buangan lawan) beserta scoring tarif normal/tinggi.
- Skenario deck habis: skor dihitung otomatis (kombinasi valid dicari otomatis
  yang memaksimalkan nilai pemain, sisanya jadi minus).
- Skor kumulatif antar ronde + aturan salip (skor yang tersalip reset ke 0),
  dievaluasi berdasarkan skor sebelum vs sesudah ronde untuk semua pasangan
  pemain sekaligus.
- Reconnect: `playerId` disimpan di localStorage per room, socket baru akan
  otomatis re-attach ke slot pemain yang sama saat refresh/reconnect.

## Asumsi desain (bagian yang tidak dirinci eksplisit di spec)

Beberapa aturan Remi punya banyak variasi rumah-ke-rumah. Berikut interpretasi
yang dipakai di server (`server/game/GameEngine.js`, `shared/combinations.js`):

- Sebuah kombinasi minimal harus punya 1 kartu asli (bukan hanya Joker).
- Run hanya boleh dalam SATU kelompok rank: angka `2–10` saja, ATAU bangsawan
  `J-Q-K` saja. As tidak pernah masuk run (tidak ada A-2-3 maupun Q-K-A), dan
  angka tidak boleh dicampur bangsawan (10-J-Q tidak valid). Set tetap bebas
  (A-A-A, K-K-K, dll valid — aturan ini hanya untuk run).
- Scoring ceburan (kejebur): kartu yang diambil dari buangan masuk ke
  kombinasi biasa dengan nilai NORMAL. Jika setelah mengambil masih ada 1
  kartu sisa untuk dibuang, kartu sisa itu jadi tutupan dengan nilai TINGGI.
  Kalau semua kartu pas jadi kombinasi tanpa sisa, tidak ada tutupan (semua
  normal).
- Alur menutup (setelah announce Ceki):
  - Tutupan: ambil kartu (dari deck seperti biasa), lalu pilih kartu untuk
    dibuang. Kalau sisa kartunya membentuk kombinasi sempurna, muncul tombol
    "🎯 Tutup! (buang X sebagai tutupan)" — X dihitung tarif tinggi, sisanya
    normal.
  - Ceburan: kalau kartu teratas buangan bisa kamu ambil DAN benar-benar
    dipakai di kombinasi (bukan cuma diambil lalu dibuang lagi), muncul
    "🎯 Ceburan! Ambil X & tutup". Kartu yang diambil = normal; kalau masih
    ada 1 kartu sisa, sisa itu jadi tutupan (tinggi).
  - Mengambil kartu dari buangan yang tidak benar-benar dibutuhkan (tangan
    sudah jadi tanpa kartu itu) ditolak — itu bukan ceburan, tutup lewat
    tutupan (buang kartu) saja.
- Klaim "kejebur" hanya berlaku untuk kartu paling atas discard pile saat itu
  juga (reaktif terhadap buangan lawan barusan), bukan mengambil beberapa
  kartu sekaligus dari tumpukan lama.
- Kombinasi yang dibentuk lewat pengambilan dari discard pile selalu naik ke
  meja (public, tidak bisa dibongkar lagi). Kombinasi yang cuma terbentuk dari
  kartu hasil ambil deck tetap privat di tangan sampai ronde berakhir (baru
  dihitung otomatis). Pengambilan yang akan menyisakan tangan kosong sebelum
  sempat buang kartu ditolak server (harus selalu ada ≥1 kartu tersisa untuk
  dibuang).
- Jika seorang pemain berhasil memindahkan semua kartunya ke meja lalu buang
  kartu terakhirnya hingga tangan benar-benar kosong, itu dihitung "closed
  card" otomatis (reason `closed-meja`): skornya = total nilai kombinasi di
  meja (tarif normal), tanpa bonus tutupan/ceburan karena bukan lewat jalur
  Ceki. Ini konsekuensi alami dari mekanisme meld-ke-meja, bukan jalur
  penutupan yang disebutkan eksplisit di rules asli.
- Nilai kartu Joker yang "menganggur" (tidak masuk kombinasi apa pun saat
  skor deck-habis) memakai tarif normal terendah (5) sebagai fallback, karena
  spec tidak mendefinisikan nilai Joker di luar kombinasi.
- Saat menutup (tutupan) via deck, jika kartu yang ditarik tidak membuat tangan
  bisa ditutup, pengambilan tetap sah dan giliran lanjut normal (kartu masuk
  tangan, pemain lanjut buang seperti giliran biasa) — Ceki tidak hangus.
- Jika ada pemain mencapai target skor tepat bersamaan, pemenang final adalah
  yang skornya tertinggi.
- Giliran pertama tiap ronde dimulai dari pemain dengan skor kumulatif
  tertinggi saat itu. Kalau seri di puncak (termasuk ronde pertama saat semua
  masih 0), pemulainya dipilih acak di antara yang tertinggi. Urutan rotasi
  giliran tetap mengikuti urutan tempat duduk.
- Aturan "run dulu baru boleh set (kecuali As)" hanya berlaku untuk
  pengambilan dari discard pile (yang naik ke meja); tidak berlaku untuk
  kombinasi yang ditemukan otomatis saat closed card (tutupan/ceburan) atau
  saat deck habis, karena itu bukan pengambilan aktif dari discard pile.
- Tidak ada auto-skip/timeout untuk pemain yang disconnect di tengah gilirannya
  — game menunggu sampai mereka reconnect (state tetap terjaga).

## Event Socket.IO

Lihat `shared/constants.js` (`SOCKET_EVENTS`) untuk daftar lengkap event lobby,
gameplay, dan state-sync yang dipakai client ↔ server.
