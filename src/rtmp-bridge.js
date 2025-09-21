const { spawn } = require('child_process');
const EventEmitter = require('events');
const config = require('./config');

class RTMPBridge extends EventEmitter {
  constructor() {
    super();
    this.ffmpegProcess = null;
    this.isRunning = false;
    this.udpPort = config.output.mpegts.udp.port;
    this.rtmpUrl = config.output.rtmp.url;
  }

  start(rtmpUrl = null) {
    if (this.isRunning) {
      this.stop();
    }

    // Use provided URL or fallback to config
    this.rtmpUrl = rtmpUrl || config.output.rtmp.url;

    if (!this.rtmpUrl) {
      const error = new Error('RTMP URL is required');
      this.emit('bridgeError', error);
      throw error;
    }

    try {
      const ffmpegArgs = this.buildRTMPBridgeArgs();
      
      console.log(`Starting RTMP Bridge with args: ${ffmpegArgs.join(' ')}`);
      
      this.ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.setupHandlers();
      this.isRunning = true;
      this.emit('bridgeStarted');

    } catch (error) {
      console.error('Failed to start RTMP bridge:', error);
      this.emit('bridgeError', error);
      throw error;
    }
  }

  stop() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          this.ffmpegProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    
    this.isRunning = false;
    this.emit('bridgeStopped');
  }

  buildRTMPBridgeArgs() {
    const args = [];
    
    // Input from UDP stream
    args.push('-i', `udp://127.0.0.1:${this.udpPort}`);
    
    // Video encoding settings for RTMP compatibility
    args.push('-c:v', 'libx264');
    args.push('-preset', 'veryfast'); // Balance between speed and quality
    args.push('-tune', 'zerolatency');
    
    // Audio encoding for RTMP
    args.push('-c:a', 'aac');
    args.push('-ar', '44100'); // Standard sample rate for RTMP
    args.push('-b:a', '128k');
    
    // Video settings for RTMP streaming
    args.push('-pix_fmt', 'yuv420p'); // Ensure compatibility
    args.push('-profile:v', 'main'); // Widely supported profile
    args.push('-level', '3.1');
    
    // Bitrate and quality settings
    args.push('-b:v', '2000k'); // Reasonable bitrate for RTMP
    args.push('-maxrate', '2000k');
    args.push('-bufsize', '4000k');
    
    // GOP settings for streaming
    args.push('-g', '50'); // Keyframe every 2 seconds at 25fps
    args.push('-keyint_min', '25');
    args.push('-sc_threshold', '0');
    
    // RTMP-specific settings
    args.push('-f', 'flv');
    
    // Connection timeout and retry settings
    args.push('-rtmp_live', 'live');
    args.push('-timeout', '5000000'); // 5 second timeout
    
    // Output to RTMP URL
    args.push(this.rtmpUrl);
    
    args.push('-loglevel', config.ffmpeg.logLevel);
    
    return args;
  }

  setupHandlers() {
    this.ffmpegProcess.stdout.on('data', (data) => {
      this.emit('bridgeOutput', data.toString());
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('bridgeLog', output);
      
      // Log RTMP connection events
      if (output.includes('RTMP') || output.includes('Connection') || output.includes('Server')) {
        console.log(`RTMP Bridge: ${output.trim()}`);
      }
      
      // Check for successful connection
      if (output.includes('Stream #0:0') && output.includes('fps')) {
        console.log('RTMP Bridge: Successfully connected and streaming');
      }
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`RTMP Bridge FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isRunning = false;
      
      if (code !== 0 && code !== null) {
        this.emit('bridgeError', new Error(`RTMP Bridge FFmpeg process exited with code ${code}`));
      } else {
        this.emit('bridgeStopped');
      }
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('RTMP Bridge FFmpeg process error:', error);
      this.isRunning = false;
      this.emit('bridgeError', error);
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      udpPort: this.udpPort,
      rtmpUrl: this.rtmpUrl ? this.maskRtmpUrl(this.rtmpUrl) : null
    };
  }
  
  // Mask sensitive information in RTMP URL for logging/status
  maskRtmpUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname.includes('/')) {
        const pathParts = urlObj.pathname.split('/');
        // Mask the stream key (usually the last part)
        if (pathParts.length > 1) {
          pathParts[pathParts.length - 1] = '***';
          urlObj.pathname = pathParts.join('/');
        }
      }
      return urlObj.toString();
    } catch (e) {
      // If URL parsing fails, mask the last part after the last slash
      const lastSlashIndex = url.lastIndexOf('/');
      if (lastSlashIndex > -1) {
        return url.substring(0, lastSlashIndex + 1) + '***';
      }
      return '***';
    }
  }
}

module.exports = RTMPBridge;