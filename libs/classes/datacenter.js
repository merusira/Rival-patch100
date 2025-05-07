/*
 * Rival Mod - Game Data System
 *
 * datacenter.js serves as the central repository for game data.
 * It loads, processes, and provides access to various game data including skills,
 * abnormalities, NPCs, and user information through a query interface.
 *
 * Datacenter class
 *
 * Provides methods to query and access game data from various sources.
 * Handles loading and processing of game data during initialization
 * and provides a clean interface for other modules to access this data.
 */
class Datacenter {
  /*
   * Creates a new Datacenter instance
   * @param {Object} mod - The mod object
   * @param {Object} mods - Additional mods
   */
  constructor(mod, mods) {
    const isMainInstance = !mods;
    this.mod = mod;                // Reference to the mod object
    this.mods = mods;              // References to other modules
    
    // Initialize data storage containers
    this.info = {
      userData: {},                // User/character data by user ID
      continentChannelType: {},    // Channel types for each continent
      skillConfigInfo: {},         // Skill configuration by channel type
      abnormality: {},             // Abnormality data by abnormality ID
      passivity: {},               // Passivity data by passivity ID
      ccInfo: {},                  // Crowd control info by abnormality ID
      npcData: {},                 // NPC data by hunting zone and NPC ID
      knockdownInfo: {},           // Knockdown skills by job ID
      loaded: false                // Whether data has been loaded
    };
    
    // Handle different initialization scenarios
    if (isMainInstance) {
      // Main instance: load data when client is ready
      mod.clientInterface.once("ready", () => {
        this.__loadData()
          .then(() => {
            console.log("Rival initialized with game data.");
            this.info.loaded = true;
          })
          .catch(error => {
            console.log(error);
            this.info.loaded = true;
          });
      });
    } else if (mods.utils) {
      // Secondary instance with utils: load data immediately
      this.__loadData()
        .then(() => console.log("mods == true - Rival initialized with game data."))
        .catch(console.log);
    } else {
      // Other instances: wait for main instance to load data
      (async () => {
        while (!mod.clientMod.info.loaded) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.info = mod.clientMod.info;
      })();
    }
  }

  // Data access methods
  
  /*
   * Get disabled skill categories for a specific zone
   * @param {number} zoneId - The zone ID to check
   * @returns {Array} Array of disabled skill categories
   */
  getDisabledCategoriesInZone = zoneId => {
    const channelType = this.info.continentChannelType[zoneId];
    return this.info.skillConfigInfo[channelType];
  };

  /*
   * Check if a skill ID is a knockdown skill for the current player
   * @param {number} skillId - The skill ID to check
   * @returns {boolean} True if the skill is a knockdown skill
   */
  isKnockDown = skillId => {
    const { player } = this.mods;
    return this.info.knockdownInfo[player.job].includes(skillId);
  };

  /*
   * Get crowd control information for an abnormality
   * @param {number} abnormalityId - The abnormality ID
   * @returns {Object} Crowd control information
   */
  getCcInfo = abnormalityId => {
    return this.info.ccInfo[abnormalityId];
  };

  /*
   * Get data for a specific abnormality
   * @param {number} abnormalityId - The abnormality ID
   * @returns {Object} Abnormality data
   */
  getAbnormalityData = abnormalityId => {
    return this.info.abnormality[abnormalityId];
  };

  /*
   * Get passivity data for a specific ID
   * @param {number} passivityId - The passivity ID
   * @returns {Object} Passivity data
   */
  getPassivityData = passivityId => {
    return this.info.passivity[passivityId];
  };

  /*
   * Get NPC data for a specific hunting zone and NPC ID
   * @param {number} huntingZoneId - The hunting zone ID
   * @param {number} npcId - The NPC ID
   * @returns {Object} NPC data
   */
  getNpcData = (huntingZoneId, npcId) => {
    return this.info.npcData[huntingZoneId][npcId];
  };

  /*
   * Get user data for a specific user ID
   * @param {number} userId - The user ID
   * @returns {Object} User data
   */
  getUserData = userId => {
    return this.info.userData[userId];
  };

