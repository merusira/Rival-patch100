'use strict'

/**
 * Packet Queue Module
 * 
 * This module handles the queuing of skill packets to ensure they are sent
 * at the right time, taking into account cooldowns and ping.
 */

class PacketQueue {
    constructor(mod) {
        this.mod = mod;
        this.settings = mod.settings.packets;
        this.ping = null; // Will be set by core.js
        
        // Queue of packets to be sent
        this.queue = [];
        
        // Cooldown tracking
        this.cooldowns = new Map(); // skillId -> { ends: timestamp }
        
        // Processing state
        this.processing = false;
        this.processingInterval = null;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Register hooks for cooldown tracking
        this.hookCooldowns();
        
        // Start queue processing
        this.startProcessing();
    }
    
    hookCooldowns() {
        // Hook S_START_COOLTIME_SKILL to track cooldowns
        this.mod.hook('S_START_COOLTIME_SKILL', 3, event => {
            if (event.cooldown > 0) {
                const cooldownEndsAt = Date.now() + event.cooldown;
                this.cooldowns.set(event.skill.id, { ends: cooldownEndsAt });
                
                if (this.mod.settings.debug.packets) {
                    this.mod.log(`Cooldown started for skill ${event.skill.id}, ends in ${event.cooldown}ms`);
                }
            } else {
                this.cooldowns.delete(event.skill.id);
                
                if (this.mod.settings.debug.packets) {
                    this.mod.log(`Cooldown cleared for skill ${event.skill.id}`);
                }
            }
        });
        
        // Hook S_DECREASE_COOLTIME_SKILL to track cooldown reductions
        this.mod.hook('S_DECREASE_COOLTIME_SKILL', 3, event => {
            const cooldown = this.cooldowns.get(event.skill.id);
            if (cooldown) {
                cooldown.ends -= event.cooldown;
                
                if (this.mod.settings.debug.packets) {
                    this.mod.log(`Cooldown decreased for skill ${event.skill.id} by ${event.cooldown}ms`);
                }
            }
        });
    }
    
    startProcessing() {
        if (this.processingInterval) return;
        
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, this.settings.queueThrottleTime);
    }
    
    stopProcessing() {
        if (!this.processingInterval) return;
        
        clearInterval(this.processingInterval);
        this.processingInterval = null;
    }
    
    /**
     * Add a packet to the queue
     * @param {Object} packet - The packet to queue
     * @returns {boolean} - Whether the packet was queued
     */
    add(packet) {
        // Check if queue is full
        if (this.queue.length >= this.settings.maxQueueSize) {
            this.mod.warn(`Packet queue is full, dropping packet: ${packet.type}`);
            return false;
        }
        
        // Add to queue
        this.queue.push(packet);
        
        if (this.mod.settings.debug.packets) {
            this.mod.log(`Queued packet: ${packet.type} for skill ${packet.skillId}`);
        }
        
        // Process queue immediately
        this.processQueue();
        
        return true;
    }
    
    /**
     * Queue a skill packet
     * @param {number} skillId - The skill ID
     * @param {Buffer} data - The packet data
     * @param {string} type - The packet type
     * @param {number} version - The packet version
     * @returns {boolean} - Whether the packet was queued or sent
     */
    queueSkillPacket(skillId, data, type, version) {
        const now = Date.now();
        
        // Check if we have cooldown information for this skill
        if (!this.cooldowns.has(skillId)) {
            // No cooldown info (first use) - send immediately
            this.mod.send(type, version, data);
            
            if (this.mod.settings.debug.packets) {
                this.mod.log(`Sent packet immediately (no cooldown info): ${type} for skill ${skillId}`);
            }
            
            return true;
        }
        
        const cooldown = this.cooldowns.get(skillId);
        
        // If cooldown has already ended, send immediately
        if (now >= cooldown.ends) {
            this.mod.send(type, version, data);
            
            if (this.mod.settings.debug.packets) {
                this.mod.log(`Sent packet immediately (cooldown ended): ${type} for skill ${skillId}`);
            }
            
            return true;
        }
        
        // Calculate when to send based on ping
        const pingDelay = this.ping ? this.ping.get('min') : 0;
        const sendTime = cooldown.ends - pingDelay;
        
        // Add to queue
        return this.add({
            skillId,
            data,
            type,
            version,
            expiresAt: now + 5000, // Expire after 5 seconds
            sendAt: Math.max(now, sendTime)
        });
    }
    
    /**
     * Process the packet queue
     */
    processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        try {
            const now = Date.now();
            const toRemove = [];
            
            // Process each packet in the queue
            for (let i = 0; i < this.queue.length; i++) {
                const packet = this.queue[i];
                
                // Remove expired packets
                if (now > packet.expiresAt) {
                    toRemove.push(i);
                    
                    if (this.mod.settings.debug.packets) {
                        this.mod.log(`Packet expired: ${packet.type} for skill ${packet.skillId}`);
                    }
                    
                    continue;
                }
                
                // Send packet if it's time
                if (now >= packet.sendAt) {
                    this.mod.send(packet.type, packet.version, packet.data);
                    toRemove.push(i);
                    
                    if (this.mod.settings.debug.packets) {
                        this.mod.log(`Sent queued packet: ${packet.type} for skill ${packet.skillId}`);
                    }
                }
            }
            
            // Remove sent or expired packets (in reverse order to avoid index issues)
            for (let i = toRemove.length - 1; i >= 0; i--) {
                this.queue.splice(toRemove[i], 1);
            }
        } catch (e) {
            this.mod.error(`Error processing packet queue: ${e.message}`);
            this.mod.error(e);
        } finally {
            this.processing = false;
        }
    }
    
    /**
     * Check if a skill is on cooldown
     * @param {number} skillId - The skill ID
     * @returns {boolean} - Whether the skill is on cooldown
     */
    isOnCooldown(skillId) {
        if (!this.cooldowns.has(skillId)) return false;
        
        const cooldown = this.cooldowns.get(skillId);
        return Date.now() < cooldown.ends;
    }
    
    /**
     * Get the remaining cooldown time for a skill
     * @param {number} skillId - The skill ID
     * @returns {number} - The remaining cooldown time in milliseconds, or 0 if not on cooldown
     */
    getRemainingCooldown(skillId) {
        if (!this.cooldowns.has(skillId)) return 0;
        
        const cooldown = this.cooldowns.get(skillId);
        const remaining = cooldown.ends - Date.now();
        return Math.max(0, remaining);
    }
    
    /**
     * Clear the packet queue
     */
    clear() {
        this.queue = [];
    }
    
    /**
     * Set the ping module reference
     * @param {Object} ping - The ping module
     */
    setPing(ping) {
        this.ping = ping;
    }
    
    /**
     * Destructor
     */
    destructor() {
        this.stopProcessing();
        this.clear();
    }
}

module.exports = PacketQueue;