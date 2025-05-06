/*
 * Rival Mod - Core Utility Library
 * 
 * library.js provides core utility functions for the Rival mod system.
 * It includes methods for mathematical operations, data manipulation, file handling,
 * packet processing, and skill information parsing.
 */

const path = require('path');
const fs = require('fs');
const util = require('util');
/*
 * SkillInfo class
 * 
 * Parses and manages skill ID information, providing methods to extract
 * skill components (base skill, sub-skill, level) from raw skill IDs.
 */
class SkillInfo {
    /*
     * Creates a new SkillInfo instance
     * @param {number} id - The raw skill ID
     * @param {boolean} usingMask - Whether the ID uses the skill mask (0x4000000)
     * @param {boolean} bossSkill - Whether this is a boss skill
     */
    constructor(id, usingMask = true, bossSkill = false) {
        const values = this.calculateValues(id, usingMask, bossSkill);
        this.raw = values.raw;       // Raw skill ID with mask
        this.id = values.id;         // Skill ID without mask
        this.skill = values.skill;   // Base skill ID
        this.sub = values.sub;       // Sub-skill ID
        this.level = values.level;   // Skill level
    }
    
    /*
     * Calculates skill ID components
     * @param {number} id - The raw skill ID
     * @param {boolean} usingMask - Whether the ID uses the skill mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {Object} Object containing parsed skill components
     * @private
     */
    calculateValues(id, usingMask = true, bossSkill = false) {
        let skillId;
        let raw;
        let skill;
        let sub;
        let level;
        
        if (bossSkill) {
            // Boss skills use a different format
            skillId = parseInt('0x' + id.toString(16).slice(-4));
            raw = id;
            skill = Math.floor(skillId / 100);
            level = 1;
        } else {
            // Normal player skills
            const SKILL_MASK = 0x4000000;
            skillId = id - (usingMask ? SKILL_MASK : 0);
            raw = id + (usingMask ? 0 : SKILL_MASK);
            skill = Math.floor(skillId / 10000);
            level = Math.floor(skillId / 100) % 100;
        }
        
        sub = skillId % 100;
        id = skillId;
        
        return {
            raw,
            id,
            skill,
            sub,
            level
        };
    }
    
    /*
     * Updates the skill values with a new ID
     * @param {number} id - The raw skill ID
     * @param {boolean} usingMask - Whether the ID uses the skill mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {SkillInfo} This instance for chaining
     */
    setValues(id, usingMask = true, bossSkill = false) {
        const values = this.calculateValues(id, usingMask, bossSkill);
        this.raw = values.raw;
        this.id = values.id;
        this.skill = values.skill;
        this.sub = values.sub;
        this.level = values.level;
        return this;
    }
    
    /*
     * Generates a base skill ID from components
     * @param {number} skill - The base skill ID
     * @param {number} level - The skill level
     * @param {number} sub - The sub-skill ID
     * @returns {number} The combined skill ID
     */
    getBaseId(skill = 1, level = 1, sub = 0) {
        return ((skill * 10000) + (level * 100)) + sub;
    }
    
    /*
     * Sets the skill values using component parts
     * @param {number} skill - The base skill ID
     * @param {number} level - The skill level
     * @param {number} sub - The sub-skill ID
     * @returns {SkillInfo} This instance for chaining
     */
    setValuesTo(skill, level, sub) {
        return this.setValues(this.getBaseId(skill, level, sub), false);
    }
}

/*
 * Library class
 * 
 * Provides utility functions for the Rival mod system, including
 * mathematical operations, data manipulation, file handling, and packet processing.
 */
class Library {
    /*
     * Creates a new Library instance
     * @param {Object} dispatch - The dispatch interface
     * @param {Object} mods - Collection of module references
     */
    constructor(dispatch, mods) {
        this.dispatch = dispatch;    // Dispatch interface
        
        // Protocol version information
        try {
            this.version = dispatch.dispatch.protocolVersion;
            this.protocolVersion = dispatch.dispatch.protocolVersion;
        } catch (error) {
            // Default values if protocol version is not available
            this.version = 0;
            this.protocolVersion = 0;
        }
        
        // Store majorPatchVersion directly from dispatch if available
        this.majorPatchVersion = dispatch.majorPatchVersion || 100; // Default to patch 100
        
        // Command interface
        this.command = dispatch.command;
        
        // Check if skill-prediction is installed
        this.sp = false;
        this._checkSkillPrediction();
        
        // Hook setup flag
        this.hookSetup = false;
        
        // If mods.packet is already available, set up the hook now
        if (mods && mods.packet && typeof mods.packet.get_all === 'function') {
            this.setupHookLater();
        }
    }
    
