// 监听插件安装
chrome.runtime.onInstalled.addListener(() => {
  console.log('Activity Monitor Plugin Installed');
  
  // 初始化存储
  chrome.storage.local.set({
    settings: {
      monitorKeyboard: true,
      monitorMouse: true,
      monitorNetwork: true,
      dataRetention: 5, // 分钟
      privacyMode: 'medium',
      qaEndpoint: 'https://your-qa-system.com/api/collect'
    },
    activities: {
      keyboard: [],
      mouse: [],
      network: []
    }
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ACTIVITY_DATA':
      handleActivityData(message.data, sender.tab?.id);
      break;
    case 'GET_SETTINGS':
      chrome.storage.local.get('settings', (result) => {
        sendResponse(result.settings);
      });
      return true; // 保持消息通道开放
    case 'UPDATE_SETTINGS':
      chrome.storage.local.set({ settings: message.settings }, () => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// 处理活动数据
async function handleActivityData(data, tabId) {
  // 获取当前设置
  const { settings } = await chrome.storage.local.get('settings');
  
  // 合并数据
  const { activities } = await chrome.storage.local.get('activities');
  
  const now = Date.now();
  const retentionTime = settings.dataRetention * 60 * 1000;
  
  // 清理旧数据
  ['keyboard', 'mouse', 'network'].forEach(type => {
    if (activities[type]) {
      activities[type] = activities[type].filter(
        item => now - item.timestamp < retentionTime
      );
    }
  });
  
  // 添加新数据
  if (data.keyboard && settings.monitorKeyboard) {
    activities.keyboard.push(...data.keyboard);
  }
  if (data.mouse && settings.monitorMouse) {
    activities.mouse.push(...data.mouse);
  }
  if (data.network && settings.monitorNetwork) {
    activities.network.push(...data.network);
  }
  
  // 保存数据
  await chrome.storage.local.set({ activities });
  
  // 定期发送到QA系统
  if (settings.qaEndpoint) {
    sendToQASystem(activities, settings);
  }
}

// 发送数据到QA系统
async function sendToQASystem(activities, settings) {
  try {
    // 只发送最近的数据
    const now = Date.now();
    const retentionTime = settings.dataRetention * 60 * 1000;
    
    const recentData = {
      keyboard: activities.keyboard.filter(k => now - k.timestamp < retentionTime),
      mouse: activities.mouse.filter(m => now - m.timestamp < retentionTime),
      network: activities.network.filter(n => now - n.timestamp < retentionTime),
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(settings.qaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plugin-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify(recentData)
    });
    
    if (response.ok) {
      console.log('Data sent to QA system successfully');
    }
  } catch (error) {
    console.error('Failed to send data to QA system:', error);
  }
}

// 定期清理数据
setInterval(async () => {
  const { activities, settings } = await chrome.storage.local.get(['activities', 'settings']);
  const now = Date.now();
  const retentionTime = settings.dataRetention * 60 * 1000;
  
  Object.keys(activities).forEach(key => {
    activities[key] = activities[key].filter(
      item => now - item.timestamp < retentionTime
    );
  });
  
  await chrome.storage.local.set({ activities });
}, 60000); // 每分钟清理一次