const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    if (!process.env.FIREBASE_CREDENTIALS) {
      return res.status(500).send("Error: FIREBASE_CREDENTIALS belum diisi.");
    }

    if (!admin.apps.length) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
      } catch (jsonErr) {
        return res.status(500).send("Error Format JSON Firebase.");
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    const sekarang = new Date();
    
    // Format WIB (Asia/Jakarta)
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

    // Kirim notifikasi dengan Payload Khusus iOS APNs
    const prosesKirim = snapshot.docs.map(async (doc) => {
      const event = doc.data();
      if (!event.fcmToken) return;

      const payload = {
        token: event.fcmToken,
        notification: {
          title: '⏰ Pengingat Scheduly Pro',
          body: event.title || 'Ada jadwal kegiatan!'
        },
        // Konfigurasi Khusus iOS APNs agar Notifikasi Muncul di Latar Belakang
        apns: {
          payload: {
            aps: {
              alert: {
                title: '⏰ Pengingat Scheduly Pro',
                body: event.title || 'Ada jadwal kegiatan!'
              },
              sound: 'default',
              badge: 1,
              'content-available': 1
            }
          },
          headers: {
            'apns-priority': '10' // Prioritas tertinggi: Langsung kirim saat layar terkunci
          }
        }
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
