/*
 * Rival Mod - Network Metrics Implementation
 *
 * monitor.js implements the core network performance monitoring functionality.
 * It measures ping and jitter using game packets without relying on external modules,
 * providing accurate real-time network performance metrics.
 *
 * Monitor class
 *
 * Tracks network performance metrics including ping and jitter.
 * Uses game packets to measure network latency and provides methods for accessing
 * these metrics for other modules to use for timing-sensitive operations.
 */
class Monitor {
    /*
     * Creates a new Monitor instance
     * @param {Object} mod - The mod framework object
     * @param {Object} mods - The mods collection object
     */
    constructor(mod, mods) {
        // Configuration constants
        this.CONFIG = {
            PING_INTERVAL: 8000,           // Interval between ping measurements (8 seconds)
            MAX_PING_CACHE_SIZE: 22,       // Maximum number of ping values to store
            MAX_ACCEPTED_JITTER: 220,      // Maximum jitter value to accept as valid
            MAX_SKILLS_TO_KEEP: 11,         // Number of most recent skills to keep for jitter calculation
            PING_DISPLAY_INTERVAL: 86000,  // Minimum time between ping messages (86 seconds)
            PING_DISPLAY_ENABLED: true,    // Whether to display ping messages by default
            CLEANUP_INTERVAL: 300000,      // Cleanup interval (5 minutes)
            HISTORY_MAX_AGE: 33000         // Maximum age for history entries (33 seconds)
        };

        // Core references
        this.mod = mod;                     // Reference to the mod framework
        this.mods = mods;                   // Reference to the mods collection
        
        // Network metrics
        this.ping = 88;                     // Current and starting ping value in milliseconds, before metrics begin
        this.jitter = 11;                   // Current and starting jitter value in milliseconds, before metrics begin
        
        // Internal tracking
        this._ping_array = [];              // Array of recent ping measurements
        this._started = 0;                  // Timestamp when ping measurement started
        this._timer = null;                 // Timer for periodic measurements
        this._lastCleanup = Date.now();     // Timestamp for last cleanup operation
        this._lastPingMessage = 0;          // Timestamp of last ping message display
        
        // Skill tracking for jitter calculation
        this._skillEvents = [];             // Array to store skill events for jitter calculation
        this._faked = { stage: {}, end: {}}; // Tracks fake skill events for jitter calculation
        this._skill_cache = null;           // Cache for Gunner skill ID fixes

        // Initialize and setup
        this.setup();
        
        // Initialize the message display interval
        this._messageInterval = null;
        
        // Set up the ping message display interval if enabled
        this.setupMessageInterval();
    }
    
    // Setup and initialization methods
    
    /*
     * Sets up event hooks and commands
     */
    setup() {
        // Hook skill events for jitter calculation
        this.mod.hook('S_ACTION_STAGE', 9, {order: 500, filter: {fake: null, silenced: null}}, this.s_action_stage);
        this.mod.hook('S_ACTION_END', 5, {order: 500, filter: {fake: null, silenced: null}}, this.s_action_end);
        
        // Setup ping measurement
        this.setupPingMeasurement();
        
        // Add command for ping display
        this.mods.command.add('ping', (param) => {
            // If a number parameter is provided, set the display interval
            if (param !== undefined) {
                const interval = parseInt(param);
                if (!isNaN(interval) && interval >= 1 && interval <= 900) {
                    // Convert to milliseconds (1 second = 1000 milliseconds)
                    this.CONFIG.PING_DISPLAY_INTERVAL = interval * 1000;
                    this.mods.command.message(`Rival ping display interval set to ${interval} seconds.`);
                    
                    // Update the message interval with new timing
                    this.setupMessageInterval();
                    return;
                } else {
                    // Error message for invalid input
                    this.mods.command.message(`Error: You must enter a number between 1 and 900, which will be the amount of seconds to display current ping.`);
                    return;
                }
            } else {
              // Toggle ping display if no parameter
              this.CONFIG.PING_DISPLAY_ENABLED = !this.CONFIG.PING_DISPLAY_ENABLED;
              this.mods.command.message(`Rival ping messages are ${this.CONFIG.PING_DISPLAY_ENABLED ? 'enabled' : 'disabled'}.`);
            
              // Update the message interval based on new enabled state
              this.setupMessageInterval();
            }
        });
    }
    
