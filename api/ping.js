const admin = require('firebase-admin');

// Inisialisasi Firebase Admin jika belum berjalan
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const sekarang = new Date();
    
    // Format tanggal & waktu WIB (Asia/Jakarta)
    const opsiTanggal = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
    const opsiWaktu = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };

    const [month, day, year] = sekarang.toLocaleDateString('en-US', opsiTanggal).split('/');
    const currentDate = `${year}-${month}-${day}`;
    const currentTime = sekarang.toLocaleTimeString('en-GB', opsiWaktu).slice(0, 5);

    console.log(`[CHECK] WIB: ${currentDate} ${currentTime}`);

    // Cari jadwal di Firestore
    const snapshot = await db.collection('events')
      .where('date', '==', currentDate)
      .where('time', '==', currentTime)
      .where('notified', '==', false)
      .get();

    if (snapshot.empty) {
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
        await doc.ref.update({ notified: true });
      } catch (err) {
        console.error(err);
      }
    });

    await Promise.all(prosesKirim);
    res.status(200).send(`Berhasil memproses ${snapshot.size} notifikasi.`);
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
};
