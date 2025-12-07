class ActivityAggregator {
  constructor(keyboardMonitor, mouseMonitor) {
    this.keyboardMonitor = keyboardMonitor;
    this.mouseMonitor = mouseMonitor;
  }

  collectRecentActivities(seconds = 300) {
    const keyboardData = this.keyboardMonitor ? 
      this.keyboardMonitor.getRecentActivities(seconds) : [];
    
    const mouseData = this.mouseMonitor ? 
      this.mouseMonitor.getRecentActivities(seconds) : [];
    
    return {
      keyboard: keyboardData,
      mouse: mouseData,
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(keyboardData, mouseData, seconds)
    };
  }

  generateSummary(keyboardData, mouseData, seconds) {
    const stats = {
      timeRange: `${seconds}秒`,
      totalKeyboardEvents: keyboardData.length,
      totalMouseEvents: mouseData.allEvents?.length || 0,
      activityScore: this.calculateActivityScore(keyboardData, mouseData, seconds),
      topInteractions: this.getTopInteractions(keyboardData, mouseData),
      timeline: this.generateTimeline(keyboardData, mouseData, seconds)
    };

    // 添加键盘统计
    if (this.keyboardMonitor) {
      stats.keyboardStats = this.keyboardMonitor.getStatistics(seconds);
    }

    // 添加鼠标统计
    if (this.mouseMonitor) {
      stats.mouseStats = this.mouseMonitor.getStatistics(seconds);
    }

    return stats;
  }

  calculateActivityScore(keyboardData, mouseData, seconds) {
    const keyboardWeight = 0.4;
    const mouseWeight = 0.4;
    const scrollWeight = 0.2;
    
    const keyboardScore = Math.min(keyboardData.length / (seconds / 10), 100);
    const mouseScore = Math.min((mouseData.clicks?.length || 0) * 10, 100);
    const scrollScore = Math.min((mouseData.scrolls?.length || 0) * 5, 100);
    
    return (
      keyboardScore * keyboardWeight +
      mouseScore * mouseWeight +
      scrollScore * scrollWeight
    );
  }

  getTopInteractions(keyboardData, mouseData) {
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
    
    return interactions;
  }

  generateTimeline(keyboardData, mouseData, seconds) {
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
      
      timeline.push({
        time: new Date(startTime).toLocaleTimeString(),
        keyboard: keyboardCount,
        mouse: mouseCount,
        total: keyboardCount + mouseCount
      });
    }
    
    return timeline;
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