    /*
     * Sets up ping measurement hooks
     */
    setupPingMeasurement() {
        // Hook for ping measurement using game packets
        this.mod.hook('S_SPAWN_ME', 'raw', () => {
            this.clearTimer();
            this.startTimer();
        });
        
        // Clear timer when changing zones or returning to lobby
        this.mod.hook('S_LOAD_TOPO', 'raw', () => this.clearTimer());
        this.mod.hook('S_RETURN_TO_LOBBY', 'raw', () => this.clearTimer());
        
        // Ping request hook - record start time
        this.mod.hook('C_REQUEST_GAMESTAT_PING', 'raw', {order: 10, filter: {fake: null}}, (code, data, incoming, fake) => {
            if (!fake) {
                this._started = Date.now();
            }
        });
        
        // Ping response hook - calculate ping
        this.mod.hook('S_RESPONSE_GAMESTAT_PONG', 'raw', {order: 10, filter: {silenced: null}}, (code, data, incoming, fake) => {
            // Only process real packets, ignore fake ones
            if (!fake) {
                this.addPingResult(Date.now() - this._started);
            }
            return false;
        });
    }
    
    // Timer management methods
    
    /*
     * Starts the timer for periodic measurements
     */
    startTimer() {
        // Clear any existing timer first to prevent multiple timers
        this.clearTimer();
        
        // Set up a new timer for the measurement cycle
        this._timer = setTimeout(() => {
            // Send ping request
            this.pingServer();
            
            // Calculate jitter from skill events
            this.calculateJitter();
            
            // Restart the timer for the next cycle
            this.startTimer();
        }, this.CONFIG.PING_INTERVAL);
    }
    
