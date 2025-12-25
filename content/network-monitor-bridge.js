(() => {
  // Helper function to dispatch network event via postMessage
  // This allows communication between page context and content script (isolated world)
  function dispatchNetworkEvent(detail) {
    window.postMessage({
      type: 'MY_EXT_NETWORK_LOG',
      detail: {
        ...detail,
        timestamp: Date.now() // Use timestamp as number for consistency
      }
    }, window.location.origin);
  }
  // Intercept XMLHttpRequest
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      dispatchNetworkEvent({
        method: this._method,
        url: this._url,
        status: this.status,
        response: this.responseText,
        requestHeaders: this._requestHeaders,
        responseHeaders: this.getAllResponseHeaders()
      });
    });
    this.addEventListener('error', function() {
      dispatchNetworkEvent({
        method: this._method,
        url: this._url,
        status: 0,
        response: 'Network error',
        requestHeaders: this._requestHeaders,
        responseHeaders: '',
        error: true
      });
    });
    return originalSend.apply(this, arguments);
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    return originalOpen.apply(this, arguments);
  };
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (!this._requestHeaders) {
      this._requestHeaders = {};
    }
    this._requestHeaders[header] = value;
    return originalSetRequestHeader.apply(this, arguments);
  };
  // Intercept Fetch API
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const startTime = Date.now();
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const options = args[1] || {};
    const method = options.method || 'GET';
    return originalFetch.apply(this, args)
      .then(async (response) => {
        // Clone the response to avoid consuming the body
        const clonedResponse = response.clone();
        let responseBody = '';
        
        try {
          // Try to get response text for JSON/text responses
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json') || contentType.includes('text/')) {
            responseBody = await clonedResponse.text();
          }
        } catch (e) {
          // If we can't read the body, that's okay
        }
        dispatchNetworkEvent({
          method: method,
          url: url,
          status: response.status,
          response: responseBody,
          requestHeaders: options.headers || {},
          responseHeaders: Object.fromEntries(response.headers.entries()),
          duration: Date.now() - startTime
        });
        return response;
      })
      .catch((error) => {
        dispatchNetworkEvent({
          method: method,
          url: url,
          status: 0,
          response: error.message || 'Fetch error',
          requestHeaders: options.headers || {},
          responseHeaders: {},
          error: true,
          duration: Date.now() - startTime
        });
        throw error;
      });
  };
  console.log('Network monitor bridge loaded');
})();