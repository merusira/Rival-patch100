/*
 * Rival Mod - Network Metrics Interface
 *
 * ping.js serves as the interface for accessing network performance metrics.
 * It provides a clean API for other modules to access ping, jitter, and
 * round-trip time (RTT) values without directly interacting with the monitoring implementation.
 *
 * Ping class
 * 
 * Provides methods to access network latency metrics including ping, jitter,
 * and calculated round-trip time. These values are essential for understanding
 * the current network conditions and can be used by other modules to adjust
 * timing-sensitive operations.
 */
class Ping {
    /*
     * Creates a new Ping instance
     * @param {Object} mod - The mod wrapper object that contains the ping functionality
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;      // Reference to the mod framework with ping data
        this.mods = mods;    // Reference to the mods object
        this.monitor = mods.monitor;  // Reference to the monitor class that provides actual metrics
    }

    // Network metrics getters

    /*
     * Gets the current ping value (one-way latency)
     * @returns {number} The current ping value in milliseconds
     */
    get ping() {
        return this.monitor.ping;
    }

    /*
     * Gets the current jitter value (ping variation)
     * @returns {number} The current jitter value in milliseconds
     */
    get jitter() {
        return this.monitor.jitter;
    }

    /*
     * Gets the average ping value calculated from recent measurements
     * @returns {number} The average ping over past MAX_PING_CACHE_SIZE defined in monitor.js
     * value in milliseconds
     */
    get averagePing() {
        return this.monitor.getAveragePing();
    }

    /*
     * Gets the round-trip time (RTT), which is the sum of ping and jitter
     * This represents the total expected delay for a request-response cycle
     * @returns {number} The calculated RTT value in milliseconds
     */
    get rtt() {
        return this.ping + this.jitter;
    }
    
    /*
     * Clean up resources when the module is unloaded
     */
    destructor() {
        // No resources to clean up as this is just an interface class
        // that delegates to the monitor implementation
    }
}
// Export the Ping class
module.exports = Ping;