    /*
     * Checks if skill-prediction is installed
     * @private
     */
    _checkSkillPrediction() {
        const spModules = ['skill-prediction', 'skill-prediction-master', 'sp', 'sp-master'];
        for (let moduleName of spModules) {
            try {
                require(moduleName);
                this.sp = true;
                break;
            } catch (error) {
                // Module not found, continue checking
            }
        }
    }
    
    /*
     * Sets up delayed hooks when packet module is fully initialized
     */
    setupHookLater() {
        // Only run this once
        if (this.hookSetup) return;
        this.hookSetup = true;
        
        // Make sure packet module is available
        let packetModule = null;
        
        // Try to get packet module from dispatch.mods
        if (this.dispatch.mods && this.dispatch.mods.packet && typeof this.dispatch.mods.packet.get_all === 'function') {
            packetModule = this.dispatch.mods.packet;
        } else {
            // Try to load packet module directly
            try {
                const PacketHandler = require('../class/packet');
                packetModule = new PacketHandler(this.dispatch);
                console.log("[Library] Loaded packet module directly");
            } catch (error) {
                // Try to load packet-old.js as fallback
                try {
                    const PacketHandler = require('../class/packet-old');
                    packetModule = new PacketHandler(this.dispatch);
                    console.log("[Library] Loaded fallback packet-old module");
                } catch (fallbackError) {
                    // Try to load packet-og.js as last resort
                    try {
                        const PacketHandler = require('../class/packet-og');
                        packetModule = new PacketHandler(this.dispatch);
                        console.log("[Library] Loaded fallback packet-og module");
                    } catch (ogError) {
                        console.log("[Library] Warning: Packet module not available, using default protocol version");
                        return;
                    }
                }
            }
        }
        
        // Try to hook C_CHECK_VERSION safely
        try {
            const packetInfo = packetModule.get_all("C_CHECK_VERSION");
            if (packetInfo && packetInfo[1] !== null) {
                this.dispatch.hook(...packetInfo, {order: 100, filter: {fake: null}}, () => {
                    this.version = this.dispatch.dispatch.protocolVersion;
                    this.protocolVersion = this.dispatch.dispatch.protocolVersion;
                });
            } else {
                console.log("[Library] Warning: Could not hook C_CHECK_VERSION, using default protocol version");
            }
        } catch (error) {
            console.log("[Library] Warning: Error hooking C_CHECK_VERSION:", error.message);
        }
    }
    
    // Database query methods
    
    /*
     * Executes a database query
     * @param {string} query - The query to execute
     * @param {...any} args - Query arguments
     * @returns {Promise<Array>} Query results
     */
    async query(query, ...args) {
        try {
            return await this.dispatch.queryData(query, args, args.length !== 0);
        } catch (error) {
            console.log("FATAL ERROR in Library. Failed to execute query:", query);
            throw new Error(error);
        }
    }
    
    /*
     * Executes multiple database queries
     * @param {Array} queries - Array of query arrays [query, ...args]
     * @returns {Promise<Array>} Combined query results
     */
    async queryM(queries) {
        const results = [];
        
        for (const [query, ...args] of queries) {
            results.push(await this.dispatch.queryData(query, args, true));
        }
        
        return results.reduce((acc, val) => {
            acc.push(...val);
            return acc;
        }, []);
    }
    
    /*
     * Executes a database query with filtering options
     * @param {string} query - The query to execute
     * @param {boolean} concat - Whether to concatenate results
     * @param {boolean} findAll - Whether to find all matches
     * @param {boolean} children - Whether to include children
     * @param {Object} attributeFilter - Filter for attributes
     * @returns {Promise<Object>} Query results
     */
    async queryF(query, concat = true, findAll = true, children = true, attributeFilter = null) {
        let result;
        try {
            result = await this.dispatch.queryData(query, [], findAll, children, attributeFilter);
        } catch (error) {
            console.log("FATAL ERROR in Library. Failed to execute query:", query);
            throw new Error(error);
        }
        
        let ret = {
            attributes: {},
            children: []
        };
        
        if (concat) {
            for (const res of (Array.isArray(result) ? result : [result])) {
                ret.attributes = {...ret.attributes, ...res.attributes};
                ret.children.push(...res.children);
            }
        } else {
            ret = result;
        }
        return ret;
    }
    