  // Query utility methods
  
  /*
   * Execute a query with parameters against the game's data files
   * This is a low-level method used by other data loading methods to retrieve data
   * using the game's query syntax.
   *
   * @param {string} query - The query to execute (e.g., "/UserData/")
   * @param {...any} params - Query parameters for parameterized queries
   * @returns {Promise<any>} Query result from the game data
   * @private - Internal method, not intended for external use
   */
  async __query(query, ...params) {
    params = [...params];
    try {
      return await this.mod.queryData(query, params, params.length !== 0);
    } catch (error) {
      console.log("FATAL ERROR in Library. Failed to execute query:", query);
      throw new Error(error);
    }
  }

  /*
   * Execute multiple queries and combine their results into a single array
   * Used for efficiently retrieving data that requires multiple separate queries,
   * such as data split across different ID ranges.
   *
   * @param {Array} queries - Array of query arrays, each formatted as [query, ...params]
   * @returns {Promise<Array>} Combined query results from all queries
   * @private - Internal method, not intended for external use
   */
  async __queryM(queries) {
    let results = [];
    for (const [query, ...params] of queries) {
      results.push(await this.mod.queryData(query, params, true));
    }
    return results.reduce((accumulator, result) => {
      accumulator.push(...result);
      return accumulator;
    }, []);
  }

  /*
   * Execute a file query with advanced options for result formatting
   * This specialized query method is used for retrieving structured data from game files
   * and provides options for how the results should be processed and formatted.
   *
   * @param {string} query - The query to execute (e.g., "/UserData/")
   * @param {boolean} mergeResults - Whether to merge multiple results into a single object
   * @param {boolean} isMulti - Whether the query returns multiple results
   * @param {boolean} keepOriginal - Whether to keep original data structure
   * @param {Object} customData - Custom data to include in the query
   * @returns {Promise<Object>} Formatted query result with attributes and children
   * @private - Internal method, not intended for external use
   */
  async __queryF(query, mergeResults = true, isMulti = true, keepOriginal = true, customData = null) {
    let result;
    try {
      result = await this.mod.queryData(query, [], isMulti, keepOriginal, customData);
    } catch (error) {
      console.log("FATAL ERROR in Library. Failed to execute query:", query);
      throw new Error(error);
    }
    
    let formattedResult = {
      attributes: {},
      children: []
    };
    
    if (mergeResults) {
      for (const item of Array.isArray(result) ? result : [result]) {
        formattedResult.attributes = {
          ...formattedResult.attributes,
          ...item.attributes
        };
        formattedResult.children.push(...item.children);
      }
    } else {
      formattedResult = result;
    }
    
    return formattedResult;
  }

  // Data loading methods
  
  /*
   * Load user data from the game and process it for internal use
   * Retrieves character data including race, class, and gender information.
   * Handles special cases like female popori (mapped to elin) and
   * standardizes class names to their display format.
   *
   * @returns {Promise<void>} Resolves when user data is loaded
   * @private - Internal method, called during initialization
   */
  _getUserData = async () => {
    const userData = await this.__queryF("/UserData/");
    for (const { attributes: userAttributes } of userData.children) {
      if (userAttributes.race === "popori" && userAttributes.gender === "female") {
        userAttributes.race = "elin";
      }
      
      userAttributes.name = userAttributes.class;
      userAttributes.class = {
        "warrior": "Warrior",
        "lancer": "Lancer",
        "slayer": "Slayer",
        "berserker": "Berserker",
        "sorcerer": "Sorcerer",
        "archer": "Archer",
        "priest": "Priest",
        "elementalist": "Mystic",
        "soulless": "Reaper",
        "engineer": "Gunner",
        "fighter": "Brawler",
        "assassin": "Ninja",
        "glaiver": "Valkyrie"
      }[userAttributes.class];
      
      this.info.userData[userAttributes.id] = userAttributes;
    }
  };

