# Quick Setup Guide

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Figma Desktop App

## Step-by-Step Setup

### 1. Install Plugin Dependencies (Root Directory)

```bash
# Make sure you're in the root directory (figma_plugin/)
npm install
```

### 2. Build the Plugin (Root Directory)

```bash
# Still in root directory - this compiles TypeScript
npm run build
```

This compiles `code.ts` to `code.js` which Figma needs.

### 3. Setup and Start MCP Server (Server Directory)

```bash
# Navigate to server directory
cd server

# Install server dependencies
npm install

# Start the server (NOT "npm run build" - that's only in root!)
npm start
```

Keep this terminal running. The server should show:
```
MCP Server running on http://localhost:3000
Ready to receive Figma component data...
```

### 4. Load Plugin in Figma

1. Open **Figma Desktop App**
2. Create or open any design file
3. Go to **Plugins** → **Development** → **Import plugin from manifest...**
4. Navigate to this project folder and select `manifest.json`
5. The plugin is now installed!

### 5. Use the Plugin

1. **Select a component** in your Figma design
2. Go to **Plugins** → **Development** → **Component Data Extractor**
3. Click **"Extract Data"** to see the JSON
4. Click **"Copy JSON"** to copy the data
5. Click **"Send to Local Server"** to generate React component

### 6. Run Generated React App

After sending to server, the React app will be created in `react-app/`:

```bash
cd react-app
npm install
npm start
```

The app will open at `http://localhost:3001` (or next available port).

## Troubleshooting

### Plugin shows "No selection"
- Make sure you have selected a component/frame in Figma before opening the plugin

### Server connection error
- Verify the server is running on port 3000
- Check that no firewall is blocking localhost connections
- Try `http://127.0.0.1:3000` instead of `localhost:3000`

### React app not generating
- Check server terminal for error messages
- Ensure you have write permissions in the project directory
- Make sure Node.js and npm are properly installed

### TypeScript compilation errors
- Run `npm install` again to ensure all dependencies are installed
- Check that TypeScript version is compatible: `npx tsc --version`

## Development Tips

- Use `npm run watch` to auto-compile TypeScript on changes
- Use `npm run dev` in server directory for auto-restart on changes
- Check browser console (F12) when plugin UI is open for debugging
- Check server terminal for backend errors

