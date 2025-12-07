class ActivityAggregator {
  constructor(keyboardMonitor, mouseMonitor) {
    this.keyboardMonitor = keyboardMonitor;
    this.mouseMonitor = mouseMonitor;
    this.networkData = [];
  }

  // Add this method
  addNetworkData(data) {
    if (Array.isArray(data)) {
      this.networkData.push(...data);
      console.log(`Added ${data.length} network events to aggregator`);
    }
  }

  collectRecentActivities(minutes) {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    
    const activities = {
      keyboard: [],
      mouse: {},
      network: [] // Add this line
    };
    
    // Collect keyboard data
    if (this.keyboardMonitor) {
      activities.keyboard = this.keyboardMonitor.getRecentActivities(cutoffTime);
    }
    
    // Collect mouse data
    if (this.mouseMonitor) {
      activities.mouse = this.mouseMonitor.getRecentActivities(cutoffTime);
    }
    
    // Collect network data - Add this block
    if (this.networkData && this.networkData.length > 0) {
      activities.network = this.networkData.filter(
        item => item.timestamp >= cutoffTime
      );
      
      // Clean up old network data to prevent memory leaks
      this.networkData = this.networkData.filter(
        item => item.timestamp >= cutoffTime
      );
    }
    
    return activities;
  }
    
  // Optional: Add a method to clear all data
  clearAll() {
    this.networkData = [];
    if (this.keyboardMonitor) {
      this.keyboardMonitor.clear?.();
    }
    if (this.mouseMonitor) {
      this.mouseMonitor.clear?.();
    }
  }

  addNetworkData(networkEvents) {
    try {
      if (Array.isArray(networkEvents)) {
        // Filter out invalid events
        const validEvents = networkEvents.filter(event =>
          event &&
          typeof event === 'object' &&
          event.timestamp &&
          event.url
        );
        
        if (validEvents.length > 0) {
          this.networkData.push(...validEvents);
          this.cleanOldNetworkEvents();
          console.log(`Added ${validEvents.length} network events`);
        }
      }
    } catch (error) {
      console.log('Error adding network data:', error);
    }
  }

  getRecentNetworkActivities(seconds = 300) {
    try {
      const cutoff = Date.now() - seconds * 1000;
      return this.networkData.filter(event =>
        event &&
        event.timestamp &&
        event.timestamp > cutoff
      );
    } catch (error) {
      console.log('Error getting recent network activities:', error);
      return [];
    }
  }

  cleanOldNetworkEvents() {
    try {
      // 只保留最近5分钟的数据
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      this.networkData = this.networkData.filter(event =>
        event &&
        event.timestamp &&
        event.timestamp > fiveMinutesAgo
      );
    } catch (error) {
      console.log('Error cleaning old network events:', error);
    }
  }

  generateSummary(keyboardData, mouseData, networkData, seconds) {
    const stats = {
      timeRange: `${seconds}秒`,
      totalKeyboardEvents: keyboardData.length,
      totalMouseEvents: mouseData.allEvents?.length || 0,
      totalNetworkEvents: networkData.length,
      activityScore: this.calculateActivityScore(keyboardData, mouseData, networkData, seconds),
      topInteractions: this.getTopInteractions(keyboardData, mouseData, networkData),
      timeline: this.generateTimeline(keyboardData, mouseData, networkData, seconds)
    };

    // 添加键盘统计
    if (this.keyboardMonitor) {
      stats.keyboardStats = this.keyboardMonitor.getStatistics(seconds);
    }

    // 添加鼠标统计
    if (this.mouseMonitor) {
      stats.mouseStats = this.mouseMonitor.getStatistics(seconds);
    }

    // 添加网络统计
    stats.networkStats = this.getNetworkStatistics(networkData, seconds);

    return stats;
  }

  calculateActivityScore(keyboardData, mouseData, networkData, seconds) {
    const keyboardWeight = 0.3;
    const mouseWeight = 0.3;
    const scrollWeight = 0.2;
    const networkWeight = 0.2;
    
    const keyboardScore = Math.min(keyboardData.length / (seconds / 10), 100);
    const mouseScore = Math.min((mouseData.clicks?.length || 0) * 10, 100);
    const scrollScore = Math.min((mouseData.scrolls?.length || 0) * 5, 100);
    const networkScore = Math.min(networkData.length * 2, 100);
    
    return (
      keyboardScore * keyboardWeight +
      mouseScore * mouseWeight +
      scrollScore * scrollWeight +
      networkScore * networkWeight
    );
  }

  getTopInteractions(keyboardData, mouseData, networkData) {
    const interactions = [];
    
    // 键盘交互
    const keyMap = {};
    keyboardData.forEach(event => {
      if (event.key && event.target) {
        const key = `${event.target.tagName}:${event.key}`;
        keyMap[key] = (keyMap[key] || 0) + 1;
      }
    });
    
    Object.entries(keyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([key, count]) => {
        interactions.push({ type: 'keyboard', key, count });
      });
    
    // 鼠标点击
    if (mouseData.clicks) {
      const clickMap = {};
      mouseData.clicks.forEach(click => {
        if (click.target) {
          const key = `${click.target.tagName}${click.target.id ? '#' + click.target.id : ''}`;
          clickMap[key] = (clickMap[key] || 0) + 1;
        }
      });
      
      Object.entries(clickMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([element, count]) => {
          interactions.push({ type: 'click', element, count });
        });
    }
    
    // 网络请求
    const networkMap = {};
    try {
      networkData.forEach(request => {
        if (request && request.url) {
          try {
            const domain = new URL(request.url).hostname;
            networkMap[domain] = (networkMap[domain] || 0) + 1;
          } catch (e) {
            // 忽略无效URL
          }
        }
      });
      
      Object.entries(networkMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([domain, count]) => {
          interactions.push({ type: 'network', domain, count });
        });
    } catch (error) {
      console.log('Error processing network interactions:', error);
    }
    
    return interactions;
  }

  generateTimeline(keyboardData, mouseData, networkData, seconds) {
    const timeline = [];
    const now = Date.now();
    const interval = Math.floor(seconds / 10); // 分为10个时间段
    
    for (let i = 0; i < 10; i++) {
      const startTime = now - (seconds * 1000) + (i * interval * 1000);
      const endTime = startTime + (interval * 1000);
      
      const keyboardCount = keyboardData.filter(
        k => k.timestamp >= startTime && k.timestamp < endTime
      ).length;
      
      const mouseCount = mouseData.allEvents?.filter(
        m => m.timestamp >= startTime && m.timestamp < endTime
      ).length || 0;
      
      const networkCount = networkData.filter(
        n => n.timestamp >= startTime && n.timestamp < endTime
      ).length;
      
      timeline.push({
        time: new Date(startTime).toLocaleTimeString(),
        keyboard: keyboardCount,
        mouse: mouseCount,
        network: networkCount,
        total: keyboardCount + mouseCount + networkCount
      });
    }
    
    return timeline;
  }

  getNetworkStatistics(networkData, seconds) {
    try {
      const recentData = Array.isArray(networkData) ? networkData : [];
      
      const domainMap = {};
      const methodMap = {};
      const statusMap = {};
      let totalDuration = 0;
      let validRequestCount = 0;
      
      recentData.forEach(request => {
        if (!request || !request.url) return;
        
        validRequestCount++;
        
        // 统计域名
        try {
          const domain = new URL(request.url).hostname;
          domainMap[domain] = (domainMap[domain] || 0) + 1;
        } catch (e) {
          // 忽略无效URL
        }
        
        // 统计方法
        methodMap[request.method] = (methodMap[request.method] || 0) + 1;
        
        // 统计状态码
        statusMap[request.status] = (statusMap[request.status] || 0) + 1;
        
        // 累计时长
        if (request.duration && typeof request.duration === 'number') {
          totalDuration += request.duration;
        }
      });
      
      return {
        totalRequests: validRequestCount,
        averageDuration: validRequestCount > 0 ? totalDuration / validRequestCount : 0,
        topDomains: Object.entries(domainMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        methods: methodMap,
        statusCodes: statusMap
      };
    } catch (error) {
      console.log('Error calculating network statistics:', error);
      return {
        totalRequests: 0,
        averageDuration: 0,
        topDomains: [],
        methods: {},
        statusCodes: {}
      };
    }
  }

  getSessionData() {
    return {
      startTime: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      activities: this.collectRecentActivities(300) // 最近5分钟
    };
  }
}