'use strict'

/**
 * Ping Measurement Module
 * 
 * This module handles ping measurement and provides timing information
 * for other components of the Rival mod.
 */

class Ping {
    constructor(mod) {
        this.mod = mod;
        this.settings = mod.settings.ping;
        
        // Ping statistics
        this.min = 0;
        this.max = 0;
        this.avg = 0;
        this.median = 0;
        this.history = [];
        this.historyRaw = [];
        
        // Ping measurement state
        this.pingStarted = false;
        this.pingTracker = new WeakMap();
        this.pingInterval = null;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Register hooks
        this.hookPing();
        
        // Start ping measurement
        this.startPingMeasurement();
    }
    
    hookPing() {
        // Hook C_REQUEST_GAMESTAT_PING
        this.mod.hook('C_REQUEST_GAMESTAT_PING', 1, event => {
            this.pingTracker.set(event, Date.now());
        });
        
        // Hook S_RESPONSE_GAMESTAT_PONG
        this.mod.hook('S_RESPONSE_GAMESTAT_PONG', 1, event => {
            const startTime = this.pingTracker.get(event);
            if (startTime) {
                const pingValue = Date.now() - startTime;
                this.addPing(pingValue);
                this.pingTracker.delete(event);
                return false; // Prevent the client from seeing this response
            }
        });
    }
    
    startPingMeasurement() {
        if (this.pingStarted) return;
        
        this.pingStarted = true;
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, this.settings.interval);
        
        this.sendPing();
    }
    
    stopPingMeasurement() {
        if (!this.pingStarted) return;
        
        this.pingStarted = false;
        clearInterval(this.pingInterval);
        this.pingInterval = null;
    }
    
    sendPing() {
        if (!this.mod.game.isIngame) return;
        
        const pingEvent = {};
        this.pingTracker.set(pingEvent, Date.now());
        this.mod.send('C_REQUEST_GAMESTAT_PING', 1, pingEvent);
        
        // Set a timeout to clean up if we don't get a response
        setTimeout(() => {
            if (this.pingTracker.has(pingEvent)) {
                this.pingTracker.delete(pingEvent);
            }
        }, this.settings.timeout);
    }
    
    addPing(ping) {
        // Add to history
        this.historyRaw.push(ping);
        
        // Trim history to keep only the most recent samples
        while (this.historyRaw.length > this.settings.samples) {
            this.historyRaw.shift();
        }
        
        // Sort history for percentile calculations
        this.history = [...this.historyRaw].sort((a, b) => a - b);
        
        // Calculate statistics
        this.min = this.history[0];
        this.max = this.history[this.history.length - 1];
        this.avg = Math.round(this.history.reduce((sum, val) => sum + val, 0) / this.history.length);
        this.median = this.history[Math.floor(this.history.length / 2)];
        
        // Log if debug is enabled
        if (this.mod.settings.debug.ping) {
            this.mod.log(`Ping: ${ping}ms (min: ${this.min}ms, avg: ${this.avg}ms, max: ${this.max}ms)`);
        }
    }
    
    /**
     * Get the current ping value
     * @param {string} type - The type of ping value to get (min, avg, max, median)
     * @returns {number} - The ping value
     */
    get(type = 'avg') {
        switch (type.toLowerCase()) {
            case 'min': return this.min;
            case 'max': return this.max;
            case 'median': return this.median;
            case 'avg':
            default: return this.avg;
        }
    }
    
    /**
     * Get ping statistics
     * @returns {Object} - Ping statistics
     */
    getStats() {
        return {
            min: this.min,
            max: this.max,
            avg: this.avg,
            median: this.median,
            samples: this.history.length
        };
    }
    
    /**
     * Get a timeout value based on ping
     * @param {number} defaultTimeout - Default timeout value
     * @returns {number} - Timeout value adjusted for ping
     */
    getTimeout(defaultTimeout = 1000) {
        return defaultTimeout + this.max;
    }
    
    /**
     * Destructor
     */
    destructor() {
        this.stopPingMeasurement();
    }
}

module.exports = Ping;