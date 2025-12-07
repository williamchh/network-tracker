class ContentScript {
  constructor() {
    this.keyboardMonitor = null;
    this.mouseMonitor = null;
    this.aggregator = null;
    this.privacyManager = null;
    this.isActive = false;
    this.networkMonitoringActive = false;
    this.contextValid = true; // Add this flag
    console.log('Content script loaded');
    this.init();
  }
  
  async init() {
    // 获取设置
    const settings = await this.getSettings();
    console.log('Content script initialized with settings:', settings);
    
    // Initialize monitors if enabled (default to true)
    this.initializeMonitors(settings);
    
    // 监控网络请求
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
    
    // 开始收集数据
    this.startDataCollection();
    this.isActive = true;
    console.log('Data collection started');
  }
  
  // Update network monitoring to check context validity
  setupNetworkMonitoring() {
    if (this.networkMonitoringActive) {
      console.log('Network monitoring already active');
      return;
    }
    
    console.log('Setting up network monitoring...');
    const self = this;
    
    // 拦截fetch请求
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const startTime = Date.now();
      let url = '';
      let method = 'GET';
      
      try {
        url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        method = args[1]?.method || 'GET';
      } catch (error) {
        console.log('Error parsing fetch arguments:', error);
      }
      
      return originalFetch.apply(this, args)
        .then(response => {
          const requestData = {
            type: 'fetch',
            url: url,
            method: method,
            status: response.status,
            timestamp: startTime,
            duration: Date.now() - startTime
          };
          
          console.log('Network request detected (fetch):', requestData.method, requestData.url);
          
          // Add to aggregator if available
          if (self.aggregator) {
            try {
              self.aggregator.addNetworkData([requestData]);
            } catch (error) {
              console.log('Error adding network data to aggregator:', error);
            }
          }
          
          // Only send if context is valid
          if (self.contextValid && self.isExtensionContextValid()) {
            try {
              self.sendActivityData({ network: [requestData] });
            } catch (error) {
              console.log('Error sending network data:', error);
            }
          }
          
          return response;
        })
        .catch(error => {
          console.log('Fetch error:', error);
          
          const errorData = {
            type: 'fetch',
            url: url,
            method: method,
            status: 0,
            timestamp: startTime,
            duration: Date.now() - startTime,
            error: error.message
          };
          
          if (self.aggregator) {
            try {
              self.aggregator.addNetworkData([errorData]);
            } catch (aggError) {
              console.log('Error adding failed network data to aggregator:', aggError);
            }
          }
          
          throw error;
        });
    };
    
    // 拦截XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        this._requestDetails = { method, url, startTime: Date.now() };
      } catch (error) {
        console.log('Error in XHR open:', error);
        this._requestDetails = { method: 'GET', url: '', startTime: Date.now() };
      }
      return originalXHROpen.apply(this, arguments);
    };
    
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      
      // Handle successful requests
      this.addEventListener('load', function() {
        try {
          const requestData = {
            type: 'xhr',
            url: xhr._requestDetails?.url || '',
            method: xhr._requestDetails?.method || 'GET',
            status: xhr.status,
            timestamp: xhr._requestDetails?.startTime || Date.now(),
            duration: Date.now() - (xhr._requestDetails?.startTime || Date.now())
          };
          
          console.log('Network request detected (XHR):', requestData.method, requestData.url);
          
          // Add to aggregator if available
          if (self.aggregator) {
            try {
              self.aggregator.addNetworkData([requestData]);
            } catch (error) {
              console.log('Error adding XHR data to aggregator:', error);
            }
          }
          
          // Only send if context is valid
          if (self.contextValid && self.isExtensionContextValid()) {
            try {
              self.sendActivityData({ network: [requestData] });
            } catch (error) {
              console.log('Error sending network data:', error);
            }
          }
        } catch (error) {
          console.log('Error in XHR load handler:', error);
        }
      });
      
      // Handle failed requests
      this.addEventListener('error', function() {
        try {
          const errorData = {
            type: 'xhr',
            url: xhr._requestDetails?.url || '',
            method: xhr._requestDetails?.method || 'GET',
            status: 0,
            timestamp: xhr._requestDetails?.startTime || Date.now(),
            duration: Date.now() - (xhr._requestDetails?.startTime || Date.now()),
            error: 'Network error'
          };
          
          if (self.aggregator) {
            try {
              self.aggregator.addNetworkData([errorData]);
            } catch (error) {
              console.log('Error adding failed XHR data to aggregator:', error);
            }
          }
        } catch (error) {
          console.log('Error in XHR error handler:', error);
        }
      });
      
      return originalXHRSend.apply(this, arguments);
    };
    
    this.networkMonitoringActive = true;
    console.log('Network monitoring initialized successfully');
  }
  
  startDataCollection() {
    // 每30秒收集一次数据
    this.dataCollectionInterval = setInterval(() => {
      // Check if context is still valid
      if (!this.isActive || !this.contextValid || !this.isExtensionContextValid()) {
        console.log('Stopping data collection - context invalid or inactive');
        clearInterval(this.dataCollectionInterval);
        return;
      }
      
      try {
        const rawData = this.aggregator.collectRecentActivities(30); // 最近30秒
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
            const data = this.aggregator.collectRecentActivities(5); // 最近5分钟
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

// 启动内容脚本
const contentScript = new ContentScript();