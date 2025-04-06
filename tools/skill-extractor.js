'use strict'

/**
 * Rival Skill Extractor
 * 
 * This tool parses the XML skill data files from the server skilldata xml files
 * and converts them to optimized JSON format for use by the Rival mod.
 * 
 * Usage: node skill-extractor.js
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Configuration
const SOURCE_DIR = path.join(__dirname, '../../../omni_skill_data');
const OUTPUT_DIR = path.join(__dirname, '../data/skills');
const OUTPUT_ALL = path.join(OUTPUT_DIR, 'all-skills.json');
const OUTPUT_BY_CLASS = path.join(OUTPUT_DIR, 'by-class');
const OUTPUT_BY_CATEGORY = path.join(OUTPUT_DIR, 'by-category');

// XML Parser options
const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name, jpath, isLeafNode, isAttribute) => {
        // Define elements that should always be treated as arrays
        const arrayElements = [
            'StageList', 'Stage', 'AnimSeq', 'TargetingList', 'Targeting',
            'AreaList', 'Area', 'Effect', 'CameraShakeList', 'SpecialEffectList'
        ];
        return arrayElements.includes(name);
    }
};

// Create parser
const parser = new XMLParser(parserOptions);

// Main data structures
const allSkills = {};
const skillsByClass = {};
const skillsByCategory = {};

// Class name patterns for extraction from skill names
// Note: Some classes have different names in the files
const classNameMap = {
    'archer': 'archer',
    'berserker': 'berserker',
    'brawler': 'brawler',
    'gunner': 'gunner',
    'engineer': 'gunner',    // Gunner is called Engineer in the files
    'lancer': 'lancer',
    'elementalist': 'mystic', // Mystic is called Elementalist in the files
    'mystic': 'mystic',
    'ninja': 'ninja',
    'priest': 'priest',
    'reaper': 'reaper',
    'soulless': 'reaper',    // Reaper is called Soulless in the files
    'slayer': 'slayer',
    'sorcerer': 'sorcerer',
    'valkyrie': 'valkyrie',
    'warrior': 'warrior'
};

// Statistics
let totalFiles = 0;
let totalSkills = 0;
let skippedSkills = 0;
let errorCount = 0;
let classStats = {};

/**
 * Determine class from skill name
 * @param {string} skillName - The skill name
 * @returns {string|null} - The class name or null if not determined
 */
function determineClassFromName(skillName) {
    if (!skillName) return null;
    
    // Convert to lowercase for case-insensitive matching
    const lowerName = skillName.toLowerCase();
    
    // Check for each class name in the skill name
    for (const [searchTerm, className] of Object.entries(classNameMap)) {
        if (lowerName.includes(searchTerm)) {
            return className;
        }
    }
    
    return null;
}

/**
 * Extract relevant skill data from XML
 * @param {Object} skill - The skill XML object
 * @returns {Object} - The extracted skill data
 */
function extractSkillData(skill) {
    if (!skill || !skill.id) {
        return null;
    }

    try {
        // Determine class from skill name
        const className = determineClassFromName(skill.name);
        
        // Skip skills that don't have a class
        if (!className) {
            return null;
        }
        
        // Basic skill info
        const result = {
            id: parseInt(skill.id),
            type: skill.type || 'normal',
            templateId: parseInt(skill.templateId) || 0,
            name: skill.name || '',
            category: skill.category ? skill.category.split(',').map(c => parseInt(c.trim())) : [],
            timeRate: parseFloat(skill.timeRate) || 1,
            totalAtk: parseFloat(skill.totalAtk) || 0,
            
            // Class information
            class: className,
            
            // Default values
            animationDuration: 0,
            pendingStartTime: 0,
            coolTime: 0,
            mpCost: 0,
            hpCost: 0,
            nextSkill: parseInt(skill.nextSkill) || 0,
            movable: false,
            stages: []
        };

        // Extract action data
        if (skill.Action) {
            // Pending time
            if (skill.Action.Pending && skill.Action.Pending.startTime) {
                result.pendingStartTime = parseInt(skill.Action.Pending.startTime) || 0;
            }

            // Stage list
            if (skill.Action.StageList && Array.isArray(skill.Action.StageList.Stage)) {
                result.stages = skill.Action.StageList.Stage.map(stage => {
                    const stageData = {
                        duration: 0,
                        animRate: 1
                    };

                    // Extract animation data
                    if (stage.AnimSeq && Array.isArray(stage.AnimSeq)) {
                        const animSeq = stage.AnimSeq[0];
                        if (animSeq) {
                            stageData.duration = parseInt(animSeq.duration) || 0;
                            stageData.animRate = parseFloat(animSeq.animRate) || 1;
                        }
                    }

                    // Check if movable
                    if (stage.movable === 'true') {
                        result.movable = true;
                    }

                    return stageData;
                });

                // Calculate total animation duration
                result.animationDuration = result.stages.reduce((total, stage) => total + stage.duration, 0);
            }
        }

        // Extract precondition data (cooldown, costs)
        if (skill.Precondition) {
            result.coolTime = parseInt(skill.Precondition.coolTime) || 0;

            if (skill.Precondition.Cost) {
                result.mpCost = parseInt(skill.Precondition.Cost.mp) || 0;
                result.hpCost = parseInt(skill.Precondition.Cost.hp) || 0;
            }
        }

        // Extract targeting data
        if (skill.TargetingList && Array.isArray(skill.TargetingList.Targeting)) {
            const targeting = skill.TargetingList.Targeting[0];
            if (targeting && targeting.AreaList && Array.isArray(targeting.AreaList.Area)) {
                const area = targeting.AreaList.Area[0];
                if (area) {
                    result.maxRadius = parseInt(area.maxRadius) || 0;
                }
            }
        }

        return result;
    } catch (e) {
        console.error(`Error extracting data for skill ${skill.id}:`, e);
        errorCount++;
        return null;
    }
}

