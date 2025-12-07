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
    
    // 开始定期更新
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
    // 监控开关
    document.getElementById('toggleKeyboard').addEventListener('change', (e) => {
      this.updateSetting('monitorKeyboard', e.target.checked);
    });
    
    document.getElementById('toggleMouse').addEventListener('change', (e) => {
      this.updateSetting('monitorMouse', e.target.checked);
    });
    
    document.getElementById('toggleNetwork').addEventListener('change', (e) => {
      this.updateSetting('monitorNetwork', e.target.checked);
    });
    
    // 隐私级别
    document.getElementById('privacyLevel').addEventListener('change', (e) => {
      this.updateSetting('privacyMode', e.target.value);
    });
    
    // 按钮
    document.getElementById('exportData').addEventListener('click', () => {
      this.exportData();
    });
    
    document.getElementById('clearData').addEventListener('click', () => {
      this.clearData();
    });
    
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ settings: this.settings }, resolve);
    });
    
    // 通知内容脚本更新
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
    
    // 更新开关状态
    document.getElementById('toggleKeyboard').checked = this.settings.monitorKeyboard !== false;
    document.getElementById('toggleMouse').checked = this.settings.monitorMouse !== false;
    document.getElementById('toggleNetwork').checked = this.settings.monitorNetwork !== false;
    
    // 更新隐私级别
    const privacySelect = document.getElementById('privacyLevel');
    privacySelect.value = this.settings.privacyMode || 'medium';
    
    // 更新统计数据
    this.updateStats();
    
    // 更新活动列表
    this.updateActivityList();
    
    // 更新会话信息
    this.updateSessionInfo();
    
    // 更新状态指示器
    this.updateStatusIndicator();
  }
  
  updateStats() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // 键盘统计
    const keyboardCount = (this.activities.keyboard || []).filter(
      k => k.timestamp > fiveMinutesAgo
    ).length;
    document.getElementById('keyCount').textContent = keyboardCount;
    
    // 鼠标统计
    const mouseCount = (this.activities.mouse || []).filter(
      m => m.timestamp > fiveMinutesAgo
    ).length;
    document.getElementById('clickCount').textContent = mouseCount;
    
    // 网络统计
    const networkCount = (this.activities.network || []).filter(
      n => n.timestamp > fiveMinutesAgo
    ).length;
    document.getElementById('networkCount').textContent = networkCount;
    
    // 活跃度评分
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
    
    // 合并所有类型的最新活动
    ['keyboard', 'mouse', 'network'].forEach(type => {
      const activities = this.activities[type] || [];
      activities.slice(-5).forEach(activity => {
        if (now - activity.timestamp < 5 * 60 * 1000) {
          recentActivities.push({
            ...activity,
            activityType: type
          });
        }
      });
    });
    
    // 按时间排序
    recentActivities.sort((a, b) => b.timestamp - a.timestamp);
    
    if (recentActivities.length === 0) {
      activityList.innerHTML = '<div class="empty-state">暂无活动记录</div>';
      return;
    }
    
    activityList.innerHTML = recentActivities.slice(0, 10).map(activity => `
      <div class="activity-item">
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
  }
  
  getActivityTypeLabel(type) {
    const labels = {
      keyboard: '键盘',
      mouse: '鼠标',
      network: '网络'
    };
    return labels[type] || type;
  }
  
  getActivityDescription(activity) {
    switch (activity.activityType) {
      case 'keyboard':
        return `按键: ${activity.key}`;
      case 'mouse':
        return activity.type === 'click' ? '点击' : activity.type;
      case 'network':
        return `${activity.method} ${activity.url?.split('/').pop() || '请求'}`;
      default:
        return activity.type || '活动';
    }
  }
  
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) {
      return `${Math.floor(diff / 1000)}秒前`;
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else {
      return new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  }
  
  updateSessionInfo() {
    // 生成简化的会话ID
    const sessionId = Math.random().toString(36).substr(2, 8).toUpperCase();
    document.getElementById('sessionId').textContent = sessionId;
    
    // 更新最后更新时间
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
    if (confirm('确定要清除所有活动数据吗？此操作不可撤销。')) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ activities: {} }, resolve);
      });
      this.activities = {};
      this.updateUI();
    }
  }
}

// 初始化弹窗
const popupManager = new PopupManager();