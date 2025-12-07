class KeyboardMonitor {
  constructor() {
    this.keyEvents = [];
    this.activeKeys = new Set(); // To track currently pressed keys for debouncing
    this.isActive = true;
    this.init();
  }

  init() {
    console.log('Initializing keyboard event listeners...');
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this)); // Keep keyup to clear activeKeys
    console.log('Keyboard event listeners attached (keydown and keyup only)');
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    // Prevent recording multiple keydown events for a single press (due to auto-repeat)
    if (this.activeKeys.has(event.code)) {
      return;
    }
    this.activeKeys.add(event.code);
    
    const keyEvent = {
      type: 'keydown',
      key: event.key,
      code: event.code,
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      modifiers: {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey
      },
      location: event.location
    };
    
    this.keyEvents.push(keyEvent);
    this.cleanOldEvents();
  }

  handleKeyUp(event) {
    if (!this.isActive) return;
    this.activeKeys.delete(event.code); // Remove key from active set on keyup
    // No need to record keyup events as distinct activities for monitoring
  }

  getRecentActivities(seconds = 300) {
    const cutoff = Date.now() - seconds * 1000;
    return this.keyEvents.filter(event => event.timestamp > cutoff);
  }

  cleanOldEvents() {
    // 只保留最近5分钟的数据
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.keyEvents = this.keyEvents.filter(event => 
      event.timestamp > fiveMinutesAgo
    );
  }

  getElementInfo(element) {
    if (!element) return null;
    
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      name: element.name,
      type: element.type,
      placeholder: element.placeholder
    };
  }

  toggleMonitoring(active) {
    this.isActive = active;
  }

  getStatistics(seconds = 300) {
    const recentEvents = this.getRecentActivities(seconds);
    
    return {
      totalEvents: recentEvents.length,
      keyDownCount: recentEvents.length, // Now only keydown events are recorded
      mostUsedKeys: this.getMostUsedKeys(recentEvents),
      averageSpeed: this.calculateTypingSpeed(recentEvents)
    };
  }

  getMostUsedKeys(events, limit = 10) {
    const keyCount = {};
    events.forEach(event => {
      if (event.key && event.key.length === 1) {
        keyCount[event.key] = (keyCount[event.key] || 0) + 1;
      }
    });
    
    return Object.entries(keyCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  calculateTypingSpeed(events) {
    const keydowns = events.filter(e => e.type === 'keydown'); // Use keydown events for typing speed
    if (keydowns.length < 2) return 0;
    
    const first = keydowns[0].timestamp;
    const last = keydowns[keydowns.length - 1].timestamp;
    const duration = (last - first) / 1000; // seconds
    
    return duration > 0 ? (keydowns.length / duration) * 60 : 0; // keys per minute
  }
}