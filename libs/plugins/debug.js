/*
 * Rival Mod - Debug System
 *
 * debug.js serves as a packet monitoring and logging system.
 * It tracks and logs network packets with specific fields to assist with
 * debugging, development, and troubleshooting of game mechanics.
 */
const hooks = require("../enums/hooks");
/*
 * Debug module
 *
 * Monitors and logs network packets with configurable field tracking.
 * Provides detailed packet information with formatting for easier analysis,
 * supports filtering by player-related packets, and handles various data types.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Debug(mod, mods) {
    // Packet definitions configuration
    
    /*
     * Packet definitions with fields to monitor
     * Each definition includes packet name, fields to track, and formatting options
     */
    const packetDefinitions = [{
        name: 'S_ACTION_STAGE',
        fields: ['skill', "stage", "speed", 'projectileSpeed', 'effectScale', 'w', "loc", "dest", "animSeq"],
        gameId: "gameId",
        fieldSelector: {
            skill: 'id'
        },
        fieldRename: {
            projectileSpeed: 'ps',
            effectScale: 'es'
        }
    }, {
        name: "S_ACTION_END",
        fields: ['skill', "type", "loc"],
        gameId: "gameId",
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_START_COOLTIME_SKILL",
        fields: ["skill", "cooldown", 'usedStacks', "nextStackCooldown"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_DECREASE_COOLTIME_SKILL",
        fields: ['skill', 'cooldown', 'usedStacks', "nextStackCooldown"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_ABNORMALITY_BEGIN",
        fields: ['id', "stacks", 'duration'],
        gameId: "target"
    }, {
        name: "S_ABNORMALITY_REFRESH",
        fields: ['id', "stacks", 'duration'],
        gameId: 'target'
    }, {
        name: "S_ABNORMALITY_END",
        fields: ['id'],
        gameId: "target"
    }, {
        name: "C_START_COMBO_INSTANT_SKILL",
        fields: ["skill", 'w', 'loc', 'targets', "endpoints"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'C_START_INSTANCE_SKILL',
        fields: ["skill", "continue", 'w', "loc", "targets", "endpoints", 'unkn1', 'unkn2'],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "C_START_INSTANCE_SKILL_EX",
        fields: ["skill", "projectile", "unk", 'w', 'loc', "dest"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "C_START_SKILL",
        fields: ["skill", "continue", "moving", "unk", "unk2", 'w', "loc", "dest"],
        fieldSelector: {
            skill: 'id'
        },
        fieldRename: {
            unk2: 'isPerfectCombo',
            unk: 'destPosOnAir',
            continue: "byGrant"
        }
    }, {
        name: "C_START_TARGETED_SKILL",
        fields: ['skill', 'w', "loc", "dest", "targets"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'C_PRESS_SKILL',
        fields: ["skill", "press", 'w', "loc", "unkn1", "unkn2", 'unkn3'],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "C_NOTIMELINE_SKILL",
        fields: ["skill"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'C_CANCEL_SKILL',
        fields: ['skill', "type"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'S_SKILL_CATEGORY',
        fields: ["category", "enabled"]
    }, {
        name: "S_GRANT_SKILL",
        fields: ["skill"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_INSTANT_DASH",
        fields: ['target', "unk", 'w', "loc"],
        gameId: "gameId"
    }, {
        name: "S_CONNECT_SKILL_ARROW",
        fields: ["skill", "unk1", "unk2"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_CANNOT_START_SKILL",
        fields: ["skill"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'C_PLAYER_LOCATION',
        fields: ["type", 'w', "loc"]
    }, {
        name: "C_NOTIFY_LOCATION_IN_ACTION",
        fields: ["skill", "stage", 'w', "loc"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_INSTANT_MOVE",
        fields: ['w', "loc"],
        gameId: "gameId"
    }, {
        name: 'S_INSTANCE_ARROW',
        fields: ["skill", "actionId", "targets", "endpoints"],
        gameId: "gameId",
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: 'S_EACH_SKILL_RESULT',
        fields: ["push", "air", "airChain", "skill", "stage", 'w', 'loc', "animSeq"],
        gameId: 'target',
        overrideEvent: "reaction",
        requiresValue: {
            enable: true
        },
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_PLAYER_STAT_UPDATE",
        fields: ["attackSpeed", 'attackSpeedBonus', "fireEdge", 'iceEdge', "lightningEdge"],
        cache: true
    }, {
        name: "S_DEFEND_SUCCESS",
        fields: ['skill', "perfect", "unk4"],
        fieldSelector: {
            skill: 'id'
        },
        gameId: "gameId"
    }, {
        name: "C_CAN_LOCKON_TARGET",
        fields: ["skill", "unk", "target"],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_CAN_LOCKON_TARGET",
        fields: ['skill', "success", "unk", 'target'],
        fieldSelector: {
            skill: 'id'
        }
    }, {
        name: "S_CREATURE_LIFE",
        fields: ['alive', 'inShuttle', "loc"],
        gameId: "gameId"
    }, {
        name: "C_HIT_USER_PROJECTILE",
        fields: ['id', 'end', "loc"]
    }, {
        name: "S_START_USER_PROJECTILE",
        fields: ['skill', 'id', "loc", "dest", "curve", "distance", "speed", "projectileSpeed"],
        gameId: 'gameId',
        fieldSelector: {
            skill: 'id'
        }
    }];

    // Utility functions
    
    /*
     * Formats values for logging by rounding numbers and handling different data types
     * @param {Object} data - The data object to format
     * @returns {Object|string} Formatted data or string representation
     */
    const formatValues = data => {
        // Handle location objects with x, y, z coordinates
        if (data.x !== undefined && data.y !== undefined && data.z !== undefined) {
            data.x = Math.round(data.x);
            data.y = Math.round(data.y);
            data.z = Math.round(data.z);
            return data.x + ':' + data.y + ':' + data.z;
        }

        // Process each property in the data object
        for (let key in data) {
            const value = data[key];
            
            switch (typeof value) {
                case "number":
                    // Round numbers to 3 decimal places
                    data[key] = +value.toFixed(3);
                    break;
                    
                case 'object': {
                    // Recursively format nested objects
                    const formattedValue = formatValues(value);
                    if (typeof formattedValue === "string") {
                        data[key] = formattedValue;
                    } else {
                        data[key] = mods.library.jsonStringify(formattedValue);
                    }
                    break;
                }
                
                case "boolean":
                    // Convert booleans to numbers (0/1)
                    data[key] = +value;
                    break;
                    
                case "bigint":
                    // No processing for bigint
                    break;
                    
                case "string":
                    // No processing for strings
                    break;
                    
                case "undefined":
                    return null;
                    
                default: {
                    throw new Error('Unsupported type ' + typeof value + ' for value: ' + value);
                }
            }
        }
        
        return data;
    };

    // Packet monitoring setup
    
    /*
     * Sets up a packet hook to monitor and log specific fields
     * @param {Object} definition - Packet definition with monitoring configuration
     * @param {string} definition.name - Name of the packet to monitor
     * @param {Array<string>} definition.fields - Fields to extract and log
     * @param {string} [definition.gameId] - Field containing the player's game ID
     * @param {string} [definition.overrideEvent] - Field to use instead of the main event
     * @param {Object} [definition.fieldSelector] - Selectors for nested fields
     * @param {Object} [definition.fieldRename] - Rename mappings for fields
     * @param {Object} [definition.requiresValue] - Required values for fields
     * @param {boolean} [definition.cache] - Whether to cache and skip duplicate messages
     */
    const setupPacketHook = ({
        name,
        fields,
        gameId = null,
        overrideEvent = null,
        fieldSelector = {},
        fieldRename = {},
        requiresValue = {},
        cache
    }) => {
        let lastLogMessage = null;    // Tracks the last logged message for caching
        
        mod.hook(...mods.packet.get_all(name), hooks.READ_ALL, (event, fake) => {
            // Skip if not related to the player
            if (gameId && !mods.player.isMe(event[gameId])) return;
            
            // Use override event if specified
            if (overrideEvent) event = event[overrideEvent];
            
            // Check required values
            for (const key in requiresValue) {
                if (requiresValue[key] !== event[key]) return;
            }
            
            // Extract field values
            let fieldValues = [];
            for (const field of fields) {
                let value = event[field];
                if (fieldSelector[field]) {
                    value = value[fieldSelector[field]];
                }
                fieldValues.push(value);
            }
            
            // Format values
            formatValues(fieldValues);
            
            // Create log message with direction indicator
            const fakeIndicator = fake ? 'F' : 'R';    // F for fake packets, R for real packets
            const directionIndicator = name[0] === 'C' ? fakeIndicator + '->' : '<-' + fakeIndicator;
            
            // Format field values with names
            fieldValues = directionIndicator + ' ' + fieldValues.map((value, index) => {
                const fieldName = fieldRename[fields[index]] || fields[index];
                return fieldName + ':' + value;
            }).join(' ');
            
            // Skip if message is the same as last one (for cached packets)
            if (cache && lastLogMessage === fieldValues) return;
            
            // Log the packet information
            lastLogMessage = fieldValues;
            mods.log.debug(name, fieldValues);
        });
    };
    // Initialize packet monitoring
    packetDefinitions.forEach(setupPacketHook);
};