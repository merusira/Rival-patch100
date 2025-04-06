'use strict'

/**
 * Validation Module
 * 
 * This module handles skill validation before sending to the server.
 * It checks if a skill can be used based on cooldowns, resources, etc.
 */

class Validation {
    constructor(mod) {
        this.mod = mod;
        this.skills = null; // Will be set by core.js
        this.packetQueue = null; // Will be set by core.js
        
        // Player state
        this.playerState = {
            hp: 0,
            maxHp: 0,
            mp: 0,
            maxMp: 0,
            alive: true,
            mounted: false,
            inCombat: false,
            abnormals: new Map() // abnormalId -> { expires: timestamp }
        };
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Register hooks
        this.hookPlayerState();
    }
    
    hookPlayerState() {
        // Hook S_CREATURE_CHANGE_HP to track player HP
        this.mod.hook('S_CREATURE_CHANGE_HP', 7, event => {
            if (this.mod.game.me.is(event.target)) {
                this.playerState.hp = event.hp;
                this.playerState.maxHp = event.maxHp;
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log(`Player HP: ${this.playerState.hp}/${this.playerState.maxHp}`);
                }
            }
        });
        
        // Hook S_PLAYER_CHANGE_MP to track player MP
        this.mod.hook('S_PLAYER_CHANGE_MP', 1, event => {
            if (this.mod.game.me.is(event.target)) {
                this.playerState.mp = event.currentMp;
                this.playerState.maxMp = event.maxMp;
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log(`Player MP: ${this.playerState.mp}/${this.playerState.maxMp}`);
                }
            }
        });
        
        // Hook S_CREATURE_LIFE to track player alive state
        this.mod.hook('S_CREATURE_LIFE', 3, event => {
            if (this.mod.game.me.is(event.gameId)) {
                this.playerState.alive = event.alive;
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log(`Player alive: ${this.playerState.alive}`);
                }
            }
        });
        
        // Hook S_MOUNT_VEHICLE to track mounted state
        this.mod.hook('S_MOUNT_VEHICLE', 2, event => {
            if (this.mod.game.me.is(event.gameId)) {
                this.playerState.mounted = true;
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log('Player mounted');
                }
            }
        });
        
        // Hook S_UNMOUNT_VEHICLE to track unmounted state
        this.mod.hook('S_UNMOUNT_VEHICLE', 2, event => {
            if (this.mod.game.me.is(event.gameId)) {
                this.playerState.mounted = false;
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log('Player unmounted');
                }
            }
        });
        
        // Hook S_USER_STATUS to track combat state
        this.mod.hook('S_USER_STATUS', 3, event => {
            if (this.mod.game.me.is(event.gameId)) {
                this.playerState.inCombat = (event.status === 1);
                
                if (this.mod.settings.debug.skills) {
                    this.mod.log(`Player combat state: ${this.playerState.inCombat}`);
                }
            }
        });
        
        // Hook S_ABNORMALITY_BEGIN to track abnormals
        this.mod.hook('S_ABNORMALITY_BEGIN', 4, event => {
            if (this.mod.game.me.is(event.target)) {
                const expires = Date.now() + event.duration;
                this.playerState.abnormals.set(event.id, { 
                    expires,
                    stacks: event.stacks
                });
                
                if (this.mod.settings.debug.abnormals) {
                    this.mod.log(`Abnormal begin: ${event.id}, stacks: ${event.stacks}, duration: ${event.duration}ms`);
                }
            }
        });
        
        // Hook S_ABNORMALITY_REFRESH to track abnormal refreshes
        this.mod.hook('S_ABNORMALITY_REFRESH', 2, event => {
            if (this.mod.game.me.is(event.target)) {
                const expires = Date.now() + event.duration;
                this.playerState.abnormals.set(event.id, { 
                    expires,
                    stacks: event.stacks
                });
                
                if (this.mod.settings.debug.abnormals) {
                    this.mod.log(`Abnormal refresh: ${event.id}, stacks: ${event.stacks}, duration: ${event.duration}ms`);
                }
            }
        });
        
        // Hook S_ABNORMALITY_END to track abnormal ends
        this.mod.hook('S_ABNORMALITY_END', 1, event => {
            if (this.mod.game.me.is(event.target)) {
                this.playerState.abnormals.delete(event.id);
                
                if (this.mod.settings.debug.abnormals) {
                    this.mod.log(`Abnormal end: ${event.id}`);
                }
            }
        });
    }
    
    /**
     * Validate if a skill can be used
     * @param {Object|number} skill - The skill object or ID
     * @param {Object} position - The player position
     * @param {Object} target - The target object (optional)
     * @returns {Object} - Validation result { valid: boolean, reason: string }
     */
    validateSkill(skill, position, target) {
        const skillId = typeof skill === 'object' ? skill.id : skill;
        
        // Check if player is alive
        if (!this.playerState.alive) {
            return { valid: false, reason: 'DEAD' };
        }
        
        // Check if player is mounted
        if (this.playerState.mounted) {
            return { valid: false, reason: 'MOUNTED' };
        }
        
        // Check if skill is on cooldown
        if (this.packetQueue && this.packetQueue.isOnCooldown(skillId)) {
            return { valid: false, reason: 'COOLDOWN' };
        }
        
        // Get skill info
        const skillInfo = this.skills ? this.skills.getSkillInfo(skillId) : null;
        
        if (!skillInfo) {
            return { valid: true }; // If we don't have info, assume it's valid
        }
        
        // Check resource costs
        if (skillInfo.mpCost > 0 && this.playerState.mp < skillInfo.mpCost) {
            return { valid: false, reason: 'NOT_ENOUGH_MP' };
        }
        
        if (skillInfo.hpCost > 0 && this.playerState.hp < skillInfo.hpCost) {
            return { valid: false, reason: 'NOT_ENOUGH_HP' };
        }
        
        // Check required abnormals
        if (skillInfo.requiredAbnormals && skillInfo.requiredAbnormals.length > 0) {
            const hasRequiredAbnormal = skillInfo.requiredAbnormals.some(abnormalId => 
                this.playerState.abnormals.has(abnormalId)
            );
            
            if (!hasRequiredAbnormal) {
                return { valid: false, reason: 'MISSING_REQUIRED_ABNORMAL' };
            }
        }
        
        // Check if skill requires combat
        if (skillInfo.requiresCombat && !this.playerState.inCombat) {
            return { valid: false, reason: 'REQUIRES_COMBAT' };
        }
        
        // Check targeting
        if (target && skillInfo.maxRadius > 0) {
            const distance = getDistance(position, target);
            if (distance > skillInfo.maxRadius) {
                return { valid: false, reason: 'TARGET_OUT_OF_RANGE' };
            }
        }
        
        return { valid: true };
    }
    
    /**
     * Check if player has an abnormality
     * @param {number} abnormalId - The abnormality ID
     * @returns {boolean} - Whether the player has the abnormality
     */
    hasAbnormality(abnormalId) {
        return this.playerState.abnormals.has(abnormalId);
    }
    
    /**
     * Get abnormality stacks
     * @param {number} abnormalId - The abnormality ID
     * @returns {number} - The number of stacks, or 0 if not present
     */
    getAbnormalityStacks(abnormalId) {
        const abnormal = this.playerState.abnormals.get(abnormalId);
        return abnormal ? abnormal.stacks : 0;
    }
    
    /**
     * Get abnormality remaining time
     * @param {number} abnormalId - The abnormality ID
     * @returns {number} - The remaining time in milliseconds, or 0 if not present
     */
    getAbnormalityRemaining(abnormalId) {
        const abnormal = this.playerState.abnormals.get(abnormalId);
        if (!abnormal) return 0;
        
        const remaining = abnormal.expires - Date.now();
        return Math.max(0, remaining);
    }
    
    /**
     * Set the skills module reference
     * @param {Object} skills - The skills module
     */
    setSkills(skills) {
        this.skills = skills;
    }
    
    /**
     * Set the packet queue module reference
     * @param {Object} packetQueue - The packet queue module
     */
    setPacketQueue(packetQueue) {
        this.packetQueue = packetQueue;
    }
    
    /**
     * Destructor
     */
    destructor() {
        // Clean up
    }
}

/**
 * Calculate distance between two points
 * @param {Object} a - Point A with x, y, z coordinates
 * @param {Object} b - Point B with x, y, z coordinates
 * @returns {number} - The distance
 */
function getDistance(a, b) {
    return Math.sqrt(
        Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2) +
        Math.pow(a.z - b.z, 2)
    );
}

module.exports = Validation;