    /*
     * Gets a specific entry from query data
     * @param {Object} queryData - The query data
     * @param {string} path - Path to the desired data
     * @param {...any} argsData - Arguments for path matching
     * @returns {Array} Matching query entries
     */
    getQueryEntry(queryData, path, ...argsData) {
        path = path.split("/");
        queryData = queryData.children;
        
        while (path.length && queryData.length) {
            const pathInfo = path.shift();
            if (pathInfo === "") break;
            
            const name = pathInfo.split("@")[0];
            const argsNames = (pathInfo.replace("=?", "").split("@")[1] || "").split("&");
            
            let argData = [];
            for (const i in argsNames) argData.push(argsData.shift());
            
            for (const child of queryData) {
                if (child.name === name) {
                    let foundAll = true;
                    for (const i in argsNames) {
                        const argName = argsNames[i];
                        const data = argData[i];
                        if (child.attributes[argName] != data) foundAll = false;
                    }
                    
                    if (foundAll) {
                        queryData = (path.length && path[0] !== "") ? child.children : [child];
                        break;
                    }
                }
            }
        }
        return queryData;
    }
    
    // Utility methods
    
    /*
     * Prints an object with color and full depth
     * @param {...any} args - Arguments to print
     */
    print(...args) {
        console.log(util.inspect(...args, false, null, true));
    }
    
    /*
     * Checks if any item in array A is in array B
     * @param {Array} a - First array
     * @param {Array} b - Second array
     * @returns {boolean} Whether any item in A is in B
     */
    arraysItemInArray(a, b) {
        for (let item of a) {
            if (b.includes(item)) return true;
        }
        return false;
    }
    
    /*
     * Checks if two objects are equal by comparing their JSON representations
     * @param {Object} a - First object
     * @param {Object} b - Second object
     * @returns {boolean} Whether the objects are equal
     */
    jsonEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    
    /*
     * Stringifies an object to JSON, handling BigInt values
     * @param {Object} data - The data to stringify
     * @param {string} spaces - Spaces for indentation
     * @returns {string} JSON string
     */
    jsonStringify(data, spaces = "") {
        return JSON.stringify(data, (key, value) => {
            if (typeof value === "bigint") {
                return `BI/-${value.toString()}`;
            }
            return value;
        }, spaces);
    }
    
    /*
     * Parses a JSON string, handling BigInt values
     * @param {string} data - The JSON string to parse
     * @returns {Object} Parsed object
     */
    parseJson(data) {
        return JSON.parse(data, (key, value) => {
            if (typeof value === "string" && value.includes("BI/-")) {
                return BigInt(value.replace("BI/-", ""));
            }
            return value;
        });
    }
    
    /*
     * Gets a random integer between min and max
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (exclusive)
     * @returns {number} Random integer
     */
    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    
    /*
     * Gets the number of properties in an object
     * @param {Object} obj - The object to measure
     * @returns {number} Number of properties
     */
    objectLength(obj) {
        return Object.keys(obj).length;
    }
    
    // Position and distance methods
    
    /*
     * Calculates 2D distance between two locations
     * @param {Object} loc1 - First location with x,y coordinates
     * @param {Object} loc2 - Second location with x,y coordinates
     * @returns {number} Distance between locations
     */
    dist2D(loc1, loc2) {
        return Math.sqrt(Math.pow(loc2.x - loc1.x, 2) + Math.pow(loc2.y - loc1.y, 2));
    }
    
    /*
     * Calculates 3D distance between two locations
     * @param {Object} loc1 - First location with x,y,z coordinates
     * @param {Object} loc2 - Second location with x,y,z coordinates
     * @returns {number} Distance between locations
     */
    dist3D(loc1, loc2) {
        return Math.sqrt(Math.pow(loc2.x - loc1.x, 2) + Math.pow(loc2.y - loc1.y, 2) + Math.pow(loc2.z - loc1.z, 2));
    }
    
    /*
     * Checks if two positions intersect within given radii
     * @param {Object} a - First position with x,y coordinates
     * @param {Object} b - Second position with x,y coordinates
     * @param {number} aRadius - Radius of first position
     * @param {number} bRadius - Radius of second position
     * @returns {boolean} Whether the positions intersect
     */
    positionsIntersect(a, b, aRadius, bRadius) {
        if (!a || !b) return false;
        if (a.zone !== b.zone) return false;
        if (a.instance !== b.instance) return false;
        
        const sum = Math.pow((a.x - b.x), 2) + Math.pow((a.y - b.y), 2);
        return (Math.pow((aRadius - bRadius), 2) <= sum && sum <= Math.pow((aRadius + bRadius), 2));
    }
    
    /*
     * Applies a distance to a location in the direction of its heading
     * @param {Object} loc - Location with x,y,w coordinates
     * @param {number} distance - Distance to apply
     * @returns {Object} Modified location
     */
    applyDistance(loc, distance) {
        const r = loc.w;
        loc.x += Math.cos(r) * distance;
        loc.y += Math.sin(r) * distance;
        return loc;
    }
    
    /*
     * Converts radians to the game's angle format
     * @param {number} w - Angle in radians
     * @returns {number} Angle in game format
     */
    fromAngle(w) { 
        return w / Math.PI * 0x8000; 
    }
    
