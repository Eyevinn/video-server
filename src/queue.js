const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class VideoQueue extends EventEmitter {
  constructor(maxSize = 100) {
    super();
    this.queue = [];
    this.maxSize = maxSize;
    this.currentItem = null;
    this.isPlaying = false;
  }

  enqueue(item) {
    if (this.queue.length >= this.maxSize) {
      throw new Error('Queue is full');
    }

    const queueItem = {
      id: uuidv4(),
      url: item.url,
      title: item.title || this.extractTitleFromUrl(item.url),
      duration: item.duration || null,
      addedAt: new Date(),
      status: 'queued'
    };

    this.queue.push(queueItem);
    this.emit('itemAdded', queueItem);
    
    if (!this.isPlaying && !this.currentItem) {
      this.playNext();
    }

    return queueItem;
  }

  dequeue() {
    if (this.queue.length === 0) {
      return null;
    }

    const item = this.queue.shift();
    this.emit('itemRemoved', item);
    return item;
  }

  remove(itemId) {
    const index = this.queue.findIndex(item => item.id === itemId);
    if (index === -1) {
      return false;
    }

    const removedItem = this.queue.splice(index, 1)[0];
    this.emit('itemRemoved', removedItem);
    return true;
  }

  clear() {
    const removedItems = [...this.queue];
    this.queue = [];
    this.emit('queueCleared', removedItems);
    
    // If no current item is playing, emit queue empty
    if (!this.currentItem) {
      this.emit('queueEmpty');
    }
  }

  moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.queue.length || 
        toIndex < 0 || toIndex >= this.queue.length) {
      return false;
    }

    const item = this.queue.splice(fromIndex, 1)[0];
    this.queue.splice(toIndex, 0, item);
    this.emit('itemMoved', { item, fromIndex, toIndex });
    return true;
  }

  playNext() {
    if (this.queue.length === 0) {
      this.currentItem = null;
      this.isPlaying = false;
      this.emit('queueEmpty');
      return null;
    }

    this.currentItem = this.dequeue();
    this.currentItem.status = 'playing';
    this.currentItem.startedAt = new Date();
    this.isPlaying = true;
    
    this.emit('itemStarted', this.currentItem);
    return this.currentItem;
  }

  skip() {
    if (this.currentItem) {
      this.emit('itemSkipped', this.currentItem);
      this.currentItem = null;
    }
    return this.playNext();
  }

  getCurrentItem() {
    return this.currentItem;
  }

  getQueue() {
    return [...this.queue];
  }

  getNextItem() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      currentItem: this.currentItem,
      nextItem: this.getNextItem(),
      queueLength: this.queue.length,
      totalItems: this.queue.length + (this.currentItem ? 1 : 0),
      schedule: this.getSchedule()
    };
  }

  getSchedule() {
    const schedule = [];
    let currentTime = new Date();
    
    // Add current item if playing
    if (this.currentItem) {
      const estimatedDuration = this.currentItem.duration || 180; // Default 3 min if unknown
      const elapsedTime = this.currentItem.startedAt 
        ? (new Date() - new Date(this.currentItem.startedAt)) / 1000 
        : 0;
      const remainingTime = Math.max(0, estimatedDuration - elapsedTime);
      
      schedule.push({
        ...this.currentItem,
        startTime: this.currentItem.startedAt ? new Date(this.currentItem.startedAt) : currentTime,
        endTime: new Date(currentTime.getTime() + remainingTime * 1000),
        estimatedDuration,
        remainingTime,
        isCurrent: true
      });
      
      currentTime = new Date(currentTime.getTime() + remainingTime * 1000);
    }
    
    // Add queued items with estimated start times
    this.queue.forEach((item, index) => {
      const estimatedDuration = item.duration || 180; // Default 3 min if unknown
      const startTime = new Date(currentTime);
      const endTime = new Date(currentTime.getTime() + estimatedDuration * 1000);
      
      schedule.push({
        ...item,
        startTime,
        endTime,
        estimatedDuration,
        isCurrent: false,
        position: index + 1
      });
      
      currentTime = endTime;
    });
    
    return schedule;
  }

  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'Unknown Video';
    } catch (error) {
      return 'Unknown Video';
    }
  }

  onItemFinished() {
    if (this.currentItem) {
      this.currentItem.status = 'finished';
      this.currentItem.finishedAt = new Date();
      this.emit('itemFinished', this.currentItem);
      this.currentItem = null;
    }
    
    setTimeout(() => {
      this.playNext();
    }, 1000);
  }
}

module.exports = VideoQueue;