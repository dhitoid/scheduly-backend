const express = require('express');
const admin = require('firebase-admin');

// Mengambil kunci rahasia dari Environment Variable di Render
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

// Endpoint ini dipanggil setiap 1 menit oleh cron-job.org
app.get('/ping', async (req, res) => {
  try {
    const sekarang = new Date();
    
    // Format waktu disesuaikan ke WIB (Asia/Jakarta)
    const opsiTanggal = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
    const opsiWaktu = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };

    const [month, day, year] = sekarang.toLocaleDateString('en-US', opsiTanggal).split('/');
    const currentDate = `${year}-${month}-${day}`;
    const currentTime = sekarang.toLocaleTimeString('en-GB', opsiWaktu).slice(0, 5);

    console.log(`[CHECK] Pengecekan pada WIB: ${currentDate} jam ${currentTime}`);

    // Cari jadwal yang cocok dari Firestore
    const snapshot = await db.collection('events')
      .where('date', '==', currentDate)
      .where('time', '==', currentTime)
      .where('notified', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("Tidak ada jadwal yang perlu dikirimkan menit ini.");
      return res.status(200).send(`Selesai. Tidak ada jadwal pada ${currentDate} ${currentTime}.`);
    }

    // Kirim notifikasi
    const prosesKirim = snapshot.docs.map(async (doc) => {
      const event = doc.data();

      const payload = {
        notification: {
          title: '⏰ Pengingat Scheduly Pro',
          body: event.title
        },
        token: event.fcmToken
      };

      try {
        await admin.messaging().send(payload);
        console.log(`[SUCCESS] Notifikasi terkirim untuk: "${event.title}"`);
        await doc.ref.update({ notified: true });
      } catch (err) {
        console.error(`[ERROR] Gagal mengirim notifikasi ID (${doc.id}):`, err);
      }
    });

    await Promise.all(prosesKirim);

    res.status(200).send(`Berhasil memproses ${snapshot.size} notifikasi.`);
  } catch (error) {
    console.error("Terjadi error pada server:", error);
    res.status(500).send('Server Error: ' + error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Scheduly Pro aktif di port ${PORT}`));