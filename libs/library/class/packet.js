/*
 * Rival Mod - Packet System
 * 
 * packet.js provides packet version management for game protocol compatibility.
 * It maintains a database of packet versions for different game patches and
 * provides methods to retrieve the appropriate version for the current game client.
 */

// Packet version database organized by packet name, patch version, and protocol version
const PACKET_DATA = {
    /* ABNORMALITY PACKETS */
    "S_ABNORMALITY_BEGIN": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 75,
            "version": 3 
        },
        {
            "patch": 75, // just new format
            "version": 4
        },
        {
            "patch": 107,
            "version": 5
        }
    ],

    "S_ABNORMALITY_REFRESH": [
        {
            "patch": 67,
            "version": 1
        },
        {
            "patch": 75, // just new format
            "version": 2
        }
    ],

    "S_ABNORMALITY_END": [
        {
            "patch": 67,
            "version": 1
        }
    ],

    "S_HOLD_ABNORMALITY_ADD": [
        {
            "patch": 67,
            "version": 2
        }
    ],

    "S_CLEAR_ALL_HOLDED_ABNORMALITY": [
        {
            "patch": 67,
            "version": 1
        }
    ],

    /* ACTION PACKETS */

    "S_ACTION_STAGE": [
        {
            "patch": 67,
            "version": 6
        },
        {
            "patch": 74,
            "version": 7
        },
        {
            "patch": 75,
            "version": 8
        },
        {
            "patch": 75,
            "version": 9
        }
    ],

    "S_ACTION_END": [
        {
            "patch": 67,
            "version": 4
        },
        {
            "patch": 74,
            "version": 5
        }
    ],

    /* Glyph packets */
    
    "S_CREST_INFO": [
        {
            "patch": 67,
            "version": 1
        },
        {
            "patch": 67,
            "version": 2
        }
    ],

    "S_CREST_APPLY": [
        {
            "patch": 67,
            "version": 1
        },
        {
            "patch": 67,
            "version": 2
        }
    ],

    "S_LOAD_EP_INFO": [
        {
            "patch": 67,
            "version": 1
        },
        {
            "patch": 96,
            "version": 2
        },
        {
            "patch": 105,
            "version": 3,
        }
    ],

    "S_PLAYER_RESET_EP": [
        {
            "patch": 67,
            "version": 1
        }
    ],

    "S_LEARN_EP_PERK": [
        {
            "patch": 67,
            "version": 1
        }
    ],

    /* PROJECTILE PACKETS */

    "S_START_USER_PROJECTILE": [
        {
            "patch": 67,
            "version": 5
        },
        {
            "patch": 74,
            "version": 8
        },
        {
            "patch": 75,
            "version": 9
        },
    ],

    "S_SPAWN_PROJECTILE": [
        {
            "patch": 67,
            "version": 4
        },
        {
            "patch": 74,
            "version": 5
        }
    ],

    "S_END_USER_PROJECTILE": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 75,
            "version": 4
        },
    ],

    "S_DESPAWN_PROJECTILE": [
        {
            "patch": 67,
            "version": 2
        },
    ],

    /* START SKILL PACKETS */

    "C_START_SKILL": [
        {
            "patch": 67,
            "version": 6
        },
        {
            "patch": 74,
            "version": 7
        },
    ],

    "C_START_TARGETED_SKILL": [
        {
            "patch": 67,
            "version": 5
        },
        {
            "patch": 74,
            "version": 6
        },
        {
            "patch": 74,
            "version": 7
        },
    ],

    "C_START_COMBO_INSTANT_SKILL": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
        {
            "patch": 74,
            "version": 5
        },
        {
            "patch": 74,
            "version": 6
        },
    ],

    "C_START_INSTANCE_SKILL": [
        {
            "patch": 67,
            "version": 4
        },
        {
            "patch": 74,
            "version": 5
        },
        {
            "patch": 74,
            "version": 6
        },
        {
            "patch": 74,
            "version": 7
        },
        {
            "patch": 114,
            "version": 8
        }
    ],

    "C_START_INSTANCE_SKILL_EX": [
        {
            "patch": 67,
            "version": 4
        },
        {
            "patch": 74,
            "version": 5
        },
    ],

    "C_PRESS_SKILL": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
        {
            "patch": 114,
            "version": 5
        }
    ],

    "C_NOTIMELINE_SKILL": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    /* MOVEMENT PACKETS */

    "C_PLAYER_LOCATION": [
        {
            "patch": 67,
            "version": 5
        },
    ],

    "C_NOTIFY_LOCATION_IN_ACTION": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
    ],

    "C_NOTIFY_LOCATION_IN_DASH": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
    ],

    "S_INSTANT_MOVE": [
        {
            "patch": 67,
            "version": 3
        },
    ],

    "S_INSTANT_DASH": [
        {
            "patch": 67,
            "version": 3
        },
    ],

    "S_INSTANCE_ARROW": [
        {
            "patch": 74,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
    ],

    /* Other skill PACKETS */

    "S_GRANT_SKILL": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    "S_SKILL_CATEGORY": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 110,
            "version": 4
        },
    ],

    "S_START_COOLTIME_SKILL": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
        {
            "patch": 114,
            "version": 4
        }
    ],

    "S_DECREASE_COOLTIME_SKILL": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
        {
            "patch": 114,
            "version": 4
        }
    ],

    "S_DEFEND_SUCCESS": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    "S_CONNECT_SKILL_ARROW": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    "C_CANCEL_SKILL": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    "C_HIT_USER_PROJECTILE": [
        {
            "patch": 67,
            "version": 4
        }
    ],

    /* Lockon PACKETS */

    "S_CAN_LOCKON_TARGET": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    "C_CAN_LOCKON_TARGET": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 74,
            "version": 3
        },
    ],

    /* Misc packets PACKETS */

    "S_LOGIN": [
        {
            "patch": 67,
            "version": 10
        },
        {
            "patch": 77,
            "version": 12
        },
        {
            "patch": 81,
            "version": 13
        },
        {
            "patch": 86,
            "version": 14
        },
        {
            "patch": 114,
            "version": 15
        }
    ],

    "S_CREST_MESSAGE": [
        {
            "patch": 67,
            "version": 2
        },
    ],

    "S_CREATURE_LIFE": [
        {
            "patch": 67,
            "version": 2
        },
        {
            "patch": 67,
            "version": 3
        },
    ],

    "S_EACH_SKILL_RESULT": [
        {
            "patch": 67,
            "version": 10
        },
        {
            "patch": 74,
            "version": 12
        },
        {
            "patch": 75, // technically patch 74
            "version": 13
        },
        {
            "patch": 86,
            "version": 14
        },
        {
            "patch": 110,
            "version": 15
        }
    ],

    "S_LOAD_TOPO": [
        {
            "patch": 67,
            "version": 3
        },
    ],

    "S_DESPAWN_USER": [
        {
            "patch": 67,
            "version": 3
        },
    ],

    "S_CANNOT_START_SKILL": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        },
    ],

    "S_SYSTEM_MESSAGE": [
        {
            "patch": 67,
            "version": 1
        },
    ],

    "S_PARTY_MEMBER_STAT_UPDATE": [
        {
            "patch": 67,
            "version": 3,
        },
        {
            "patch": 108,
            "version": 4
        }
    ],

    "S_PLAYER_STAT_UPDATE": [
        {
            "patch": 67,
            "version": 8
        },
        {
            "patch": 75,
            "version": 10
        },
        {
            "patch": 75,
            "version": 11
        },
        {
            "patch": 80,
            "version": 12
        },
        {
            "patch": 86,
            "version": 13
        },
        {
            "patch": 93,
            "version": 14
        },
        {
            "patch": 105,
            "version": 15,
        },
        {
            "patch": 106,
            "version": 16,
        },
        {
            "patch": 108,
            "version": 17
        }
    ],

    "S_START_INVERSE_CAPTURE": [
        {
            "patch": 67,
            "version": 3
        },
        {
            "patch": 74,
            "version": 4
        }
    ],

    "S_REQUEST_REACTION_POS_TICK": [
        {
            "patch": 75,
            "version": 1
        }
    ],

    "C_UPDATE_REACTION_POS": [
        {
            "patch": 75,
            "version": 1
        }
    ],

    "S_STICK_TO_USER_START": [
        {
            "patch": 75,
            "version": 1
        }
    ],

    "S_CHANGE_RELATION": [
        {
            "patch": 90,
            "version": 1,
        }
    ],

    "S_STICK_TO_USER_END": [
        {
            "patch": 75,
            "version": 2
        }
    ],

    "C_USE_ITEM": [
        {
            "patch": 75,
            "version": 3
        }
    ],

    "S_START_COOLTIME_ITEM": [
        {
            "patch": 75,
            "version": 1
        }
    ],

    "S_RP_SKILL_POLISHING_LIST": [
        {
            "patch": 80,
            "version": 1
        }
    ],

    "S_SPAWN_USER": [
        {
            "patch": 80,
            "version": 15
        },
        {
            "patch": 99,
            "version": 16
        }
    ],

    "S_SPAWN_NPC": [
        {
            "patch": 80,
            "version": 11
        },
        {
            "patch": 101,
            "version": 12
        },
    ],

    "S_DESPAWN_NPC": [
        {
            "patch": 80,
            "version": 3
        }
    ],

    "S_NPC_LOCATION": [
        {
            "patch": 80,
            "version": 3
        }
    ],

    "S_USER_LOCATION": [
        {
            "patch": 80,
            "version": 5
        },
        {
            "patch": 105,
            "version": 6,
        }
    ],

    "S_CREATURE_ROTATE": [
        {
            "patch": 80,
            "version": 2
        }
    ],
    
    "S_USER_LEVELUP": [
        {
            "patch": 80,
            "version": 2
        }
    ],
    
    "S_DESPAWN_NPC": [
        {
            "patch": 80,
            "version": 3
        }
    ],
    
    "S_CURRENT_CHANNEL": [
        {
            "patch": 80,
            "version": 2
        }
    ],
    
    "S_PLAYER_CHANGE_STAMINA": [
        {
            "patch": 80,
            "version": 1
        }
    ],
    
    "S_CREATURE_CHANGE_HP": [
        {
            "patch": 80,
            "version": 6
        }
    ],
    
    "S_PLAYER_CHANGE_MP": [
        {
            "patch": 80,
            "version": 1
        }
    ],
    
    "S_MOUNT_VEHICLE": [
        {
            "patch": 80,
            "version": 2
        }
    ],
    
    "S_UNMOUNT_VEHICLE": [
        {
            "patch": 80,
            "version": 2
        }
    ],
    
    "S_PARTY_MEMBER_LIST": [
        {
            "patch": 80,
            "version": 8,
        },
        {
            "patch": 106,
            "version": 9,
        }
    ],
    
    "S_ITEMLIST": [
        {
            "patch": 80,
            "version": 1
        },
        {
            "patch": 86,
            "version": 2
        },
        {
            "patch": 87,
            "version": 3
        },
        {
            "patch": 96,
            "version": 4
        },
        {
            "patch": 107,
            "version": 5
        },
        {
            "patch": 109,
            "version": 6
        },
        {
            "patch": 114,
            "version": 7
        }
    ],
    
    "S_INVEN": [
        {
            "patch": 67,
            "version": 10
        },
        {
            "patch": 74,
            "version": 13
        },
        {
            "patch": 80,
            "version": 16
        },
        {
            "patch": 85,
            "version": 17
        },
        {
            "patch": 86,
            "version": 18
        },
        {
            "patch": 100,
            "version": 19
        }
    ],

    "C_CHECK_VERSION": [
        {
            "patch": 80,
            "version": 1
        }
    ],

    "S_USER_STATUS": [
        {
            "patch": 80,
            "version": 3
        },
        {
            "patch": 108,
            "version": 4
        },
    ],

    "S_FEARMOVE_STAGE": [
        {
            "patch": 90,
            "version": 2
        }
    ],

    "S_FEARMOVE_END": [
        {
            "patch": 90,
            "version": 2
        }
    ],

    "C_REQUEST_ABNORMALITY_TOOLTIP_VALUE": [
        {
            "patch": 94,
            "version": 1
        }
    ],

    "S_ABNORMALITY_TOOLTIP_VALUE": [
        {
            "patch": 94,
            "version": 1
        }
    ],

    "TTB_S_LOAD_EP_PAGE": [
        {
            "patch": 96,
            "version": 1
        }
    ],
    "S_LOAD_EP_PAGE": [
        {
            "patch": 96,
            "version": 1
        }
    ],

    "S_SKILL_LIST": [
        {
            "patch": 90,
            "version": 2
        }
    ],

    "S_GET_USER_LIST": [
        {
            "patch": 86,
            "version": 17,
        },
        {
            "patch": 95,
            "version": 18,
        },
        {
            "patch": 104,
            "version": 21,
        },
    ],

    "S_LOGIN_ACCOUNT_INFO": [
        {
            "patch": 60,
            "version": 2,
        },
        {
            "patch": 93,
            "version": 3,
        },
    ],

    "S_WEAK_POINT": [
        {
            "patch": 60,
            "version": 1,
        },
        {
            "patch": 114,
            "version": 2,
        },
    ],
};
const fs = require('fs');
const path = require('path');
/*
 * PacketHandler class
 *
 * Manages packet version compatibility between different game client versions.
 * Provides methods to retrieve the appropriate packet version for the current game client,
 * with fallback mechanisms to ensure compatibility.
 */
