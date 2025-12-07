class MouseMonitor {
  constructor() {
    this.mouseEvents = [];
    this.clicks = [];
    this.movements = [];
    this.scrolls = [];
    this.isActive = true;
    this.init();
  }

  init() {
    console.log('Initializing mouse event listeners...');
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    document.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    document.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('scroll', this.handleScroll.bind(this), true);
    
    // 鼠标悬停
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    console.log('Mouse event listeners attached');
  }

  handleMouseMove(event) {
    if (!this.isActive) return;
    
    const mouseEvent = {
      type: 'mousemove',
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      movementX: event.movementX,
      movementY: event.movementY
    };
    
    this.movements.push(mouseEvent);
    this.mouseEvents.push(mouseEvent);
    this.cleanOldEvents();
  }

  handleClick(event) {
    if (!this.isActive) return;
    
    const clickEvent = {
      type: 'click',
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      button: event.button,
      target: this.getElementInfo(event.target),
      elementPath: this.getElementPath(event.target),
      pageX: event.pageX,
      pageY: event.pageY
    };
    
    this.clicks.push(clickEvent);
    this.mouseEvents.push(clickEvent);
    this.cleanOldEvents();
  }

  handleDoubleClick(event) {
    if (!this.isActive) return;
    
    const dblClickEvent = {
      type: 'dblclick',
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    };
    
    this.mouseEvents.push(dblClickEvent);
    this.cleanOldEvents();
  }

  handleMouseDown(event) {
    if (!this.isActive) return;
    
    const mouseDownEvent = {
      type: 'mousedown',
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      button: event.button,
      target: this.getElementInfo(event.target)
    };
    
    this.mouseEvents.push(mouseDownEvent);
    this.cleanOldEvents();
  }

  handleMouseUp(event) {
    if (!this.isActive) return;
    
    const mouseUpEvent = {
      type: 'mouseup',
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now(),
      button: event.button,
      target: this.getElementInfo(event.target)
    };
    
    this.mouseEvents.push(mouseUpEvent);
    this.cleanOldEvents();
  }

  handleScroll(event) {
    if (!this.isActive) return;
    
    const scrollEvent = {
      type: 'scroll',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      scrollTop: event.target.scrollTop,
      scrollLeft: event.target.scrollLeft,
      deltaX: event.deltaX,
      deltaY: event.deltaY
    };
    
    this.scrolls.push(scrollEvent);
    this.mouseEvents.push(scrollEvent);
    this.cleanOldEvents();
  }

  handleMouseOver(event) {
    if (!this.isActive) return;
    
    const hoverEvent = {
      type: 'mouseover',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      relatedTarget: this.getElementInfo(event.relatedTarget)
    };
    
    this.mouseEvents.push(hoverEvent);
    this.cleanOldEvents();
  }

  handleMouseOut(event) {
    if (!this.isActive) return;
    
    const hoverEvent = {
      type: 'mouseout',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      relatedTarget: this.getElementInfo(event.relatedTarget)
    };
    
    this.mouseEvents.push(hoverEvent);
    this.cleanOldEvents();
  }

  getRecentActivities(seconds = 300) {
    const cutoff = Date.now() - seconds * 1000;
    
    return {
      movements: this.movements.filter(m => m.timestamp > cutoff),
      clicks: this.clicks.filter(c => c.timestamp > cutoff),
      scrolls: this.scrolls.filter(s => s.timestamp > cutoff),
      allEvents: this.mouseEvents.filter(e => e.timestamp > cutoff)
    };
  }

  getMouseHeatmap(seconds = 300) {
    const cutoff = Date.now() - seconds * 1000;
    const recentMovements = this.movements.filter(m => m.timestamp > cutoff);
    
    const heatmap = {};
    const gridSize = 50; // 像素
    
    recentMovements.forEach(move => {
      const gridX = Math.floor(move.x / gridSize);
      const gridY = Math.floor(move.y / gridSize);
      const key = `${gridX},${gridY}`;
      
      heatmap[key] = (heatmap[key] || 0) + 1;
    });
    
    return heatmap;
  }

  getClickDistribution(seconds = 300) {
    const cutoff = Date.now() - seconds * 1000;
    const recentClicks = this.clicks.filter(c => c.timestamp > cutoff);
    
    const distribution = {};
    recentClicks.forEach(click => {
      if (click.target) {
        const key = `${click.target.tagName}${click.target.id ? '#' + click.target.id : ''}`;
        distribution[key] = (distribution[key] || 0) + 1;
      }
    });
    
    return distribution;
  }

  getElementPath(element, maxDepth = 5) {
    const path = [];
    let current = element;
    let depth = 0;
    
    while (current && depth < maxDepth) {
      const info = this.getElementInfo(current);
      path.push(info);
      current = current.parentElement;
      depth++;
    }
    
    return path;
  }

  getElementInfo(element) {
    if (!element) return null;
    
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      name: element.name,
      type: element.type,
      text: element.textContent?.substring(0, 50)
    };
  }

  cleanOldEvents() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    this.mouseEvents = this.mouseEvents.filter(m => m.timestamp > fiveMinutesAgo);
    this.movements = this.movements.filter(m => m.timestamp > fiveMinutesAgo);
    this.clicks = this.clicks.filter(c => c.timestamp > fiveMinutesAgo);
    this.scrolls = this.scrolls.filter(s => s.timestamp > fiveMinutesAgo);
  }

  toggleMonitoring(active) {
    this.isActive = active;
  }

  getStatistics(seconds = 300) {
    const recentActivities = this.getRecentActivities(seconds);
    
    return {
      totalMovements: recentActivities.movements.length,
      totalClicks: recentActivities.clicks.length,
      totalScrolls: recentActivities.scrolls.length,
      clickRate: recentActivities.clicks.length / (seconds / 60), // 每分钟点击次数
      movementDistance: this.calculateMovementDistance(recentActivities.movements),
      activeAreas: Object.keys(this.getMouseHeatmap(seconds)).length
    };
  }

  calculateMovementDistance(movements) {
    let totalDistance = 0;
    
    for (let i = 1; i < movements.length; i++) {
      const dx = movements[i].x - movements[i - 1].x;
      const dy = movements[i].y - movements[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    return totalDistance;
  }
}