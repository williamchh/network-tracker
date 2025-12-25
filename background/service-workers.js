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
    // 1. Get current settings and activities
    const { settings, activities: currentActivities } = await chrome.storage.local.get(['settings', 'activities']);
    const activities = currentActivities || { keyboard: [], mouse: [], network: [] };
    
    // 2. Add new data from the content script (ONLY if there is new data to add)
    let hasNewData = false;
    
    if (data.keyboard && Array.isArray(data.keyboard) && data.keyboard.length > 0 && settings?.monitorKeyboard !== false) {
      activities.keyboard.push(...data.keyboard);
      hasNewData = true;
    }
    
    if (data.mouse && settings?.monitorMouse !== false) {
      let mouseEvents = [];
      if (data.mouse.allEvents && Array.isArray(data.mouse.allEvents)) {
        mouseEvents = data.mouse.allEvents;
      } else if (Array.isArray(data.mouse)) {
        mouseEvents = data.mouse;
      } else if (typeof data.mouse === 'object') {
        mouseEvents = [...(data.mouse.clicks || []), ...(data.mouse.movements || []), ...(data.mouse.scrolls || [])];
      }
      
      if (mouseEvents.length > 0) {
        activities.mouse.push(...mouseEvents);
        hasNewData = true;
      }
    }
    
    if (data.network && Array.isArray(data.network) && data.network.length > 0 && settings?.monitorNetwork !== false) {
      activities.network.push(...data.network);
      hasNewData = true;
    }
    
    // 3. ONLY persist if we actually added new data. 
    // This prevents the background script from accidentally overwriting 
    // imported data with an "empty" update if a race condition occurs.
    if (hasNewData) {
      // Also perform a quick cleanup of VERY old data (e.g. > 24h) just to prevent storage bloat
      // but keep it very loose to avoid killing imported sessions.
      const now = Date.now();
      const absoluteMaxRetention = 24 * 60 * 60 * 1000; // 24 hours
      
      ['keyboard', 'mouse', 'network'].forEach(type => {
        if (activities[type] && Array.isArray(activities[type])) {
          if (activities[type].length > 2000) { // Only cap if it's getting huge
            activities[type] = activities[type].slice(-2000);
          }
        }
      });

      await chrome.storage.local.set({ activities });
      
      // 4. Send to QA if needed
      if (settings?.qaEndpoint && settings.qaEndpoint.trim() !== '') {
        sendToQASystem(activities, settings);
      }
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
  try {
    const { activities, settings } = await chrome.storage.local.get(['activities', 'settings']);
    if (!activities) return;
    
    const now = Date.now();
    const retentionTime = (settings?.dataRetention || 5) * 60 * 1000;
    
    // Only clean up if retention is not set to "infinite" (e.g. 1440 mins = 24h)
    if (settings?.dataRetention && settings.dataRetention >= 1440) {
      return;
    }

    let changed = false;
    Object.keys(activities).forEach(key => {
      if (Array.isArray(activities[key])) {
        const originalLength = activities[key].length;
        activities[key] = activities[key].filter(
          item => !item.timestamp || (now - item.timestamp < retentionTime) || (item.timestamp > now)
        );
        if (activities[key].length !== originalLength) changed = true;
      }
    });
    
    if (changed) {
      await chrome.storage.local.set({ activities });
    }
  } catch (err) {
    console.error('Periodic cleanup failed:', err);
  }
}, 60000); // Clean up every minute
