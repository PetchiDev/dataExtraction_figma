# Quick Start Guide

## Correct Command Sequence

### Step 1: Root Directory Setup
```powershell
# You should be here: C:\Users\Petchiappan.P\figma_plugin\
npm install
npm run build
```

### Step 2: Server Directory Setup
```powershell
# Navigate to server folder
cd server

# Install server dependencies
npm install

# Start the server (NOT "npm run build")
npm start
```

## Important Notes

- **`npm run build`** → Only in **root directory** (compiles TypeScript plugin code)
- **`npm start`** → Only in **server directory** (starts the MCP server)
- The server doesn't need a build step - it's plain JavaScript

## Common Mistakes

❌ **Wrong**: Running `npm run build` in `server/` directory
✅ **Correct**: Run `npm run build` in root, `npm start` in server/

## Complete Setup (Copy-Paste Ready)

```powershell
# Terminal 1: Root directory
cd C:\Users\Petchiappan.P\figma_plugin
npm install
npm run build

# Terminal 2: Server directory  
cd C:\Users\Petchiappan.P\figma_plugin\server
npm install
npm start
```

