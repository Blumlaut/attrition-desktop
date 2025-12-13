# Attrition Desktop Application

A desktop application for managing Attrition web content with integrated livery download functionality.

## Overview

Attrition Desktop is a cross-platform desktop application built with Electron that provides a native interface for accessing and managing Attrition. The application allows users to configure their preferred Attrition URL, manage Assetto Corsa Competizione liveries, and provides a system tray integration for convenient access.

## Features

- **Web Content Access**: Displays configured Attrition web content in a desktop window
- **Configuration Management**: Easy configuration of web URLs and documents folders
- **System Tray Integration**: Minimize to tray functionality with double-click restore
- **Livery Download**: Download and extract liveries directly from the web application
- **Cross-Platform Support**: Works on Windows, macOS, and Linux
- **Auto-Detection**: Automatically detects Assetto Corsa Competizione documents folders

## Installation

### Pre-built Binaries

Download the latest release for your platform:
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` executable
- **macOS**: `.dmg` installer

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Blumlaut/attrition-desktop.git
cd attrition-desktop

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for distribution
npm run build
```

## Usage

### First Time Setup

1. Launch the application
2. The configuration window will automatically appear
3. Enter your Attrition URL (default: `https://blancpaw-gt.uk`)
4. Select your Assetto Corsa Competizione Documents folder
5. Save the configuration

### Daily Usage

- **Main Window**: Displays your configured Attrition content
- **System Tray**: Right-click the tray icon to show/hide the application or exit
- **Minimize Behavior**: Configure whether to minimize to tray or close completely

### Livery Download

1. In the main window, use the livery download functionality
2. Specify event ID and base URL
3. The application will automatically detect your ACC documents folder
4. Downloaded liveries are extracted directly to the Customs folder

## Project Structure

```
attrition-desktop/
├── main.js          # Main process logic
├── preload.js       # Preload script for security
├── configHelpers.js # Configuration helper functions
├── index.html       # Main window placeholder
├── config.html      # Configuration interface
├── icon.png         # Application icon
├── package.json     # Project metadata and dependencies
└── .github/workflows/release.yml  # CI/CD workflow
```

## Technologies Used

- **Electron**: Cross-platform desktop application framework
- **Node.js**: Backend runtime environment
- **JavaScript/HTML/CSS**: Frontend interface
- **unzipper**: ZIP file extraction library
- **electron-builder**: Application packaging and distribution

## Configuration

Configuration is stored in the application's user data directory:
- **Windows**: `%APPDATA%\attrition-desktop\config.json`
- **macOS**: `~/Library/Application Support/attrition-desktop/config.json`
- **Linux**: `~/.config/attrition-desktop/config.json`

The configuration file contains:
- Saved URL for the Attrition web application
- Documents folder path for Assetto Corsa Competizione
- Minimize to tray preference

## Development

### Available Scripts

```bash
npm run dev        # Start development server
npm run start      # Start application
npm run build      # Build for all platforms
npm run build:win  # Build Windows installer
npm run build:linux # Build Linux AppImage
```

### Building

The project uses `electron-builder` for cross-platform builds:
- Windows: NSIS installer
- macOS: DMG installer  
- Linux: AppImage executable

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and feature requests, please create an issue on the GitHub repository.
