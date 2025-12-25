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
    
    document.getElementById('importData').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importData(e);
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
    
    // Mouse modal close button
    document.getElementById('closeMouseModal').addEventListener('click', () => {
      this.closeMouseModal();
    });
    
    // Close modal when clicking outside
    document.getElementById('networkModal').addEventListener('click', (e) => {
      if (e.target.id === 'networkModal') {
        this.closeModal();
      }
    });
    
    // Close mouse modal when clicking outside
    document.getElementById('mouseModal').addEventListener('click', (e) => {
      if (e.target.id === 'mouseModal') {
        this.closeMouseModal();
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
    // Show total counts for all activities instead of filtering by last 5 minutes
    // Keyboard statistics
    const keyboardCount = (this.activities.keyboard || []).length;
    document.getElementById('keyCount').textContent = keyboardCount;
    
    // Mouse statistics
    const mouseData = this.activities.mouse || [];
    const mouseCount = Array.isArray(mouseData)
      ? mouseData.length
      : (mouseData.allEvents || []).length;
    document.getElementById('clickCount').textContent = mouseCount;
    
    // Network statistics
    const networkCount = (this.activities.network || []).length;
    document.getElementById('networkCount').textContent = networkCount;
    
    // Activity score (relative to recent activity, but let's keep it simple)
    const activityScore = Math.min(
      (keyboardCount * 0.3 + mouseCount * 0.4 + networkCount * 0.3) / 2,
      100
    ).toFixed(0);
    document.getElementById('activityScore').textContent = activityScore;
  }
  
  updateActivityList() {
    const activityList = document.getElementById('activityList');
    const recentActivities = [];
    
    // Merge all types of activities
    ['keyboard', 'mouse', 'network'].forEach(type => {
      let activities = this.activities[type] || [];
      
      // Handle mouse data which might be an object with allEvents
      if (type === 'mouse' && !Array.isArray(activities)) {
        activities = activities.allEvents || [];
      }
      
      if (Array.isArray(activities)) {
        activities.forEach(activity => {
          recentActivities.push({
            ...activity,
            activityType: type
          });
        });
      }
    });
    
    // Sort by time
    recentActivities.sort((a, b) => b.timestamp - a.timestamp);
    
    if (recentActivities.length === 0) {
      activityList.innerHTML = '<div class="empty-state">No activity records</div>';
      return;
    }
    
    // Show top 50 activities instead of just 10, or all if preferred
    const displayCount = Math.min(recentActivities.length, 50);
    
    activityList.innerHTML = recentActivities.slice(0, displayCount).map((activity, index) => `
      <div class="activity-item ${activity.activityType === 'network' || activity.activityType === 'mouse' ? 'clickable' : ''}"
           data-index="${index}"
           data-type="${activity.activityType}">
        <div class="activity-content">
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
        ${activity.activityType === 'mouse' ? `
          <button class="details-btn" data-index="${index}">Details</button>
        ` : ''}
      </div>
    `).join('');
    
    // Add click handlers for items
    activityList.querySelectorAll('.activity-item.clickable').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if details button was clicked
        if (e.target.classList.contains('details-btn')) return;
        
        const index = parseInt(e.currentTarget.dataset.index);
        const activity = recentActivities[index];
        
        if (activity.activityType === 'network') {
          this.showNetworkActivityDetails(activity);
        } else if (activity.activityType === 'mouse') {
          // Highlight position without opening modal
          this.highlightActivityOnPage(activity);
        }
      });
    });
    
    // Add click handlers for details buttons
    activityList.querySelectorAll('.details-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        const activity = recentActivities[index];
        this.showMouseActivityDetails(activity);
      });
    });
  }
  
  async highlightActivityOnPage(activity) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'HIGHLIGHT_MOUSE_ACTIVITY',
        activity: activity
      });
    } catch (error) {
      console.error('Error highlighting activity:', error);
    }
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
    await this.loadSettings();
    const data = {
      version: '1.0',
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
  
  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Handle both old and new export formats
        const activities = data.activities || data;
        
        if (!activities || (!activities.keyboard && !activities.mouse && !activities.network)) {
          throw new Error('Invalid export file: missing activities data');
        }
        
        if (confirm('Importing data will overwrite your current activities. Continue?')) {
          // 1. Update storage
          await new Promise((resolve) => {
            chrome.storage.local.set({ 
              activities: activities,
              settings: data.settings || this.settings
            }, resolve);
          });
          
          this.activities = activities;
          this.settings = data.settings || this.settings;
          
          // 2. Notify content script to update its local state
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            try {
              // First reset content script state
              await chrome.tabs.sendMessage(tab.id, { type: 'RESET_ACTIVITIES' });
            } catch (err) {
              console.log('Content script notification failed:', err);
            }
          }
          
          // Force a small delay to allow storage to settle
          await new Promise(r => setTimeout(r, 500));
          
          this.updateUI();
          // alert('Data imported successfully!'); // Removed success message as requested
        }
      } catch (error) {
        console.error('Error importing data:', error);
        alert('Failed to import data: ' + error.message);
      }
      // Reset file input
      event.target.value = '';
    };
    reader.readAsText(file);
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
    
    // Get speed setting
    const speed = parseFloat(document.getElementById('replaySpeed').value);
    
    // Get activities
    await this.loadSettings();
    
    console.log('Loading all activities for replay');
    console.log('Activities object:', this.activities);
    console.log('Mouse data:', this.activities.mouse);
    
    // Handle different possible data structures for mouse data
    let mouseClicks = [];
    let mouseAllEvents = [];
    
    if (Array.isArray(this.activities.mouse)) {
      // Mouse data is stored as an array of events
      mouseClicks = this.activities.mouse.filter(m => m.type === 'click');
      mouseAllEvents = this.activities.mouse;
    } else if (typeof this.activities.mouse === 'object') {
      // Mouse data is stored as object with separate arrays
      mouseClicks = (this.activities.mouse?.clicks || []);
      mouseAllEvents = (this.activities.mouse?.allEvents || []);
    }
    
    console.log('Mouse clicks found:', mouseClicks.length);
    console.log('Mouse all events found:', mouseAllEvents.length);
    
    const activitiesToReplay = {
      keyboard: (this.activities.keyboard || []),
      mouse: {
        movements: [],
        clicks: mouseClicks,
        scrolls: [],
        allEvents: mouseAllEvents
      }
    };
    
    const totalEvents = activitiesToReplay.keyboard.length +
                      activitiesToReplay.mouse.allEvents.length;
    
    if (totalEvents === 0) {
      alert('No activity records found');
      return;
    }
    
    // Confirm before replaying
    const confirmMsg = `About to replay all ${totalEvents} activity events\n\n` +
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
  
  async showMouseActivityDetails(activity) {
    const modal = document.getElementById('mouseModal');
    const modalBody = document.getElementById('mouseModalBody');
    
    // Build the modal content
    let content = `
      <div class="modal-section">
        <div class="modal-section-title">Mouse Activity Information</div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">Event Type:</div>
          <div class="modal-detail-value"><code>${activity.type || 'Unknown'}</code></div>
        </div>
        <div class="modal-detail-row">
          <div class="modal-detail-label">Position (X, Y):</div>
          <div class="modal-detail-value">${activity.x || 0}, ${activity.y || 0}</div>
        </div>
        ${activity.pageX !== undefined ? `
        <div class="modal-detail-row">
          <div class="modal-detail-label">Page Position (X, Y):</div>
          <div class="modal-detail-value">${activity.pageX}, ${activity.pageY}</div>
        </div>
        ` : ''}
        <div class="modal-detail-row">
          <div class="modal-detail-label">Timestamp:</div>
          <div class="modal-detail-value">${new Date(activity.timestamp).toLocaleString()}</div>
        </div>
        ${activity.button !== undefined ? `
        <div class="modal-detail-row">
          <div class="modal-detail-label">Button:</div>
          <div class="modal-detail-value">${activity.button === 0 ? 'Left' : activity.button === 1 ? 'Middle' : activity.button === 2 ? 'Right' : activity.button}</div>
        </div>
        ` : ''}
      </div>
    `;
    
    // Add target element information if available
    if (activity.target) {
      content += `
        <div class="modal-section">
          <div class="modal-section-title">Target Element</div>
          <div class="modal-detail-row">
            <div class="modal-detail-label">Tag:</div>
            <div class="modal-detail-value"><code>${activity.target.tagName || '-'}</code></div>
          </div>
          ${activity.target.id ? `
          <div class="modal-detail-row">
            <div class="modal-detail-label">ID:</div>
            <div class="modal-detail-value"><code>${activity.target.id}</code></div>
          </div>
          ` : ''}
          ${activity.target.className ? `
          <div class="modal-detail-row">
            <div class="modal-detail-label">Class:</div>
            <div class="modal-detail-value"><code>${activity.target.className}</code></div>
          </div>
          ` : ''}
          ${activity.target.name ? `
          <div class="modal-detail-row">
            <div class="modal-detail-label">Name:</div>
            <div class="modal-detail-value"><code>${activity.target.name}</code></div>
          </div>
          ` : ''}
          ${activity.target.text ? `
          <div class="modal-detail-row">
            <div class="modal-detail-label">Text:</div>
            <div class="modal-detail-value">${activity.target.text}</div>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    // Add action button to highlight element on page
    content += `
      <div class="modal-section">
        <button id="highlightElementBtn" class="btn btn-primary">Highlight Element on Page</button>
        <div id="highlightResult" class="highlight-result"></div>
      </div>
    `;
    
    modalBody.innerHTML = content;
    modal.classList.add('show');
    
    // Add click handler for highlight button
    document.getElementById('highlightElementBtn').addEventListener('click', async () => {
      const resultDiv = document.getElementById('highlightResult');
      resultDiv.textContent = 'Highlighting...';
      
      try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          resultDiv.textContent = 'Error: No active tab found';
          resultDiv.classList.add('error');
          return;
        }
        
        // Send message to content script to highlight element
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'HIGHLIGHT_MOUSE_ACTIVITY',
          activity: activity
        });
        console.log('Received response:', response);
        
        if (response && response.success) {
          resultDiv.textContent = response.message || 'Element highlighted successfully!';
          resultDiv.classList.add('success');
        } else {
          resultDiv.textContent = response?.message || 'Element not found on current page. You may be on a different page than when this activity was recorded.';
          resultDiv.classList.add('error');
        }
      } catch (error) {
        console.error('Error highlighting element:', error);
        console.error('Error details:', error.message, error.stack);
        resultDiv.textContent = `Error: ${error.message || 'Could not communicate with the page. Please refresh and try again.'}`;
        resultDiv.classList.add('error');
      }
    });
  }
  
  closeMouseModal() {
    const modal = document.getElementById('mouseModal');
    modal.classList.remove('show');
  }
}

// Initialize popup
const popupManager = new PopupManager();
