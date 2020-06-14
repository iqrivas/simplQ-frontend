const functions = require("firebase-functions");

const admin = require("firebase-admin");

admin.initializeApp();

QUEUES_COLLECTION_NAME = "queuesFromFBFn";

exports.createQueue = functions.https.onCall((data, context) => {
    name = data.name;
    console.log('Starting createQueue');
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);
    return queue.add({
        name: name,
    })
        .then(docRef => { return { data: docRef.id } })
        .catch(err => reject(new functions.https.HttpsError('unknown', err.message, err)))
});

exports.readQueue = functions.https.onCall(async (data, context) => {
    console.log("Starting readQueue");
    const queueId = data.queueId;
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);

    const namePromise = queue.doc(queueId).get().then(doc => {
        if (doc.exists) {
            return doc.data().name;
        } else {
            throw new functions.https.HttpsError('invalid-argument', "Queue not found");
        }
    });

    const usersPromise = queue.doc(queueId).collection("users").orderBy('timestamp').get()
        .then(snapshot => {
            const users = [];
            snapshot.forEach(doc => {
                const user = doc.data();
                user.tokenId = doc.id;
                users.push(user)
            });
            return users;
        })
        .catch(err => {
            throw new functions.https.HttpsError('unknown', err.message, err)
        });

    return {
        name: await namePromise,
        users: await usersPromise
    };
});

exports.addQueue = functions.https.onCall(async (data, context) => {
    console.log("Starting addToQueue");
    const name = data.name, contact = data.contact, queueId = data.queueId, notifyable = data.notifyable;
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);
    var tokenIdPromise = queue.doc(queueId).collection("users").add({
        name: name,
        contact: contact,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        notified: false,
        notifyable: notifyable
    })
        .then((docRef) => docRef.id)
        .catch((err) => {
            throw new functions.https.HttpsError('unknown', err.message, err)
        });
    return {
        tokenId: await tokenIdPromise,
        aheadCount: await queue.doc(queueId).collection("users").get().then(snapshot => size = snapshot.size - 1)
    };
});

exports.notifyUser = functions.https.onCall((data, context) => {
    console.log("Starting notify User");
    const queueId = data.queueId, tokenId = data.tokenId;
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);
    return queue.doc(`${queueId}`).collection("users").doc(tokenId).update({ "notified": true })
    .then(() => "OK")
    .catch(err => { throw new functions.https.HttpsError('unknown', 'Notification failed', err) });
});

exports.deleteFromQueue = functions.https.onCall((data, context) => {
    console.log("Starting delete Queue");
    const queueId = data.queueId, tokenId = data.tokenId;
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);
    return queue.doc(`${queueId}`).collection("users").doc(tokenId).delete()
    .then(() => "OK")
    .catch(err => { throw new functions.https.HttpsError('unknown', 'Deletion failed', err) });
});

exports.userStatus = functions.https.onCall(async (data, context) => {
    console.log("Starting userStatus");
    const queueId = data.queueId;
    const tokenId = data.tokenId;
    const queue = admin.firestore().collection(QUEUES_COLLECTION_NAME);
    const users = queue.doc(queueId).collection("users");
    const user = await users.doc(tokenId).get().then(doc => {
        if (doc.data()) {
            return doc.data();
        }
        else {
            throw new functions.https.HttpsError('invalid-argument', "User not found");
        }
    }).catch(err => {
        throw new functions.https.HttpsError('unknown', err.message, err)
    });

    const aheadCount = await users.where("timestamp", "<", user.timestamp).get()
        .then(snapshot => snapshot.size);

    return {
        aheadCount: aheadCount,
        notified: user.notified
    }
});