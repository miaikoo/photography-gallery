# PRD: Portofolio Fotografi Pribadi

Nov 2, 2026 · @mia

## Ringkasan

Bikin website dokumentasi hobi foto, dengan biaya Rp0: foto street dan nature pilihanmu disusun per event dan tag. Saat foto diklik, pengunjung melihat versi besar ber-watermark dan detail EXIF-nya, tanpa data GPS.

Batasan yang sudah kamu tentukan:

- Dipakai sendiri untuk dokumentasi hobi dan sekaligus jadi proyek portofolio SE, bukan untuk cari klien atau jualan.
- Tidak ada biaya sama sekali, dan alamatnya memakai subdomain gratis `.vercel.app`.
- Tidak ada foto orang yang diunggah.
- Foto dikelompokkan per event dan bisa diberi tag.

## Masalah

Platform yang ada dibuat untuk engagement, bukan untuk menampilkan karya dengan baik.

| Opsi yang ada | Kurangnya buat pamer foto |
| --- | --- |
| Instagram | Foto dikompres dan dipotong rasionya, karya lama tenggelam di feed, pengunjung harus lewat algoritma dan ajakan login |
| Flickr, 500px | Kamu jadi satu dari jutaan akun, tampilan dan brandingnya milik platform |
| Google Drive | Bisa berbagi file, tapi rasanya folder, bukan pameran |
| Pembuat situs seperti Squarespace | Hasilnya bagus, tapi ada biaya langganan dan kamu terikat ke template mereka |

Yang dibutuhkan: tempat yang kamu kontrol, foto tampil sesuai aslinya, dan urutannya kamu yang kurasi.

## Tujuan

Produk ini berhasil kalau kamu rela menaruh link-nya di bio dan terus mengisinya.

**Tujuan**

- Foto tampil tajam dan sesuai rasio aslinya, di HP maupun laptop.
- Upload cukup gampang sampai kamu benar-benar rutin melakukannya.
- Pengunjung langsung melihat karya terbaikmu tanpa harus login.
- Kode dan keputusan teknisnya layak ditunjukkan di portofolio SE.

**Bukan tujuan (untuk sekarang)**

- Akun pengguna lain, follow, atau komentar publik.
- Cari klien, jual foto, dan pembayaran.
- Edit foto di dalam aplikasi. Editing tetap di Lightroom atau aplikasi pilihanmu.
- Foto orang.

**Ukuran berhasil** (target awal, silakan disesuaikan)

| Ukuran | Target |
| --- | --- |
| Biaya | Rp0 per bulan |
| Waktu menerbitkan satu event | Di bawah 10 menit, setelah foto dipilih |
| Waktu muat halaman galeri di 4G | Foto pertama muncul di bawah 2,5 detik |
| Konsistensi | Minimal 1 event baru per bulan selama 3 bulan pertama |

## Pengguna

Ada dua peran, dan tidak ada yang perlu login.

| Peran | Siapa | Yang dia butuhkan |
| --- | --- | --- |
| Pemilik | Kamu | Upload foto pilihan, memilih event dan tag, mengatur urutan, menyembunyikan foto |
| Pengunjung | Teman, keluarga, orang dari bio | Buka link, menelusuri event dan tag, melihat detail EXIF, lancar di HP, bisa membagikan foto tertentu |

## Alur utama

&#91;embedded content: alur utama · pemilik, sistem, pengunjung\]

Pengunjung tidak pernah melihat draf atau file asli, dan tiap link foto yang dibagikan bisa mendatangkan pengunjung baru.

## Fitur

MVP berpusat pada empat hal yang kamu minta: event, EXIF saat foto diklik, watermark, dan tag. Foto masuk lewat form upload di aplikasi kecil di laptop, jadi website publik tidak butuh login.

