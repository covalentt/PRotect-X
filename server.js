const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/dashboard.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.js'));
});
app.use(express.static('public'));

// ============================================
// DATABASE SETUP
// ============================================

const db = new sqlite3.Database('./safety_mask.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create sensor data table
    db.run(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        heart_rate INTEGER,
        finger_detected INTEGER,
        motion_detected INTEGER,
        ir_value INTEGER,
        gas_value INTEGER,
        vibrator_active INTEGER,
        gas_alert INTEGER,
        heart_alert INTEGER,
        no_motion_alert INTEGER
      )
    `);

    // Create alerts table
    db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        alert_type TEXT,
        alert_message TEXT,
        status TEXT
      )
    `);

    console.log('Database tables initialized');
  });
}

// ============================================
// DEVICE ID (Can be extended for multiple devices)
// ============================================

let currentDeviceStatus = {
  lastUpdate: null,
  isOnline: false,
  heartRate: 0,
  fingerDetected: false,
  motionDetected: false,
  irValue: 0,
  gasValue: 0,
  vibratorAlert: false,
  gasAlert: false,
  heartAlert: false,
  noMotionAlert: false
};

// ============================================
// API ENDPOINTS
// ============================================

// Receive sensor data from ESP32
app.post('/api/sensor-data', (req, res) => {
  const {
    heartRate,
    fingerDetected,
    motionDetected,
    irValue,
    gasValue,
    vibratorAlert,
    gasAlert,
    heartAlert,
    noMotionAlert
  } = req.body;

  // Update current status
  currentDeviceStatus = {
    lastUpdate: new Date(),
    isOnline: true,
    heartRate: heartRate || 0,
    fingerDetected: fingerDetected || false,
    motionDetected: motionDetected || false,
    irValue: irValue || 0,
    gasValue: gasValue || 0,
    vibratorAlert: vibratorAlert || false,
    gasAlert: gasAlert || false,
    heartAlert: heartAlert || false,
    noMotionAlert: noMotionAlert || false
  };

  // Save to database
  db.run(`
    INSERT INTO sensor_data (
      heart_rate, finger_detected, motion_detected, ir_value, gas_value,
      vibrator_active, gas_alert, heart_alert, no_motion_alert
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    heartRate || 0,
    fingerDetected ? 1 : 0,
    motionDetected ? 1 : 0,
    irValue || 0,
    gasValue || 0,
    vibratorAlert ? 1 : 0,
    gasAlert ? 1 : 0,
    heartAlert ? 1 : 0,
    noMotionAlert ? 1 : 0
  ], (err) => {
    if (err) console.error('Database insert error:', err);
  });

  // Log alerts
  if (gasAlert || heartAlert || noMotionAlert) {
    let alertMessage = 'Alerts: ';
    if (gasAlert) alertMessage += 'High Gas | ';
    if (heartAlert) alertMessage += 'Low Heart Rate | ';
    if (noMotionAlert) alertMessage += 'No Motion Detected | ';

    db.run(`
      INSERT INTO alerts (alert_type, alert_message, status)
      VALUES (?, ?, ?)
    `, ['sensor_alert', alertMessage, 'active']);
  }

  // Broadcast to all connected clients
  io.emit('sensor-update', currentDeviceStatus);

  res.json({ success: true, message: 'Data received' });
});

// Get current device status
app.get('/api/device-status', (req, res) => {
  res.json(currentDeviceStatus);
});

// Get historical data
app.get('/api/sensor-data/history', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;

  db.all(`
    SELECT * FROM sensor_data
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `, [parseInt(limit), parseInt(offset)], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get data for last N hours
app.get('/api/sensor-data/range', (req, res) => {
  const { hours = 24 } = req.query;

  db.all(`
    SELECT * FROM sensor_data
    WHERE timestamp >= datetime('now', '-' || ? || ' hours')
    ORDER BY timestamp ASC
  `, [parseInt(hours)], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get alerts
app.get('/api/alerts', (req, res) => {
  const { limit = 50 } = req.query;

  db.all(`
    SELECT * FROM alerts
    ORDER BY timestamp DESC
    LIMIT ?
  `, [parseInt(limit)], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get statistics
app.get('/api/statistics', (req, res) => {
  db.all(`
    SELECT
      AVG(heart_rate) as avg_heart_rate,
      MIN(heart_rate) as min_heart_rate,
      MAX(heart_rate) as max_heart_rate,
      AVG(gas_value) as avg_gas_value,
      MAX(gas_value) as max_gas_value,
      SUM(CASE WHEN motion_detected = 1 THEN 1 ELSE 0 END) as motion_events,
      SUM(CASE WHEN gas_alert = 1 THEN 1 ELSE 0 END) as gas_alerts_count,
      SUM(CASE WHEN heart_alert = 1 THEN 1 ELSE 0 END) as heart_alerts_count,
      SUM(CASE WHEN no_motion_alert = 1 THEN 1 ELSE 0 END) as motion_alerts_count
    FROM sensor_data
    WHERE timestamp >= datetime('now', '-24 hours')
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows[0] || {});
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// ============================================
// SOCKET.IO
// ============================================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current status to new client
  socket.emit('sensor-update', currentDeviceStatus);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Set device offline after 30 seconds of no data
setInterval(() => {
  if (currentDeviceStatus.lastUpdate) {
    const timeSinceUpdate = Date.now() - currentDeviceStatus.lastUpdate.getTime();
    if (timeSinceUpdate > 30000) {
      currentDeviceStatus.isOnline = false;
      io.emit('sensor-update', currentDeviceStatus);
    }
  }
}, 5000);

// ============================================
// BLYNK POLLING
// ============================================
const BLYNK_TOKEN = 'n50c3tuwopv9uGU3NJgCT3U5mn-_aji6'; // regenerate it in Blynk first

async function pollBlynk() {
  try {
    const hw = await fetch(`https://blynk.cloud/external/api/isHardwareConnected?token=${BLYNK_TOKEN}`);
    const status = (await hw.text()).trim();
    console.log('Blynk hardware status:', status);
    if (status !== 'true') return;

    const r = await fetch(`https://blynk.cloud/external/api/get?token=${BLYNK_TOKEN}&v1&v2&v3&v7&v8`);
    const raw = await r.text();
    console.log('Blynk data:', raw);
    const d = JSON.parse(raw);
    const alert = d.v8 || 'SAFE';

    const post = await fetch(`http://localhost:${PORT}/api/sensor-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heartRate: Math.round(parseFloat(d.v3) || 0),
        fingerDetected: d.v7 === '1',
        motionDetected: d.v2 === '1',
        gasValue: parseInt(d.v1) || 0,
        gasAlert: alert === 'GAS DETECTED',
        heartAlert: alert === 'LOW BPM',
        noMotionAlert: alert === 'NO MOTION',
        vibratorAlert: alert !== 'SAFE'
      })
    });
    console.log('Posted to server:', post.status);
  } catch (e) {
    console.error('Blynk poll error:', e.message);
  }
}
setInterval(pollBlynk, 2000);

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
