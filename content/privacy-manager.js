class PrivacyManager {
  constructor() {
    this.sensitivePatterns = [
      /password/gi,
      /passwd/gi,
      /pwd/gi,
      /secret/gi,
      /token/gi,
      /api[_-]?key/gi,
      /credit.?card/gi,
      /cc.?number/gi,
      /cvv/gi,
      /ssn/gi,
      /social.?security/gi,
      /bank.?account/gi,
      /phone.?number/gi,
      /email/gi,
      /address/gi,
      /birth.?date/gi
    ];
    
    this.sensitiveFields = [
      'password', 'passwd', 'pwd', 'secret',
      'token', 'apiKey', 'api_key', 'apikey',
      'creditcard', 'ccnumber', 'cvv', 'ssn',
      'phone', 'email', 'address', 'dob'
    ];
    
    this.privacyLevels = {
      low: {
        redactSensitive: false,
        anonymizeData: false,
        hashIdentifiers: false
      },
      medium: {
        redactSensitive: true,
        anonymizeData: true,
        hashIdentifiers: true
      },
      high: {
        redactSensitive: true,
        anonymizeData: true,
        hashIdentifiers: true,
        excludeContent: true
      }
    };
  }

  sanitizeData(data, privacyLevel = 'medium') {
    const level = this.privacyLevels[privacyLevel] || this.privacyLevels.medium;
    
    const sanitized = { ...data };
    
    if (sanitized.keyboard) {
      sanitized.keyboard = sanitized.keyboard.map(event =>
        this.sanitizeKeyboardEvent(event, level)
      );
    }
    
    if (sanitized.mouse) {
      sanitized.mouse = this.sanitizeMouseData(sanitized.mouse, level);
    }
    
    if (sanitized.network) {
      sanitized.network = this.sanitizeNetworkData(sanitized.network, level);
    }
    
    if (sanitized.summary) {
      sanitized.summary = this.sanitizeSummary(sanitized.summary, level);
    }
    
    return sanitized;
  }

  sanitizeKeyboardEvent(event, level) {
    const sanitized = { ...event };
    
    if (level.redactSensitive && this.isSensitiveField(event.target)) {
      sanitized.key = '[REDACTED]';
      sanitized.code = '[REDACTED]';
    }
    
    if (level.anonymizeData) {
      sanitized.target = this.anonymizeElementInfo(sanitized.target);
    }
    
    if (level.hashIdentifiers && sanitized.target) {
      if (sanitized.target.id) {
        sanitized.target.id = this.hashString(sanitized.target.id);
      }
      if (sanitized.target.name) {
        sanitized.target.name = this.hashString(sanitized.target.name);
      }
    }
    
    return sanitized;
  }

  sanitizeMouseData(mouseData, level) {
    const sanitized = { ...mouseData };
    
    if (level.anonymizeData) {
      if (sanitized.clicks) {
        sanitized.clicks = sanitized.clicks.map(click => ({
          ...click,
          target: this.anonymizeElementInfo(click.target),
          elementPath: click.elementPath?.map(el => this.anonymizeElementInfo(el))
        }));
      }
      
      if (sanitized.movements) {
        sanitized.movements = sanitized.movements.map(move => ({
          ...move,
          target: this.anonymizeElementInfo(move.target)
        }));
      }
    }
    
    return sanitized;
  }

  sanitizeNetworkData(networkData, level) {
    const sanitized = [...networkData];
    
    return sanitized.map(request => {
      const sanitizedRequest = { ...request };
      
      if (level.redactSensitive) {
        sanitizedRequest.url = this.sanitizeUrl(sanitizedRequest.url);
      }
      
      if (level.anonymizeData) {
        // Remove query parameters that may contain sensitive information
        try {
          const url = new URL(sanitizedRequest.url);
          url.search = '';
          sanitizedRequest.url = url.toString();
        } catch (e) {
          // If URL parsing fails, keep as is
        }
      }
      
      return sanitizedRequest;
    });
  }

  sanitizeSummary(summary, level) {
    const sanitized = { ...summary };
    
    if (level.excludeContent) {
      delete sanitized.topInteractions;
      delete sanitized.timeline;
    }
    
    return sanitized;
  }

  isSensitiveField(elementInfo) {
    if (!elementInfo) return false;
    
    return this.sensitiveFields.some(field => 
      elementInfo.type?.toLowerCase().includes(field) ||
      elementInfo.name?.toLowerCase().includes(field) ||
      elementInfo.id?.toLowerCase().includes(field) ||
      elementInfo.placeholder?.toLowerCase().includes(field)
    ) || this.sensitivePatterns.some(pattern =>
      pattern.test(elementInfo.type || '') ||
      pattern.test(elementInfo.name || '') ||
      pattern.test(elementInfo.id || '') ||
      pattern.test(elementInfo.placeholder || '')
    );
  }

  anonymizeElementInfo(elementInfo) {
    if (!elementInfo) return null;
    
    return {
      tagName: elementInfo.tagName,
      type: elementInfo.type,
      // Remove or hash identifier information
      id: elementInfo.id ? 'element_id' : undefined,
      name: elementInfo.name ? 'element_name' : undefined,
      className: elementInfo.className ? 'element_class' : undefined,
      text: elementInfo.text ? '[...]' : undefined
    };
  }

  hashString(str) {
    // Simple hash function, actual applications should use a more secure hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove sensitive query parameters
      const params = new URLSearchParams(urlObj.search);
      params.forEach((value, key) => {
        if (this.sensitivePatterns.some(pattern => 
          pattern.test(key) || pattern.test(value)
        )) {
          params.set(key, '[REDACTED]');
        }
      });
      
      urlObj.search = params.toString();
      
      // Hash sensitive information in path
      const pathParts = urlObj.pathname.split('/').map(part => {
        if (this.sensitivePatterns.some(pattern => pattern.test(part))) {
          return '[REDACTED]';
        }
        return part;
      });
      
      urlObj.pathname = pathParts.join('/');
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}