| Fitur | Detail | Prioritas |
| --- | --- | --- |
| Form upload | Seret foto hasil pilihanmu ke aplikasi lokal; folder SOOC tidak pernah dibaca otomatis | MVP |
| Pilih event | Dropdown berisi event yang sudah ada, atau "Tambah baru" dengan judul dan tanggal; tanggal terisi dari EXIF dan bisa diubah | MVP |
| Pilih tag | Pilih dari tag yang sudah ada atau ketik tag baru; berlaku untuk satu kali upload dan bisa diubah per foto | MVP |
| Edit EXIF | Form terisi otomatis dari EXIF foto dan semua field yang tayang bisa diubah, misalnya kalau tanggal kamera belum benar; hasilnya disimpan ke data situs, file asli tidak diubah, dan GPS tidak ada di form | MVP |
| Proses otomatis | Membuat beberapa ukuran WebP atau AVIF, menghapus semua metadata dari file publik | MVP |
| Watermark | Dipasang permanen pada semua file publik; posisi dan transparansinya bisa diatur | MVP |
| Atur urutan dan sampul | Geser untuk menyusun foto dalam event; pilih satu foto sampul | MVP |
| Draf dan tayang | Event disimpan dulu di laptop dan belum masuk repo, jadi belum terlihat publik | MVP |
| Beranda | Daftar event dari yang terbaru, dengan foto sampul, judul, dan tanggal | MVP |
| Halaman event | Grid yang menghormati rasio asli, bukan potongan kotak | MVP |
| Filter tag | Klik satu tag untuk melihat semua foto bertag itu dari semua event | MVP |
| Detail foto saat diklik | Foto layar penuh dengan tanggal, kamera, lensa, focal length, aperture, shutter, dan ISO; field kosong disembunyikan | MVP |
| Link per foto | Tiap foto punya URL sendiri dan pratinjau rapi saat dibagikan | MVP |
| Halaman tentang | Bio singkat dan link Instagram | MVP |
| Statistik pengunjung | Vercel Web Analytics, gratis sampai 50.000 event per bulan | Berikutnya |
| Upload langsung dari HP | Butuh login dan penyimpanan online, jadi lebih berisiko keluar dari batas gratis | Nanti |
| Domain sendiri | Berbayar, jadi hanya kalau nanti kamu berubah pikiran | Nanti |

## Syarat kualitas

Yang paling penting: EXIF tetap tampil, tapi data lokasinya tidak boleh bocor.

- **EXIF tanpa GPS:** field yang boleh tayang disalin ke data situs dari daftar yang sudah ditentukan. File gambar publik tidak membawa metadata sama sekali, jadi GPS tidak bisa ikut terbawa.
- **Sumber EXIF:** pengaturan ekspor di aplikasi editing harus tetap menyertakan metadata. Kalau tidak, detail fotonya kosong.
- **Watermark:** terpasang pada semua file publik dan tidak bisa dimatikan pengunjung. Ukurannya mengikuti lebar foto, supaya tetap terbaca di HP.
- **File asli:** hanya diproses di laptop dan tidak masuk repo. Yang tayang hanya versi web ber-watermark.
- **Cadangan:** website ini bukan cadangan, jadi folder lokal tetap perlu kamu back up sendiri.
- **Kualitas gambar:** warna dikonversi ke sRGB agar konsisten di semua layar, dan foto tidak terlihat pecah di layar resolusi tinggi.
- **Performa:** gambar dimuat sesuai ukuran layar, foto di bawah layar dimuat belakangan, dan ada placeholder blur agar layout tidak melompat.
- **Aksesibilitas:** ada teks alternatif untuk tiap foto, navigasi keyboard di layar penuh, dan kontras teks yang cukup.
- **Mobile:** semua halaman publik nyaman dipakai di HP; proses menerbitkan foto cukup dari laptop.

## Teknis dan biaya

Stack yang direkomendasikan adalah TypeScript dan Next.js dalam satu monorepo, tanpa database dan penyimpanan terpisah. Biayanya Rp0, dan kalau batas gratis terlampaui situs berhenti sementara, bukan ditagih.

