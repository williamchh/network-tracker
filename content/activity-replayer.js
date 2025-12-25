class ActivityReplayer {
  constructor() {
    this.isPlaying = false;
    this.playbackSpeed = 1.0; // 1.0 = normal speed, 2.0 = 2x speed, etc.
    this.currentTimeouts = [];
    
    // Listen for replay messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      
      if (message.type === 'REPLAY_ACTIVITIES') {
        this.replayActivities(message.activities, message.options);
        sendResponse({ success: true });
      } else if (message.type === 'STOP_REPLAY') {
        this.stopReplay();
        sendResponse({ success: true });
      } else if (message.type === 'HIGHLIGHT_MOUSE_ACTIVITY') {
        const result = this.highlightMouseActivity(message.activity);
        sendResponse(result);
      }
      return true;
    });
  }

  replayActivities(activities, options = {}) {
    if (this.isPlaying) {
      this.stopReplay();
    }

    this.isPlaying = true;
    this.playbackSpeed = options.speed || 1.0;
    
    console.log('Starting activity replay with speed:', this.playbackSpeed);
    console.log('Activities to replay:', activities);

    // Combine all events and sort by timestamp
    const allEvents = [];
    
    // Add keyboard events
    if (activities.keyboard && Array.isArray(activities.keyboard)) {
      activities.keyboard.forEach(event => {
        allEvents.push({ ...event, type: 'keyboard' });
      });
    }
    
    // Add mouse events
    if (activities.mouse) {
      const mouseEvents = activities.mouse.allEvents || [];
      mouseEvents.forEach(event => {
        allEvents.push({ ...event, type: 'mouse' });
      });
    }
    
    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    if (allEvents.length === 0) {
      console.log('No activities to replay');
      this.isPlaying = false;
      return;
    }

    // Get the first event timestamp as the base time
    const baseTimestamp = allEvents[0].timestamp;
    const startTime = Date.now();
    
    // Schedule each event
    allEvents.forEach((event, index) => {
      const delay = (event.timestamp - baseTimestamp) / this.playbackSpeed;
      
      const timeoutId = setTimeout(() => {
        if (!this.isPlaying) return;
        
        try {
          this.executeEvent(event);
          
          // Highlight with circle for mouse activities
          if (event.type === 'mouse' || event.type === 'click' || event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'dblclick' || event.type === 'mousemove') {
            this.highlightMouseActivity(event);
          } else if (event.target) {
            // Only highlight DOM element for non-mouse events (e.g. keyboard)
            this.highlightElement(event.target);
          }
        } catch (error) {
          console.error('Error replaying event:', error);
        }
        
        // Notify when replay is complete
        if (index === allEvents.length - 1) {
          console.log('Activity replay complete');
          this.isPlaying = false;
        }
      }, delay);
      
      this.currentTimeouts.push(timeoutId);
    });
  }

  executeEvent(event) {
    switch (event.type) {
      case 'keyboard':
        this.replayKeyboardEvent(event);
        break;
      case 'click':
      case 'mousedown':
      case 'mouseup':
      case 'dblclick':
        this.replayMouseEvent(event);
        break;
      case 'mousemove':
        this.replayMouseMove(event);
        break;
      case 'scroll':
        this.replayScrollEvent(event);
        break;
      default:
        console.log('Unknown event type:', event.type);
    }
  }

  replayKeyboardEvent(event) {
    const element = this.findElement(event.target);
    if (!element) {
      console.log('Element not found for keyboard event:', event.target);
      return;
    }

    // Focus the element first
    element.focus();
    
    // Create and dispatch keyboard events
    const keydownEvent = new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      ctrlKey: event.modifiers?.ctrl || false,
      altKey: event.modifiers?.alt || false,
      shiftKey: event.modifiers?.shift || false,
      metaKey: event.modifiers?.meta || false,
      bubbles: true
    });
    
    element.dispatchEvent(keydownEvent);
    
    // Also dispatch input event for form elements
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        data: event.key,
        inputType: 'insertText'
      });
      element.dispatchEvent(inputEvent);
    }
    
    console.log('Replayed keyboard event:', event.key);
  }

  replayMouseEvent(event) {
    const element = this.findElement(event.target);
    if (!element) {
      console.log('Element not found for mouse event:', event.target);
      return;
    }

    // Scroll element into view first
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    const mouseEvent = new MouseEvent(event.type, {
      clientX: event.x,
      clientY: event.y,
      button: event.button || 0,
      bubbles: true,
      cancelable: true
    });
    
    element.dispatchEvent(mouseEvent);
    console.log('Replayed mouse event:', event.type, 'at', event.x, event.y);
  }

  replayMouseMove(event) {
    const element = this.findElement(event.target);
    if (!element) {
      console.log('Element not found for mousemove event:', event.target);
      return;
    }

    const mouseEvent = new MouseEvent('mousemove', {
      clientX: event.x,
      clientY: event.y,
      movementX: event.movementX || 0,
      movementY: event.movementY || 0,
      bubbles: true
    });
    
    element.dispatchEvent(mouseEvent);
  }

  replayScrollEvent(event) {
    const element = this.findElement(event.target);
    if (!element) {
      console.log('Element not found for scroll event:', event.target);
      return;
    }

    // Scroll the element to the recorded position
    if (element.scrollTop !== undefined) {
      element.scrollTop = event.scrollTop || 0;
    }
    if (event.scrollLeft !== undefined) {
      element.scrollLeft = event.scrollLeft || 0;
    }
    
    console.log('Replayed scroll event');
  }

  findElement(targetInfo) {
    if (!targetInfo) return document.body;
    
    // Try to find element by ID first
    if (targetInfo.id) {
      const element = document.getElementById(targetInfo.id);
      if (element) {
        return element;
      }
    }
    
    // Try to find by tag name and name attribute
    if (targetInfo.tagName && targetInfo.name) {
      const elements = document.getElementsByTagName(targetInfo.tagName);
      for (let element of elements) {
        if (element.name === targetInfo.name) {
          return element;
        }
      }
    }
    
    // Try to find by tag name and type
    if (targetInfo.tagName && targetInfo.type) {
      const elements = document.getElementsByTagName(targetInfo.tagName);
      for (let element of elements) {
        if (element.type === targetInfo.type) {
          return element;
        }
      }
    }
    
    // Try to find by tag name and class name
    if (targetInfo.tagName && targetInfo.className) {
      const elements = document.getElementsByTagName(targetInfo.tagName);
      const classNames = targetInfo.className.split(' ').filter(c => c.trim());
      for (let element of elements) {
        const elementClassNames = element.className.split(' ').filter(c => c.trim());
        const hasAllClasses = classNames.every(cls => elementClassNames.includes(cls));
        if (hasAllClasses) {
          return element;
        }
      }
    }
    
    // Try to find by text content
    if (targetInfo.text && targetInfo.tagName) {
      const elements = document.getElementsByTagName(targetInfo.tagName);
      for (let element of elements) {
        if (element.textContent && element.textContent.includes(targetInfo.text)) {
          console.log('Found element by text content:', element);
          return element;
        }
      }
    }
    
    // Try querySelector with combined attributes
    if (targetInfo.tagName) {
      let selector = targetInfo.tagName.toLowerCase();
      if (targetInfo.id) {
        selector += `#${targetInfo.id}`;
      }
      if (targetInfo.className) {
        const classNames = targetInfo.className.split(' ').filter(c => c.trim()).join('.');
        selector += `.${classNames}`;
      }
      try {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      } catch (e) {
        console.log('QuerySelector failed:', e);
      }
    }
    
    console.log('Element not found, falling back to body');
    // Fallback to body
    return document.body;
  }
  
  findElementByPath(path) {
    if (!path || !Array.isArray(path) || path.length === 0) {
      return null;
    }
    
    // Start from the last element in path (the target itself)
    // and work backwards up the path
    for (let i = path.length - 1; i >= 0; i--) {
      const targetInfo = path[i];
      
      // Try to find element by ID first
      if (targetInfo.id) {
        const element = document.getElementById(targetInfo.id);
        if (element) {
          // Verify this element matches the path by checking its ancestors
          if (this.verifyElementPath(element, path, i)) {
            return element;
          }
        }
      }
      
      // Try to find by tag, class, and text
      if (targetInfo.tagName) {
        const elements = document.getElementsByTagName(targetInfo.tagName);
        for (let element of elements) {
          let match = true;
          
          // Check class name
          if (targetInfo.className && targetInfo.className.trim()) {
            const classNames = targetInfo.className.split(' ').filter(c => c.trim());
            const elementClassNames = element.className.split(' ').filter(c => c.trim());
            const hasAllClasses = classNames.every(cls => elementClassNames.includes(cls));
            if (!hasAllClasses) match = false;
          }
          
          // Check text content
          if (match && targetInfo.text && targetInfo.text.trim()) {
            if (!element.textContent || !element.textContent.includes(targetInfo.text)) {
              match = false;
            }
          }
          
          // Check name attribute
          if (match && targetInfo.name) {
            if (element.name !== targetInfo.name) {
              match = false;
            }
          }
          
          // Check type attribute
          if (match && targetInfo.type) {
            if (element.type !== targetInfo.type) {
              match = false;
            }
          }
          
          if (match) {
            if (this.verifyElementPath(element, path, i)) {
              return element;
            }
          }
        }
      }
    }
    
    return null;
  }
  
  verifyElementPath(element, path, startIndex) {
    // Verify that the element's ancestors match the path
    let current = element;
    for (let i = startIndex - 1; i >= 0; i--) {
      current = current.parentElement;
      if (!current) return false;
      
      const pathInfo = path[i];
      if (current.tagName !== pathInfo.tagName) {
        return false;
      }
    }
    return true;
  }

  highlightElement(targetInfo) {
    const element = this.findElement(targetInfo);
    if (!element) return;
    
    // Add temporary highlight
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    
    element.style.outline = '2px solid #ff0000';
    element.style.outlineOffset = '2px';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
    }, 500 / this.playbackSpeed);
  }
  
  highlightMouseActivity(activity) {
    
    // Use page coordinates for more accurate positioning
    const x = activity.pageX !== undefined ? activity.pageX : activity.x;
    const y = activity.pageY !== undefined ? activity.pageY : activity.y;

    if (x === undefined || y === undefined) {
      console.log('No coordinates for mouse activity highlight');
      return { success: false };
    }
    
    // Create a circle indicator at the click position
    const circle = document.createElement('div');
    circle.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 107, 0, 0.3);
      border: 3px solid #ff6b00;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 999999;
      box-shadow: 0 0 20px rgba(255, 107, 0, 0.8);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(circle);
    
    // Pulse animation
    let pulseCount = 0;
    const maxPulses = 3;
    const pulseInterval = setInterval(() => {
      pulseCount++;
      
      if (pulseCount >= maxPulses * 2) {
        clearInterval(pulseInterval);
        // Remove circle after animation
        circle.style.opacity = '0';
        circle.style.transform = 'translate(-50%, -50%) scale(1.5)';
        setTimeout(() => {
          if (circle.parentNode) {
            circle.parentNode.removeChild(circle);
          }
        }, 300);
        return;
      }
      
      // Pulse effect
      if (pulseCount % 2 === 0) {
        circle.style.transform = 'translate(-50%, -50%) scale(1)';
        circle.style.boxShadow = '0 0 20px rgba(255, 107, 0, 0.8)';
      } else {
        circle.style.transform = 'translate(-50%, -50%) scale(1.3)';
        circle.style.boxShadow = '0 0 30px rgba(255, 107, 0, 1)';
      }
    }, 300);
    
    return {
      success: true,
      message: 'Click position highlighted with circle!'
    };
  }

  stopReplay() {
    this.isPlaying = false;
    
    // Clear all scheduled timeouts
    this.currentTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.currentTimeouts = [];
    
  }
}

// Initialize the replayer
const activityReplayer = new ActivityReplayer();
console.log('Activity replayer initialized');
