# Complete Workflow: From Figma to React

## Overview

This plugin extracts component data from Figma and automatically generates React components that look exactly like your Figma designs.

## Step-by-Step Workflow

### 1. Preparation Phase

```bash
# Terminal 1: Install plugin dependencies
npm install

# Terminal 1: Build the plugin
npm run build

# Terminal 2: Setup and start MCP server
cd server
npm install
npm start
```

### 2. Figma Plugin Setup

1. Open **Figma Desktop App**
2. **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `manifest.json` from this project
4. Plugin is now available in your plugins menu

### 3. Extract Component Data

1. **Select a component/frame** in your Figma design
2. Open plugin: **Plugins** → **Development** → **Component Data Extractor**
3. Click **"Extract Data"** button
4. View the JSON preview showing:
   - Dimensions (width, height)
   - Colors (fills, strokes)
   - Text properties (font, size, alignment)
   - Layout properties (padding, gap, flex)
   - SVG and image data (Base64 encoded)

### 4. Copy or Send Data

**Option A: Copy JSON**
- Click **"Copy JSON"** button
- JSON is copied to clipboard
- Use it for manual processing or other tools

**Option B: Generate React Component**
- Click **"Send to Local Server"** button
- Server receives the data
- React app is created/updated automatically
- Component files are generated

### 5. View Generated React Component

```bash
# Navigate to generated React app
cd react-app

# Install dependencies (first time only)
npm install

# Start development server
npm start
```

The React app will open in your browser showing the component that matches your Figma design.

## Data Flow Diagram

```
Figma Design
    ↓
[Select Component]
    ↓
[Plugin: Extract Data]
    ↓
[Extract Properties]
  - Dimensions
  - Colors
  - Text
  - Layout
  - SVG/Images
    ↓
[JSON Preview]
    ↓
[User Action]
    ├─→ Copy JSON (Manual)
    └─→ Send to Server
            ↓
        [MCP Server]
            ↓
        [Generate React App]
            ↓
        [Create Components]
            ↓
        [React App Ready]
```

## Extracted Properties

### Visual Properties
- ✅ Width & Height (pixels)
- ✅ Position (x, y)
- ✅ Opacity
- ✅ Visibility

### Color Properties
- ✅ Fill colors (RGB with opacity)
- ✅ Stroke colors and weights
- ✅ Gradient stops (if applicable)

### Text Properties
- ✅ Text content
- ✅ Font family
- ✅ Font size
- ✅ Font weight
- ✅ Text alignment
- ✅ Letter spacing
- ✅ Line height

### Layout Properties
- ✅ Flex direction (horizontal/vertical)
- ✅ Padding (top, right, bottom, left)
- ✅ Gap between items
- ✅ Corner radius

### Assets
- ✅ SVG export (Base64 encoded)
- ✅ PNG export (Base64 encoded)

### Effects
- ✅ Drop shadows
- ✅ Blur effects
- ✅ Other Figma effects

## Generated React Component Structure

```
react-app/
├── src/
│   ├── components/
│   │   ├── ComponentName.jsx    # Generated component
│   │   └── ComponentName.css    # Component styles
│   ├── App.js                    # Updated to use component
│   └── index.css                 # Tailwind CSS imports
├── tailwind.config.js          # Tailwind configuration
└── package.json                  # Dependencies
```

## Component Code Example

The generated component will look like:

```jsx
import React from 'react';
import './ComponentName.css';

const ComponentName = () => {
  return (
    <div className="componentname-container">
      <div
        style={{
          width: '375px',
          height: '812px',
          backgroundColor: 'rgb(255, 255, 255)',
          // ... more styles
        }}
      >
        {/* Nested components */}
      </div>
    </div>
  );
};

export default ComponentName;
```

## Tips for Best Results

1. **Use Frames**: Frame components extract better than groups
2. **Name Components**: Give meaningful names to components
3. **Organize Layers**: Well-organized layers create better React structure
4. **Use Auto Layout**: Auto Layout properties are preserved in React
5. **Check Text**: Ensure text layers are not outlined (use live text)

## Troubleshooting

### Component looks different
- Check if all fonts are loaded
- Verify SVG/images are rendering correctly
- Check browser console for errors

### Server not responding
- Verify server is running on port 3000
- Check CORS settings
- Ensure firewall allows localhost connections

### React app not starting
- Run `npm install` in react-app directory
- Check Node.js version (v16+)
- Review error messages in terminal

## Next Steps

After generating the component:
1. Customize styles as needed
2. Add interactivity (onClick, hover, etc.)
3. Extract reusable parts into separate components
4. Add props for dynamic content
5. Integrate with your existing React app