  /*
   * Load skill configuration data for different channel types
   * Retrieves information about which skill categories are disabled
   * in different types of game zones (PvP, PvE, etc.) and maps
   * continent IDs to their channel types.
   *
   * @returns {Promise<void>} Resolves when skill config data is loaded
   * @private - Internal method, called during initialization
   */
  _getSkillConfig = async () => {
    const skillConfig = await this.__queryF("/WorldData/SkillConfig/");
    for (const configItem of skillConfig.children) {
      const configName = configItem.name;
      if (!configName.startsWith("DisableIn")) {
        continue;
      }
      
      const channelType = configName.replace("DisableIn", '').toLowerCase();
      const continentData = await this.__query("/ContinentData/Continent@channelType=?/", channelType);
      
      for (const { attributes: continentAttributes } of continentData) {
        this.info.continentChannelType[continentAttributes.id] = channelType;
      }
      
      if (!this.info.skillConfigInfo[channelType]) {
        this.info.skillConfigInfo[channelType] = [];
      }
      
      this.info.skillConfigInfo[channelType].push(configItem.attributes.id);
    }
  };

  /*
   * Load abnormality (buff/debuff) data from game files
   * Retrieves comprehensive data about all abnormalities in the game,
   * including their effects, durations, and affected skill categories.
   * Processes the data into a structured format for efficient access.
   *
   * @returns {Promise<void>} Resolves when abnormality data is loaded
   * @private - Internal method, called during initialization
   */
  _getAbnormalityData = async () => {
    const abnormalityData = await this.__queryM([
      ["/Abnormality/Abnormal@id>=?", 100000],
      ["/Abnormality/Abnormal@id<?", 100000]
    ]);
    
    for (const { attributes: abnormalityAttributes, children: abnormalityChildren } of abnormalityData) {
      for (const { name: childName, attributes: childAttributes } of abnormalityChildren) {
        if (!abnormalityAttributes[childName]) {
          abnormalityAttributes[childName] = [];
        }
        abnormalityAttributes[childName].push(childAttributes);
      }
      
      const skillCategories = (abnormalityAttributes.bySkillCategory || '').split(",");
      abnormalityAttributes.bySkillCategory = [];
      
      for (const category of skillCategories) {
        if (category !== '') {
          abnormalityAttributes.bySkillCategory.push(+category);
        }
      }
      
      this.info.abnormality[abnormalityAttributes.id] = abnormalityAttributes;
    }
  };

  /*
   * Process abnormality effects to identify and categorize crowd control effects
   * Analyzes loaded abnormality data to extract crowd control information,
   * such as stuns, and creates a mapping of abnormality IDs to their
   * crowd control properties (duration, type, affected categories).
   *
   * @private - Internal method, called during initialization after abnormality data is loaded
   */
  _getAbnormalityEffects = () => {
    const excludedAbnormalities = [10158620, 10158621, 909745];
    const effectTypeMap = {
      211: "stunned"
    };
    
    for (const abnormality of Object.values(this.info.abnormality)) {
      for (const effect of abnormality.AbnormalityEffect || []) {
        switch (effect.type) {
          case 211: {
            if (excludedAbnormalities.includes(abnormality.id)) {
              break;
            }
            
            this.info.ccInfo[abnormality.id] = {
              dur: +abnormality.time,
              categories: abnormality.bySkillCategory,
              type: effectTypeMap[effect.type]
            };
            break;
          }
        }
      }
    }
  };

  /*
   * Load passivity (passive skill) data from game files
   * Retrieves information about passive skills and their effects,
   * including condition categories that determine when they activate.
   * Processes the data into a structured format for efficient access.
   *
   * @returns {Promise<void>} Resolves when passivity data is loaded
   * @private - Internal method, called during initialization
   */
  _getPassivityData = async () => {
    const passivityData = await this.__queryM([
      ["/Passivity/Passive@id>=?", 100000],
      ["/Passivity/Passive@id<?", 100000]
    ]);
    
    for (const { attributes: passivityAttributes, children: passivityChildren } of passivityData) {
      for (const { name: childName, attributes: childAttributes } of passivityChildren) {
        if (!passivityAttributes[childName]) {
          passivityAttributes[childName] = [];
        }
        passivityAttributes[childName].push(childAttributes);
      }
      
      const conditionCategories = (passivityAttributes.conditionCategory || '').split(",");
      passivityAttributes.conditionCategory = [];
      
      for (const category of conditionCategories) {
        if (category !== '') {
          passivityAttributes.conditionCategory.push(+category);
        }
      }
      
      this.info.passivity[passivityAttributes.id] = passivityAttributes;
    }
  };

