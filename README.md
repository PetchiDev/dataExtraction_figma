# Figma Component Data Extractor Plugin

A comprehensive Figma plugin that extracts component data (dimensions, colors, SVG, images, styles) and automatically generates React components with the same UI look as Figma.

## Features

- ✅ Extract complete component data (width, height, colors, fills, strokes, effects)
- ✅ Export SVG and PNG images as Base64
- ✅ Extract text properties (font size, family, weight, alignment)
- ✅ Extract layout properties (padding, gap, flex direction)
- ✅ JSON preview with copy functionality
- ✅ Send data to local MCP server
- ✅ Auto-generate React app with Tailwind CSS
- ✅ Recreate Figma UI in React with pixel-perfect accuracy

## Project Structure

```
figma_plugin/
├── manifest.json          # Figma plugin manifest
├── code.ts                # Plugin main logic (TypeScript)
├── ui.html                # Plugin UI
├── package.json           # Plugin dependencies
├── tsconfig.json          # TypeScript configuration
├── server/
│   ├── index.js           # MCP server (Node.js/Express)
│   └── package.json       # Server dependencies
└── react-app/             # Generated React app (created automatically)
```

## Setup Instructions

### Step 1: Install Plugin Dependencies

```bash
# Install TypeScript and Figma plugin types
npm install
```

### Step 2: Build the Plugin

```bash
# Compile TypeScript to JavaScript
npm run build
```

This will generate `code.js` from `code.ts`.

### Step 3: Install and Start MCP Server

```bash
# Navigate to server directory
cd server

# Install server dependencies
npm install

# Start the server
npm start
```

The server will run on `http://localhost:3000`

### Step 4: Load Plugin in Figma

1. Open Figma Desktop App
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select the `manifest.json` file from this project
4. The plugin will appear in your plugins menu

## Usage

### Extracting Component Data

1. **Select a component** in Figma (frame, group, or any node)
2. Open the plugin from **Plugins** → **Development** → **Component Data Extractor**
3. Click **"Extract Data"** button
4. View the extracted JSON in the preview area
5. Click **"Copy JSON"** to copy the data to clipboard

### Generating React Component

1. After extracting data, click **"Send to Local Server"**
2. The server will:
   - Create a new React app (if it doesn't exist)
   - Install Tailwind CSS
   - Generate React components matching your Figma design
   - Update `App.jsx` to render the component
3. Navigate to `react-app` directory and run:
   ```bash
   cd react-app
   npm start
   ```

## Extracted Data Structure

The plugin extracts the following properties:

```json
{
  "name": "Component Name",
  "type": "FRAME",
  "width": 375,
  "height": 812,
  "x": 0,
  "y": 0,
  "fills": [
    {
      "type": "SOLID",
      "color": { "r": 1, "g": 1, "b": 1 },
      "opacity": 1
    }
  ],
  "strokes": [],
  "effects": [],
  "opacity": 1,
  "visible": true,
  "svg": "data:image/svg+xml;base64,...",
  "image": "data:image/png;base64,...",
  "cornerRadius": 8,
  "layoutMode": "VERTICAL",
  "paddingLeft": 16,
  "paddingRight": 16,
  "paddingTop": 16,
  "paddingBottom": 16,
  "gap": 12,
  "children": [...]
}
```

## API Endpoints

### POST `/generate-component`

Receives Figma component data and generates React components.

**Request Body:**
```json
{
  "data": [/* extracted component data */]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Component generated successfully!",
  "componentPath": "/path/to/component.jsx"
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "MCP Server is running"
}
```

## Development

### Watch Mode (TypeScript)

```bash
npm run watch
```

This will automatically recompile `code.ts` when you make changes.

### Server Development Mode

```bash
cd server
npm run dev
```

Uses `nodemon` to automatically restart the server on changes.

## Troubleshooting

### CORS Errors

If you encounter CORS errors, ensure:
- The server is running on `http://localhost:3000`
- The `manifest.json` includes the correct network access domains

### Plugin Not Loading

- Make sure `code.js` exists (run `npm run build`)
- Check that `manifest.json` points to `code.js` (not `code.ts`)
- Restart Figma Desktop App

### React App Not Generated

- Check server logs for errors
- Ensure Node.js and npm are installed
- Verify you have write permissions in the project directory

## Technical Details

### Data Extraction

- **Dimensions**: Extracted from `node.width` and `node.height`
- **Colors**: Converted from RGB (0-1) to hex/rgba CSS values
- **SVG**: Exported using `exportAsync({ format: 'SVG' })` and encoded as Base64
- **Images**: Exported as PNG and encoded as Base64
- **Text**: Extracts font properties, content, and styling
- **Layout**: Extracts flex properties, padding, and gaps

### Component Generation

- Converts Figma properties to inline React styles
- Preserves exact dimensions and positioning
- Maintains color accuracy with opacity support
- Handles nested components recursively
- Supports SVG and image embedding

## License

MIT