/**
 * Process a single XML file
 * @param {string} filePath - Path to the XML file
 */
function processFile(filePath) {
    try {
        console.log(`Processing ${filePath}...`);
        
        // Read and parse XML file
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const data = parser.parse(xmlData);
        
        // Check if we have skill data
        if (!data || !data.SkillData || !data.SkillData.Skill) {
            console.warn(`No skill data found in ${filePath}`);
            return;
        }
        
        // Convert to array if it's a single skill
        const skills = Array.isArray(data.SkillData.Skill) ? data.SkillData.Skill : [data.SkillData.Skill];
        
        // Process each skill
        for (const skill of skills) {
            const skillData = extractSkillData(skill);
            
            if (!skillData) {
                skippedSkills++;
                continue;
            }
            
            // Add to all skills
            allSkills[skillData.id] = skillData;
            
            // Add to class-specific collection
            if (skillData.class) {
                if (!skillsByClass[skillData.class]) {
                    skillsByClass[skillData.class] = {};
                    classStats[skillData.class] = 0;
                }
                skillsByClass[skillData.class][skillData.id] = skillData;
                classStats[skillData.class]++;
            }
            
            // Add to category-specific collections
            if (skillData.category && skillData.category.length > 0) {
                for (const category of skillData.category) {
                    if (!skillsByCategory[category]) {
                        skillsByCategory[category] = {};
                    }
                    skillsByCategory[category][skillData.id] = skillData;
                }
            }
            
            totalSkills++;
        }
    } catch (e) {
        console.error(`Error processing file ${filePath}:`, e);
        errorCount++;
    }
}

/**
 * Process all XML files in the source directory
 */
function processAllFiles() {
    // Check if source directory exists
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`Source directory ${SOURCE_DIR} does not exist!`);
        return;
    }
    
    // Create output directories if they don't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(OUTPUT_BY_CLASS)) {
        fs.mkdirSync(OUTPUT_BY_CLASS, { recursive: true });
    }
    if (!fs.existsSync(OUTPUT_BY_CATEGORY)) {
        fs.mkdirSync(OUTPUT_BY_CATEGORY, { recursive: true });
    }
    
    // Get all XML files
    const files = fs.readdirSync(SOURCE_DIR).filter(file => file.endsWith('.xml'));
    totalFiles = files.length;
    
    console.log(`Found ${totalFiles} XML files to process.`);
    
    // Process each file
    for (const file of files) {
        processFile(path.join(SOURCE_DIR, file));
    }
    
    // Write output files
    writeOutputFiles();
    
    // Print statistics
    console.log('\nExtraction complete!');
    console.log(`Processed ${totalFiles} files.`);
    console.log(`Extracted ${totalSkills} skills.`);
    console.log(`Skipped ${skippedSkills} skills.`);
    console.log(`Encountered ${errorCount} errors.`);
    console.log(`Found ${Object.keys(skillsByClass).length} classes.`);
    
    // Print class statistics
    console.log('\nSkills per class:');
    for (const className in classStats) {
        console.log(`  ${className}: ${classStats[className]} skills`);
    }
}

/**
 * Write the extracted data to output files
 */
function writeOutputFiles() {
    console.log('\nWriting output files...');
    
    // Write all skills
    const allSkillsData = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        skills: allSkills
    };
    //fs.writeFileSync() overwrites any existing files with the same name.  No appending, so there will not be duplicates.
    fs.writeFileSync(OUTPUT_ALL, JSON.stringify(allSkillsData, null, 2));
    console.log(`Wrote ${Object.keys(allSkills).length} skills to ${OUTPUT_ALL}`);
    
    // Write class-specific files
    for (const [className, skills] of Object.entries(skillsByClass)) {
        const classData = {
            version: '1.0',
            className,
            lastUpdated: new Date().toISOString(),
            skills
        };
        const outputPath = path.join(OUTPUT_BY_CLASS, `${className}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(classData, null, 2));
        console.log(`Wrote ${Object.keys(skills).length} skills to ${outputPath}`);
    }
    
    // Write category-specific files
    for (const [categoryId, skills] of Object.entries(skillsByCategory)) {
        // Only write categories with a significant number of skills
        if (Object.keys(skills).length < 5) continue;
        
        const categoryData = {
            version: '1.0',
            categoryId: parseInt(categoryId),
            lastUpdated: new Date().toISOString(),
            skills
        };
        const outputPath = path.join(OUTPUT_BY_CATEGORY, `category-${categoryId}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(categoryData, null, 2));
        console.log(`Wrote ${Object.keys(skills).length} skills to ${outputPath}`);
    }
}

// Check if fast-xml-parser is installed
try {
    require.resolve('fast-xml-parser');
} catch (e) {
    console.error('Error: fast-xml-parser module not found!');
    console.error('Please install it using: npm install fast-xml-parser');
    process.exit(1);
}

// Run the extraction process
console.log('Starting skill data extraction...');
processAllFiles();