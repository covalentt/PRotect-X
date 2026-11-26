// ============================================
// SOCKET.IO CONNECTION
// ============================================

const socket = io();

let charts = {};
let currentData = {};

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initialized');
  
  // Initialize charts
  initCharts();
  
  // Load initial data
  loadHistoricalData();
  loadStatistics();
  loadAlerts();
  
  // Update clock
  updateClock();
  setInterval(updateClock, 1000);
  
  // Refresh data periodically
  setInterval(loadHistoricalData, 10000);
  setInterval(loadStatistics, 30000);
  setInterval(loadAlerts, 5000);
});

// ============================================
// REAL-TIME SOCKET UPDATES
// ============================================

socket.on('sensor-update', (data) => {
  console.log('Sensor update received:', data);
  currentData = data;
  
  updateDeviceStatus();
  updateCards();
  updateCharts();
});

// ============================================
// UPDATE DEVICE STATUS
// ============================================

function updateDeviceStatus() {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  if (currentData.isOnline) {
    statusIndicator.className = 'status-indicator online';
    statusText.textContent = 'Device Status: ONLINE';
    statusText.style.color = '#10b981';
  } else {
    statusIndicator.className = 'status-indicator offline';
    statusText.textContent = 'Device Status: OFFLINE';
    statusText.style.color = '#ef4444';
  }
  
  // Update last update time
  if (currentData.lastUpdate) {
    const lastUpdateTime = new Date(currentData.lastUpdate);
    const timeAgo = getTimeAgo(lastUpdateTime);
    document.getElementById('lastUpdate').textContent = lastUpdateTime.toLocaleTimeString();
    document.getElementById('updateStatus').textContent = `${timeAgo} ago`;
  }
}

// ============================================
// UPDATE CARD VALUES
// ============================================

function updateCards() {
  // Heart Rate
  if (currentData.fingerDetected && currentData.heartRate > 0) {
    document.getElementById('heartRateValue').textContent = currentData.heartRate;
    document.getElementById('heartStatus').className = 
      currentData.heartAlert ? 'card-status status-alert' : 'card-status status-normal';
    document.getElementById('heartStatus').textContent = 
      currentData.heartAlert ? '⚠️ LOW HEART RATE' : '✓ Normal';
    document.getElementById('fingerIcon').className = 'icon-indicator detected';
  } else {
    document.getElementById('heartRateValue').textContent = '--';
    document.getElementById('heartStatus').className = 'card-status status-inactive';
    document.getElementById('heartStatus').textContent = 'No Finger Detected';
    document.getElementById('fingerIcon').className = 'icon-indicator not-detected';
  }

  // Gas Level
  document.getElementById('gasValue').textContent = currentData.gasValue || '--';
  const gasStatus = document.getElementById('gasStatus');
  if (currentData.gasAlert) {
    gasStatus.className = 'card-status status-alert';
    gasStatus.textContent = '⚠️ HIGH GAS LEVEL';
  } else {
    gasStatus.className = 'card-status status-normal';
    gasStatus.textContent = '✓ Normal';
  }

  // Motion Detection
  const motionStatus = document.getElementById('motionStatus');
  const motionIcon = document.getElementById('motionIcon');
  if (currentData.motionDetected) {
    motionStatus.className = 'card-status status-normal';
    motionStatus.textContent = '✓ Motion Detected';
    motionIcon.className = 'icon-indicator detected';
  } else if (currentData.noMotionAlert) {
    motionStatus.className = 'card-status status-alert';
    motionStatus.textContent = '⚠️ NO MOTION 5s';
    motionIcon.className = 'icon-indicator not-detected';
  } else {
    motionStatus.className = 'card-status status-inactive';
    motionStatus.textContent = 'Not Detected';
    motionIcon.className = 'icon-indicator not-detected';
  }

  // IR Value
  document.getElementById('irValue').textContent = currentData.irValue || '--';

  // Vibrator
  const vibratorStatus = document.getElementById('vibratorStatus');
  const vibratorIcon = document.getElementById('vibratorIcon');
  if (currentData.vibratorAlert) {
    vibratorStatus.className = 'card-status status-alert';
    vibratorStatus.textContent = '⚠️ ALERT ON';
    vibratorIcon.className = 'icon-indicator detected';
  } else {
    vibratorStatus.className = 'card-status status-normal';
    vibratorStatus.textContent = '✓ Off';
    vibratorIcon.className = 'icon-indicator not-detected';
  }
}

// ============================================
// INITIALIZE CHARTS
// ============================================

