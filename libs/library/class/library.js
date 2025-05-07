/*
 * Rival Mod - Core Library System
 * 
 * library.js provides core utility functions and services for the Rival mod.
 * It handles data manipulation, skill information, distance calculations,
 * file operations, and protocol version tracking.
 */
const path = require('path');
const fs = require('fs');
const util = require('util');
/*
 * SkillClasserino class
 * 
 * Handles skill ID parsing and manipulation, providing a consistent interface
 * for working with skill IDs throughout the mod.
 */
class SkillClasserino {
    /*
     * Creates a new SkillClasserino instance
     * @param {number} id - The raw skill ID
     * @param {boolean} usingMask - Whether to use the skill ID mask (0x4000000)
     * @param {boolean} bossSkill - Whether this is a boss skill
     */
    constructor(id, usingMask=true, bossSkill=false) {
        let val = this.calculateValues(id, usingMask, bossSkill);
        this.raw = val.raw;         // Original raw ID
        this.id = val.id;           // Processed ID
        this.skill = val.skill;     // Base skill number
        this.sub = val.sub;         // Skill sub-type
        this.level = val.level;     // Skill level
    }

    /*
     * Calculates all skill ID components
     * @param {number} id - The raw skill ID
     * @param {boolean} usingMask - Whether to use the skill ID mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {Object} Object containing all calculated skill values
     */
    calculateValues(id, usingMask=true, bossSkill=false) {
        let skillId;
        let raw;
        let skill;
        let sub;
        let level;
        
        if (bossSkill) {
            // Handle boss skill IDs differently
            skillId = parseInt('0x' + id.toString(16).slice(-4));
            raw = id;
            skill = Math.floor(skillId / 100);
            level = 1;
        } else {
            // Handle player skill IDs
            skillId = id - (usingMask ? 0x4000000 : 0);
            raw = id + (usingMask ? 0 : 0x4000000);
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
     * Updates the skill ID values
     * @param {number} id - The new raw skill ID
     * @param {boolean} usingMask - Whether to use the skill ID mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {SkillClasserino} This instance for chaining
     */
    setValues(id, usingMask=true, bossSkill=false) {
        let val = this.calculateValues(id, usingMask, bossSkill);
        this.raw = val.raw;
        this.id = val.id;
        this.skill = val.skill;
        this.sub = val.sub;
        this.level = val.level;
        return this;
    }

    /*
     * Generates a base skill ID from components
     * @param {number} skill - The base skill number
     * @param {number} level - The skill level
     * @param {number} sub - The skill sub-type
     * @returns {number} The calculated base skill ID
     */
    getBaseId(skill=1, level=1, sub=0) {
        return ((skill * 10000) + (level * 100)) + sub;
    }

    /*
     * Sets values using skill components
     * @param {number} skill - The base skill number
     * @param {number} level - The skill level
     * @param {number} sub - The skill sub-type
     * @returns {SkillClasserino} This instance for chaining
     */
    setValuesTo(skill, level, sub) {
        return this.setValues(this.getBaseId(skill, level, sub), false);
    }
}

/*
 * Library class
 * 
 * Core utility class that provides essential functions for the Rival mod.
 * Handles data queries, distance calculations, file operations, and more.
 */
class Library {
    /*
     * Creates a new Library instance
     * @param {Object} mod - The mod API object for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.dispatch = mod;
        
        // Set protocol version
        try {
            this.version = mod.dispatch.protocolVersion;
            this.protocolVersion = mod.dispatch.protocolVersion;
        } catch(e) {
            // Default values if protocol version is not available
            this.version = 0;
            this.protocolVersion = 0;
        }
        
        // Store majorPatchVersion directly from dispatch if available
        this.majorPatchVersion = mod.majorPatchVersion || 100; // Default to patch 100
        
        // We'll set up the C_CHECK_VERSION hook later when packet module is fully initialized
        this.setupHookLater = () => {
            // Only run this once
            if (this.hookSetup) return;
            this.hookSetup = true;
            
            // Make sure packet module is available
            if (!mods || !mods.packet || typeof mods.packet.get_all !== 'function') {
                console.log("[Library] Warning: Packet module not available, using default protocol version");
                return;
            }
            
            // Try to hook C_CHECK_VERSION safely
            try {
                const packetInfo = mods.packet.get_all("C_CHECK_VERSION");
                if (packetInfo && packetInfo[1] !== null) {
                    mod.hook(...packetInfo, {order: 100, filter: {fake: null}}, () => {
                        this.version = mod.dispatch.protocolVersion;
                        this.protocolVersion = mod.dispatch.protocolVersion;
                    });
                } else {
                    console.log("[Library] Warning: Could not hook C_CHECK_VERSION, using default protocol version");
                }
            } catch(e) {
                console.log("[Library] Warning: Error hooking C_CHECK_VERSION:", e.message);
            }
        };
        
        // If mods.packet is already available, set up the hook now
        if (mods && mods.packet && typeof mods.packet.get_all === 'function') {
            this.setupHookLater();
        }
        
        this.command = mod.command;

        // Check if skill-prediction is installed
        this.sp = false;
        for (let x of ['skill-prediction', 'skill-prediction-master', 'sp', 'sp-master']) {
            try {
                require(x);
                this.sp = true;
            } catch(e) {
                // Module not found, continue checking
            }
        }
    }

    // Data query methods

    /*
     * Executes a data query with arguments
     * @param {string} query - The query to execute
     * @param {...*} args - Arguments for the query
     * @returns {Promise<Object>} Query results
     */
    async query(query, ...args) {
        try {
            return await this.dispatch.queryData(query, args, args.length != 0);
        } catch(e) {
            console.log("FATAL ERROR in Library. Failed to execute query:", query);
            throw new Error(e);
        }
    }

    /*
     * Executes multiple queries and combines the results
     * @param {Array} queries - Array of query arrays [query, ...args]
     * @returns {Promise<Array>} Combined query results
     */
    async queryM(queries) {
        let ret = [];

        for (const [query, ...args] of queries) {
            ret.push(await this.dispatch.queryData(query, args, true));
        }

        return ret.reduce((acc, val) => {
            acc.push(...val);
            return acc;
        }, []);
    }

    /*
     * Executes a query with filtering options
     * @param {string} query - The query to execute
     * @param {boolean} concat - Whether to concatenate results
     * @param {boolean} findAll - Whether to find all matches
     * @param {boolean} children - Whether to include children
     * @param {Object} attributeFilter - Filter for attributes
     * @returns {Promise<Object>} Query results
     */
    async queryF(query, concat=true, findAll=true, children=true, attributeFilter=null) {
        let result;
        try {
            result = await this.dispatch.queryData(query, [], findAll, children, attributeFilter);
        } catch(e) {
            console.log("FATAL ERROR in Library. Failed to execute query:", query);
            throw new Error(e);
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
     * Gets a specific entry from query data using a path
     * @param {Object} queryData - Data returned from a query
     * @param {string} path - Path to the desired data
     * @param {...*} argsData - Arguments for path matching
     * @returns {Array} Matching query entries
     */
    getQueryEntry(queryData, path, ...argsData) {
        path = path.split("/");
        queryData = queryData.children;

        while (path.length && queryData.length) {
            const path_info = path.shift();
            if (path_info == "") break;
            const name = path_info.split("@")[0];
            const argsNames = (path_info.replace("=?", "").split("@")[1] || "").split("&");
            
            let argData = [];
            for (const i in argsNames) argData.push(argsData.shift());

            for (const child of queryData) {
                if (child.name == name) {
                    let found_all = true;
                    for (const i in argsNames) {
                        const name = argsNames[i];
                        const data = argData[i];
                        if (child.attributes[name] != data) found_all = false;
                    }
                    if (found_all) {
                        queryData = (path.length && path[0] != "") ? child.children : [child];
                        break;
                    }
                }
            }
        }
        return queryData;
    }

    // Utility methods

    /*
     * Prints an object with full inspection
     * @param {...*} args - Arguments to print
     */
    print(...args) {
        console.log(util.inspect(...args, false, null, true));
    }

    /*
     * Checks if any item in array A is in array B
     * @param {Array} a - First array
     * @param {Array} b - Second array
     * @returns {boolean} True if any item in A is in B
     */
    arraysItemInArray(a, b) {
        for (let item of a) {
            if (b.includes(item)) return true;
        }
        return false;
    }

    /*
     * Calculates 2D distance between two locations
     * @param {Object} loc1 - First location with x,y coordinates
     * @param {Object} loc2 - Second location with x,y coordinates
     * @returns {number} Distance between the points
     */
    dist2D(loc1, loc2) {
        return Math.sqrt(Math.pow(loc2.x - loc1.x, 2) + Math.pow(loc2.y - loc1.y, 2));
    }

    /*
     * Calculates 3D distance between two locations
     * @param {Object} loc1 - First location with x,y,z coordinates
     * @param {Object} loc2 - Second location with x,y,z coordinates
     * @returns {number} Distance between the points
     */
    dist3D(loc1, loc2) {
        return Math.sqrt(Math.pow(loc2.x - loc1.x, 2) + Math.pow(loc2.y - loc1.y, 2) + Math.pow(loc2.z - loc1.z, 2));
    }

    /*
     * Gets direction from one position to another (DEPRECATED)
     * @param {Object} fromPos - Starting position
     * @param {Object} toPos - Target position
     * @returns {number} Direction value
     * @deprecated Use Angle equivalents instead
     */
    getDirectionTo(fromPos, toPos) {
        console.warn(`DeprecationWarning: Library.getDirectionTo is deprecated. Use "Angle" equivalents instead.\n    at ${Error().stack.split('\n')[3].slice(7)}`);
        return Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x) * 0x8000 / Math.PI;
    }

    /*
     * Gets the opposite direction (DEPRECATED)
     * @param {number} direction - Direction value
     * @returns {number} Opposite direction
     * @deprecated Use Angle equivalents instead
     */
    opositeDirection(direction) {
        console.warn(`DeprecationWarning: Library.opositeDirection is deprecated. Use "Angle" equivalents instead.\n    at ${Error().stack.split('\n')[3].slice(7)}`);
        return (direction + 2 * 32768) % (2 * 32768) - 32768;
    }

    /*
     * Compares two objects for equality using JSON stringification
     * @param {*} a - First object
     * @param {*} b - Second object
     * @returns {boolean} True if objects are equal
     */
    jsonEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /*
     * Creates an empty long (DEPRECATED)
     * @param {boolean} bool - Whether to create a signed or unsigned long
     * @throws {Error} Always throws an error as this method is deprecated
     * @deprecated Use BigInt equivalents instead
     */
    emptyLong(bool=true) {
        throw new Error(`DeprecationWarning: Library.emptyLong is deprecated. Use BigInt equivalents instead.\n    ${Error().stack}`);
    }

    /*
     * Creates a long value (DEPRECATED)
     * @param {number} low - Low bits
     * @param {number} high - High bits
     * @param {boolean} unsigned - Whether to create an unsigned long
     * @throws {Error} Always throws an error as this method is deprecated
     * @deprecated Use BigInt equivalents instead
     */
    long(low=0, high=0, unsigned=true) {
        throw new Error(`DeprecationWarning: Library.long is deprecated. Use BigInt equivalents instead.\n    ${Error().stack}`);
    }

    /*
     * Stringifies an object with BigInt support
     * @param {*} data - Data to stringify
     * @param {string} spaces - Spaces for formatting
     * @returns {string} JSON string
     */
    jsonStringify(data, spaces="") {
        return JSON.stringify(data, (key, value) => {
            if (typeof value === "bigint") {
                return `BI/-${value.toString()}`;
            }
            return value;
        }, spaces);
    }

    /*
     * Parses JSON with BigInt support
     * @param {string} data - JSON string to parse
     * @returns {*} Parsed object
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
     * @param {Object} obj - Object to check
     * @returns {number} Number of properties
     */
    objectLength(obj) {
        return Object.keys(obj).length;
    }

    /*
     * Checks if two positions intersect within given radii
     * @param {Object} a - First position
     * @param {Object} b - Second position
     * @param {number} aRadius - Radius of first position
     * @param {number} bRadius - Radius of second position
     * @returns {boolean} True if positions intersect
     */
    positionsIntersect(a, b, aRadius, bRadius) {
        let sum = Math.pow((a.x - b.x), 2) + Math.pow((a.y - b.y), 2);
        return (Math.pow((aRadius - bRadius), 2) <= sum && sum <= Math.pow((aRadius + bRadius), 2));
    }

    /*
     * Gets skill information from a skill ID
     * @param {number} id - Skill ID
     * @param {boolean} usingMask - Whether to use the skill ID mask
     * @param {boolean} bossSkill - Whether this is a boss skill
     * @returns {SkillClasserino} Skill information object
     */
    getSkillInfo(id, usingMask=true, bossSkill=false) {
        return new SkillClasserino(id, usingMask, bossSkill);
    }

    /*
     * Converts radians to game angle units
     * @param {number} w - Angle in radians
     * @returns {number} Angle in game units
     */
    fromAngle(w) { 
        return w / Math.PI * 0x8000; 
    }
    
    /*
     * Converts game angle units to radians
     * @param {number} w - Angle in game units
     * @returns {number} Angle in radians
     */
    toAngle(w) { 
        return w / 0x8000 * Math.PI; 
    }

    /*
     * Applies a distance to a location in its facing direction
     * @param {Object} loc - Location object with x,y,w properties
     * @param {number} distance - Distance to apply
     * @returns {Object} Modified location object
     */
    applyDistance(loc, distance) {
        let r = loc.w;
        loc.x += Math.cos(r) * distance;
        loc.y += Math.sin(r) * distance;
        return loc;
    }

    /*
     * Saves data to a file
     * @param {string} filePath - Path to save the file
     * @param {*} data - Data to save
     * @param {string} dirname - Directory name
     */
    saveFile(filePath, data, dirname=__dirname) {
        const str = typeof data === "object" ? JSON.stringify(data, null, "    ") : data;
        fs.writeFileSync(path.join(dirname, filePath), str);
    }

    /*
     * Gets an event object from raw packet data
     * @param {number} opcode - Packet opcode
     * @param {number} packetVersion - Packet version
     * @param {Buffer} payload - Packet payload
     * @returns {Object} Event object
     */
    getEvent(opcode, packetVersion, payload) {
        return this.dispatch.dispatch.fromRaw(opcode, packetVersion, payload);
    }

    /*
     * Gets raw payload from an event object
     * @param {number} opcode - Packet opcode
     * @param {number} packetVersion - Packet version
     * @param {Object} data - Event data
     * @returns {Buffer} Raw payload
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
     * Reads a file
     * @param {string} dirname - Directory name
     * @param {string} filePath - Path to the file
     * @returns {Buffer} File contents
     */
    readFile(dirname, filePath) {
        return fs.readFileSync(path.join(dirname, filePath));
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
}
// Export the Library class
module.exports = Library;
