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
      console.log(`Primary Output: ${config.output.mode.toUpperCase()}`);
      if (config.output.mode === 'srt') {
        console.log(`  SRT: srt://localhost:${config.output.srt.port} (listener mode)`);
      } else if (config.output.mode === 'udp') {
        console.log(`  MPEG-TS UDP: udp://${config.output.mpegts.udp.host}:${config.output.mpegts.udp.port}`);
      } else if (config.output.mode === 'rtp') {
        console.log(`  RTP${config.output.rtp.fec ? '-FEC' : ''}: rtp://${config.output.rtp.host}:${config.output.rtp.port}`);
        if (config.output.rtp.fec) {
          console.log(`    FEC: ${config.output.rtp.fecColumns}x${config.output.rtp.fecRows} ProMPEG`);
        }
      }
    });
  }
}

module.exports = VideoServerAPI;