    /*
     * Clears the measurement timer
     */
    clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }
    
    // Ping measurement methods
    
    /*
     * Sends a ping request to the server
     */
    pingServer() {
        this._started = Date.now();
        this.mod.send('C_REQUEST_GAMESTAT_PING', 1, {});
    }
    
    /*
     * Adds a ping measurement result and updates statistics
     * @param {number} ping - The measured ping value in milliseconds
     */
    addPingResult(ping) {
        // Validate ping value
        if (isNaN(ping) || ping < 0 || ping > 800) {
            return;
        }
        
        // Add data to the array
        this._ping_array.push(Number(ping));
        
        // Reduce the array if it's over the max size
        if (this._ping_array.length > this.CONFIG.MAX_PING_CACHE_SIZE) {
            this._ping_array.shift();
        }
        
        // Update ping with the minimum value (most accurate representation)
        let minPing = this._ping_array[0];
        for (let i = 1; i < this._ping_array.length; i++) {
            if (this._ping_array[i] < minPing) minPing = this._ping_array[i];
        }
        this.ping = minPing;
        
        // Get current timestamp for cleanup check
        const now = Date.now();
        
        // Periodically clean up the _faked object to prevent memory leaks
        if (now - this._lastCleanup > this.CONFIG.CLEANUP_INTERVAL) {
            this.cleanupFakedEvents();
            this._lastCleanup = now;
        }
    }

    /*
     * Calculates the average ping from stored measurements
     * @returns {number} The average ping in milliseconds
     */
    getAveragePing() {
        if (this._ping_array.length === 0) return 0;
        
        let avg = 0;
        for (const x of this._ping_array) avg += x;
        return Math.floor(avg / this._ping_array.length);
    }

    // Jitter calculation methods
    
    /*
     * Calculates jitter based on stored skill events
     * Uses the last few skills and selects the lowest jitter value
     * If a skill action takes longer to be confirmed by the server than just the ping time, that extra delay is the jitter
     */
    calculateJitter() {
        const now = Date.now();
        const jitterValues = [];
        
        // Process each skill event in _skillEvents
        for (const event of this._skillEvents) {
            const skillId = event.skillId;
            const stage = event.stage;
            const realTime = event.time;
            
            // For stage events
            if (stage !== null && this._faked.stage[skillId] && this._faked.stage[skillId][stage] !== undefined) {
                const fakeTime = this._faked.stage[skillId][stage];
                
                // Only process if real event came after fake event
                if (realTime > fakeTime) {
                    // Calculate jitter: real event time - fake event time - ping
                    const jitter = realTime - fakeTime - this.ping;
                    
                    // Only accept jitter values within the configured range
                    if (0 <= jitter && jitter <= this.CONFIG.MAX_ACCEPTED_JITTER) {
                        jitterValues.push(jitter);
                    }
                }
            }
            
            // For end events
            if (stage === null && this._faked.end[skillId] !== undefined) {
                const fakeTime = this._faked.end[skillId];
                
                // Only process if real event came after fake event
                if (realTime > fakeTime) {
                    // Calculate jitter: real event time - fake event time - ping
                    const jitter = realTime - fakeTime - this.ping;
                    
                    // Only accept jitter values within the configured range
                    if (0 <= jitter && jitter <= this.CONFIG.MAX_ACCEPTED_JITTER) {
                        jitterValues.push(jitter);
                    }
                }
            }
        }
        
        // Update jitter with the lowest value if available
        if (jitterValues.length > 0) {
            // Sort jitter values and take the lowest
            jitterValues.sort((a, b) => a - b);
            this.jitter = jitterValues[0];
        }
        
        // Trim _skillEvents to keep only the last MAX_SKILLS_TO_KEEP events
        if (this._skillEvents.length > this.CONFIG.MAX_SKILLS_TO_KEEP) {
            this._skillEvents = this._skillEvents.slice(-this.CONFIG.MAX_SKILLS_TO_KEEP);
        }
    }
    
    /*
     * Cleans up old entries in the _faked object to prevent memory leaks
     */
    cleanupFakedEvents() {
        const now = Date.now();
        const maxAge = this.CONFIG.HISTORY_MAX_AGE;
        
        // Clean up stage events
        for (const skillId in this._faked.stage) {
            for (const stage in this._faked.stage[skillId]) {
                if (now - this._faked.stage[skillId][stage] > maxAge) {
                    delete this._faked.stage[skillId][stage];
                }
            }
            // Remove empty skill entries
            if (Object.keys(this._faked.stage[skillId]).length === 0) {
                delete this._faked.stage[skillId];
            }
        }
        
        // Clean up end events
        for (const skillId in this._faked.end) {
            if (now - this._faked.end[skillId] > maxAge) {
                delete this._faked.end[skillId];
            }
        }
        
        // Clean up old skill events
        const oldLength = this._skillEvents.length;
        this._skillEvents = this._skillEvents.filter(event => now - event.time <= maxAge);
        
        // Limit the number of entries in _faked.stage and _faked.end to match MAX_SKILLS_TO_KEEP
        const maxEntries = this.CONFIG.MAX_SKILLS_TO_KEEP;
        
        // Trim stage events if there are too many
        const stageSkillIds = Object.keys(this._faked.stage);
        if (stageSkillIds.length > maxEntries) {
            // Sort by most recent stage time
            stageSkillIds.sort((a, b) => {
                const aLatest = Math.max(...Object.values(this._faked.stage[a]));
                const bLatest = Math.max(...Object.values(this._faked.stage[b]));
                return bLatest - aLatest; // Descending order (most recent first)
            });
            
            // Keep only the most recent skills
            for (let i = maxEntries; i < stageSkillIds.length; i++) {
                delete this._faked.stage[stageSkillIds[i]];
            }
        }
        
        // Trim end events if there are too many
        const endSkillIds = Object.keys(this._faked.end);
        if (endSkillIds.length > maxEntries) {
            // Sort by most recent end time
            endSkillIds.sort((a, b) => this._faked.end[b] - this._faked.end[a]); // Descending order
            
            // Keep only the most recent skills
            for (let i = maxEntries; i < endSkillIds.length; i++) {
                delete this._faked.end[endSkillIds[i]];
            }
        }
    }
    
    // Skill event tracking methods
    
    /*
     * Adds a skill event timestamp to the _faked object
     * @param {number} skillId - The ID of the skill
     * @param {number|null} stage - The stage of the skill, or null for end events
     */
    addToFaked(skillId, stage=null) {
        if (stage !== null) {
            if (!this._faked.stage[skillId]) this._faked.stage[skillId] = {};
            this._faked.stage[skillId][stage] = Date.now();
        } else {
            this._faked.end[skillId] = Date.now();
        }
    }
    
    /*
     * Adds a skill event to the _skillEvents array
     * @param {number} skillId - The ID of the skill
     * @param {number|null} stage - The stage of the skill, or null for end events
     */
    addSkillEvent(skillId, stage=null) {
        const now = Date.now();
        this._skillEvents.push({
            skillId: skillId,
            stage: stage,
            time: now
        });
        
        // Trim the array if it gets too large
        if (this._skillEvents.length > this.CONFIG.MAX_SKILLS_TO_KEEP * 2) {
            this._skillEvents = this._skillEvents.slice(-this.CONFIG.MAX_SKILLS_TO_KEEP);
        }
    }
    
    /*
     * Fixes skill IDs for Gunner class (job ID 9)
     * @param {Object} event - The skill event object
     * @param {boolean} fake - Whether this is a fake event
     */
    fixEvent(event, fake) {
        // Only apply fix for Gunner class (job ID 9)
        if (this.mods.player.job !== 9) return;
        
        // For fake events with skills in the 21xxxx range, cache the skill ID
        if (fake && Math.floor(event.skill.id / 10000) === 21) {
            this._skill_cache = event.skill.id;
            return;
        }
        
        // Apply cached skill ID for specific Gunner skills
        if ((event.skill.id - (this.mods.player.templateId * 100)) !== 8 || !this._skill_cache) return;
        event.skill.id = this._skill_cache;
    }
    
    // Event handlers
    
    /*
     * Handler for S_ACTION_STAGE events
     * @param {Object} event - The event object
     * @param {boolean} fake - Whether this is a fake event
     */
    s_action_stage = (event, fake) => {
        if (!this.mods.player.isMe(event.gameId)) return;
        
        this.fixEvent(event, fake);
        
        if (fake) {
            this.addToFaked(event.skill.id, event.stage);
        } else {
            this.addSkillEvent(event.skill.id, event.stage);
        }
    }
    
    /*
     * Handler for S_ACTION_END events
     * @param {Object} event - The event object
     * @param {boolean} fake - Whether this is a fake event
     */
    s_action_end = (event, fake) => {
        if (!this.mods.player.isMe(event.gameId)) return;
        
        this.fixEvent(event, fake);
        
        if (fake) {
            this.addToFaked(event.skill.id);
        } else {
            this.addSkillEvent(event.skill.id, null);
        }
    }
    
    // Message display and cleanup methods
    
    /*
     * Sets up or clears the message interval based on current configuration
     */
    setupMessageInterval() {
        // Clear existing interval if it exists
        if (this._messageInterval) {
            clearInterval(this._messageInterval);
            this._messageInterval = null;
        }
        
        // Set up new interval if enabled / re-enabled
        if (this.CONFIG.PING_DISPLAY_ENABLED) {
            try {
                this._messageInterval = setInterval(() => {
                    this.mods.command.message(`PING\nACTUAL = ${this.ping}  AVERAGE = ${this.getAveragePing()}  JITTER = ${this.jitter}\nType '/8 rival ping' to dis/enable this message.`);
                }, this.CONFIG.PING_DISPLAY_INTERVAL);
            } catch (error) {
                console.error('Monitor: Error setting up message interval:', error);
            }
        }
    }
    
    /*
     * Cleans up resources when the module is unloaded
     */
    destructor() {
        this.clearTimer();
        
        // Clear message interval if it exists
        if (this._messageInterval) {
            clearInterval(this._messageInterval);
            this._messageInterval = null;
        }
        
        // Clean up any other resources
        this._ping_array = null;
        this._skillEvents = null;
        this._faked = null;
    }
}
// Export the Monitor class
module.exports = Monitor;