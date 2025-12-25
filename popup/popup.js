class PopupManager {
  constructor() {
    this.activities = [];
    this.settings = {};
    this.init();
  }
  
  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    
    // Start periodic updates
    setInterval(() => this.updateUI(), 2000);
  }
  
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings', 'activities'], (result) => {
        this.settings = result.settings || {};
        this.activities = result.activities || {};
        resolve();
      });
    });
  }
  
  setupEventListeners() {
    // Monitor toggles
    document.getElementById('toggleKeyboard').addEventListener('change', (e) => {
      this.updateSetting('monitorKeyboard', e.target.checked);
    });
    
    document.getElementById('toggleMouse').addEventListener('change', (e) => {
      this.updateSetting('monitorMouse', e.target.checked);
    });
    
    document.getElementById('toggleNetwork').addEventListener('change', (e) => {
      this.updateSetting('monitorNetwork', e.target.checked);
    });
    
    // Privacy level
    document.getElementById('privacyLevel').addEventListener('change', (e) => {
      this.updateSetting('privacyMode', e.target.value);
    });
    
    // Buttons
    document.getElementById('exportData').addEventListener('click', () => {
      this.exportData();
    });
    
    document.getElementById('clearData').addEventListener('click', () => {
      this.clearData();
    });
    
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    
    // Replay buttons
    document.getElementById('replayActivities').addEventListener('click', () => {
      this.replayActivities();
    });
    
    document.getElementById('stopReplay').addEventListener('click', () => {
      this.stopReplay();
    });
    
    // Refresh button
    document.getElementById('refreshActivities').addEventListener('click', () => {
      this.refreshActivities();
    });
    
    // Clear activities button
    document.getElementById('clearActivities').addEventListener('click', () => {
      this.clearActivities();
    });
    
    // Modal close button
    document.getElementById('closeModal').addEventListener('click', () => {
      this.closeModal();
    });
    
    // Close modal when clicking outside
    document.getElementById('networkModal').addEventListener('click', (e) => {
      if (e.target.id === 'networkModal') {
        this.closeModal();
      }
    });
  }
  
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings: this.settings }, resolve);
    });
    
    // Notify content script of update
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'UPDATE_SETTINGS',
          settings: this.settings
        });
      }
    });
  }
  
  async updateUI() {
    await this.loadSettings();
    
    // Update toggle states
    document.getElementById('toggleKeyboard').checked = this.settings.monitorKeyboard !== false;
    document.getElementById('toggleMouse').checked = this.settings.monitorMouse !== false;
    document.getElementById('toggleNetwork').checked = this.settings.monitorNetwork !== false;
    
    // Update privacy level
    const privacySelect = document.getElementById('privacyLevel');
    privacySelect.value = this.settings.privacyMode || 'medium';
    
    // Update statistics
    this.updateStats();
    
    // Update activity list
    this.updateActivityList();
    
    // Update session info
    this.updateSessionInfo();
    
    // Update status indicator
    this.updateStatusIndicator();
  }
  
  updateStats() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // Keyboard statistics
    const keyboardCount = (this.activities.keyboard || []).filter(
      k => k.timestamp > fiveMinutesAgo
    ).length;
    document.getElementById('keyCount').textContent = keyboardCount;
    
    // Mouse statistics
    const mouseData = this.activities.mouse || [];
    const mouseCount = Array.isArray(mouseData)
      ? mouseData.filter(m => m.timestamp > fiveMinutesAgo).length
      : (mouseData.allEvents || []).filter(m => m.timestamp > fiveMinutesAgo).length;
    document.getElementById('clickCount').textContent = mouseCount;
    
    // Network statistics
    const networkCount = (this.activities.network || []).filter(
      n => n.timestamp > fiveMinutesAgo
    ).length;
    document.getElementById('networkCount').textContent = networkCount;
    
    // Activity score
    const activityScore = Math.min(
      (keyboardCount * 0.3 + mouseCount * 0.4 + networkCount * 0.3) / 2,
      100
    ).toFixed(0);
    document.getElementById('activityScore').textContent = activityScore;
  }
  
  updateActivityList() {
    const activityList = document.getElementById('activityList');
    const now = Date.now();
    const recentActivities = [];
    
    // Merge all types of recent activities
    ['keyboard', 'mouse', 'network'].forEach(type => {
      let activities = this.activities[type] || [];
      
      // Handle mouse data which might be an object with allEvents
      if (type === 'mouse' && !Array.isArray(activities)) {
        activities = activities.allEvents || [];
      }
      
      if (Array.isArray(activities)) {
        activities.slice(-5).forEach(activity => {
          if (now - activity.timestamp < 5 * 60 * 1000) {
            recentActivities.push({
              ...activity,
              activityType: type
            });
          }
        });
      }
    });
    
    // Sort by time
    recentActivities.sort((a, b) => b.timestamp - a.timestamp);
    
    if (recentActivities.length === 0) {
      activityList.innerHTML = '<div class="empty-state">No activity records</div>';
      return;
    }
    
    activityList.innerHTML = recentActivities.slice(0, 10).map((activity, index) => `
      <div class="activity-item ${activity.activityType === 'network' ? 'clickable' : ''}"
           data-index="${index}"
           data-type="${activity.activityType}">
        <div>
          <span class="activity-type type-${activity.activityType}">
            ${this.getActivityTypeLabel(activity.activityType)}
          </span>
          <span>${this.getActivityDescription(activity)}</span>
        </div>
        <div class="activity-time">
          ${this.formatTime(activity.timestamp)}
        </div>
      </div>
    `).join('');
    
    // Add click handlers for network activity items
    activityList.querySelectorAll('.activity-item.clickable').forEach(item => {
      item.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.showNetworkActivityDetails(recentActivities[index]);
      });
    });
  }
  
  getActivityTypeLabel(type) {
    const labels = {
      keyboard: 'Keyboard',
      mouse: 'Mouse',
      network: 'Network'
    };
    return labels[type] || type;
  }
  
  getActivityDescription(activity) {
    switch (activity.activityType) {
      case 'keyboard':
        return `Key: ${activity.key}`;
      case 'mouse':
        return activity.type === 'click' ? 'Click' : activity.type;
      case 'network':
        return `${activity.method} ${activity.url?.split('/').pop() || 'Request'}`;
      default:
        return activity.type || 'Activity';
    }
  }
  
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) {
      return `${Math.floor(diff / 1000)}s ago`;
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else {
      return new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  }
  
  updateSessionInfo() {
    // Generate simplified session ID
    const sessionId = Math.random().toString(36).substr(2, 8).toUpperCase();
    document.getElementById('sessionId').textContent = sessionId;
    
    // Update last update time
    document.getElementById('lastUpdate').textContent = 
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  updateStatusIndicator() {
    const indicator = document.querySelector('.status-indicator');
    const isActive = this.settings.monitorKeyboard || 
                     this.settings.monitorMouse || 
                     this.settings.monitorNetwork;
    
    indicator.classList.toggle('inactive', !isActive);
  }
  
  async exportData() {
    const data = {
      exportTime: new Date().toISOString(),
      activities: this.activities,
      settings: this.settings
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-monitor-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  async clearData() {
    if (confirm('Are you sure you want to clear all activity data? This action cannot be undone.')) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ activities: {} }, resolve);
      });
      this.activities = {};
      this.updateUI();
    }
  }
  
  async replayActivities() {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('Please open a webpage tab first');
      return;
    }
    
    // Get time range and speed settings
    const timeRange = parseInt(document.getElementById('replayTimeRange').value);
    const speed = parseFloat(document.getElementById('replaySpeed').value);
    
    // Get activities from specified time range
    await this.loadSettings();
    const now = Date.now();
    const cutoffTime = now - (timeRange * 60 * 1000);
    
    const activitiesToReplay = {
      keyboard: (this.activities.keyboard || []).filter(k => k.timestamp > cutoffTime),
      mouse: {
        movements: (this.activities.mouse?.movements || []).filter(m => m.timestamp > cutoffTime),
        clicks: (this.activities.mouse?.clicks || []).filter(c => c.timestamp > cutoffTime),
        scrolls: (this.activities.mouse?.scrolls || []).filter(s => s.timestamp > cutoffTime),
        allEvents: (this.activities.mouse?.allEvents || []).filter(e => e.timestamp > cutoffTime)
      }
    };
    
    const totalEvents = activitiesToReplay.keyboard.length + 
                      activitiesToReplay.mouse.allEvents.length;
    
    if (totalEvents === 0) {
      alert(`No activity records in the last ${timeRange} minutes`);
      return;
    }
    
    // Confirm before replaying
    const confirmMsg = `About to replay ${totalEvents} activity events from the last ${timeRange} minutes\n\n` +
                     `Playback speed: ${speed}x\n\n` +
                     `Note: Replay will execute keyboard and mouse operations on the current webpage. Please ensure the page state matches the recording state.`;
    
    if (!confirm(confirmMsg)) {
      return;
    }
    
    // Send replay message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'REPLAY_ACTIVITIES',
        activities: activitiesToReplay,
        options: { speed: speed }
      });
      
      // Close popup after starting replay
      window.close();
    } catch (error) {
      console.error('Error starting replay:', error);
      alert('Unable to start replay. Please refresh the page and try again.');
    }
  }
  
  async stopReplay() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'STOP_REPLAY'
      });
    } catch (error) {
      console.error('Error stopping replay:', error);
    }
  }
  
  async refreshActivities() {
    const refreshBtn = document.getElementById('refreshActivities');
    
    // Add spinning animation
    refreshBtn.classList.add('spinning');
    
    try {
      // Get active tab and send refresh message to content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'REFRESH_ACTIVITIES'
        });
        
        // Wait a moment for data to be sent to aggregator, then reload
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Reload settings and update UI
      await this.loadSettings();
      this.updateUI();
    } catch (error) {
      console.log('Error during refresh:', error);
      // If content script is not available, just reload settings
      await this.loadSettings();
      this.updateUI();
    } finally {
      // Always remove spinning animation
      refreshBtn.classList.remove('spinning');
    }
  }
  
  async clearActivities() {
    // Confirm before clearing
    if (!confirm('Are you sure you want to clear all activity records? This will reset the state and start recording from scratch.')) {
      return;
    }
    
    try {
      // Clear activities from storage
      await chrome.storage.local.set({
        activities: {
          keyboard: [],
          mouse: [],
          network: []
        }
      });
      
      // Send reset message to content script to clear its state
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'RESET_ACTIVITIES'
          });
        } catch (error) {
          console.log('Could not send reset message to content script:', error);
        }
      }
      
      // Reload settings and update UI to show empty state
      await this.loadSettings();
      this.updateUI();
      
      console.log('Activities cleared successfully');
    } catch (error) {
      console.error('Error clearing activities:', error);
      alert('Failed to clear activities. Please try again.');
    }
  }
  
  showNetworkActivityDetails(activity) {
    const modal = document.getElementById('networkModal');
    const modalBody = document.getElementById('modalBody');
    
    // Build the modal content
    let content = `
      <div class="modal-section">
        <div class="modal-section-title">Request Information</div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">Method:</div>
          <div class="modal-detail-value"><code>${activity.method || 'GET'}</code></div>
        </div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">URL:</div>
          <div class="modal-detail-value">${activity.url || '-'}</div>
        </div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">Type:</div>
          <div class="modal-detail-value">${activity.type || 'xhr'}</div>
        </div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">Timestamp:</div>
          <div class="modal-detail-value">${new Date(activity.timestamp).toLocaleString()}</div>
        </div>
      </div>
    `;
    
    // Add request headers if available
    if (activity.requestHeaders && Object.keys(activity.requestHeaders).length > 0) {
      content += `
        <div class="modal-section">
          <div class="modal-section-title">Request Headers</div>
          ${Object.entries(activity.requestHeaders).map(([key, value]) => `
            <div class="modal-detail-row">
              <div class="modal-detail-label">${key}:</div>
              <div class="modal-detail-value">${value}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    // Add response details if available
    if (activity.status !== undefined) {
      content += `
        <div class="modal-section">
          <div class="modal-section-title">Response Details</div>
          <div class="modal-detail-row">
            <div class="modal-detail-label">Status:</div>
            <div class="modal-detail-value">
              <code>${activity.status} ${activity.statusText || ''}</code>
            </div>
          </div>
          ${activity.duration ? `
          <div class="modal-detail-row">
            <div class="modal-detail-label">Duration:</div>
            <div class="modal-detail-value">${activity.duration}ms</div>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    // Add response headers if available
    if (activity.responseHeaders) {
      let headers = activity.responseHeaders;
      // Handle string format from XHR.getAllResponseHeaders()
      if (typeof headers === 'string' && headers.trim()) {
        const headerLines = headers.split('\n').filter(h => h.trim());
        content += `
          <div class="modal-section">
            <div class="modal-section-title">Response Headers</div>
            ${headerLines.map(line => {
              const [key, ...valueParts] = line.split(':');
              const value = valueParts.join(':').trim();
              return `
                <div class="modal-detail-row">
                  <div class="modal-detail-label">${key}:</div>
                  <div class="modal-detail-value">${value}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else if (typeof headers === 'object' && Object.keys(headers).length > 0) {
        // Handle object format from fetch
        content += `
          <div class="modal-section">
            <div class="modal-section-title">Response Headers</div>
            ${Object.entries(headers).map(([key, value]) => `
              <div class="modal-detail-row">
                <div class="modal-detail-label">${key}:</div>
                <div class="modal-detail-value">${value}</div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
    
    // Add request body if available
    if (activity.requestBody) {
      content += `
        <div class="modal-section">
          <div class="modal-section-title">Request Body</div>
          <div class="modal-detail-row">
            <div class="modal-detail-value">
              <pre>${typeof activity.requestBody === 'string'
                ? activity.requestBody
                : JSON.stringify(activity.requestBody, null, 2)}</pre>
            </div>
          </div>
        </div>
      `;
    }
    
    // Add response body if available
    if (activity.response) {
      content += `
        <div class="modal-section">
          <div class="modal-section-title">Response Body</div>
          <div class="modal-detail-row">
            <div class="modal-detail-value">
              <pre>${typeof activity.response === 'string'
                ? activity.response
                : JSON.stringify(activity.response, null, 2)}</pre>
            </div>
          </div>
        </div>
      `;
    }
    
    modalBody.innerHTML = content;
    modal.classList.add('show');
  }
  
  closeModal() {
    const modal = document.getElementById('networkModal');
    modal.classList.remove('show');
  }
}

// Initialize popup
const popupManager = new PopupManager();
