const config = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  
  streaming: {
    defaultFormat: 'mpegts',
    defaultVideoCodec: 'libx264',
    defaultAudioCodec: 'aac',
    defaultFramerate: process.env.FRAMERATE || 50,
    defaultResolution: process.env.RESOLUTION || '1920x1080',
    defaultBitrate: process.env.VIDEO_BITRATE || '5000k',
    defaultAudioBitrate: process.env.AUDIO_BITRATE || '128k',
    presets: {
      '720p50': { resolution: '1280x720', framerate: 50, bitrate: '2000k' },
      '1080p25': { resolution: '1920x1080', framerate: 25, bitrate: '3000k' },
      '1080p50': { resolution: '1920x1080', framerate: 50, bitrate: '4000k' },
      '4k25': { resolution: '3840x2160', framerate: 25, bitrate: '8000k' },
      '4k50': { resolution: '3840x2160', framerate: 50, bitrate: '15000k' }
    }
  },
  
  output: {
    srt: {
      enabled: false,
      port: 9998,
      latency: 120
    },
    mpegts: {
      enabled: true,
      udp: {
        host: '127.0.0.1',
        port: 1234
      }
    }
  },
  
  queue: {
    maxSize: 100,
    preloadNext: true
  },
  
  ffmpeg: {
    path: process.env.FFMPEG_PATH || 'ffmpeg',
    logLevel: process.env.FFMPEG_LOG_LEVEL || 'error'
  }
};

module.exports = config;