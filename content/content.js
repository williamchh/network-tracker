class ContentScript {
  constructor() {
    this.keyboardMonitor = null;
    this.mouseMonitor = null;
    this.aggregator = null;
    this.privacyManager = null;
    this.isActive = false;
    this.networkMonitoringActive = false;
    console.log('Content script loaded');
    this.init();
  }
  
  async init() {
    // 获取设置
    const settings = await this.getSettings();
    console.log('Content script initialized with settings:', settings);
    
    // Initialize monitors if enabled (default to true)
    if (settings.monitorKeyboard !== false || settings.monitorMouse !== false) {
      this.initializeMonitors(settings);
    }
    
    // 监控网络请求
    if (settings.monitorNetwork !== false) {
      this.setupNetworkMonitoring();
    }
    
    this.setupMessageListeners();
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
  
  setupNetworkMonitoring() {
    if (this.networkMonitoringActive) {
      console.log('Network monitoring already active');
      return;
    }
    
    console.log('Setting up network monitoring...');
    
    // 拦截fetch请求
    const originalFetch = window.fetch;
    const self = this;
    window.fetch = function(...args) {
      const startTime = Date.now();
      return originalFetch.apply(this, args)
        .then(response => {
          const requestData = {
            type: 'fetch',
            url: typeof args[0] === 'string' ? args[0] : args[0].url,
            method: args[1]?.method || 'GET',
            status: response.status,
            timestamp: startTime,
            duration: Date.now() - startTime
          };
          
          console.log('Network request detected (fetch):', requestData.method, requestData.url);
          
          // Send without expecting a response
          try {
            chrome.runtime.sendMessage({
              type: 'ACTIVITY_DATA',
              data: { network: [requestData] }
            });
          } catch (error) {
            console.log('Error sending network data:', error);
          }
          
          return response;
        })
        .catch(error => {
          console.log('Fetch error:', error);
          throw error;
        });
    };
    
    // 拦截XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._requestDetails = { method, url, startTime: Date.now() };
      return originalXHROpen.apply(this, arguments);
    };
    
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      this.addEventListener('load', function() {
        const requestData = {
          type: 'xhr',
          url: this._requestDetails.url,
          method: this._requestDetails.method,
          status: this.status,
          timestamp: this._requestDetails.startTime,
          duration: Date.now() - this._requestDetails.startTime
        };
        
        console.log('Network request detected (XHR):', requestData.method, requestData.url);
        
        // Send without expecting a response
        try {
          chrome.runtime.sendMessage({
            type: 'ACTIVITY_DATA',
            data: { network: [requestData] }
          });
        } catch (error) {
          console.log('Error sending network data:', error);
        }
      });
      
      return originalXHRSend.apply(this, arguments);
    };
    
    this.networkMonitoringActive = true;
    console.log('Network monitoring initialized successfully');
  }
  
  startDataCollection() {
    // 每30秒收集一次数据
    setInterval(() => {
      if (!this.isActive) return;
      
      const rawData = this.aggregator.collectRecentActivities(30); // 最近30秒
      const sanitizedData = this.privacyManager.sanitizeData(rawData);
      
      // Send without expecting a response to avoid port closure errors
      try {
        chrome.runtime.sendMessage({
          type: 'ACTIVITY_DATA',
          data: sanitizedData
        });
      } catch (error) {
        console.log('Error sending activity data:', error.message);
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
    
    // Toggle network monitoring
    if (settings.monitorNetwork !== false && !this.networkMonitoringActive) {
      this.setupNetworkMonitoring();
    }
    
    // Recreate aggregator if monitors changed
    if (this.keyboardMonitor || this.mouseMonitor) {
      this.aggregator = new ActivityAggregator(
        this.keyboardMonitor,
        this.mouseMonitor
      );
      if (!this.privacyManager) {
        this.privacyManager = new PrivacyManager();
      }
      if (!this.isActive) {
        this.startDataCollection();
        this.isActive = true;
      }
    }
  }
}

// 启动内容脚本
const contentScript = new ContentScript();