    /*
     * Converts the game's angle format to radians
     * @param {number} w - Angle in game format
     * @returns {number} Angle in radians
     */
    toAngle(w) { 
        return w / 0x8000 * Math.PI; 
    }
    
    // Deprecated methods with warnings
    
    /*
     * Gets the direction from one position to another (DEPRECATED)
     * @param {Object} fromPos - Starting position
     * @param {Object} toPos - Target position
     * @returns {number} Direction in game format
     * @deprecated Use Angle equivalents instead
     */
    getDirectionTo(fromPos, toPos) {
        console.warn(`DeprecationWarning: Library.getDirectionTo is deprecated. Use "Angle" equivalents instead.\n    at ${Error().stack.split('\n')[3].slice(7)}`);
        return Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x) * 0x8000 / Math.PI;
    }
    
    /*
     * Gets the opposite direction (DEPRECATED)
     * @param {number} direction - Direction in game format
     * @returns {number} Opposite direction
     * @deprecated Use Angle equivalents instead
     */
    opositeDirection(direction) {
        console.warn(`DeprecationWarning: Library.opositeDirection is deprecated. Use "Angle" equivalents instead.\n    at ${Error().stack.split('\n')[3].slice(7)}`);
        return (direction + 2 * 32768) % (2 * 32768) - 32768;
    }
    
    /*
     * Creates an empty long (DEPRECATED)
     * @param {boolean} bool - Whether to create a signed or unsigned long
     * @throws {Error} Always throws an error as this method is deprecated
     * @deprecated Use BigInt equivalents instead
     */
    emptyLong(bool = true) {
        throw new Error(`DeprecationWarning: Library.emptyLong is deprecated. Use BigInt equivalents instead.\n    ${Error().stack}`);
    }
    
    /*
     * Creates a long from low and high bits (DEPRECATED)
     * @param {number} low - Low bits
     * @param {number} high - High bits
     * @param {boolean} unsigned - Whether the long is unsigned
     * @throws {Error} Always throws an error as this method is deprecated
     * @deprecated Use BigInt equivalents instead
     */
    long(low = 0, high = 0, unsigned = true) {
        throw new Error(`DeprecationWarning: Library.long is deprecated. Use BigInt equivalents instead.\n    ${Error().stack}`);
    }
    
    // File operations
    
    /*
     * Saves data to a file
     * @param {string} filePath - Path to the file
     * @param {Object|string} data - Data to save
     * @param {string} dirname - Directory name
     */
    saveFile(filePath, data, dirname = __dirname) {
        const str = typeof data === "object" ? JSON.stringify(data, null, "    ") : data;
        fs.writeFileSync(path.join(dirname, filePath), str);
    }
    
    /*
     * Reads data from a file
     * @param {string} dirname - Directory name
     * @param {string} filePath - Path to the file
     * @returns {Buffer} File contents
     */
    readFile(dirname, filePath) {
        return fs.readFileSync(path.join(dirname, filePath));
    }
    
    // Packet operations
    
    /*
     * Gets an event object from raw packet data
     * @param {number} opcode - Packet opcode
     * @param {number} packetVersion - Packet version
     * @param {Buffer} payload - Raw packet data
     * @returns {Object} Parsed event object
     */
    getEvent(opcode, packetVersion, payload) {
        return this.dispatch.dispatch.fromRaw(opcode, packetVersion, payload);
    }
    
    /*
     * Gets raw packet data from an event object
     * @param {number} opcode - Packet opcode
     * @param {number} packetVersion - Packet version
     * @param {Object} data - Event object
     * @returns {Buffer} Raw packet data
     */
    getPayload(opcode, packetVersion, data) {
        return this.dispatch.dispatch.toRaw(opcode, packetVersion, data);
    }
    
    /*
     * Gets packet information from an identifier
     * @param {string} identifier - Packet identifier
     * @returns {Object} Packet information
     */
    getPacketInformation(identifier) {
        return this.dispatch.dispatch.resolve(identifier);
    }
    
    /*
     * Parses a system message string into an object
     * @param {string} message - System message string
     * @returns {Object} Parsed message object
     */
    parseSystemMessage(message) {
        return this.dispatch.parseSystemMessage(message);
    }
    
    /*
     * Builds a system message string from an object
     * @param {Object} message - Message object
     * @returns {string} System message string
     */
    buildSystemMessage(message) {
        return this.dispatch.buildSystemMessage(message);
    }
    
    /*
     * Gets skill information from a skill ID
     * @param {number} id - Skill ID
     * @param {boolean} usingMask - Whether the ID uses the skill mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {SkillInfo} Skill information object
     */
    getSkillInfo(id, usingMask = true, bossSkill = false) {
        return new SkillInfo(id, usingMask, bossSkill);
    }
}
// Export the Library class
module.exports = Library;
