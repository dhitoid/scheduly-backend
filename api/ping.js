const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    // 1. Validasi keberadaan Environment Variable
    if (!process.env.FIREBASE_CREDENTIALS) {
      return res.status(500).send("Error: Variable FIREBASE_CREDENTIALS belum diisi di Vercel Settings.");
    }

    // 2. Inisialisasi Firebase Admin secara aman di dalam handler
    if (!admin.apps.length) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

        // Memperbaiki karakter baris baru (\n) pada private_key yang sering ter-escape saat di-paste
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
      } catch (jsonErr) {
        return res.status(500).send("Error JSON: Format FIREBASE_CREDENTIALS tidak valid. Pastikan di-copy lengkap dari file .json Firebase.");
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    const sekarang = new Date();
    
    // Format tanggal & waktu WIB (Asia/Jakarta)
    const opsiTanggal = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
    const opsiWaktu = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };

    const [month, day, year] = sekarang.toLocaleDateString('en-US', opsiTanggal).split('/');
    const currentDate = `${year}-${month}-${day}`;
    const currentTime = sekarang.toLocaleTimeString('en-GB', opsiWaktu).slice(0, 5);

    // Cari jadwal di Firestore
    const snapshot = await db.collection('events')
      .where('date', '==', currentDate)
      .where('time', '==', currentTime)
      .where('notified', '==', false)
      .get();

    if (snapshot.empty) {
      return res.status(200).send(`Selesai. Tidak ada jadwal pada ${currentDate} ${currentTime}.`);
    }

    // Kirim notifikasi FCM
    const prosesKirim = snapshot.docs.map(async (doc) => {
      const event = doc.data();
      if (!event.fcmToken) return;

      const payload = {
        notification: {
          title: '⏰ Pengingat Scheduly Pro',
          body: event.title || 'Ada jadwal kegiatan!'
        },
        token: event.fcmToken
      };

      try {
        await admin.messaging().send(payload);
        await doc.ref.update({ notified: true });
      } catch (err) {
        console.error('Gagal kirim notif:', err);
      }
    });

    await Promise.all(prosesKirim);
    return res.status(200).send(`Berhasil memproses ${snapshot.size} notifikasi.`);

  } catch (error) {
    return res.status(500).send('Server Error: ' + error.message);
  }
};
