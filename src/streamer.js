const { spawn } = require('child_process');
const EventEmitter = require('events');
const axios = require('axios');
const config = require('./config');
const SRTBridge = require('./srt-bridge');

class FFmpegStreamer extends EventEmitter {
  constructor(outputConfig = {}) {
    super();
    this.ffmpegProcess = null;
    this.isStreaming = false;
    this.currentItem = null;
    this.outputConfig = { ...config.streaming, ...outputConfig };
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.srtBridge = null;
    this.srtEnabled = config.output.srt.enabled;
  }

  async startStream(item) {
    if (this.isStreaming) {
      this.stopStream();
    }

    this.currentItem = item;
    
    try {
      const inputArgs = await this.buildInputArgs(item.url);
      const outputArgs = this.buildOutputArgs();
      const ffmpegArgs = [...inputArgs, ...outputArgs];

      console.log(`Starting FFmpeg with args: ${ffmpegArgs.join(' ')}`);
      
      this.ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.setupFFmpegHandlers();
      this.isStreaming = true;
      this.restartAttempts = 0;
      
      // Start SRT bridge if enabled
      if (this.srtEnabled) {
        this.startSRTBridge();
      }
      
      this.emit('streamStarted', item);

    } catch (error) {
      console.error('Failed to start stream:', error);
      this.emit('streamError', error);
      throw error;
    }
  }

  stopStream() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          this.ffmpegProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    // Stop SRT bridge if running
    if (this.srtBridge) {
      this.stopSRTBridge();
    }
    
    this.isStreaming = false;
    this.currentItem = null;
    this.emit('streamStopped');
  }

  setupFFmpegHandlers() {
    this.ffmpegProcess.stdout.on('data', (data) => {
      this.emit('ffmpegOutput', data.toString());
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('ffmpegLog', output);
      
      if (output.includes('time=')) {
        this.parseProgressInfo(output);
      }
      
      if (output.includes('Stream mapping:')) {
        this.emit('streamInfo', this.parseStreamInfo(output));
      }
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isStreaming = false;
      
      if (code === 0) {
        this.emit('streamFinished', this.currentItem);
      } else if (this.restartAttempts < this.maxRestartAttempts && this.currentItem) {
        this.restartAttempts++;
        console.log(`Attempting to restart stream (attempt ${this.restartAttempts})`);
        setTimeout(() => {
          this.startStream(this.currentItem);
        }, 2000);
      } else {
        this.emit('streamError', new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg process error:', error);
      this.isStreaming = false;
      this.emit('streamError', error);
    });
  }

  async buildInputArgs(url) {
    const args = ['-re'];
    
    if (url.startsWith('http')) {
      args.push('-headers', 'User-Agent: VideoServer/1.0');
      args.push('-timeout', '10000000');
      args.push('-reconnect', '1');
      args.push('-reconnect_streamed', '1');
      args.push('-reconnect_delay_max', '5');
    }
    
    args.push('-i', url);
    args.push('-avoid_negative_ts', 'make_zero');
    
    return args;
  }

  buildOutputArgs() {
    const args = [];
    
    // Common encoding settings optimized for stability
    args.push('-c:v', this.outputConfig.defaultVideoCodec);
    args.push('-c:a', this.outputConfig.defaultAudioCodec);
    args.push('-r', this.outputConfig.defaultFramerate.toString());
    args.push('-b:v', this.outputConfig.defaultBitrate);
    args.push('-b:a', this.outputConfig.defaultAudioBitrate);
    args.push('-s', this.outputConfig.defaultResolution);
    
    // Optimized encoding settings for stable UDP streaming
    args.push('-preset', 'ultrafast');  // Faster encoding for realtime
    args.push('-tune', 'zerolatency');
    args.push('-g', (this.outputConfig.defaultFramerate * 2).toString());
    args.push('-keyint_min', this.outputConfig.defaultFramerate.toString());
    args.push('-sc_threshold', '0');
    
    args.push('-pix_fmt', 'yuv420p');
    args.push('-profile:v', 'baseline');  // More compatible profile
    args.push('-level', '3.1');
    
    // Buffer and threading optimizations
    args.push('-threads', '0');  // Use all available CPU threads
    args.push('-thread_type', 'slice');
    
    // Primary output: UDP
    args.push('-f', 'mpegts');
    // Add UDP-specific optimizations to reduce packet loss
    args.push('-mpegts_original_network_id', '1');
    args.push('-mpegts_transport_stream_id', '1');
    args.push('-mpegts_service_id', '1');
    args.push('-muxrate', '6000000');  // Set mux rate slightly higher than video bitrate
    args.push(`udp://${config.output.mpegts.udp.host}:${config.output.mpegts.udp.port}?pkt_size=1316&buffer_size=65536`);
    
    args.push('-loglevel', config.ffmpeg.logLevel);
    
    return args;
  }

  parseProgressInfo(output) {
    const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
    const fpsMatch = output.match(/fps=\s*(\d+\.?\d*)/);
    const bitrateMatch = output.match(/bitrate=\s*(\d+\.?\d*)kbits\/s/);
    
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseInt(timeMatch[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      
      const progress = {
        time: totalSeconds,
        fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
        bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
        timestamp: new Date()
      };
      
      this.emit('progress', progress);
    }
  }

  parseStreamInfo(output) {
    const info = {
      input: {},
      output: {}
    };
    
    const videoMatch = output.match(/Video: (\w+).*?, (\d+x\d+).*?, (\d+\.?\d*) fps/);
    if (videoMatch) {
      info.input.video = {
        codec: videoMatch[1],
        resolution: videoMatch[2],
        fps: parseFloat(videoMatch[3])
      };
    }
    
    const audioMatch = output.match(/Audio: (\w+).*?, (\d+) Hz/);
    if (audioMatch) {
      info.input.audio = {
        codec: audioMatch[1],
        sampleRate: parseInt(audioMatch[2])
      };
    }
    
    return info;
  }


  startSRTBridge() {
    if (!this.srtBridge) {
      this.srtBridge = new SRTBridge();
      
      this.srtBridge.on('bridgeStarted', () => {
        console.log('SRT Bridge started successfully');
      });
      
      this.srtBridge.on('bridgeError', (error) => {
        console.error('SRT Bridge error:', error);
      });
      
      this.srtBridge.on('bridgeStopped', () => {
        console.log('SRT Bridge stopped');
      });
    }
    
    // Give the main stream a moment to start before bridging
    setTimeout(() => {
      this.srtBridge.start();
    }, 2000);
  }

  stopSRTBridge() {
    if (this.srtBridge) {
      this.srtBridge.stop();
      this.srtBridge = null;
    }
  }

  getStatus() {
    return {
      isStreaming: this.isStreaming,
      currentItem: this.currentItem,
      outputConfig: this.outputConfig,
      restartAttempts: this.restartAttempts,
      srtBridge: this.srtBridge ? this.srtBridge.getStatus() : null
    };
  }
}

module.exports = FFmpegStreamer;