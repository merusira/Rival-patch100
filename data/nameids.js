'use strict'

/**
 * Name Extractor for Rival Mod
 * 
 * This script extracts the "name" attribute from each skill in the XML files
 * and records which file it was found in. The extracted data is saved to
 * namesFound.json in the same directory.
 * 
 * Usage: node nameids.js
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Configuration
const SOURCE_DIR = path.join(__dirname, '../../../omni_skill_data');
const OUTPUT_FILE = path.join(__dirname, 'namesFound.json');

// XML Parser options
const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name, jpath, isLeafNode, isAttribute) => {
        // Define elements that should always be treated as arrays
        const arrayElements = ['Skill'];
        return arrayElements.includes(name);
    }
};

// Create parser
const parser = new XMLParser(parserOptions);

// Main data structure to store names and their source files
const namesData = {};

// Statistics
let totalFiles = 0;
let totalSkills = 0;
let uniqueNames = 0;

/**
 * Process a single XML file
 * @param {string} filePath - Path to the XML file
 * @param {string} fileName - Name of the file
 */
function processFile(filePath, fileName) {
    try {
        console.log(`Processing ${fileName}...`);
        
        // Read and parse XML file
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const data = parser.parse(xmlData);
        
        // Check if we have skill data
        if (!data || !data.SkillData || !data.SkillData.Skill) {
            console.warn(`No skill data found in ${fileName}`);
            return;
        }
        
        // Convert to array if it's a single skill
        const skills = Array.isArray(data.SkillData.Skill) ? data.SkillData.Skill : [data.SkillData.Skill];
        
        // Process each skill
        for (const skill of skills) {
            if (skill && skill.name) {
                const name = skill.name;
                
                // Add to namesData
                if (!namesData[name]) {
                    namesData[name] = [];
                    uniqueNames++;
                }
                
                // Add file to the list if not already there
                if (!namesData[name].includes(fileName)) {
                    namesData[name].push(fileName);
                }
                
                totalSkills++;
            }
        }
    } catch (e) {
        console.error(`Error processing file ${fileName}:`, e);
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
    
    // Get all XML files
    const files = fs.readdirSync(SOURCE_DIR).filter(file => file.endsWith('.xml'));
    totalFiles = files.length;
    
    console.log(`Found ${totalFiles} XML files to process.`);
    
    // Process each file
    for (const file of files) {
        processFile(path.join(SOURCE_DIR, file), file);
    }
    
    // Write output file
    writeOutputFile();
    
    // Print statistics
    console.log('\nExtraction complete!');
    console.log(`Processed ${totalFiles} files.`);
    console.log(`Extracted ${totalSkills} skills.`);
    console.log(`Found ${uniqueNames} unique names.`);
}

/**
 * Write the extracted data to the output file
 */
function writeOutputFile() {
    console.log(`\nWriting output to ${OUTPUT_FILE}...`);
    
    // Create output data
    const outputData = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        totalFiles,
        totalSkills,
        uniqueNames,
        names: namesData
    };
    
    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    
    console.log(`Successfully wrote data to ${OUTPUT_FILE}`);
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
console.log('Starting name extraction...');
processAllFiles();