class OptionsManager {
  constructor() {
    this.settings = {};
    this.init();
  }
  
  async init() {
    await this.loadSettings();
    this.setupUI();
    this.setupEventListeners();
    this.updateVersion();
  }
  
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        this.settings = result.settings || {};
        resolve();
      });
    });
  }
  
  setupUI() {
    // 监控设置
    document.getElementById('monitorKeyboard').checked = 
      this.settings.monitorKeyboard !== false;
    document.getElementById('monitorMouse').checked = 
      this.settings.monitorMouse !== false;
    document.getElementById('monitorNetwork').checked = 
      this.settings.monitorNetwork !== false;
    
    // 隐私设置
    document.getElementById('privacyMode').value = 
      this.settings.privacyMode || 'medium';
    document.getElementById('dataRetention').value = 
      this.settings.dataRetention || 5;
    document.getElementById('autoCleanup').checked = 
      this.settings.autoCleanup || false;
    
    // QA系统集成
    document.getElementById('qaEndpoint').value = 
      this.settings.qaEndpoint || '';
    document.getElementById('autoSend').checked = 
      this.settings.autoSend || false;
    document.getElementById('sendFrequency').value = 
      this.settings.sendFrequency || 60;
    document.getElementById('sendFrequency').disabled = 
      !this.settings.autoSend;
    
    // 高级设置
    document.getElementById('debugMode').checked = 
      this.settings.debugMode || false;
    document.getElementById('samplingRate').value = 
      this.settings.samplingRate || 100;
  }
  
  setupEventListeners() {
    // 保存设置按钮
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // 测试连接按钮
    document.getElementById('testConnection').addEventListener('click', () => {
      this.testConnection();
    });
    
    // 导出数据按钮
    document.getElementById('exportAllData').addEventListener('click', () => {
      this.exportAllData();
    });
    
    // 清除数据按钮
    document.getElementById('clearAllData').addEventListener('click', () => {
      this.clearAllData();
    });
    
    // 自动发送切换
    document.getElementById('autoSend').addEventListener('change', (e) => {
      document.getElementById('sendFrequency').disabled = !e.target.checked;
    });
  }
  
  async saveSettings() {
    this.collectSettings();
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings: this.settings }, resolve);
    });
    
    this.showStatus('设置已保存', 'success');
    
    // 通知所有标签页更新设置
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_SETTINGS',
            settings: this.settings
          }).catch(() => {
            // 忽略错误（页面可能没有内容脚本）
          });
        }
      });
    });
  }
  
  collectSettings() {
    this.settings = {
      monitorKeyboard: document.getElementById('monitorKeyboard').checked,
      monitorMouse: document.getElementById('monitorMouse').checked,
      monitorNetwork: document.getElementById('monitorNetwork').checked,
      privacyMode: document.getElementById('privacyMode').value,
      dataRetention: parseInt(document.getElementById('dataRetention').value),
      autoCleanup: document.getElementById('autoCleanup').checked,
      qaEndpoint: document.getElementById('qaEndpoint').value.trim(),
      autoSend: document.getElementById('autoSend').checked,
      sendFrequency: parseInt(document.getElementById('sendFrequency').value),
      debugMode: document.getElementById('debugMode').checked,
      samplingRate: parseInt(document.getElementById('samplingRate').value)
    };
  }
  
  async testConnection() {
    const endpoint = document.getElementById('qaEndpoint').value.trim();
    
    if (!endpoint) {
      this.showStatus('请输入QA系统API端点', 'error');
      return;
    }
    
    this.showStatus('正在测试连接...', 'info');
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Connection': 'true'
        },
        body: JSON.stringify({ test: true })
      });
      
      if (response.ok) {
        this.showStatus('连接测试成功', 'success');
      } else {
        this.showStatus(`连接失败: HTTP ${response.status}`, 'error');
      }
    } catch (error) {
      this.showStatus(`连接失败: ${error.message}`, 'error');
    }
  }
  
  async exportAllData() {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(null, resolve);
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-monitor-full-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.showStatus('数据已导出', 'success');
  }
  
  async clearAllData() {
    if (!confirm('确定要清除所有数据吗？包括活动记录和设置。此操作不可撤销。')) {
      return;
    }
    
    await new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
    
    // 重置默认设置
    const defaultSettings = {
      monitorKeyboard: true,
      monitorMouse: true,
      monitorNetwork: true,
      privacyMode: 'medium',
      dataRetention: 5,
      autoCleanup: false,
      qaEndpoint: '',
      autoSend: false,
      sendFrequency: 60,
      debugMode: false,
      samplingRate: 100
    };
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings: defaultSettings }, resolve);
    });
    
    this.settings = defaultSettings;
    this.setupUI();
    this.showStatus('所有数据已清除', 'success');
  }
  
  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = 'status ' + type;
    
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = 'status';
    }, 5000);
  }
  
  updateVersion() {
    const manifest = chrome.runtime.getManifest();
    document.getElementById('version').textContent = manifest.version;
  }
}

// 初始化选项页面
const optionsManager = new OptionsManager();