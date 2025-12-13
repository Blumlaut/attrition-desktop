const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const unzipper = require('unzipper');

// Function to get the config file path
const getConfigPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
};

// Function to read saved URL
const readSavedUrl = () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(config);
      console.log('Read saved URL from config:', data.url);
      return data.url || 'https://blancpaw-gt.uk';
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  console.log('Using default URL');
  return 'https://blancpaw-gt.uk';
};

// Function to save URL
const saveUrl = (url) => {
  try {
    console.log('Saving URL to config:', url);
    const configPath = getConfigPath();
    const config = { url };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('URL saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
};

// Function to save complete configuration
const saveConfig = (config) => {
  try {
    console.log('Saving complete config:', config);
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Configuration saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
};

// Function to read saved configuration
const readSavedConfig = () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(config);
      console.log('Read saved configuration from config:', data);
      return data;
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  console.log('Using default configuration');
  return {};
};

// Function to get configured livery directory
const getConfiguredLiveryDirectory = () => {
  const config = readSavedConfig();
  // Check for both liveryDirectory and documentsFolder (backward compatibility)
  return config.liveryDirectory || config.documentsFolder || null;
};

// Function to save configured livery directory
const saveConfiguredLiveryDirectory = (directory) => {
  try {
    const config = readSavedConfig();
    config.liveryDirectory = directory;
    return saveConfig(config);
  } catch (error) {
    console.error('Error saving livery directory config:', error);
    return false;
  }
};

// Function to get livery path with automatic detection
const getAutoDetectDocumentsPath = () => {
  const homeDir = app.getPath('home');
  
  // Check if we're on Windows or Linux
  if (process.platform === 'win32') {
    // Windows: Documents/Assetto Corsa Competizione
    return path.join(homeDir, 'Documents', 'Assetto Corsa Competizione');
  } else if (process.platform === 'linux') {
    // Linux: Steam path
    return path.join(homeDir, '.steam', 'steam', 'steamapps', 'compatdata', '805550', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'Assetto Corsa Competizione');
  } else {
    // For other platforms (macOS), use Documents path
    return path.join(homeDir, 'Documents', 'Assetto Corsa Competizione');
  }
};

// Function to validate if a directory exists and is accessible
const validateDirectory = (dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      const stats = fs.statSync(dirPath);
      return stats.isDirectory();
    }
    return false;
  } catch (error) {
    console.error('Error validating directory:', error);
    return false;
  }
};

// Helper function to select documents folder
const selectDocumentsFolder = async () => {
  console.log('Selecting documents folder');
  
  try {
    const homeDir = app.getPath('home');
    
    // Get auto-detected livery path or fallback to home directory
    const autoDetectPath = getAutoDetectDocumentsPath();
    const defaultPath = validateDirectory(autoDetectPath) ? autoDetectPath : homeDir;
    
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Assetto Corsa Competizione Documents Folder',
      message: 'Please select the Assetto Corsa Competizione Documents folder.',
      defaultPath: defaultPath
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    
    // Validate that the selected folder contains a Customs subfolder
    const selectedFolder = result.filePaths[0];
    const customsSubfolder = path.join(selectedFolder, 'Customs');
    
    if (validateDirectory(customsSubfolder)) {
      // If Customs folder exists within selected folder, return it
      return { 
        path: customsSubfolder,
        canceled: false
      };
    } else {
      // If no Customs subfolder exists, ask user if they want to create it
      const response = await dialog.showMessageBox({
        type: 'question',
        title: 'Customs Folder Not Found',
        message: `The selected folder does not look like an ACC Documents Folder. This is usually because you selected the wrong folder, are you sure you want to continue?`,
        buttons: ['Continue', 'Cancel']
      });
      
      if (response.response === 0) {
        // Create Customs folder
        fs.mkdirSync(customsSubfolder, { recursive: true });
        return { 
          path: customsSubfolder,
          canceled: false
        };
      } else {
        return { canceled: true };
      }
    }
  } catch (error) {
    console.error('Error selecting documents folder:', error);
    throw new Error(`Failed to select documents folder: ${error.message}`);
  }
};

// Function to save minimize to tray preference
const saveMinimizeToTrayPreference = (shouldMinimize) => {
  try {
    const config = readSavedConfig();
    config.minimizeToTray = shouldMinimize;
    return saveConfig(config);
  } catch (error) {
    console.error('Error saving minimize to tray preference:', error);
    return false;
  }
};

module.exports = {
  getConfigPath,
  readSavedUrl,
  saveUrl,
  saveConfig,
  readSavedConfig,
  getConfiguredLiveryDirectory,
  saveConfiguredLiveryDirectory,
  getAutoDetectDocumentsPath,
  validateDirectory,
  selectDocumentsFolder,
  saveMinimizeToTrayPreference
};