function initCharts() {
  const chartConfig = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      filler: {
        propagate: true
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  // Heart Rate Chart
  const heartRateCtx = document.getElementById('heartRateChart').getContext('2d');
  charts.heartRate = new Chart(heartRateCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Heart Rate (BPM)',
        data: [],
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#ec4899'
      }]
    },
    options: chartConfig
  });

  // Gas Chart
  const gasCtx = document.getElementById('gasChart').getContext('2d');
  charts.gas = new Chart(gasCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Gas Level (ppm)',
        data: [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#f59e0b'
      }]
    },
    options: chartConfig
  });

  // Motion Chart
  const motionCtx = document.getElementById('motionChart').getContext('2d');
  charts.motion = new Chart(motionCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Motion Events',
        data: [],
        backgroundColor: '#8b5cf6',
        borderColor: '#7c3aed',
        borderWidth: 1
      }]
    },
    options: chartConfig
  });

  // Alert Chart
  const alertCtx = document.getElementById('alertChart').getContext('2d');
  charts.alert = new Chart(alertCtx, {
    type: 'doughnut',
    data: {
      labels: ['Gas Alerts', 'Heart Alerts', 'Motion Alerts'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: ['#f59e0b', '#ec4899', '#8b5cf6'],
        borderColor: ['#f97316', '#be185d', '#6d28d9'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// ============================================
// UPDATE CHARTS
// ============================================

function updateCharts() {
  fetch('/api/sensor-data/range?hours=24')
    .then(response => response.json())
    .then(data => {
      if (!data || data.length === 0) return;

      // Prepare data
      const labels = data.map(d => {
        const date = new Date(d.timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      });

      const heartRates = data.map(d => d.heart_rate);
      const gasValues = data.map(d => d.gas_value);
      const motionEvents = data.map(d => d.motion_detected ? 1 : 0);

      // Update Heart Rate Chart
      charts.heartRate.data.labels = labels;
      charts.heartRate.data.datasets[0].data = heartRates;
      charts.heartRate.update();

      // Update Gas Chart
      charts.gas.data.labels = labels;
      charts.gas.data.datasets[0].data = gasValues;
      charts.gas.update();

      // Update Motion Chart
      charts.motion.data.labels = labels;
      charts.motion.data.datasets[0].data = motionEvents;
      charts.motion.update();

      // Count alerts for pie chart
      const gasAlerts = data.filter(d => d.gas_alert).length;
      const heartAlerts = data.filter(d => d.heart_alert).length;
      const motionAlerts = data.filter(d => d.no_motion_alert).length;

      charts.alert.data.datasets[0].data = [gasAlerts, heartAlerts, motionAlerts];
      charts.alert.update();
    })
    .catch(err => console.error('Error updating charts:', err));
}

// ============================================
// LOAD HISTORICAL DATA
// ============================================

function loadHistoricalData() {
  fetch('/api/sensor-data/range?hours=24&limit=1000')
    .then(response => response.json())
    .then(data => {
      updateCharts();
    })
    .catch(err => console.error('Error loading historical data:', err));
}

// ============================================
// LOAD STATISTICS
// ============================================

function loadStatistics() {
  fetch('/api/statistics')
    .then(response => response.json())
    .then(stats => {
      if (!stats || Object.keys(stats).length === 0) return;

      const statsGrid = document.getElementById('statsGrid');
      statsGrid.innerHTML = `
        <div class="stat-item">
          <div class="stat-label">Avg Heart Rate</div>
          <div class="stat-value">${Math.round(stats.avg_heart_rate || 0)} BPM</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Min Heart Rate</div>
          <div class="stat-value">${stats.min_heart_rate || '--'} BPM</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Max Heart Rate</div>
          <div class="stat-value">${stats.max_heart_rate || '--'} BPM</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Avg Gas Level</div>
          <div class="stat-value">${Math.round(stats.avg_gas_value || 0)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Max Gas Level</div>
          <div class="stat-value">${stats.max_gas_value || '--'}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Motion Events</div>
          <div class="stat-value">${stats.motion_events || 0}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Gas Alerts</div>
          <div class="stat-value">${stats.gas_alerts_count || 0}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Heart Alerts</div>
          <div class="stat-value">${stats.heart_alerts_count || 0}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Motion Alerts</div>
          <div class="stat-value">${stats.motion_alerts_count || 0}</div>
        </div>
      `;
    })
    .catch(err => console.error('Error loading statistics:', err));
}

// ============================================
// LOAD ALERTS
// ============================================

function loadAlerts() {
  fetch('/api/alerts?limit=20')
    .then(response => response.json())
    .then(alerts => {
      const alertsList = document.getElementById('alertsList');
      
      if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = '<div class="no-alerts">✓ No recent alerts</div>';
        return;
      }

      alertsList.innerHTML = alerts.map(alert => {
        const timestamp = new Date(alert.timestamp);
        const timeAgo = getTimeAgo(timestamp);
        
        let alertType = 'motion';
        let badgeClass = 'motion';
        
        if (alert.alert_message.includes('HIGH GAS')) {
          alertType = 'GAS';
          badgeClass = 'gas';
        } else if (alert.alert_message.includes('LOW HEART RATE')) {
          alertType = 'HEART';
          badgeClass = 'heart';
        } else if (alert.alert_message.includes('NO MOTION')) {
          alertType = 'MOTION';
          badgeClass = 'motion';
        }

        return `
          <div class="alert-item ${badgeClass}">
            <div>
              <div class="alert-message">${alert.alert_message}</div>
              <div class="alert-time">${timeAgo} ago (${timestamp.toLocaleTimeString()})</div>
            </div>
            <span class="alert-badge ${badgeClass}">${alertType}</span>
          </div>
        `;
      }).join('');
    })
    .catch(err => console.error('Error loading alerts:', err));
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function updateClock() {
  const now = new Date();
  document.getElementById('currentTime').textContent = 
    now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Log connection status
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  document.getElementById('statusIndicator').className = 'status-indicator offline';
  document.getElementById('statusText').textContent = 'Device Status: OFFLINE';
  document.getElementById('statusText').style.color = '#ef4444';
});
