// Listen for plugin installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Activity Monitor Plugin Installed');
  
  // Initialize storage
  chrome.storage.local.set({
    settings: {
      monitorKeyboard: true,
      monitorMouse: true,
      monitorNetwork: true,
      dataRetention: 5, // minutes
      privacyMode: 'medium',
      qaEndpoint: '' // Default is empty, user needs to configure
    },
    activities: {
      keyboard: [],
      mouse: [],
      network: []
    }
  });
});

// Listen for messages from content script
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
      return true; // Keep message channel open
    case 'UPDATE_SETTINGS':
      chrome.storage.local.set({ settings: message.settings }, () => {
        sendResponse({ success: true });
      });
      return true;
  }
  return false; // Close message channel immediately for ACTIVITY_DATA
});

// Handle activity data
async function handleActivityData(data, tabId) {
  try {
    // Get current settings
    const { settings } = await chrome.storage.local.get('settings');
    
    // Merge data
    const { activities } = await chrome.storage.local.get('activities');
    
    const now = Date.now();
    const retentionTime = (settings?.dataRetention || 5) * 60 * 1000;
    
    // Initialize activities structure if not exists
    if (!activities.keyboard) activities.keyboard = [];
    if (!activities.mouse) activities.mouse = [];
    if (!activities.network) activities.network = [];
    
    // Clean up old data
    ['keyboard', 'mouse', 'network'].forEach(type => {
      if (activities[type]) {
        activities[type] = activities[type].filter(
          item => now - item.timestamp < retentionTime
        );
      }
    });
    
    // Add new data - check if data is an array
    if (data.keyboard && Array.isArray(data.keyboard) && settings?.monitorKeyboard !== false) {
      activities.keyboard.push(...data.keyboard);
      console.log(`Added ${data.keyboard.length} keyboard events`);
    }
    
    // Handle mouse data - mouseData is an object containing clicks, movements, scrolls
    if (data.mouse && settings?.monitorMouse !== false) {
      // Initialize mouse array if not exists
      if (!Array.isArray(activities.mouse)) {
        activities.mouse = [];
      }
      
      // If mouse data is an object with allEvents
      if (data.mouse.allEvents && Array.isArray(data.mouse.allEvents)) {
        activities.mouse.push(...data.mouse.allEvents);
        console.log(`Added ${data.mouse.allEvents.length} mouse events`);
      }
      // If mouse data is directly an array
      else if (Array.isArray(data.mouse)) {
        activities.mouse.push(...data.mouse);
        console.log(`Added ${data.mouse.length} mouse events`);
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
          console.log(`Added ${allMouseEvents.length} mouse events`);
        }
      }
    }
    
    if (data.network && Array.isArray(data.network) && settings?.monitorNetwork !== false) {
      activities.network.push(...data.network);
      console.log(`Added ${data.network.length} network events:`, data.network.map(n => `${n.method} ${n.url}`).join(', '));
    }
    
    // Save data
    await chrome.storage.local.set({ activities });
    
    // Periodically send to QA system (only when valid endpoint is configured)
    if (settings?.qaEndpoint && settings.qaEndpoint.trim() !== '') {
      sendToQASystem(activities, settings);
    }
  } catch (error) {
    console.error('Error handling activity data:', error);
  }
}

// Send data to QA system
async function sendToQASystem(activities, settings) {
  try {
    // Check QA system configuration
    if (!settings.qaEndpoint || settings.qaEndpoint.trim() === '') {
      console.log('QA endpoint not configured, skipping data send');
      return;
    }
    
    // Validate URL format
    try {
      new URL(settings.qaEndpoint);
    } catch (urlError) {
      console.error('Invalid QA endpoint URL:', settings.qaEndpoint, urlError);
      return;
    }
    
    // Only send recent data
    const now = Date.now();
    const retentionTime = (settings.dataRetention || 5) * 60 * 1000;
    
    const recentData = {
      keyboard: (activities.keyboard || []).filter(k => k && k.timestamp && now - k.timestamp < retentionTime),
      mouse: (activities.mouse || []).filter(m => m && m.timestamp && now - m.timestamp < retentionTime),
      network: (activities.network || []).filter(n => n && n.timestamp && now - n.timestamp < retentionTime),
      timestamp: new Date().toISOString()
    };
    
    // Check if there is data to send
    const totalEvents = recentData.keyboard.length + recentData.mouse.length + recentData.network.length;
    if (totalEvents === 0) {
      console.log('No recent activity data to send to QA system');
      return;
    }
    
    console.log(`Sending ${totalEvents} events to QA system:`, settings.qaEndpoint);
    
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
    } else {
      console.error('QA system returned error status:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Failed to send data to QA system:', error);
    
    // If it's a network error, provide more detailed information
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.log('This is expected if the QA endpoint is not accessible or is a placeholder URL');
      console.log('To fix this issue:');
      console.log('1. Configure a real QA endpoint in the extension settings');
      console.log('2. Or disable the QA system integration');
    }
  }
}

// Periodically clean up data
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
}, 60000); // Clean up every minute