class PacketHandler {
	/*
     * Creates a new PacketHandler instance
     * @param {Object} dispatch - The dispatch interface for hooking events and sending packets
     */
    constructor(dispatch) {
        this.dispatch = dispatch;
        
        // Try to get the data directory from the library-loader
        this.dataDir = this.getDataDirectoryFromLoader();
        
        if (this.dataDir) {
            // Check if definitions directory exists
            const defsDir = path.join(this.dataDir, 'definitions');
            if (fs.existsSync(defsDir)) {
                try {
                    const defFiles = fs.readdirSync(defsDir);
                    // Store the count but don't log it
                    this.defFilesCount = defFiles.length;
                } catch (e) {
                    // Silently handle error
                    this.defFilesCount = 0;
                }
            }
        }
    }
    
    /*
     * Gets the data directory from the library-loader or by traversing directories
     * @returns {string|null} The data directory path or null if not found
     * @private
     */
    getDataDirectoryFromLoader() {
        try {
            // First try to find the library-loader in the current process
            if (global.LibraryLoader && global.LibraryLoader.dataDir) {
                return global.LibraryLoader.dataDir;
            }
            
            // If not found, try to find it by traversing directories
            let currentDir = __dirname;
            
            // Traverse up to find the patch100 directory
            for (let i = 0; i < 10; i++) {
                currentDir = path.dirname(currentDir);
                
                // Check for patch100 structure first
                if (path.basename(currentDir) === 'patch100') {
                    const dataDir = path.join(currentDir, 'data');
                    if (fs.existsSync(dataDir)) {
                        return dataDir;
                    }
                }
                
                // Check if we're in the mods directory
                if (path.basename(currentDir) === 'mods') {
                    // Try patch100 structure
                    const patchDir = path.dirname(currentDir);
                    if (path.basename(patchDir) === 'patch100') {
                        const dataDir = path.join(patchDir, 'data');
                        if (fs.existsSync(dataDir)) {
                            return dataDir;
                        }
                    }
                    
                    // Try classic structure
                    const toolboxRoot = path.dirname(currentDir);
                    const dataDir = path.join(toolboxRoot, 'data');
                    if (fs.existsSync(dataDir)) {
                        return dataDir;
                    }
                }
                
                // If we've reached the root of the filesystem, stop searching
                if (currentDir === path.dirname(currentDir)) {
                    break;
                }
            }
        } catch (e) {
            // Silently handle error
        }
        
        return null;
    }
    
