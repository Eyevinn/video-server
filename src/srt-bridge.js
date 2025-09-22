const { spawn } = require('child_process');
const EventEmitter = require('events');
const config = require('./config');

class SRTBridge extends EventEmitter {
  constructor() {
    super();
    this.ffmpegProcess = null;
    this.isRunning = false;
    this.udpPort = config.output.mpegts.udp.port;
    this.srtPort = config.output.srt.port;
    this.srtLatency = config.output.srt.latency;
  }

  start() {
    if (this.isRunning) {
      this.stop();
    }

    try {
      const ffmpegArgs = this.buildSRTBridgeArgs();
      
      console.log(`Starting SRT Bridge with args: ${ffmpegArgs.join(' ')}`);
      
      this.ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.setupHandlers();
      this.isRunning = true;
      this.emit('bridgeStarted');

    } catch (error) {
      console.error('Failed to start SRT bridge:', error);
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

  buildSRTBridgeArgs() {
    const args = [];
    
    // Input from UDP multicast
    args.push('-i', `udp://${config.output.mpegts.udp.host}:${this.udpPort}`);
    
    // Copy streams without re-encoding for minimal latency
    args.push('-c', 'copy');
    
    // SRT output in listener mode
    args.push('-f', 'mpegts');
    args.push(`srt://0.0.0.0:${this.srtPort}?mode=listener&latency=${this.srtLatency}`);
    
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
      
      // Log SRT connection events
      if (output.includes('SRT')) {
        console.log(`SRT Bridge: ${output.trim()}`);
      }
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`SRT Bridge FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isRunning = false;
      
      if (code !== 0 && code !== null) {
        this.emit('bridgeError', new Error(`SRT Bridge FFmpeg process exited with code ${code}`));
      } else {
        this.emit('bridgeStopped');
      }
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('SRT Bridge FFmpeg process error:', error);
      this.isRunning = false;
      this.emit('bridgeError', error);
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      udpPort: this.udpPort,
      srtPort: this.srtPort,
      srtLatency: this.srtLatency
    };
  }
}

module.exports = SRTBridge;