const WebSocket = require('ws');
const admin = require('firebase-admin');

const firebaseConfig = {
  type: process.env.FIREBASE_TYPE || 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  // Handle case when private key is undefined
  private_key: process.env.FIREBASE_PRIVATE_KEY ? 
               process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : 
               undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
  token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};

// Check if essential Firebase config is available
if (!firebaseConfig.project_id || !firebaseConfig.private_key || !firebaseConfig.client_email) {
  console.error('⚠️ Missing essential Firebase configuration environment variables!');
  console.error('Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  console.error('Current config:', {
    project_id_set: !!firebaseConfig.project_id,
    private_key_set: !!firebaseConfig.private_key,
    client_email_set: !!firebaseConfig.client_email
  });
  // Choose whether to exit or continue
  // process.exit(1); // Uncomment to exit on missing config
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
  });
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  // Continue execution without Firebase if there's an error
}

const db = admin.firestore();
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
});

// Function to broadcast data to all connected clients
const broadcast = (message) => {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
};

// **1. Listen for changes in "projects" collection**
db.collection('projects').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        broadcast({
            type: 'project_update',  // Changed to match client expectations
            action: change.type,     // Store the original action type (created, modified, removed)
            projectId: change.doc.id, // Include projectId for client-side filtering
            data: { id: change.doc.id, ...change.doc.data() }
        });
    });
}, error => {
    console.error("🚨 Error Firestore listener:", error);
});

// **2. Listen for changes in "tasks" collection**
db.collectionGroup('tasks').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        broadcast({
            type: 'task_update',     // Changed to match client expectations
            action: change.type,     // Store the original action type
            projectId: data.projectId, // Include projectId for client-side filtering
            taskId: change.doc.id,
            data: { id: change.doc.id, ...data }
        });
    });
});

// **3. Listen for changes in "users" collection**
db.collection('users').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        broadcast({
            type: 'user_update',     // Changed to a more appropriate type
            action: change.type,
            userId: change.doc.id,
            data: { id: change.doc.id, ...change.doc.data() }
        });
    });
});

// **4. Listen for changes in "comments" collection**
db.collection('comments').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        broadcast({
            type: 'comment_update',  // Fixed: was incorrectly using 'user:${change.type}'
            action: change.type,
            projectId: data.projectId,
            taskId: data.taskId,
            commentId: change.doc.id,
            data: { id: change.doc.id, ...data }
        });
    });
});

// **5. Listen for changes in "notifications" collection**
db.collection('notifications').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        broadcast({
            type: 'notification_update',  // Fixed: was incorrectly using 'user:${change.type}'
            action: change.type,
            userId: data.userId,  // Assuming notifications have a userId field
            data: { id: change.doc.id, ...data }
        });
    });
});