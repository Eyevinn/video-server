const { spawn } = require('child_process');
const EventEmitter = require('events');
const config = require('./config');

class SlateGenerator extends EventEmitter {
  constructor(outputConfig = {}) {
    super();
    this.ffmpegProcess = null;
    this.isGenerating = false;
    this.outputConfig = { ...config.streaming, ...outputConfig };
  }

  startSlate() {
    if (this.isGenerating) {
      this.stopSlate();
    }

    try {
      const ffmpegArgs = this.buildSlateArgs();
      
      console.log(`Starting slate generation with args: ${ffmpegArgs.join(' ')}`);
      
      this.ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.setupSlateHandlers();
      this.isGenerating = true;
      this.emit('slateStarted');

    } catch (error) {
      console.error('Failed to start slate:', error);
      this.emit('slateError', error);
      throw error;
    }
  }

  stopSlate() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          this.ffmpegProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    
    this.isGenerating = false;
    this.emit('slateStopped');
  }

  buildSlateArgs() {
    const args = [];
    
    // Generate broadcast-standard color bars
    args.push('-f', 'lavfi');
    args.push('-i', `testsrc=size=${this.outputConfig.defaultResolution}:rate=${this.outputConfig.defaultFramerate}`);
    
    // Generate broadcast standard 1kHz reference tone
    args.push('-f', 'lavfi'); 
    args.push('-i', 'sine=frequency=1000:sample_rate=48000');
    
    // Simplified broadcast encoding settings
    args.push('-c:v', 'libx264');
    args.push('-c:a', 'aac');
    args.push('-r', this.outputConfig.defaultFramerate.toString());
    args.push('-b:v', this.outputConfig.defaultBitrate);
    args.push('-b:a', this.outputConfig.defaultAudioBitrate);
    args.push('-s', this.outputConfig.defaultResolution);
    args.push('-preset', 'ultrafast');
    args.push('-tune', 'zerolatency');
    args.push('-g', (this.outputConfig.defaultFramerate * 2).toString());
    args.push('-keyint_min', this.outputConfig.defaultFramerate.toString());
    args.push('-sc_threshold', '0');
    args.push('-pix_fmt', 'yuv420p');
    
    // Primary HLS output for web preview (simplified approach)
    args.push('-f', 'hls');
    args.push('-hls_time', '2');
    args.push('-hls_list_size', '3');
    args.push('-hls_flags', 'delete_segments');
    args.push('./public/live/preview.m3u8');
    
    return args;
  }

  setupSlateHandlers() {
    this.ffmpegProcess.stdout.on('data', (data) => {
      this.emit('slateOutput', data.toString());
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('slateLog', output);
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`Slate FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isGenerating = false;
      
      if (code !== 0 && code !== null) {
        this.emit('slateError', new Error(`Slate FFmpeg process exited with code ${code}`));
      } else {
        this.emit('slateStopped');
      }
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('Slate FFmpeg process error:', error);
      this.isGenerating = false;
      this.emit('slateError', error);
    });
  }

  getStatus() {
    return {
      isGenerating: this.isGenerating,
      outputConfig: this.outputConfig
    };
  }
}

module.exports = SlateGenerator;