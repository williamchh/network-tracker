class ContentScript {
  constructor() {
    this.keyboardMonitor = null;
    this.mouseMonitor = null;
    this.aggregator = null;
    this.privacyManager = null;
    this.isActive = false;
    this.networkMonitoringActive = false;
    this.contextValid = true;
    console.log('Content script loaded');
    this.init();
  }
  
  async init() {
    // Get settings
    const settings = await this.getSettings();
    console.log('Content script initialized with settings:', settings);
    
    // Initialize monitors if enabled (default to true)
    this.initializeMonitors(settings);
    
    // Monitor network requests
    if (settings.monitorNetwork !== false) {
      this.setupNetworkMonitoring();
    }
    
    this.setupMessageListeners();
  }

  // Add method to check if extension context is valid
  isExtensionContextValid() {
    try {
      // Try to access chrome.runtime - if it throws, context is invalid
      return chrome.runtime && chrome.runtime.id !== undefined;
    } catch (e) {
      return false;
    }
  }
  
  async getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'GET_SETTINGS' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error getting settings:', chrome.runtime.lastError.message);
            // Return default settings if there's an error
            resolve({
              monitorKeyboard: true,
              monitorMouse: true,
              monitorNetwork: true,
              privacyMode: 'medium'
            });
          } else {
            resolve(response || {
              monitorKeyboard: true,
              monitorMouse: true,
              monitorNetwork: true,
              privacyMode: 'medium'
            });
          }
        }
      );
    });
  }
  
  initializeMonitors(settings) {
    if (settings.monitorKeyboard !== false) {
      this.keyboardMonitor = new KeyboardMonitor();
      console.log('Keyboard monitor initialized');
    }
    
    if (settings.monitorMouse !== false) {
      this.mouseMonitor = new MouseMonitor();
      console.log('Mouse monitor initialized');
    }
    
    // Always create aggregator and privacy manager
    this.aggregator = new ActivityAggregator(
      this.keyboardMonitor,
      this.mouseMonitor
    );
    
    this.privacyManager = new PrivacyManager();
    
    // Start collecting data
    this.startDataCollection();
    this.isActive = true;
    console.log('Data collection started');
  }
  
  // Revised Network Monitoring using Injection + Event Bridge
  setupNetworkMonitoring() {
    if (this.networkMonitoringActive) {
      console.log('Network monitoring already active');
      return;
    }
    
    console.log('Setting up network monitoring (Injection Mode)...');
    
    // 1. Listen for events from the Injected Script (Main World)
    // This runs in the Content Script (Isolated World)
    // Use window.postMessage to receive data from page context
    window.addEventListener('message', (event) => {
      // Only accept messages from the same origin (security check)
      if (event.source !== window) return;
      
      // Check if this is our network log message
      if (event.data && event.data.type === 'MY_EXT_NETWORK_LOG') {
        console.log('Received network event via bridge:', event.data.detail);
        
        // Security/Validity checks
        if (!this.isActive || !this.contextValid || !this.isExtensionContextValid()) return;
        if (!this.aggregator) return;

        const requestData = event.data.detail;
        
        // Log for debugging
        // console.log('Captured network request via bridge:', requestData.url);

        try {
          this.aggregator.addNetworkData([requestData]);
        } catch (error) {
          console.error('Error adding bridged network data:', error);
        }
      }
    });

    // 2. Inject the interceptor code into the Main World
    // This code runs in the Page Context

    // Execute injection
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/network-monitor-bridge.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove(); // Clean up the tag immediately after loading
    
    this.networkMonitoringActive = true;
    console.log('Network monitoring initialized successfully via Bridge');
  }
  
  startDataCollection() {
    // Collect data every 30 seconds
    this.dataCollectionInterval = setInterval(() => {
      // Check if context is still valid
      if (!this.isActive || !this.contextValid || !this.isExtensionContextValid()) {
        console.log('Stopping data collection - context invalid or inactive');
        clearInterval(this.dataCollectionInterval);
        return;
      }
      
      try {
        const rawData = this.aggregator.collectRecentActivities(30); // Last 30 seconds
        const sanitizedData = this.privacyManager.sanitizeData(rawData);
        
        // Send without expecting a response to avoid port closure errors
        this.sendActivityData(sanitizedData);
      } catch (error) {
        console.log('Error collecting data:', error);
      }
    }, 30000);
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_CURRENT_ACTIVITIES':
          if (this.aggregator) {
            const data = this.aggregator.collectRecentActivities(5); // Last 5 minutes
            sendResponse(this.privacyManager.sanitizeData(data));
          } else {
            sendResponse({});
          }
          return true;
          
        case 'TOGGLE_MONITORING':
          this.isActive = message.active;
          sendResponse({ success: true });
          return true;
          
        case 'UPDATE_SETTINGS':
          // Handle settings update from popup/options
          console.log('Settings updated:', message.settings);
          this.updateMonitorsWithSettings(message.settings);
          sendResponse({ success: true });
          return true;
      }
    });
  }
  
  updateMonitorsWithSettings(settings) {
    // Toggle keyboard monitoring
    if (settings.monitorKeyboard !== false && !this.keyboardMonitor) {
      this.keyboardMonitor = new KeyboardMonitor();
      console.log('Keyboard monitor enabled');
    } else if (settings.monitorKeyboard === false && this.keyboardMonitor) {
      this.keyboardMonitor.toggleMonitoring(false);
      console.log('Keyboard monitor disabled');
    }
    
    // Toggle mouse monitoring
    if (settings.monitorMouse !== false && !this.mouseMonitor) {
      this.mouseMonitor = new MouseMonitor();
      console.log('Mouse monitor enabled');
    } else if (settings.monitorMouse === false && this.mouseMonitor) {
      this.mouseMonitor.toggleMonitoring(false);
      console.log('Mouse monitor disabled');
    }
    
    // Always recreate aggregator to ensure network monitoring is included
    this.aggregator = new ActivityAggregator(
      this.keyboardMonitor,
      this.mouseMonitor
    );
    
    if (!this.privacyManager) {
      this.privacyManager = new PrivacyManager();
    }
    
    // Toggle network monitoring after aggregator is created
    if (settings.monitorNetwork !== false && !this.networkMonitoringActive) {
      this.setupNetworkMonitoring();
    } else if (settings.monitorNetwork === false && this.networkMonitoringActive) {
      this.networkMonitoringActive = false;
      console.log('Network monitor disabled');
    }
    
    if (!this.isActive) {
      this.startDataCollection();
      this.isActive = true;
    }
  }

  // Updated sendActivityData method with better error handling
  sendActivityData = (data) => {
    // Check if extension context is still valid
    if (!this.isExtensionContextValid()) {
      console.log('Extension context invalidated, stopping data collection');
      this.contextValid = false;
      this.isActive = false;
      
      // Stop all monitoring to prevent further errors
      if (this.keyboardMonitor) {
        this.keyboardMonitor.toggleMonitoring?.(false);
      }
      if (this.mouseMonitor) {
        this.mouseMonitor.toggleMonitoring?.(false);
      }
      
      return;
    }
    
    try {
      chrome.runtime.sendMessage({
        type: 'ACTIVITY_DATA',
        data: data
      }, (response) => {
        // Check for errors
        if (chrome.runtime.lastError) {
          // If context invalidated, stop monitoring
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated, stopping monitoring');
            this.contextValid = false;
            this.isActive = false;
          } else {
            console.log('Error sending activity data:', chrome.runtime.lastError.message);
          }
        }
      });
    } catch (error) {
      console.log('Failed to send activity data:', error.message);
      this.contextValid = false;
      this.isActive = false;
    }
  };
}

// Start content script
const contentScript = new ContentScript();
