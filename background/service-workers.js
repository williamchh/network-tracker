// 监听插件安装
chrome.runtime.onInstalled.addListener(() => {
  
  // 初始化存储
  chrome.storage.local.set({
    settings: {
      monitorKeyboard: true,
      monitorMouse: true,
      monitorNetwork: true,
      dataRetention: 5, // 分钟
      privacyMode: 'medium',
      qaEndpoint: '' // 默认为空，需要用户配置
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
      // Send response to prevent port closure errors
      sendResponse({ received: true });
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
  return false; // Close message channel immediately for ACTIVITY_DATA
});

// 处理活动数据
async function handleActivityData(data, tabId) {
  try {
    // 获取当前设置
    const { settings } = await chrome.storage.local.get('settings');
    
    // 合并数据
    const { activities } = await chrome.storage.local.get('activities');
    
    const now = Date.now();
    const retentionTime = (settings?.dataRetention || 5) * 60 * 1000;
    
    // 初始化activities结构如果不存在
    if (!activities.keyboard) activities.keyboard = [];
    if (!activities.mouse) activities.mouse = [];
    if (!activities.network) activities.network = [];
    
    // 清理旧数据
    ['keyboard', 'mouse', 'network'].forEach(type => {
      if (activities[type]) {
        activities[type] = activities[type].filter(
          item => now - item.timestamp < retentionTime
        );
      }
    });
    
    // 添加新数据 - 检查数据是否为数组
    if (data.keyboard && Array.isArray(data.keyboard) && settings?.monitorKeyboard !== false) {
      activities.keyboard.push(...data.keyboard);
    }
    
    // 处理鼠标数据 - mouseData是一个包含clicks, movements, scrolls的对象
    if (data.mouse && settings?.monitorMouse !== false) {
      // Initialize mouse array if not exists
      if (!Array.isArray(activities.mouse)) {
        activities.mouse = [];
      }
      
      // If mouse data is an object with allEvents
      if (data.mouse.allEvents && Array.isArray(data.mouse.allEvents)) {
        activities.mouse.push(...data.mouse.allEvents);
      }
      // If mouse data is directly an array
      else if (Array.isArray(data.mouse)) {
        activities.mouse.push(...data.mouse);
      }
      // If mouse data is an object with clicks, movements, scrolls
      else if (typeof data.mouse === 'object') {
        const allMouseEvents = [
          ...(data.mouse.clicks || []),
          ...(data.mouse.movements || []),
          ...(data.mouse.scrolls || [])
        ];
        if (allMouseEvents.length > 0) {
          activities.mouse.push(...allMouseEvents);
        }
      }
    }
    
    if (data.network && Array.isArray(data.network) && settings?.monitorNetwork !== false) {
      activities.network.push(...data.network);
    }
    
    // 保存数据
    await chrome.storage.local.set({ activities });
    
    // 定期发送到QA系统（仅当配置了有效端点时）
    if (settings?.qaEndpoint && settings.qaEndpoint.trim() !== '') {
      sendToQASystem(activities, settings);
    }
  } catch (error) {
    console.error('Error handling activity data:', error);
  }
}

// 发送数据到QA系统
async function sendToQASystem(activities, settings) {
  try {
    // 检查QA系统配置
    if (!settings.qaEndpoint || settings.qaEndpoint.trim() === '') {
      console.log('QA endpoint not configured, skipping data send');
      return;
    }
    
    // 验证URL格式
    try {
      new URL(settings.qaEndpoint);
    } catch (urlError) {
      console.error('Invalid QA endpoint URL:', settings.qaEndpoint, urlError);
      return;
    }
    
    // 只发送最近的数据
    const now = Date.now();
    const retentionTime = (settings.dataRetention || 5) * 60 * 1000;
    
    const recentData = {
      keyboard: (activities.keyboard || []).filter(k => k && k.timestamp && now - k.timestamp < retentionTime),
      mouse: (activities.mouse || []).filter(m => m && m.timestamp && now - m.timestamp < retentionTime),
      network: (activities.network || []).filter(n => n && n.timestamp && now - n.timestamp < retentionTime),
      timestamp: new Date().toISOString()
    };
    
    // 检查是否有数据要发送
    const totalEvents = recentData.keyboard.length + recentData.mouse.length + recentData.network.length;
    if (totalEvents === 0) {
      return;
    }
    
    
    const response = await fetch(settings.qaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plugin-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify(recentData)
    });
    
    // if (response.ok) {
    //   console.log('Data sent to QA system successfully');
    // } else {
    //   console.error('QA system returned error status:', response.status, response.statusText);
    // }
  } catch (error) {
    console.error('Failed to send data to QA system:', error);
    
    // 如果是网络错误，提供更详细的信息
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.log('This is expected if the QA endpoint is not accessible or is a placeholder URL');
      console.log('To fix this issue:');
      console.log('1. Configure a real QA endpoint in the extension settings');
      console.log('2. Or disable the QA system integration');
    }
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