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
          
          // Highlight the replayed element
          if (event.target) {
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
      if (element) return element;
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
    
    // Fallback to body
    return document.body;
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

  stopReplay() {
    this.isPlaying = false;
    
    // Clear all scheduled timeouts
    this.currentTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.currentTimeouts = [];
    
    console.log('Activity replay stopped');
  }
}

// Initialize the replayer
const activityReplayer = new ActivityReplayer();
console.log('Activity replayer initialized');
