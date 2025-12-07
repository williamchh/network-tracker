export class QASystemIntegration {
  constructor() {
    this.endpoint = null;
    this.sessionId = this.generateSessionId();
    this.batchSize = 50;
    this.batchQueue = [];
    this.isSending = false;
    
    this.init();
  }
  
  init() {
    // 加载配置
    this.loadConfiguration();
    
    // 设置定期发送
    this.setupPeriodicSending();
    
    // 页面卸载时发送剩余数据
    window.addEventListener('beforeunload', () => {
      this.sendBatch();
    });
  }
  
  loadConfiguration() {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings?.qaEndpoint) {
        this.endpoint = result.settings.qaEndpoint;
      }
    });
  }
  
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  setupPeriodicSending() {
    // 每30秒发送一次
    setInterval(() => {
      this.sendBatch();
    }, 30000);
  }
  
  addToQueue(data) {
    this.batchQueue.push({
      ...data,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });
    
    // 如果队列达到批次大小，立即发送
    if (this.batchQueue.length >= this.batchSize) {
      this.sendBatch();
    }
  }
  
  async sendBatch() {
    if (!this.endpoint || this.batchQueue.length === 0 || this.isSending) {
      return;
    }
    
    this.isSending = true;
    const batchToSend = [...this.batchQueue];
    this.batchQueue = [];
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId,
          'X-Plugin-Version': chrome.runtime.getManifest().version,
          'X-Batch-Size': batchToSend.length.toString()
        },
        body: JSON.stringify({
          batch: batchToSend,
          metadata: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`Sent ${batchToSend.length} activities to QA system`);
      
      // 如果发送失败，重新加入队列
      if (result.failedItems && result.failedItems.length > 0) {
        this.batchQueue.push(...result.failedItems);
      }
      
    } catch (error) {
      console.error('Failed to send batch to QA system:', error);
      // 重新加入队列等待下次发送
      this.batchQueue.push(...batchToSend);
    } finally {
      this.isSending = false;
    }
  }
  
  async sendActivityData(activityData) {
    if (!this.endpoint) {
      console.warn('QA endpoint not configured');
      return null;
    }
    
    const data = {
      ...activityData,
      sessionId: this.sessionId,
      pageUrl: window.location.href,
      collectedAt: new Date().toISOString()
    };
    
    // 添加到队列中批量发送
    this.addToQueue(data);
    
    return { success: true, queued: true };
  }
  
  async sendImmediate(data) {
    if (!this.endpoint) {
      throw new Error('QA endpoint not configured');
    }
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId,
          'X-Immediate': 'true'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Immediate send failed:', error);
      throw error;
    }
  }
  
  updateEndpoint(newEndpoint) {
    this.endpoint = newEndpoint;
    
    // 保存到存储
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || {};
      settings.qaEndpoint = newEndpoint;
      chrome.storage.local.set({ settings });
    });
  }
  
  getQueueSize() {
    return this.batchQueue.length;
  }
  
  clearQueue() {
    this.batchQueue = [];
  }
  
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      queueSize: this.batchQueue.length,
      endpointConfigured: !!this.endpoint
    };
  }
}