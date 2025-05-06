/*
 * Rival Mod - State Tracking
 * 
 * last.js serves as a state tracking system for recent game events and player actions.
 * It maintains a history of recently used skills, player location data, and important
 * game events to provide context for other modules in the system.
 */
const hooks = require("../enums/hooks");
/*
 * Last class
 * 
 * Tracks and manages the most recent game state information including skills,
 * player location, and packet data. Acts as a central cache for recent events
 * that other modules can query to make informed decisions.
 */
class Last {
    /*
     * Creates a new Last instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;      // Reference to the mod framework
        this.mods = mods;    // References to other modules
        
        // Initialize data storage for various types of information
        this.info = {
            packet: {        // Storage for all cached packets by type
                _time: 0
            },
            latest: {        // Most recently used skill
                _time: 0
            },
            skill: {         // Packets organized by skill ID
                _time: 0
            },
            instantMove: {   // Last instant movement data
                _time: 0
            },
            cPlayerLocation: { // Player's current location
                _time: 0
            },
            defendSuccess: { // Last successful block data
                _time: 0
            },
            skillList: {     // Player's available skills and passives
                skills: {},
                passives: {}
            }
        };

        // Set up packet hooks for various game events
        mod.hook(...mods.packet.get_all("S_INSTANT_MOVE"), hooks.READ_DESTINATION_ALL_CLASS, this.sInstantMove);
        mod.hook(...mods.packet.get_all("S_SKILL_LIST"), hooks.READ_DESTINATION_ALL_CLASS, this.sSkillList);
        mod.hook(...mods.packet.get_all("S_DEFEND_SUCCESS"), hooks.READ_DESTINATION_ALL_CLASS, this.sDefendSuccess);
        mod.hook(...mods.packet.get_all("C_PLAYER_LOCATION"), hooks.READ_ALL, this.cPlayerLocation);
        
        // Set up hooks for various skill-related packets
        mod.hook(...mods.packet.get_all("C_START_SKILL"), hooks.READ_ALL, this.cachePacket("C_START_SKILL"));
        mod.hook(...mods.packet.get_all("C_START_TARGETED_SKILL"), hooks.READ_ALL, this.cachePacket("C_START_TARGETED_SKILL"));
        mod.hook(...mods.packet.get_all("C_START_COMBO_INSTANT_SKILL"), hooks.READ_ALL, this.cachePacket("C_START_COMBO_INSTANT_SKILL"));
        mod.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL"), hooks.READ_ALL, this.cachePacket("C_START_INSTANCE_SKILL"));
        mod.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL_EX"), hooks.READ_ALL, this.cachePacket("C_START_INSTANCE_SKILL_EX"));
        mod.hook(...mods.packet.get_all("C_PRESS_SKILL"), hooks.READ_ALL, this.cachePacket("C_PRESS_SKILL"));
        mod.hook(...mods.packet.get_all("C_NOTIMELINE_SKILL"), hooks.READ_ALL, this.cachePacket("C_NOTIMELINE_SKILL"));
    }

    // Getter methods for state information

    /*
     * Gets the last instant move data
     * @returns {Object} The most recent instant move data
     */
    get instantMove() {
        return this.info.instantMove;
    }

    /*
     * Gets the player's skill list
     * @returns {Object} Object containing skills and passives
     */
    get skillList() {
        return this.info.skillList;
    }

    /*
     * Gets the most recently used skill
     * @returns {Object} The most recent skill packet data
     */
    get startSkill() {
        return this.info.latest;
    }

    /*
     * Gets all cached packets
     * @returns {Object} All cached packets organized by type
     */
    get packets() {
        return this.info.packet;
    }

    /*
     * Gets the player's current location
     * @returns {Object} The current player location data
     */
    get playerLocation() {
        return this.info.cPlayerLocation;
    }

    /*
     * Gets the last successful block data
     * @returns {Object} The most recent successful block data
     */
    get block() {
        return this.info.defendSuccess;
    }

    // Packet access methods

    /*
     * Gets a specific packet by name
     * @param {string} packetName - The name of the packet to retrieve
     * @returns {Object} The packet data
     */
    packet = packetName => {
        return this.packets[packetName];
    };

    /*
     * Gets packet data for a specific skill ID
     * @param {number} skillId - The skill ID to retrieve packet data for
     * @returns {Object} The packet data for the skill
     */
    packetForSkill = skillId => {
        return this.info.skill[skillId];
    };

    /*
     * Creates a function that caches packet data for a specific packet type
     * @param {string} packetType - The type of packet to cache
     * @returns {Function} A function that caches the packet data
     */
    cachePacket = packetType => {
        return packetData => {
            // Add timestamp and packet name
            packetData._time = Date.now();
            packetData._name = packetType;
            
            // Store packet in multiple locations for different access patterns
            this.info.packet[packetType] = packetData;  // By packet type
            this.info.latest = packetData;              // As most recent
            this.info.skill[packetData.skill.id] = packetData;  // By skill ID
        };
    };

    // Event handler methods

    /*
     * Handles instant move events
     * @param {Object} moveData - The instant move data
     */
    sInstantMove = moveData => {
        // Only process events for the current player
        if (!this.mods.player.isMe(moveData.gameId)) return;
        
        moveData._time = Date.now();
        this.info.instantMove = moveData;
    };

    /*
     * Handles player location updates
     * @param {Object} locationData - The player location data
     */
    cPlayerLocation = locationData => {
        locationData._time = Date.now();
        this.info.cPlayerLocation = locationData;
    };

    /*
     * Handles successful defend/block events
     * @param {Object} defendData - The defend success data
     */
    sDefendSuccess = defendData => {
        // Only process events for the current player
        if (!this.mods.player.isMe(defendData.gameId)) return;
        
        defendData._time = Date.now();
        this.info.defendSuccess = defendData;
    };

    /*
     * Processes and organizes the player's skill list
     * @param {Object} skillListData - The skill list data
     */
    sSkillList = skillListData => {
        // Initialize skill list structure
        this.info.skillList = {
            skills: {},    // Active skills
            passives: {}   // Passive skills
        };

        // Process each skill in the list
        for (const { id, active: isActive } of skillListData.skills) {
            const skillId = Number(id);
            
            // Handle passive skills
            if (!isActive) {
                this.info.skillList.passives[skillId] = true;
                continue;
            }

            // Handle active skills
            this.info.skillList.skills[skillId] = true;
            
            // Organize skills by their base skill and sub-skill
            const skillInfo = this.mods.utils.getSkillInfo(skillId);
            const skillKey = skillInfo.skill + '-' + skillInfo.sub;
            
            // Create array for this skill type if it doesn't exist
            if (!this.info.skillList.skills[skillKey]) {
                this.info.skillList.skills[skillKey] = [];
            }
            
            // Add this skill's level to the array
            this.info.skillList.skills[skillKey].push(skillInfo.level);
        }
    };
}
// Export the Last class
module.exports = Last;