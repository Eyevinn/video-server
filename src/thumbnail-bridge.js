const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('./config');

class ThumbnailBridge extends EventEmitter {
  constructor() {
    super();
    this.ffmpegProcess = null;
    this.isRunning = false;
    this.udpPort = config.output.thumbnail.udp.port;
    this.outputPath = config.output.thumbnail.path;
    this.interval = config.output.thumbnail.interval;
    this.width = config.output.thumbnail.width;
    this.height = config.output.thumbnail.height;
    this.lastThumbnailPath = null;
    
    // Ensure output directory exists
    this.ensureOutputDirectory();
  }

  start() {
    if (this.isRunning) {
      this.stop();
    }

    try {
      const ffmpegArgs = this.buildThumbnailArgs();
      
      console.log(`Starting Thumbnail Bridge with args: ${ffmpegArgs.join(' ')}`);
      
      this.ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.setupHandlers();
      this.startThumbnailMonitoring();
      this.isRunning = true;
      this.emit('bridgeStarted');

    } catch (error) {
      console.error('Failed to start thumbnail bridge:', error);
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
    
    this.stopThumbnailMonitoring();
    this.isRunning = false;
    this.emit('bridgeStopped');
  }

  buildThumbnailArgs() {
    const args = [];
    
    args.push('-y'); // Overwrite output files without asking
    
    // Input from UDP stream
    args.push('-i', `udp://${config.output.thumbnail.udp.host}:${this.udpPort}`);
    
    // Video filter for thumbnail generation
    args.push('-vf', `fps=1/${this.interval},scale=${this.width}:${this.height}`);
    
    // Image encoding settings
    args.push('-f', 'image2');
    args.push('-q:v', '2'); // High quality JPEG
    args.push('-update', '1'); // Overwrite the same file
    
    // Output path for thumbnail
    const thumbnailFile = path.join(this.outputPath, 'thumbnail.jpg');
    args.push(thumbnailFile);
    
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
      
      // Log thumbnail generation events
      if (output.includes('thumbnail') || output.includes('fps=')) {
        console.log(`Thumbnail Bridge: ${output.trim()}`);
      }
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`Thumbnail Bridge FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isRunning = false;
      this.stopThumbnailMonitoring();
      
      if (code !== 0 && code !== null) {
        this.emit('bridgeError', new Error(`Thumbnail Bridge FFmpeg process exited with code ${code}`));
      } else {
        this.emit('bridgeStopped');
      }
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('Thumbnail Bridge FFmpeg process error:', error);
      this.isRunning = false;
      this.stopThumbnailMonitoring();
      this.emit('bridgeError', error);
    });
  }

  startThumbnailMonitoring() {
    // Monitor thumbnail file for updates
    this.thumbnailMonitor = setInterval(() => {
      this.updateLastThumbnailPath();
    }, this.interval * 1000);
  }

  stopThumbnailMonitoring() {
    if (this.thumbnailMonitor) {
      clearInterval(this.thumbnailMonitor);
      this.thumbnailMonitor = null;
    }
  }

  ensureOutputDirectory() {
    try {
      if (!fs.existsSync(this.outputPath)) {
        fs.mkdirSync(this.outputPath, { recursive: true });
        console.log(`Created thumbnail output directory: ${this.outputPath}`);
      }
    } catch (error) {
      console.error('Failed to create thumbnail output directory:', error);
      throw error;
    }
  }

  updateLastThumbnailPath() {
    const thumbnailFile = path.join(this.outputPath, 'thumbnail.jpg');
    if (fs.existsSync(thumbnailFile)) {
      this.lastThumbnailPath = thumbnailFile;
    }
  }

  getLastThumbnailPath() {
    return this.lastThumbnailPath;
  }

  getThumbnailUrl() {
    if (this.lastThumbnailPath) {
      // Return relative URL path for serving the thumbnail
      return '/api/thumbnail/current';
    }
    return null;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      udpPort: this.udpPort,
      outputPath: this.outputPath,
      interval: this.interval,
      dimensions: `${this.width}x${this.height}`,
      lastThumbnailPath: this.lastThumbnailPath,
      thumbnailUrl: this.getThumbnailUrl()
    };
  }
}

module.exports = ThumbnailBridge;