| Bagian | Pilihan | Kenapa |
| --- | --- | --- |
| Bahasa | TypeScript mode strict | Tipe data yang sama dipakai website dan aplikasi lokal |
| Struktur repo | Monorepo pnpm: `apps/web`, `apps/studio`, `packages/core` | Logika foto terpisah dari UI, jadi mudah diuji |
| Website publik | Next.js App Router dengan [static export](https://nextjs.org/docs/app/guides/static-exports) | Tiap event dan foto jadi halaman HTML sendiri, tanpa server |
| Aplikasi lokal | Next.js biasa, hanya jalan di laptop | Form upload butuh server dan akses file, yang tidak tersedia di static export |
| Tampilan | Tailwind CSS | Cepat dibuat dan konsisten di kedua aplikasi |
| Proses gambar | sharp | Membuat ukuran, AVIF dan WebP, serta memasang watermark |
| Baca EXIF | [exiftool-vendored](https://registry.npmjs.org/exiftool-vendored/latest) | Menyediakan paket Windows; butuh Node 22 ke atas |
| Data | File JSON di repo, divalidasi Zod | Tanpa database; build gagal kalau datanya rusak |
| Atur urutan | dnd-kit | Drag and drop di aplikasi lokal |
| Tes | Vitest dan Playwright | Tes logika foto dan alur utama di browser |
| CI | [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | Lint, cek tipe, tes, dan build; gratis untuk repo publik |
| Performa | Lighthouse CI | Pull request gagal kalau skor performa turun di bawah target |

**Yang membuatnya kuat di portofolio SE**

- **Uji privasi otomatis:** CI memeriksa semua gambar publik dan gagal kalau menemukan metadata atau GPS. Ada juga tes dengan foto contoh yang sengaja berisi GPS.
- **Keputusan tertulis:** alasan memilih situs statis dibanding R2 atau Blob dicatat sebagai Architecture Decision Record.
- **README yang meyakinkan:** ada link demo, diagram arsitektur, skor Lighthouse, dan cara menjalankan proyek.
- **Sengaja sederhana:** tidak ada database, Kubernetes, atau microservice, karena masalahnya tidak membutuhkan itu.

**Konsekuensi repo publik**

- Draf tetap di laptop dan tidak masuk repo. Kalau masuk, drafnya bisa dilihat orang.
- Foto yang pernah di-push tetap ada di riwayat git, walaupun nanti dihapus dari situs.
- File asli dan folder kerja lokal dimasukkan ke `.gitignore`.

**Batas gratis**

| Bagian | Pilihan | Batas gratis |
| --- | --- | --- |
| Website publik | Next.js, diekspor statis, di [Vercel Hobby](https://vercel.com/docs/plans/hobby) | 100 GB transfer per bulan, 1 juta request CDN |
| Alamat situs | Subdomain [`.vercel.app`](https://vercel.com/docs/domains/working-with-domains/add-a-domain) | Gratis; membeli domain lewat Vercel berbayar |
| Penyimpanan foto dan data | Repo [GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) | Idealnya di bawah 1 GB, sangat disarankan di bawah 5 GB |
| Aplikasi lokal | Next.js dan library sharp, jalan di laptop | Gratis |
| Deploy | Otomatis dari GitHub setiap ada push | 100 deployment per hari |

Dengan sekitar 1 MB per foto untuk semua ukurannya (perkiraan, belum diuji), repo 1 GB cukup untuk sekitar 1.000 foto. Hindari deploy lewat Vercel CLI, karena Hobby membatasi unggahan CLI sampai [100 MB](https://vercel.com/docs/limits). Fitur optimasi gambar Vercel juga tidak dipakai, karena semua ukuran sudah dibuat di laptop.

**Kenapa bukan rencana awal?**

- [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) gratis sampai 10 GB, tapi [alamat publik `r2.dev`](https://developers.cloudflare.com/r2/buckets/public-buckets/) dibatasi dan hanya untuk development. Pemakaian produksi disarankan memakai domain sendiri, padahal kamu tidak membeli domain.
- [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) di Hobby hanya 1 GB dengan transfer 10 GB per bulan, jauh lebih kecil daripada file statis.
- Tidak ada panel online, jadi login dan database tidak dibutuhkan.

Keputusan: foto diterbitkan dari laptop, tidak dari HP. Kalau foto sudah mendekati 1.000, foto bisa dipindahkan ke layanan penyimpanan lain.

Batas di atas dicek dari halaman resmi pada 2 November 2026. Vercel Hobby khusus pemakaian pribadi non-komersial, dan itu cocok dengan tujuan hobimu.

Keputusan: dibangun sendiri, bukan pakai layanan jadi seperti Format, Pixieset, atau Squarespace. Tidak ada biaya langganan dan kontrol penuh di tanganmu, tapi butuh waktu lebih lama sampai tayang.

## Tahapan

Fondasi kode dibuat dulu, lalu yang dilihat pengunjung, supaya kamu cepat punya sesuatu yang bisa dibagikan.

1. **Fondasi:** monorepo, TypeScript, CI, dan deploy pertama ke Vercel.
2. **Galeri publik:** 2-3 event dimasukkan manual, lengkap dengan beranda, halaman event, foto layar penuh dengan EXIF, dan halaman tentang. Link sudah bisa dibagikan.
3. **Proses foto:** salin EXIF yang diizinkan, hapus metadata, pasang watermark, buat beberapa ukuran, dan tambahkan uji privasi ke CI.
4. **Form upload:** pilih event dan tag atau tambah baru, atur urutan, simpan draf, lalu terbitkan.
5. **Tag dan polesan:** filter tag, pratinjau saat dibagikan, performa di HP, dan tes Playwright.
6. **Isi galeri dan dokumentasi:** upload foto pilihanmu, lalu lengkapi README dan catatan keputusan teknis.

## Yang perlu kamu putuskan

Dua hal masih perlu kamu jawab; yang lain sudah diputuskan.

- [x] Repo: publik, supaya bisa dilihat recruiter dan CI-nya gratis.
- [x] Watermark-nya berupa teks atau logo, dan tulisannya apa: © miaikoo
- [ ] Subdomain yang kamu mau apa? Formatnya `nama.vercel.app`, selama nama itu belum dipakai orang lain.
- [x] Cara bangun: bangun sendiri.
- [x] Cara terbit: form upload di aplikasi lokal laptop; folder SOOC tidak dibaca otomatis.
- [x] Tujuan: dokumentasi hobi dengan biaya Rp0, sekaligus portofolio SE.
- [x] Genre: street dan nature, tanpa foto orang.
- [x] Alamat: subdomain gratis dari Vercel.