    /*
     * Checks if a packet definition exists in the TeraToolbox data directory
     * @param {string} name - The packet name
     * @param {number} version - The packet version
     * @returns {boolean} Whether the definition exists
     * @private
     */
    checkDefinitionExists(name, version) {
        if (!this.dataDir) return false;
        
        const defPath = path.join(this.dataDir, 'definitions', `${name}.${version}.def`);
        return fs.existsSync(defPath);
    }

    /*
     * Gets the appropriate packet version for the specified packet name
     * @param {string} name - The packet name
     * @param {number} [patchOverride] - Optional patch version override
     * @returns {number} The packet version
     * @throws {Error} If the packet name is invalid
     */
    get(name, patchOverride) {
        const array = PACKET_DATA[name];
        if(!array) throw new Error(`PacketHandler looking for invalid packet name ${name}`);
        
        // Try to get patch version from multiple sources
        let patch = patchOverride;
        if (!patch) {
            // Try to get from dispatch.majorPatchVersion
            if (this.dispatch && this.dispatch.majorPatchVersion) {
                patch = this.dispatch.majorPatchVersion;
            }
            // Try to get from library object if available
            else if (this.dispatch && this.dispatch.library && this.dispatch.library.majorPatchVersion) {
                patch = this.dispatch.library.majorPatchVersion;
            }
            // Default to patch 100 if not available
            else {
                patch = 100;
            }
        }

        // First try to find a version that exists in the TeraToolbox data directory
        if (this.dataDir) {
            // Try versions from newest to oldest
            const versionsToTry = [];
            
            // Add versions from the hardcoded data
            if (array && array.length > 0) {
                for (const entry of array) {
                    if (!versionsToTry.includes(entry.version)) {
                        versionsToTry.push(entry.version);
                    }
                }
            }
            
            // Add some common versions if they're not already included
            for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
                if (!versionsToTry.includes(v)) {
                    versionsToTry.push(v);
                }
            }
            
            // Sort versions in descending order (newest first)
            versionsToTry.sort((a, b) => b - a);
            
            // Try each version
            for (const version of versionsToTry) {
                if (this.checkDefinitionExists(name, version)) {
                    return version;
                }
            }
        }
        
        // If we couldn't find a definition in the TeraToolbox data directory, fall back to the hardcoded data
        let version = null;
        for(let idx in array) {
            const obj = array[idx];
            if(patch >= obj.patch) version = obj.version;
        }

        if(version === null) {
            // Use the latest known version as a fallback
            if(array.length > 0) {
                version = array[array.length - 1].version;
            } else {
                // If no versions are defined, use version 1 as a last resort
                version = 1;
            }
        }

        return version;
    }
    get_all(name) {
        return [name, this.get(name)];
    }
}
// Export PacketHandler class
module.exports = PacketHandler;