  /*
   * Load NPC data from game files and calculate derived properties
   * Retrieves information about NPCs and calculates gameplay-relevant
   * properties such as whether they can be backstabbed, locked onto,
   * and their hitbox radius based on size and scale factors.
   *
   * @returns {Promise<void>} Resolves when NPC data is loaded
   * @private - Internal method, called during initialization
   */
  _getNpcData = async () => {
    const npcData = await this.__queryM([
      ["/NpcData@huntingZoneId>=?", 780],
      ["/NpcData@huntingZoneId<?", 780]
    ]);
    
    for (const { attributes: { huntingZoneId }, children: npcChildren } of npcData) {
      for (const { attributes: npcAttributes } of npcChildren) {
        const canBackstab = !npcAttributes.cannotPassThrough;
        const canLockOn = !(npcAttributes.isObjectNpc || npcAttributes.villager || npcAttributes.isServant);
        const resourceSize = npcAttributes.resourceSize || 100;
        const scale = npcAttributes.scale || 1;
        const size = npcAttributes.size;
        const sizeFactor = size === "medium" ? 0.25 : size === "small" ? 0.125 : 1;
        const radius = Math.max(75, resourceSize / scale * sizeFactor);
        
        if (!this.info.npcData[huntingZoneId]) {
          this.info.npcData[huntingZoneId] = {};
        }
        
        this.info.npcData[huntingZoneId][npcAttributes.id] = {
          backstab: canBackstab,
          lockon: canLockOn,
          radius: radius
        };
      }
    }
  };

  /*
   * Load knockdown skill data for each character class
   * Retrieves information about which skills can be used to
   * recover from knockdown states for each character class.
   * Maps this data to job IDs for efficient access during gameplay.
   *
   * @returns {Promise<void>} Resolves when knockdown data is loaded
   * @private - Internal method, called during initialization
   */
  _getKnockdownData = async () => {
    const classNames = new Set();
    for (const userData of Object.values(this.info.userData)) {
      classNames.add(userData.name.toLowerCase());
    }
    
    const hotKeyQuery = "/SkillHotKeyData/HotKey@class=?";
    const hotKeyData = await this.__queryM([...classNames].map(className => [hotKeyQuery, className]));
    
    for (const { attributes: hotKeyAttributes, children: hotKeyChildren } of hotKeyData) {
      const className = hotKeyAttributes.class.toLowerCase();
      const reactionSkills = hotKeyChildren
        .filter(child => child.name === "Reaction")
        .map(reaction => +reaction.attributes.id);
      
      for (const [userId, userData] of Object.entries(this.info.userData)) {
        if (className !== userData.name.toLowerCase()) {
          continue;
        }
        
        this.info.knockdownInfo[(+userId - 10101) % 100] = reactionSkills;
      }
    }
  };

  /*
   * Load all game data in sequence, respecting dependencies
   * This is the main data loading orchestrator that calls all individual
   * data loading methods in the correct order to ensure dependencies are met.
   * For example, abnormality effects processing requires abnormality data to be loaded first.
   *
   * @returns {Promise<void>} Resolves when all game data is loaded
   * @private - Internal method, called during initialization
   */
  __loadData = async () => {
    // Chain data loading methods in sequence to ensure dependencies are met
    await this._getUserData()
      .then(this._getSkillConfig)
      .then(this._getAbnormalityData)
      .then(this._getAbnormalityEffects)
      .then(this._getNpcData)
      .then(this._getKnockdownData);
  };
}
// Export the Datacenter class
module.exports = Datacenter;