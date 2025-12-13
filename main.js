const { app, BrowserWindow, ipcMain, dialog, session, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const unzipper = require('unzipper');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  console.log('electron-squirrel-startup triggered, quitting app');
  app.quit();
}

// Import config helpers
const {
  getConfigPath,
  readSavedUrl,
  saveUrl,
  saveConfig,
  readSavedConfig,
  getConfiguredLiveryDirectory,
  validateDirectory,
  selectDocumentsFolder,
  saveMinimizeToTrayPreference
} = require('./configHelpers');

let mainWindow;
let configWindow;
let tray = null;

// Create the system tray icon
function createTray() {
  // Create a simple icon (you can use a more sophisticated approach with actual icons)
  const iconPath = path.join(__dirname, 'icon.png');
  
  // Try to use a default icon if custom one doesn't exist
  try {
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      // Create a simple tray icon using nativeImage
      const image = nativeImage.createEmpty();
      tray = new Tray(image);
    }
  } catch (error) {
    console.error('Error creating tray icon:', error);
    // Fallback to empty tray icon
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  
  // Add click handler to restore window
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createMainWindow();
    }
  });
  
  // Add double-click handler to restore window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createMainWindow();
    }
  });
  
  tray.setToolTip('Attrition Desktop App');
}

// Create the main browser window
function createMainWindow() {
  console.log('Creating main window');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      enableRemoteModule: true,
      // Add preload script for better security
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // Load the saved URL or default
  const savedUrl = readSavedUrl();
  console.log('Loading URL in main window:', savedUrl);
  
  // Add error handling for the load operation
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('Main window failed to load:', errorDescription, errorCode);
    // Try to create a fallback or show an error
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile('error.html'); // Fallback to error page
    }
  });
  
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('Main window started loading');
  });
  
  mainWindow.webContents.on('did-stop-loading', () => {
    console.log('Main window finished loading');
  });
  
  mainWindow.webContents.on('dom-ready', () => {
    console.log('Main window DOM ready');
  });

  // Handle window close events - ask user if they want to minimize to tray or quit
  mainWindow.on('close', (event) => {
    console.log('Main window close event triggered');
    if (!app.isQuiting) {
      // Read the saved preference first
      const config = readSavedConfig();
      
      // Check if minimizeToTray preference exists in config
      const hasMinimizePreference = 'minimizeToTray' in config;
      const minimizeToTrayPreference = config.minimizeToTray;
      
      // If user has explicitly set a preference, use it without asking
      if (hasMinimizePreference) {
        event.preventDefault();
        
        if (minimizeToTrayPreference) {
          mainWindow.hide();
          console.log('Main window hidden, minimized to tray (user preference)');
        } else {
          app.isQuiting = true;
          mainWindow.destroy();
          console.log('Main window destroyed, closing completely (user preference)');
        }
      } else {
        // No preference saved yet - ask user for first time
        event.preventDefault();
        
        const response = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          title: 'Close Application',
          message: 'Do you want to close the application completely or minimize to system tray?',
          buttons: ['Minimize to Tray', 'Close Completely', 'Cancel'],
          defaultId: 0,
          cancelId: 2
        });
        
        if (response === 0) {
          // Minimize to tray - save preference for next time
          const newConfig = readSavedConfig();
          newConfig.minimizeToTray = true;
          saveConfig(newConfig);
          mainWindow.hide();
          console.log('Main window hidden, minimized to tray');
        } else if (response === 1) {
          // Close completely - save preference for next time
          const newConfig = readSavedConfig();
          newConfig.minimizeToTray = false;
          saveConfig(newConfig);
          app.isQuiting = true;
          mainWindow.destroy();
          console.log('Main window destroyed, closing completely');
        } else {
          // Cancel - prevent closing
          console.log('Close action cancelled by user');
        }
      }
    }
  });

  // Handle window closed events
  mainWindow.on('closed', () => {
    console.log('Main window closed');
    mainWindow = null;
  });

  // Load the URL with error handling
  try {
    mainWindow.loadURL(savedUrl);
  } catch (error) {
    console.error('Error loading main window URL:', error);
    // If we can't load the URL, create a fallback or log error
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile('error.html');
    }
  }
}

