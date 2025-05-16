const http = require('http');
const { Server } = require('socket.io');
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

// Create HTTP server
const server = http.createServer();

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"]
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Create namespaces
const projectsNamespace = io.of('/projects');
const tasksNamespace = io.of('/tasks');
const usersNamespace = io.of('/users');
const commentsNamespace = io.of('/comments');
const notificationsNamespace = io.of('/notifications');

// Main namespace (/)
io.on('connection', (socket) => {
  console.log(`[Main] Client connected: ${socket.id}`);
  
  // Join a room
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`[Main] Client ${socket.id} joined room: ${room}`);
    socket.emit('room_joined', { room });
  });
  
  // Leave a room
  socket.on('leave_room', (room) => {
    socket.leave(room);
    console.log(`[Main] Client ${socket.id} left room: ${room}`);
    socket.emit('room_left', { room });
  });
  
  // Send message to a specific room
  socket.on('send_room_message', ({ room, message }) => {
    io.to(room).emit('room_message', { 
      sender: socket.id,
      room,
      message,
      time: new Date().toISOString()
    });
  });
  
  // Custom event handling
  socket.on('custom_event', (data) => {
    console.log(`[Main] Received custom event from ${socket.id}:`, data);
    socket.emit('custom_response', { 
      message: 'Custom event received',
      data
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`[Main] Client disconnected: ${socket.id}`);
  });
});

// Projects namespace
projectsNamespace.on('connection', (socket) => {
  console.log(`[Projects] Client connected: ${socket.id}`);
  
  socket.on('join_project', (projectId) => {
    socket.join(`project:${projectId}`);
    console.log(`[Projects] Client ${socket.id} joined project: ${projectId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Projects] Client disconnected: ${socket.id}`);
  });
});

// Tasks namespace
tasksNamespace.on('connection', (socket) => {
  console.log(`[Tasks] Client connected: ${socket.id}`);
  
  socket.on('join_task', (taskId) => {
    socket.join(`task:${taskId}`);
    console.log(`[Tasks] Client ${socket.id} joined task: ${taskId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Tasks] Client disconnected: ${socket.id}`);
  });
});

// Users namespace
usersNamespace.on('connection', (socket) => {
  console.log(`[Users] Client connected: ${socket.id}`);
  
  socket.on('follow_user', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`[Users] Client ${socket.id} following user: ${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Users] Client disconnected: ${socket.id}`);
  });
});

// Comments namespace
commentsNamespace.on('connection', (socket) => {
  console.log(`[Comments] Client connected: ${socket.id}`);
  
  socket.on('join_comment_thread', (taskId) => {
    socket.join(`comments:${taskId}`);
    console.log(`[Comments] Client ${socket.id} joined comment thread for task: ${taskId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Comments] Client disconnected: ${socket.id}`);
  });
});

// Notifications namespace
notificationsNamespace.on('connection', (socket) => {
  console.log(`[Notifications] Client connected: ${socket.id}`);
  
  socket.on('subscribe_user', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`[Notifications] Client ${socket.id} subscribed to user: ${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Notifications] Client disconnected: ${socket.id}`);
  });
});

// **1. Listen for changes in "projects" collection**
db.collection('projects').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const projectId = change.doc.id;
    
    // Send to main namespace for all clients
    io.emit('update', {
      type: 'project_update',
      action: change.type,
      projectId: projectId,
      data: { id: projectId, ...data }
    });
    
    // Send to specific project room in projects namespace
    projectsNamespace.to(`project:${projectId}`).emit('project_updated', {
      action: change.type,
      projectId: projectId,
      data: { id: projectId, ...data }
    });
  });
}, error => {
  console.error("🚨 Error Firestore listener:", error);
});

// **2. Listen for changes in "tasks" collection**
db.collectionGroup('tasks').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const taskId = change.doc.id;
    const projectId = data.projectId;
    
    // Send to main namespace for all clients
    io.emit('update', {
      type: 'task_update',
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      data: { id: taskId, ...data }
    });
    
    // Send to specific project room in projects namespace
    projectsNamespace.to(`project:${projectId}`).emit('task_updated', {
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      data: { id: taskId, ...data }
    });
    
    // Send to specific task room in tasks namespace
    tasksNamespace.to(`task:${taskId}`).emit('task_updated', {
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      data: { id: taskId, ...data }
    });
  });
});

// **3. Listen for changes in "users" collection**
db.collection('users').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const userId = change.doc.id;
    
    // Send to main namespace for all clients
    io.emit('update', {
      type: 'user_update',
      action: change.type,
      userId: userId,
      data: { id: userId, ...data }
    });
    
    // Send to specific user room in users namespace
    usersNamespace.to(`user:${userId}`).emit('user_updated', {
      action: change.type,
      userId: userId,
      data: { id: userId, ...data }
    });
  });
});

// **4. Listen for changes in "comments" collection**
db.collection('comments').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const commentId = change.doc.id;
    const projectId = data.projectId;
    const taskId = data.taskId;
    
    // Send to main namespace for all clients
    io.emit('update', {
      type: 'comment_update',
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      commentId: commentId,
      data: { id: commentId, ...data }
    });
    
    // Send to specific task room in tasks namespace
    tasksNamespace.to(`task:${taskId}`).emit('comment_updated', {
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      commentId: commentId,
      data: { id: commentId, ...data }
    });
    
    // Send to specific comment thread in comments namespace
    commentsNamespace.to(`comments:${taskId}`).emit('comment_updated', {
      action: change.type,
      projectId: projectId,
      taskId: taskId,
      commentId: commentId,
      data: { id: commentId, ...data }
    });
  });
});

// **5. Listen for changes in "notifications" collection**
db.collection('notifications').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const notificationId = change.doc.id;
    const userId = data.userId;
    
    // Send to main namespace for all clients
    io.emit('update', {
      type: 'notification_update',
      action: change.type,
      userId: userId,
      notificationId: notificationId,
      data: { id: notificationId, ...data }
    });
    
    // Send to specific user in notifications namespace
    notificationsNamespace.to(`user:${userId}`).emit('notification', {
      action: change.type,
      userId: userId,
      notificationId: notificationId,
      data: { id: notificationId, ...data }
    });
  });
});