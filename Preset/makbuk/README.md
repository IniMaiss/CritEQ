# CritEQ Presets - MacBook Pro M1 (2020) Built-in Speakers
### ⚡ Dikalibrasi Khusus untuk Penggunaan Volume 80%

Koleksi preset Equalizer Parametrik (PEQ / Equalizer APO format) yang dioptimalkan secara spesifik untuk karakteristik akustik speaker internal **Apple MacBook Pro 13-inch (M1, 2020)** saat diputar pada tingkat volume tinggi (**~80% volume slider macOS**).

---

## 🔊 Mengapa Diperlukan Kalibrasi Khusus di Volume 80%?

Saat memutar speaker MacBook Pro M1 pada volume tinggi (~80%), terjadi beberapa fenomena fisik dan akustik:

1. **Pemicu Limiter Bawaan macOS (Anti-Pumping / Anti-Ducking):**
   * macOS CoreAudio memiliki *hardware safety limiter & dynamic compressor* otomatis.
   * Jika sinyal sub-bass (<80 Hz) terlalu besar saat volume 80%, limiter akan terpicu secara agresif dan membuat keseluruhan volume suara mengecil-membesar sendiri (*pumping / ducking*).
   * **Solusi Preset:** Diterapkan *low-shelf cut* terukur di 75–80 Hz (-4.5 dB s/d -5.0 dB) dan Preamp negatif (-2.5 dB s/d -4.5 dB) agar driver mikro laptop tetap memiliki *headroom* bebas distorsi dan terhindar dari kompresi dinamis liar.
2. **Kompensasi Kurva Pendengaran Manusia (Fletcher-Munson):**
   * Pada level SPL tinggi (~80 dB), telinga manusia menjadi jauh lebih peka terhadap frekuensi tajam di area **3 kHz – 4 kHz** dan **6 kHz – 7 kHz**.
   * Suara vokal atas, petikan gitar elektrik, desis snare/simbal, dan konsonan 'S' dapat terdengar menusuk atau "kaleng".
   * **Solusi Preset:** Pemotongan terarah pada rentang 3.2 kHz – 3.8 kHz dan 6 kHz – 6.5 kHz untuk menghasilkan karakter suara yang bertenaga tapi tetap empuk (*fatigue-free*).
3. **Meredam Resonansi Unibody & Boxiness (400–480 Hz):**
   * Di volume 80%, resonansi rongga bodi aluminium terasa lebih jelas mendengung. Pemotongan -3 dB pada pita 400–480 Hz membuat pemisahan instrumen dan vokal menjadi sangat jernih.

---

## 📁 Daftar Preset & Kegunaan (Volume 80%)

| File Preset | Profil Penggunaan | Fokus Tuning di Volume 80% |
| :--- | :--- | :--- |
| `MacBook Pro M1 2020 - Balanced & Clean.txt` | **All-Round / Referensi Netral** | Menghilangkan suara sengau bodi laptop, meredakan ketajaman 3.3 kHz, bebas distorsi, suara jernih dan seimbang. |
| `MacBook Pro M1 2020 - Bass Boost & Music.txt` | **Musik (Pop, Hip-Hop, EDM, Rock)** | Memaksimalkan *punch* 130 Hz tanpa memicu limiter macOS ducking, vokal forward, bebas sensasi "kaleng". |
| `MacBook Pro M1 2020 - Movies & Cinematic.txt` | **Film & Serial (Netflix, YouTube)** | Mengangkat kejelasan dialog aktor di 1.7 kHz agar tidak tertelan sound effect ledakan yang keras, tanpa suara menusuk telinga. |
| `MacBook Pro M1 2020 - Voice & Podcast.txt` | **Zoom / Google Meet / Podcast / Kuliah** | Meredam getaran meja total, mengangkat artikulasi ucapan, serta fitur *de-esser* agresif untuk memotong mic lawan bicara yang pecah. |
| `MacBook Pro M1 2020 - Gaming & Spatial.txt` | **Gaming (FPS, Action, RPG)** | Mengisolasi suara langkah kaki (*footsteps*) di 2 kHz dan spasial arah peluru di 4.2 kHz saat situasi baku tembak ramai. |
| `MacBook Pro M1 2020 - Night Mode.txt` | **Penggunaan Santai / Low Fatigue** | Meredam getaran bass ke meja kerja, suara lembut dan hangat meskipun diputar di volume 80%. |
| `MacBook Pro M1 2020 - All Presets.txt` | **Semua Preset Sekaligus** | Menggabungkan seluruh 6 preset di atas dalam 1 file untuk langsung di-import bersamaan ke CritEQ. |

---

## 🛠️ Cara Import ke CritEQ

1. Buka aplikasi **CritEQ**.
2. Klik tombol **Import** pada *preset bar* di bagian atas jendela aplikasi.
3. Buka folder:
   ```
   /Users/atha/Documents/Test/Preset/makbuk/
   ```
4. Pilih file preset yang diinginkan, atau pilih `MacBook Pro M1 2020 - All Presets.txt` untuk mengimpor semua preset sekaligus.
5. Set volume slider macOS ke sekitar **75% – 85% (optimal di 80%)** dan nikmati performa audio yang bersih dan solid tanpa distorsi!