// Create the configuration window
function createConfigWindow() {
  console.log('Creating config window');
  configWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  configWindow.loadFile('config.html');
  
  configWindow.on('closed', () => {
    console.log('Config window closed');
    configWindow = null;
    // Check if we should quit the app when config window closes
    if (!mainWindow && BrowserWindow.getAllWindows().length === 0) {
      console.log('Quitting app as no main window and no other windows exist');
      app.quit();
    }
  });
}

// Initialize the app
function initializeApp() {
  console.log('Initializing app');
  
  // Set up IPC handlers
  ipcMain.handle('get-saved-url', async () => {
    console.log('IPC get-saved-url called');
    return readSavedUrl();
  });

  ipcMain.handle('get-saved-config', async () => {
    console.log('IPC get-saved-config called');
    return readSavedConfig();
  });

  ipcMain.handle('save-url', async (event, url) => {
    console.log('IPC save-url called with:', url);
    const success = saveUrl(url);
    if (success && mainWindow) {
      // Reload the main window with the new URL
      const savedUrl = readSavedUrl();
      console.log('Reloading main window with URL:', savedUrl);
      mainWindow.loadURL(savedUrl);
    }
    return success;
  });

  ipcMain.handle('save-config', async (event, config) => {
    console.log('IPC save-config called with:', config);
    const success = saveConfig(config);
    if (success && mainWindow) {
      // Reload the main window with the new URL if it exists
      const savedUrl = readSavedUrl();
      console.log('Reloading main window with URL:', savedUrl);
      mainWindow.loadURL(savedUrl);
    }
    return success;
  });

  // Handle config saved event - close config and reload main window
  ipcMain.handle('config-saved', async (event, url) => {
    console.log('IPC config-saved called with:', url);
    // Instead of just saving URL, we should merge with existing config to preserve documentsFolder
    const existingConfig = readSavedConfig();
    existingConfig.url = url;
    
    // Save the complete configuration to ensure both URL and documentsFolder are preserved
    const success = saveConfig(existingConfig);
    if (success) {
      console.log('Config saved successfully, processing next steps');
      // If we have a main window, reload it with the new URL
      if (mainWindow) {
        const savedUrl = readSavedUrl();
        console.log('Reloading main window with URL:', savedUrl);
        mainWindow.loadURL(savedUrl);
      } else {
        console.log('No main window exists yet, creating one');
        // If no main window exists yet, create it
        createMainWindow();
      }
      
      // Close the config window if it exists
      if (configWindow) {
        console.log('Closing config window via IPC handler');
        configWindow.close();
      } else {
        console.log('Config window already closed or not found');
      }
    }
    return success;
  });

  // Handle documents folder selection
  ipcMain.handle('select-documents-folder', async () => {
    console.log('IPC select-documents-folder called');
    const result = await selectDocumentsFolder();
    
    // If user selected a directory, save it to configuration for future use
    if (result && !result.canceled) {
      // Save the documents folder path as part of complete configuration
      const config = readSavedConfig();
      config.documentsFolder = result.path;
      saveConfig(config);
    }
    
    return result;
  });

  // Handle config reset - clear all saved configuration and restart
  ipcMain.handle('reset-config', async (event) => {
    console.log('IPC reset-config called, clearing all saved configuration');
    
    try {
      const configPath = getConfigPath();
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log('Configuration file cleared successfully');
      }
      
      // Close any existing windows
      if (mainWindow) {
        mainWindow.close();
        mainWindow = null;
      }
      if (configWindow) {
        configWindow.close();
        configWindow = null;
      }
      
      // Clear all windows and restart
      console.log('Relaunching application after reset');
      app.relaunch();
      app.exit(0);
      
      return { success: true, message: 'Configuration reset successfully' };
    } catch (error) {
      console.error('Error resetting configuration:', error);
      return { 
        success: false, 
        message: `Failed to reset configuration: ${error.message}` 
      };
    }
  });

  // Handle minimize to tray preference saving
  ipcMain.handle('save-minimize-to-tray-preference', async (event, shouldMinimize) => {
    console.log('IPC save-minimize-to-tray-preference called with:', shouldMinimize);
    return saveMinimizeToTrayPreference(shouldMinimize);
  });

  // Handle livery download and extraction with authentication using native fetch
  ipcMain.handle('download-event-liveries', async (event, eventId, baseUrl) => {
    console.log('IPC download-event-liveries called for event:', eventId);
    
    try {
      // Validate inputs
      if (!eventId || !baseUrl) {
        throw new Error('Missing required parameters: eventId and baseUrl');
      }

      // Construct the livery download URL
      const downloadUrl = `${baseUrl}/events/${eventId}/liveries`;
      console.log('Attempting to download livery ZIP from:', downloadUrl);
      
      // First check if we have a configured livery directory
      let documentsDir = getConfiguredLiveryDirectory() ;
      
      // If no configured directory, prompt user for selection (no auto-detection)
      if (!documentsDir) {
        console.log('No configured livery directory found, prompting user for selection');
        
        // Use the existing selectDocumentsFolder function to handle user selection
        const folderResult = await selectDocumentsFolder();
        
        if (folderResult.canceled) {
          throw new Error('No directory selected for liveries extraction');
        }
        
        documentsDir = folderResult.path;
        console.log('Final target directory:', documentsDir);
      } else {
        console.log('Using configured target directory:', documentsDir);
        // Validate that the configured directory still exists
        if (!validateDirectory(documentsDir)) {
          console.log('Configured directory does not exist or is inaccessible, prompting user for selection');
          
          // Use the existing selectDocumentsFolder function to handle user selection
          const folderResult = await selectDocumentsFolder();
          
          if (folderResult.canceled) {
            throw new Error('No directory selected for liveries extraction');
          }
          
          documentsDir = folderResult.path;
          console.log('Final target directory:', documentsDir);
        }
      }
      
      customsDir = documentsDir
      console.log('Using target directory:', customsDir);
      
      // Ensure the target directory exists
      fs.mkdirSync(customsDir, { recursive: true });
      
      // Create a temporary file for the ZIP
      const tempDir = app.getPath('temp');
      const zipFileName = `liveries_event_${eventId}.zip`;
      const zipPath = path.join(tempDir, zipFileName);
      
      console.log('Temporary ZIP path:', zipPath);
      
      // Download the ZIP file with session cookies from main window using native fetch
      let cookieString = '';
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          const cookies = await mainWindow.webContents.session.cookies.get({
            url: baseUrl
          });
          
          // Format cookies as a string
          cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
          console.log('Found session cookies for download:', cookieString ? 'Yes' : 'No');
        } catch (cookieError) {
          console.warn('Failed to get session cookies:', cookieError.message);
          // If we can't get cookies, proceed without them but log a warning
          console.warn('Proceeding without authentication cookies - you may need to be logged in through the web interface');
        }
      }
      
      // Download the ZIP file with retry logic and proper error handling
      const downloadFileWithRetry = async (url, destPath, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`Attempt ${attempt} to download from: ${url}`);
            
            // Create fetch options with proper headers and timeout
            const fetchOptions = {
              method: 'GET',
              headers: {
                'User-Agent': 'Attrition Desktop App/1.0',
                'Accept': '*/*',
                // Include session cookies if we have them
                ...(cookieString && cookieString.length > 0 ? { 'Cookie': cookieString } : {}),
              },
              // Set timeouts for better connection handling
              signal: AbortSignal.timeout(60000) // 60 second timeout
            };
            
            const response = await fetch(url, fetchOptions);
            
            // Handle HTTP errors
            if (!response.ok) {
              if (response.status === 401 || response.status === 403) {
                throw new Error(`Authentication required: ${response.status} ${response.statusText}. Please ensure you're logged into the web application.`);
              }
              if (response.status === 404) {
                throw new Error(`File not found: ${response.status} ${response.statusText}`);
              }
              throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
            }
            
            // Check content type
            const contentType = response.headers.get('content-type') || '';
            const contentLength = response.headers.get('content-length');
            
            // If we're getting HTML content instead of ZIP, it's likely an auth error page
            if (contentType.includes('text/html') && contentLength && parseInt(contentLength) > 1000) {
              console.log(`Warning: Received HTML content instead of ZIP file. Content-Type: ${contentType}, Length: ${contentLength}`);
              
              const text = await response.text();
              if (text.includes('redirect') || text.includes('login') || text.includes('401') || text.includes('403') || text.includes('Unauthorized')) {
                throw new Error(`Authentication required or access denied. Received HTML page instead of ZIP file. Please ensure you're logged into the web application.`);
              } else if (text.includes('<html') && text.includes('<title>') && text.includes('Home')) {
                // This looks like a homepage redirect
                throw new Error(`Failed to download ZIP: Server returned homepage instead of livery archive. This typically means you need to be logged into the web application.`);
              } else {
                throw new Error(`Failed to download ZIP: Received HTML content instead of ZIP file. Status: ${response.status}`);
              }
            }
            
            // Stream the response to file
            const fileStream = fs.createWriteStream(destPath);
            
            // Convert the body stream to a Node.js stream
            const reader = response.body.getReader();
            const writer = fileStream;
            
            // Read and write in chunks
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                if (!writer.write(value)) {
                  // Pause reading if the stream is full
                  await new Promise(resolve => writer.once('drain', resolve));
                }
              }
              writer.end();
            };
            
            await pump();
            
            return destPath;
            
          } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error.message);
            
            // If this was the last attempt, rethrow the error
            if (attempt === maxRetries) {
              throw new Error(`Failed to download after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };
      
      // Download the ZIP file with retries
      await downloadFileWithRetry(downloadUrl, zipPath);
      console.log('ZIP file downloaded successfully to:', zipPath);
      
      // Extract the ZIP file
      const extractDir = customsDir;
      
      try {
        // Use unzipper to extract
        const directory = fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir }));
        
        await new Promise((resolve, reject) => {
          directory.on('close', resolve);
          directory.on('error', reject);
        });
        
        console.log('ZIP file extracted successfully to:', extractDir);
        
        // Clean up the temporary ZIP file
        fs.unlinkSync(zipPath);
        console.log('Temporary ZIP file cleaned up');
        
        return {
          success: true,
          message: `Liveries downloaded and extracted to ${extractDir}`,
          targetDirectory: extractDir
        };
      } catch (extractionError) {
        console.error('Error extracting ZIP file:', extractionError);
        // Clean up the temporary ZIP file even if extraction fails
        try {
          fs.unlinkSync(zipPath);
        } catch (cleanupError) {
          console.error('Error cleaning up temporary file:', cleanupError);
        }
        throw new Error(`Failed to extract ZIP file: ${extractionError.message}`);
      }
    } catch (error) {
      console.error('Error in download-event-liveries:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  // Check if we have a saved URL
  const savedUrl = readSavedUrl();
  console.log('Saved URL check:', savedUrl);
  
  // If the saved URL is still the default and no config exists, show config window
  if (savedUrl === 'https://blancpaw-gt.uk' && !fs.existsSync(getConfigPath())) {
    console.log('Showing config window as no config exists');
    createConfigWindow();
  } else {
    console.log('Creating main window directly');
    createMainWindow();
  }
  
  // Add a check to ensure app doesn't quit prematurely
  console.log('App initialized, main windows count:', BrowserWindow.getAllWindows().length);
}

// Create application menu
const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reset Config',
          click: async () => {
            try {
              // Reset configuration directly without triggering window close events
              const configPath = getConfigPath();
              if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                console.log('Configuration file cleared successfully');
              }
              
              // Instead of calling mainWindow.close() which triggers the tray minimize dialog,
              // we'll just exit the app directly and let it restart
              console.log('Relaunching application after reset (direct approach)');
              app.relaunch();
              app.exit(0);
            } catch (error) {
              console.error('Error resetting configuration:', error);
              dialog.showErrorBox('Reset Configuration Error', `Failed to reset configuration: ${error.message}`);
            }
          }
        },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'Ctrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Reset Zoom', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// Main application entry point
console.log('Waiting for Electron app to be ready...');
app.whenReady().then(() => {
  console.log('Electron app is ready, initializing...');
  initializeApp();
  createMenu();
  createTray();

  app.on('activate', () => {
    console.log('App activated, checking windows');
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No windows exist, creating main window');
      if (configWindow) {
        configWindow.show();
      } else {
        createMainWindow();
      }
    } else if (mainWindow && !mainWindow.isVisible()) {
      // If mainWindow exists but is hidden (minimized to tray), show it
      console.log('Main window exists but is hidden, showing it');
      mainWindow.show();
    }
  });
});

// Handle quit properly - modify to track quiting state
app.on('window-all-closed', () => {
  console.log('All windows closed, checking platform:', process.platform);
  // Don't quit on macOS, but do quit on other platforms when all windows are closed
  if (process.platform !== 'darwin') {
    console.log('Not on macOS, quitting app');
    app.quit();
  } else {
    console.log('On macOS, not quitting');
  }
});

// Handle app quit properly to clean up tray
app.on('before-quit', () => {
  console.log('App is about to quit, cleaning up...');
  app.isQuiting = true;
});

console.log('Main process script loaded successfully');
