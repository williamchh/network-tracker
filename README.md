# User Activity Monitoring Extension

A Chrome extension designed for QA analysis that monitors user network activity, keyboard input, and mouse interactions.

## Features

### Monitoring Capabilities
- **Keyboard Activity Tracking** – Records all key events, including modifier keys  
- **Mouse Activity Tracking** – Tracks clicks, movement, scrolling, and hover events  
- **Network Activity Monitoring** – Intercepts and analyzes page network requests  
- **Real-time Analytics** – Provides activity scoring and live data visualization  

### Privacy Protection
- **Multi-level Privacy Settings** – Low / Medium / High privacy modes  
- **Sensitive Data Filtering** – Automatically detects and filters passwords and sensitive fields  
- **Data Anonymization** – Optional hashing of identifying information  
- **Local Processing** – Sensitive data is handled locally whenever possible  

### QA System Integration
- **API Integration** – Supports sending data to custom QA systems  
- **Batch Uploading** – Smart batching to reduce network requests  
- **Session Management** – Full session tracking and analysis  
- **Data Export** – Supports exporting data in JSON format  

---

## Installation

### Development Mode
1. Download or clone this project  
2. Open Chrome and go to `chrome://extensions/`  
3. Enable **Developer Mode** (top-right corner)  
4. Click **Load unpacked**  
5. Select the project directory  

### Production Deployment
1. Package the extension  
   - In the Extensions page, click **Pack extension**  
   - Select the project root directory  
   - Generate the `.crx` file and `.pem` key  

2. Publish to Chrome Web Store  
   - Create a developer account  
   - Upload a ZIP package  
   - Wait for review and approval  

---

## Configuration

### Basic Settings
In the settings page, you can configure:
- Monitoring switches (keyboard / mouse / network)  
- Privacy protection level  
- Data retention period  
- QA system API endpoint  

### QA System Integration
1. Configure the API endpoint in settings  
2. Test the connection  
3. Set the automatic upload frequency  
4. Data will be sent periodically based on your configuration  

---

## Data Structure

### Activity Data Format
```json
{
  "keyboard": [
    {
      "type": "keydown",
      "key": "a",
      "timestamp": 1234567890,
      "target": {
        "tagName": "INPUT",
        "id": "search"
      }
    }
  ],
  "mouse": [
    {
      "type": "click",
      "x": 100,
      "y": 200,
      "timestamp": 1234567890
    }
  ],
  "network": [
    {
      "type": "fetch",
      "url": "https://api.example.com",
      "method": "GET",
      "status": 200
    }
  ]
}
