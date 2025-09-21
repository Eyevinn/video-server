const express = require('express');
const cors = require('cors');
const VideoQueue = require('./queue');
const FFmpegStreamer = require('./streamer');
const config = require('./config');
const { specs, swaggerUi } = require('./swagger');

class VideoServerAPI {
  constructor() {
    this.app = express();
    this.queue = new VideoQueue(config.queue.maxSize);
    this.streamer = new FFmpegStreamer();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // API Documentation
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #00ff00; }
        body { background-color: #0a0a0a; color: #e0e0e0; }
        .swagger-ui .scheme-container { background: #1a1a1a; }
      `,
      customSiteTitle: 'Open Video Server API Documentation'
    }));

    this.app.get('/api/status', this.getStatus.bind(this));
    this.app.get('/api/queue', this.getQueue.bind(this));
    this.app.post('/api/queue/add', this.addToQueue.bind(this));
    this.app.delete('/api/queue/:id', this.removeFromQueue.bind(this));
    this.app.post('/api/queue/clear', this.clearQueue.bind(this));
    this.app.post('/api/queue/skip', this.skipCurrent.bind(this));
    this.app.post('/api/queue/move', this.moveQueueItem.bind(this));
    this.app.get('/api/stream/status', this.getStreamStatus.bind(this));
    this.app.post('/api/stream/start', this.startStream.bind(this));
    this.app.post('/api/stream/stop', this.stopStream.bind(this));
    this.app.get('/api/config', this.getConfig.bind(this));
    this.app.post('/api/config', this.updateConfig.bind(this));
    this.app.post('/api/config/srt', this.updateSRTConfig.bind(this));
    this.app.post('/api/config/rtmp', this.updateRTMPConfig.bind(this));
    this.app.post('/api/config/thumbnail', this.updateThumbnailConfig.bind(this));
    this.app.get('/api/thumbnail/current', this.getCurrentThumbnail.bind(this));
    
    this.app.get('/', (req, res) => {
      res.sendFile(__dirname + '/../public/index.html');
    });
  }

  setupEventHandlers() {
    this.queue.on('itemStarted', (item) => {
      console.log(`Starting playback: ${item.title}`);
      this.streamer.startStream(item).catch(error => {
        console.error('Failed to start stream:', error);
        this.queue.onItemFinished();
      });
    });

    this.queue.on('itemSkipped', () => {
      this.streamer.stopStream();
    });

    this.queue.on('queueEmpty', () => {
      console.log('Queue is empty');
    });

    this.streamer.on('streamStarted', () => {
      console.log('Stream started');
    });

    this.streamer.on('streamFinished', () => {
      this.queue.onItemFinished();
      // Check if queue is now empty after finishing
      if (this.queue.getQueue().length === 0 && !this.queue.getCurrentItem()) {
        console.log('Queue is now empty after stream finished');
      }
    });

    this.streamer.on('streamError', (error) => {
      console.error('Stream error:', error);
      this.queue.onItemFinished();
      // Check if queue is now empty after error
      if (this.queue.getQueue().length === 0 && !this.queue.getCurrentItem()) {
        console.log('Queue is now empty after stream error');
      }
    });

  }


  /**
   * @swagger
   * /status:
   *   get:
   *     tags: [Status]
   *     summary: Get comprehensive server status
   *     description: Returns detailed status information about the queue, stream, slate, and server
   *     responses:
   *       200:
   *         description: Server status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     queue:
   *                       $ref: '#/components/schemas/QueueStatus'
   *                     stream:
   *                       $ref: '#/components/schemas/StreamStatus'
   *                     slate:
   *                       $ref: '#/components/schemas/SlateStatus'
   *                     server:
   *                       $ref: '#/components/schemas/ServerStatus'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async getStatus(req, res) {
    try {
      const queueStatus = this.queue.getStatus();
      const streamStatus = this.streamer.getStatus();
      
      res.json({
        success: true,
        data: {
          queue: queueStatus,
          stream: streamStatus,
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: require('../package.json').version
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getQueue(req, res) {
    try {
      const queue = this.queue.getQueue();
      const current = this.queue.getCurrentItem();
      const next = this.queue.getNextItem();
      
      res.json({
        success: true,
        data: {
          current,
          next,
          queue,
          total: queue.length + (current ? 1 : 0)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * @swagger
   * /queue/add:
   *   post:
   *     tags: [Queue]
   *     summary: Add content to the queue
   *     description: Adds a new video item to the playback queue
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - url
   *             properties:
   *               url:
   *                 type: string
   *                 format: uri
   *                 description: URL of the video content
   *                 example: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
   *               title:
   *                 type: string
   *                 description: Optional title for the content
   *                 example: "Big Buck Bunny"
   *               duration:
   *                 type: integer
   *                 description: Duration in seconds
   *                 example: 596
   *     responses:
   *       200:
   *         description: Content added successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/QueueItem'
   *       400:
   *         description: Bad request - invalid URL or missing required fields
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async addToQueue(req, res) {
    try {
      const { url, title, duration } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }

      if (!this.isValidUrl(url)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
      }

      const item = this.queue.enqueue({ url, title, duration });
      
      res.json({
        success: true,
        data: item
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async removeFromQueue(req, res) {
    try {
      const { id } = req.params;
      const success = this.queue.remove(id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Item not found'
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async clearQueue(req, res) {
    try {
      this.queue.clear();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * @swagger
   * /queue/skip:
   *   post:
   *     tags: [Queue]
   *     summary: Skip currently playing content
   *     description: Skips the currently playing item and moves to the next item in queue
   *     responses:
   *       200:
   *         description: Current item skipped successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     nextItem:
   *                       $ref: '#/components/schemas/QueueItem'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async skipCurrent(req, res) {
    try {
      const nextItem = this.queue.skip();
      res.json({
        success: true,
        data: { nextItem }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async moveQueueItem(req, res) {
    try {
      const { fromIndex, toIndex } = req.body;
      
      if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'fromIndex and toIndex must be numbers'
        });
      }
      
      const success = this.queue.moveItem(fromIndex, toIndex);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid indices'
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getStreamStatus(req, res) {
    try {
      const status = this.streamer.getStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async startStream(req, res) {
    try {
      if (!this.queue.getCurrentItem()) {
        return res.status(400).json({
          success: false,
          error: 'No item currently playing'
        });
      }
      
      await this.streamer.startStream(this.queue.getCurrentItem());
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async stopStream(req, res) {
    try {
      this.streamer.stopStream();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getConfig(req, res) {
    try {
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateConfig(req, res) {
    try {
      res.status(501).json({
        success: false,
        error: 'Configuration updates not implemented yet'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * @swagger
   * /config/srt:
   *   post:
   *     tags: [Configuration]
   *     summary: Update SRT output configuration
   *     description: Enables/disables SRT bridge output and configures SRT port settings
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - output
   *             properties:
   *               output:
   *                 type: object
   *                 required:
   *                   - srt
   *                 properties:
   *                   srt:
   *                     type: object
   *                     required:
   *                       - enabled
   *                     properties:
   *                       enabled:
   *                         type: boolean
   *                         description: Enable or disable SRT bridge output
   *                         example: true
   *                       port:
   *                         type: integer
   *                         minimum: 1024
   *                         maximum: 65535
   *                         description: SRT listener port (optional, defaults to current port)
   *                         example: 9998
   *     responses:
   *       200:
   *         description: SRT configuration updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     srtEnabled:
   *                       type: boolean
   *                       description: Current SRT enabled state
   *                       example: true
   *                     srtPort:
   *                       type: integer
   *                       description: Current SRT port
   *                       example: 9998
   *                     message:
   *                       type: string
   *                       description: Status message
   *                       example: "SRT bridge enabled on port 9998"
   *       400:
   *         description: Invalid configuration data
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async updateSRTConfig(req, res) {
    try {
      const { output } = req.body;
      
      if (!output || !output.srt || typeof output.srt.enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid SRT configuration data'
        });
      }

      // Validate port if provided
      if (output.srt.port !== undefined) {
        const port = parseInt(output.srt.port);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return res.status(400).json({
            success: false,
            error: 'SRT port must be a number between 1024 and 65535'
          });
        }
      }

      // Update the config with the new SRT settings
      config.output.srt.enabled = output.srt.enabled;
      if (output.srt.port !== undefined) {
        config.output.srt.port = parseInt(output.srt.port);
      }
      
      // If there's an active stream, update the SRT bridge accordingly
      if (this.streamer.isStreaming) {
        if (output.srt.enabled && !this.streamer.srtBridge) {
          this.streamer.startSRTBridge();
        } else if (!output.srt.enabled && this.streamer.srtBridge) {
          this.streamer.stopSRTBridge();
        } else if (output.srt.enabled && this.streamer.srtBridge && output.srt.port !== undefined) {
          // If port changed while SRT is active, restart the bridge
          this.streamer.stopSRTBridge();
          setTimeout(() => {
            this.streamer.startSRTBridge();
          }, 1000);
        }
      }
      
      // Update streamer's srtEnabled setting for future streams
      this.streamer.srtEnabled = output.srt.enabled;
      
      const responseData = {
        srtEnabled: output.srt.enabled,
        srtPort: config.output.srt.port,
        message: output.srt.enabled ? 
          `SRT bridge enabled on port ${config.output.srt.port}` : 
          'SRT bridge disabled'
      };
      
      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * @swagger
   * /config/rtmp:
   *   post:
   *     tags: [Configuration]
   *     summary: Update RTMP output configuration
   *     description: Enables/disables RTMP push output and configures RTMP URL settings
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - output
   *             properties:
   *               output:
   *                 type: object
   *                 required:
   *                   - rtmp
   *                 properties:
   *                   rtmp:
   *                     type: object
   *                     required:
   *                       - enabled
   *                     properties:
   *                       enabled:
   *                         type: boolean
   *                         description: Enable or disable RTMP push output
   *                         example: true
   *                       url:
   *                         type: string
   *                         format: uri
   *                         description: RTMP push URL (required when enabled)
   *                         example: "rtmp://live.twitch.tv/live/your_stream_key"
   *     responses:
   *       200:
   *         description: RTMP configuration updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     rtmpEnabled:
   *                       type: boolean
   *                       description: Current RTMP enabled state
   *                       example: true
   *                     rtmpUrl:
   *                       type: string
   *                       description: Current RTMP URL (masked for security)
   *                       example: "rtmp://live.twitch.tv/live/***"
   *                     message:
   *                       type: string
   *                       description: Status message
   *                       example: "RTMP push enabled to rtmp://live.twitch.tv/live/***"
   *       400:
   *         description: Invalid configuration data
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async updateRTMPConfig(req, res) {
    try {
      const { output } = req.body;
      
      if (!output || !output.rtmp || typeof output.rtmp.enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid RTMP configuration data'
        });
      }

      // Validate URL if RTMP is being enabled
      if (output.rtmp.enabled) {
        if (!output.rtmp.url || typeof output.rtmp.url !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'RTMP URL is required when RTMP is enabled'
          });
        }
        
        // Basic URL validation for RTMP
        if (!output.rtmp.url.startsWith('rtmp://') && !output.rtmp.url.startsWith('rtmps://')) {
          return res.status(400).json({
            success: false,
            error: 'RTMP URL must start with rtmp:// or rtmps://'
          });
        }
      }

      // Update the config with the new RTMP settings
      config.output.rtmp.enabled = output.rtmp.enabled;
      if (output.rtmp.url !== undefined) {
        config.output.rtmp.url = output.rtmp.url;
      }
      
      // If there's an active stream, update the RTMP bridge accordingly
      if (this.streamer.isStreaming) {
        if (output.rtmp.enabled && !this.streamer.rtmpBridge && config.output.rtmp.url) {
          this.streamer.startRTMPBridge();
        } else if (!output.rtmp.enabled && this.streamer.rtmpBridge) {
          this.streamer.stopRTMPBridge();
        } else if (output.rtmp.enabled && this.streamer.rtmpBridge && output.rtmp.url !== undefined) {
          // If URL changed while RTMP is active, restart the bridge
          this.streamer.stopRTMPBridge();
          setTimeout(() => {
            this.streamer.startRTMPBridge();
          }, 1000);
        }
      }
      
      // Update streamer's rtmpEnabled setting for future streams
      this.streamer.rtmpEnabled = output.rtmp.enabled;
      
      // Mask the URL for the response
      const maskedUrl = output.rtmp.enabled && config.output.rtmp.url ? 
        this.maskRtmpUrl(config.output.rtmp.url) : null;
      
      const responseData = {
        rtmpEnabled: output.rtmp.enabled,
        rtmpUrl: maskedUrl,
        message: output.rtmp.enabled ? 
          `RTMP push enabled to ${maskedUrl}` : 
          'RTMP push disabled'
      };
      
      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Utility method to mask RTMP URL for security
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

  async updateThumbnailConfig(req, res) {
    try {
      const { output } = req.body;
      
      if (!output || !output.thumbnail || typeof output.thumbnail.enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid thumbnail configuration data'
        });
      }

      const thumbnailConfig = output.thumbnail;
      
      // Validate configuration values if provided
      if (thumbnailConfig.interval !== undefined) {
        const interval = parseInt(thumbnailConfig.interval);
        if (isNaN(interval) || interval < 1 || interval > 60) {
          return res.status(400).json({
            success: false,
            error: 'Thumbnail interval must be between 1 and 60 seconds'
          });
        }
        config.output.thumbnail.interval = interval;
      }
      
      if (thumbnailConfig.width !== undefined) {
        const width = parseInt(thumbnailConfig.width);
        if (isNaN(width) || width < 64 || width > 1920) {
          return res.status(400).json({
            success: false,
            error: 'Thumbnail width must be between 64 and 1920 pixels'
          });
        }
        config.output.thumbnail.width = width;
      }
      
      if (thumbnailConfig.height !== undefined) {
        const height = parseInt(thumbnailConfig.height);
        if (isNaN(height) || height < 64 || height > 1080) {
          return res.status(400).json({
            success: false,
            error: 'Thumbnail height must be between 64 and 1080 pixels'
          });
        }
        config.output.thumbnail.height = height;
      }

      // Update the config with the new thumbnail settings
      config.output.thumbnail.enabled = thumbnailConfig.enabled;
      
      // If there's an active stream, update the thumbnail bridge accordingly
      if (this.streamer.isStreaming) {
        if (thumbnailConfig.enabled && !this.streamer.thumbnailBridge) {
          this.streamer.startThumbnailBridge();
        } else if (!thumbnailConfig.enabled && this.streamer.thumbnailBridge) {
          this.streamer.stopThumbnailBridge();
        }
      }
      
      // Update streamer's thumbnailEnabled setting for future streams
      this.streamer.thumbnailEnabled = thumbnailConfig.enabled;
      
      const responseData = {
        thumbnailEnabled: thumbnailConfig.enabled,
        interval: config.output.thumbnail.interval,
        width: config.output.thumbnail.width,
        height: config.output.thumbnail.height,
        path: config.output.thumbnail.path,
        message: thumbnailConfig.enabled ? 
          `Thumbnail generation enabled (${config.output.thumbnail.width}x${config.output.thumbnail.height} every ${config.output.thumbnail.interval}s)` : 
          'Thumbnail generation disabled'
      };
      
      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getCurrentThumbnail(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      if (!this.streamer.thumbnailBridge || !this.streamer.thumbnailBridge.isRunning) {
        return res.status(404).json({
          success: false,
          error: 'Thumbnail generation is not active'
        });
      }
      
      const thumbnailPath = this.streamer.thumbnailBridge.getLastThumbnailPath();
      
      if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        return res.status(404).json({
          success: false,
          error: 'No thumbnail available yet'
        });
      }
      
      // Set appropriate headers for image response
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Send the thumbnail file
      res.sendFile(path.resolve(thumbnailPath));
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return string.startsWith('http://') || string.startsWith('https://');
    } catch (_) {
      return false;
    }
  }


  start() {
    const port = config.server.port;
    const host = config.server.host;
    
    this.app.listen(port, host, () => {
      console.log(`Video Server running on http://${host}:${port}`);
      console.log(`Primary Output: UDP`);
      console.log(`  MPEG-TS UDP: udp://${config.output.mpegts.udp.host}:${config.output.mpegts.udp.port}`);
      
      // Show SRT bridge info if enabled
      if (config.output.srt.enabled) {
        console.log(`Additional SRT Output: srt://localhost:${config.output.srt.port} (listener mode)`);
        console.log(`  Bridged from UDP: udp://${config.output.mpegts.udp.host}:${config.output.mpegts.udp.port}`);
      }
    });
  }
}

module.exports = VideoServerAPI;