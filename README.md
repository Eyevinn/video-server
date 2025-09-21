# Video Server

A powerful video streaming server with queue management, built with Node.js and FFmpeg. Supports multiple output formats including MPEG-TS/SRT, RTMP, and UDP streaming.

## Features

- 🎬 **Video Queue Management**: Add, remove, and reorder videos in a playlist
- 🎯 **Multiple Output Formats**: MPEG-TS over SRT, RTMP, or UDP
- 🌐 **Modern Web Interface**: Clean, responsive UI for queue management
- 🔧 **RESTful API**: Full API for programmatic control
- 📺 **Format Support**: Handles various video formats via FFmpeg
- ⚡ **Real-time Updates**: Live status updates and queue changes

## Quick Start

### Prerequisites

- Node.js 16+ 
- FFmpeg installed and accessible in PATH
- Network access for HTTP video sources

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-restart
npm run dev
```

### Configuration

The server can be configured via environment variables or by editing `src/config.js`:

```bash
# Server settings
PORT=3000
HOST=0.0.0.0

# Output mode: 'udp', 'srt', or 'rtmp'
OUTPUT_MODE=udp

# FFmpeg settings
FFMPEG_PATH=/usr/local/bin/ffmpeg
FFMPEG_LOG_LEVEL=error
```

## Output Formats

### Default Configuration
- **Video**: AVC (H.264) at 1920x1080, 50fps, 2500k bitrate
- **Audio**: AAC at 128k bitrate
- **Container**: MPEG-TS

### UDP MPEG-TS Output (Default)
```
udp://127.0.0.1:1234
```
Use VLC or similar player: Media > Open Network Stream

### SRT Output
```bash
# Enable SRT mode
OUTPUT_MODE=srt npm start

# Connect to: srt://localhost:9998
```
**Note**: SRT listener mode requires a client to connect before streaming starts.

### RTMP Output
```bash
# Enable RTMP mode  
OUTPUT_MODE=rtmp npm start

# Connect to: rtmp://localhost:1935/live/stream
```

## API Endpoints

### Queue Management
- `GET /api/queue` - Get current queue status
- `POST /api/queue/add` - Add video to queue
- `DELETE /api/queue/:id` - Remove item from queue
- `POST /api/queue/clear` - Clear entire queue
- `POST /api/queue/skip` - Skip current item
- `POST /api/queue/move` - Reorder queue items

### System Status
- `GET /api/status` - Get server and stream status
- `GET /api/stream/status` - Get streaming status
- `POST /api/stream/start` - Start streaming
- `POST /api/stream/stop` - Stop streaming

### Configuration
- `GET /api/config` - Get current configuration

## Usage Examples

### Adding a Video via API
```bash
curl -X POST http://localhost:3000/api/queue/add \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/video.mp4", "title": "My Video"}'
```

### Web Interface
Open http://localhost:3000 in your browser for the web interface.

## Video Sources

The server supports any video source accessible via HTTPS:
- Direct video file URLs (MP4, MKV, AVI, etc.)
- Streaming URLs (HLS, DASH)
- CDN-hosted content

## Output Configuration

Edit `src/config.js` to customize output settings:

```javascript
const config = {
  streaming: {
    defaultFormat: 'mpegts',
    defaultVideoCodec: 'libx264',
    defaultAudioCodec: 'aac',
    defaultFramerate: 50,
    defaultResolution: '1920x1080',
    defaultBitrate: '2500k'
  },
  
  output: {
    srt: {
      enabled: true,
      port: 9998,
      latency: 120
    },
    rtmp: {
      enabled: false,
      port: 1935,
      app: 'live',
      key: 'stream'
    },
    mpegts: {
      enabled: false,
      udp: {
        host: '127.0.0.1',
        port: 1234
      }
    }
  }
};
```

## Troubleshooting

### FFmpeg Not Found
Ensure FFmpeg is installed and in your PATH:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Or set custom path
export FFMPEG_PATH=/path/to/ffmpeg
```

### Network Issues
- Ensure video URLs are accessible via HTTPS
- Check firewall settings for output ports
- Verify SRT/RTMP client can connect to the specified ports

### Performance
- Adjust bitrate settings based on your network capacity
- Use hardware encoding if available (e.g., `h264_videotoolbox` on macOS)
- Monitor CPU usage and adjust quality settings accordingly

## Development

```bash
# Run tests
npm test

# Start development server with hot reload
npm run dev
```

## License

MIT License - see LICENSE file for details.