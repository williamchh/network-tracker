class KeyboardMonitor {
  constructor() {
    this.keyEvents = [];
    this.isActive = true;
    this.init();
  }

  init() {
    console.log('Initializing keyboard event listeners...');
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    document.addEventListener('keypress', this.handleKeyPress.bind(this));
    console.log('Keyboard event listeners attached');
  }

  handleKeyDown(event) {
    if (!this.isActive) return;
    
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
    
    const keyEvent = {
      type: 'keyup',
      key: event.key,
      code: event.code,
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    };
    
    this.keyEvents.push(keyEvent);
    this.cleanOldEvents();
  }

  handleKeyPress(event) {
    if (!this.isActive) return;
    
    const keyEvent = {
      type: 'keypress',
      key: event.key,
      code: event.code,
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      charCode: event.charCode
    };
    
    this.keyEvents.push(keyEvent);
    this.cleanOldEvents();
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
      keyDownCount: recentEvents.filter(e => e.type === 'keydown').length,
      keyUpCount: recentEvents.filter(e => e.type === 'keyup').length,
      keyPressCount: recentEvents.filter(e => e.type === 'keypress').length,
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
    const keyPresses = events.filter(e => e.type === 'keypress');
    if (keyPresses.length < 2) return 0;
    
    const first = keyPresses[0].timestamp;
    const last = keyPresses[keyPresses.length - 1].timestamp;
    const duration = (last - first) / 1000; // 秒
    
    return duration > 0 ? (keyPresses.length / duration) * 60 : 0; // 每分钟按键数
  }
}