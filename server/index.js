const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;
const PROJECT_DIR = path.join(__dirname, '../react-app');
const SRC_DIR = path.join(PROJECT_DIR, 'src');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');

// Constants
const REACT_APP_NAME = 'react-app';
const DEFAULT_COMPONENT_NAME = 'FigmaComponent';
const TAILWIND_CONFIG = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: []
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Utility: Check if directory exists
async function directoryExists(dirPath) {
  try {
    await fs.access(dirPath);
    return true;
  } catch {
    return false;
  }
}

// Utility: Create directory if it doesn't exist
async function ensureDirectory(dirPath) {
  if (!(await directoryExists(dirPath))) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Helper function to convert kebab-case to camelCase
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

// Utility: Convert RGB to Tailwind color or hex
function rgbToColor(rgb, opacity = 1) {
  if (!rgb) return 'transparent';
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  const a = opacity !== undefined ? opacity : 1;

  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// Utility: Convert Figma fills to CSS background
function getBackgroundStyle(fills) {
  if (!fills || fills.length === 0) return {};

  const fill = fills[0];
  if (fill.type === 'SOLID' && fill.color) {
    return {
      backgroundColor: rgbToColor(fill.color, fill.opacity)
    };
  }

  return {};
}

// Utility: Convert strokes to CSS border
function getBorderStyle(strokes, node) {
  if (!strokes || strokes.length === 0) return {};

  const stroke = strokes[0];
  if (stroke.type === 'SOLID' && stroke.color) {
    return {
      borderWidth: `${stroke.weight || 1}px`,
      borderStyle: 'solid',
      borderColor: rgbToColor(stroke.color, stroke.opacity)
    };
  }

  return {};
}

// Utility: Convert effects to CSS
function getEffectStyles(effects) {
  if (!effects || effects.length === 0) return {};

  const shadows = effects
    .filter(e => e.type === 'DROP_SHADOW' && e.visible)
    .map(e => {
      const offsetX = e.offset?.x || 0;
      const offsetY = e.offset?.y || 0;
      const blur = e.radius || 0;
      const color = e.color ? rgbToColor(e.color, 1) : 'rgba(0, 0, 0, 0.25)';
      return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
    });

  if (shadows.length > 0) {
    return { boxShadow: shadows.join(', ') };
  }

  return {};
}

// Utility: Detect semantic component type based on name and properties
function detectComponentType(node) {
  const name = node.name.toLowerCase();

  // Button detection
  if (
    (name.includes('button') || name.includes('btn')) &&
    (node.type === 'FRAME' || node.type === 'INSTANCE' || node.type === 'GROUP' || node.type === 'COMPONENT')
  ) {
    return 'Button';
  }

  // Input detection
  if (name.includes('input') || name.includes('field') || name.includes('search')) {
    return 'TextField';
  }

  // Checkbox detection
  if (name.includes('checkbox') || name.includes('tick')) {
    return 'Checkbox';
  }

  // Typography detection
  if (node.type === 'TEXT') {
    return 'Typography';
  }

  return null;
}

// Generate React component from Figma data
function generateComponentCode(data, componentName = DEFAULT_COMPONENT_NAME) {
  const components = Array.isArray(data) ? data : [data];
  let nodeCounter = 0;

  function generateNodeComponent(node, depth = 0, parentX = 0, parentY = 0) {
    const indent = '      '.repeat(depth);
    const nodeId = `node_${nodeCounter++}`;

    // Root container uses relative positioning, children use absolute
    const isRoot = depth === 0;
    const hasChildren = node.children && node.children.length > 0;

    // For root, normalize coordinates (handle negative values by making them relative to 0,0)
    // For children, calculate relative to parent
    let relativeX = 0;
    let relativeY = 0;

    if (isRoot) {
      relativeX = 0;
      relativeY = 0;
    } else {
      relativeX = node.x !== undefined ? node.x - parentX : 0;
      relativeY = node.y !== undefined ? node.y - parentY : 0;
    }

    const componentType = detectComponentType(node);
    const isTextNode = node.type === 'TEXT';
    const hasSVG = !!(node.svg || node.svgBase64);
    const shouldUseSVG = hasSVG && !isTextNode;

    // Styles generation
    const styles = {
      width: `${node.width}px`,
      height: `${node.height}px`,
      position: isRoot ? 'relative' : 'absolute',
      opacity: node.opacity !== undefined ? node.opacity : 1,
      display: node.visible !== false ? 'block' : 'none',
      ...((hasSVG && shouldUseSVG) || isTextNode || componentType === 'Button' ? {} : getBackgroundStyle(node.fills)),
      ...getBorderStyle(node.strokes, node),
      ...getEffectStyles(node.effects)
    };

    if (!isRoot) {
      styles.left = `${relativeX}px`;
      styles.top = `${relativeY}px`;
    }

    if (node.cornerRadius) styles.borderRadius = `${node.cornerRadius}px`;

    // Handle Auto Layout (Flexbox)
    if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
      styles.display = 'flex';
      styles.position = 'relative'; // Auto Layout uses relative positioning
      styles.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
      if (node.gap) styles.gap = `${node.gap}px`;
      if (node.paddingLeft) styles.paddingLeft = `${node.paddingLeft}px`;
      if (node.paddingRight) styles.paddingRight = `${node.paddingRight}px`;
      if (node.paddingTop) styles.paddingTop = `${node.paddingTop}px`;
      if (node.paddingBottom) styles.paddingBottom = `${node.paddingBottom}px`;
      // Remove absolute positioning for Auto Layout children
      delete styles.left;
      delete styles.top;
    }

    // Prepare style string
    const normalizedStyles = {};
    for (const [key, value] of Object.entries(styles)) {
      if (value !== undefined && value !== null && value !== '') {
        const camelKey = toCamelCase(key);
        normalizedStyles[camelKey] = value;
      }
    }

    const styleEntries = Object.entries(normalizedStyles);
    const styleString = styleEntries.length > 0
      ? styleEntries.map(([key, value]) => {
        const escapedValue = String(value).replace(/'/g, "\\'");
        return `${indent}        ${key}: '${escapedValue}'`;
      }).join(',\n')
      : '';

    // --- GENERATION LOGIC ---

    // 1. Semantic MUI Components
    if (componentType === 'Button') {
      let label = 'Button';
      // Extract label from children
      if (node.children) {
        const textChild = node.children.find(c => c.type === 'TEXT');
        if (textChild && textChild.textContent) label = textChild.textContent;
      }

      let bgColorProp = '';
      if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
        const c = node.fills[0].color;
        bgColorProp = `backgroundColor: '${rgbToColor(c, node.fills[0].opacity)}',`;
      }

      return `${indent}    <Button
${indent}      variant="contained"
${indent}      key="${nodeId}"
${indent}      sx={{
${indent}        position: 'absolute',
${indent}        left: '${relativeX}px',
${indent}        top: '${relativeY}px',
${indent}        width: '${node.width}px',
${indent}        height: '${node.height}px',
${indent}        ${bgColorProp}
${indent}        borderRadius: '${node.cornerRadius || 4}px',
${indent}        textTransform: 'none',
${indent}        zIndex: 10
${indent}      }}
${indent}    >
${indent}      ${label}
${indent}    </Button>`;
    }

    if (componentType === 'TextField') {
      let placeholder = node.name;
      let fontFamily = '';

      // Find text child for placeholder and font family
      if (node.children) {
        const textChild = node.children.find(c => c.type === 'TEXT');
        if (textChild && textChild.textContent) {
          placeholder = textChild.textContent;
          if (textChild.fontFamily) fontFamily = textChild.fontFamily;
        }
      }

      // Background color extraction
      let bgColor = 'white';
      if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
        bgColor = rgbToColor(node.fills[0].color, node.fills[0].opacity);
      }

      // Border Radius extraction
      const borderRadius = node.cornerRadius ? `${node.cornerRadius}px` : '4px';

      // Border logic: if no strokes, remove default MUI border
      const hasStroke = node.strokes && node.strokes.length > 0;

      const fontStyle = fontFamily ? `\n${indent}          fontFamily: '${fontFamily.replace(/'/g, '')}',` : '';

      return `${indent}    <TextField
${indent}      variant="outlined"
${indent}      key="${nodeId}"
${indent}      placeholder="${placeholder.replace(/"/g, '&quot;')}"
${indent}      sx={{
${indent}        position: 'absolute',
${indent}        left: '${relativeX}px',
${indent}        top: '${relativeY}px',
${indent}        width: '${node.width}px',
${indent}        height: '${node.height}px',
${indent}        backgroundColor: '${bgColor}',
${indent}        borderRadius: '${borderRadius}',
${indent}        zIndex: 10,
${indent}        '& .MuiOutlinedInput-root': {
${indent}          height: '100%',
${indent}          borderRadius: '${borderRadius}',
${indent}
${indent}          ${!hasStroke ? "'& fieldset': { border: 'none' }," : ''}
${indent}        },
${indent}        '& .MuiInputBase-input': {${fontStyle}
${indent}        }
${indent}      }}
${indent}    />`;
    }

    if (componentType === 'Checkbox') {
      return `${indent}    <Checkbox
${indent}      defaultChecked
${indent}      key="${nodeId}"
${indent}      sx={{
${indent}        position: 'absolute',
${indent}        left: '${relativeX}px',
${indent}        top: '${relativeY}px',
${indent}        zIndex: 10
${indent}      }}
${indent}    />`;
    }

    // 2. Standard Elements (Text, SVG, Images, Divs)
    let content = '';
    const nodeHasChildren = node.children && node.children.length > 0;

    if (node.type === 'TEXT' && node.textContent) {
      const textStyles = {};
      if (node.fontSize) textStyles.fontSize = `${node.fontSize}px`;
      if (node.fontFamily) textStyles.fontFamily = node.fontFamily.replace(/'/g, '');
      if (node.fontWeight) textStyles.fontWeight = typeof node.fontWeight === 'number' ? node.fontWeight : 400;
      if (node.textAlign) textStyles.textAlign = node.textAlign.toLowerCase();

      const fillColor = node.fills && node.fills[0]?.color;
      if (fillColor) {
        textStyles.color = rgbToColor(fillColor, node.fills[0].opacity);
      }

      const normalizedTextStyles = {};
      for (const [key, value] of Object.entries(textStyles)) {
        if (value !== undefined && value !== null && value !== '') {
          const camelKey = toCamelCase(key);
          normalizedTextStyles[camelKey] = value;
        }
      }

      const textStyleEntries = Object.entries(normalizedTextStyles);
      const textStyleStr = textStyleEntries.length > 0
        ? textStyleEntries.map(([key, value]) => {
          const escapedValue = String(value).replace(/'/g, "\\'");
          return `${indent}          ${key}: '${escapedValue}'`;
        }).join(',\n')
        : '';

      if (textStyleStr) {
        content = `\n${indent}        <span style={{\n${textStyleStr}\n${indent}        }}>\n${indent}          ${node.textContent.replace(/'/g, "\\'")}\n${indent}        </span>`;
      } else {
        content = `\n${indent}        <span>\n${indent}          ${node.textContent.replace(/'/g, "\\'")}\n${indent}        </span>`;
      }
    } else if (hasSVG && shouldUseSVG) {
      // SVG Handling
      let svgContent = node.svg || node.svgBase64;
      if (typeof svgContent === 'string' && svgContent.startsWith('data:image/svg+xml;base64,')) {
        try {
          const base64Data = svgContent.replace('data:image/svg+xml;base64,', '');
          svgContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decoding Base64 SVG:', e);
          content = `\n${indent}        <img src="${svgContent}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
          svgContent = null;
        }
      }

      if (svgContent && !svgContent.startsWith('data:')) {
        const escapedSvg = svgContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        content = `\n${indent}        <div
${indent}          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
${indent}          dangerouslySetInnerHTML={{ __html: \`${escapedSvg}\` }}
${indent}        />`;
      } else if (svgContent && svgContent.startsWith('data:')) {
        content = `\n${indent}        <img src="${svgContent}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
      }
    } else if (node.image) {
      content = `\n${indent}        <img src="${node.image}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
    }

    // Calculate Children offsets
    let childrenX, childrenY;
    if (isRoot) {
      const rootX = node.x !== undefined ? node.x : 0;
      const rootY = node.y !== undefined ? node.y : 0;
      childrenX = node.layoutMode ? 0 : (rootX < 0 ? Math.abs(rootX) : 0);
      childrenY = node.layoutMode ? 0 : (rootY < 0 ? Math.abs(rootY) : 0);
    } else {
      childrenX = node.layoutMode ? 0 : (node.x !== undefined ? node.x : parentX);
      childrenY = node.layoutMode ? 0 : (node.y !== undefined ? node.y : parentY);
    }

    const childrenContent = nodeHasChildren
      ? node.children.map((child) => generateNodeComponent(child, depth + 1, childrenX, childrenY)).join('\n')
      : '';

    const Tag = node.type === 'TEXT' ? 'span' : 'div';
    const isSelfClosing = !nodeHasChildren && !content;

    let openingTag = `${indent}    <${Tag}\n${indent}      key="${nodeId}"`;
    if (styleString) {
      openingTag += `\n${indent}      style={{\n${styleString}\n${indent}      }}`;
    }

    if (isSelfClosing) return `${openingTag}\n    />`;
    return `${openingTag}\n    >\n${content}${childrenContent}${indent}    </${Tag}>`;
  }

  // Root Generation
  const mainComponent = components.map((comp) => {
    const rootX = comp.x !== undefined ? comp.x : 0;
    const rootY = comp.y !== undefined ? comp.y : 0;
    const childrenOffsetX = rootX < 0 ? Math.abs(rootX) : 0;
    const childrenOffsetY = rootY < 0 ? Math.abs(rootY) : 0;
    return generateNodeComponent(comp, 0, childrenOffsetX, childrenOffsetY);
  }).join('\n');

  return `import React from 'react';
import { Button, TextField, Checkbox } from '@mui/material';
import './${componentName}.css';

const ${componentName} = () => {
  return (
    <div className="${componentName.toLowerCase()}-container">
${mainComponent}
    </div>
  );
};

export default ${componentName};
`;
}

// Generate CSS file
function generateCSS(componentName = DEFAULT_COMPONENT_NAME) {
  return `.${componentName.toLowerCase()}-container {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
}
`;
}

// Create React app if it doesn't exist
async function createReactApp() {
  if (await directoryExists(PROJECT_DIR)) {
    console.log('React app already exists');
    return;
  }

  console.log('Creating React app...');
  try {
    await execAsync(`npx create-react-app ${REACT_APP_NAME}`, {
      cwd: path.join(__dirname, '..')
    });

    console.log('Installing Tailwind CSS...');
    await execAsync('npm install -D tailwindcss postcss autoprefixer', {
      cwd: PROJECT_DIR
    });

    // Create Tailwind config file manually (more reliable than npx command)
    const tailwindConfigPath = path.join(PROJECT_DIR, 'tailwind.config.js');
    await fs.writeFile(tailwindConfigPath, `module.exports = ${JSON.stringify(TAILWIND_CONFIG, null, 2)};`);

    // Create PostCSS config file manually
    const postcssConfigPath = path.join(PROJECT_DIR, 'postcss.config.js');
    await fs.writeFile(postcssConfigPath, `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

    // Update index.css with Tailwind directives
    const indexCSSPath = path.join(SRC_DIR, 'index.css');
    await fs.writeFile(indexCSSPath, `@tailwind base;
@tailwind components;
@tailwind utilities;
`);

    // Update index.html to allow inline styles (CSP)
    const publicDir = path.join(PROJECT_DIR, 'public');
    const indexHtmlPath = path.join(publicDir, 'index.html');
    try {
      let indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');

      // Check if CSP meta tag already exists
      if (!indexHtml.includes('Content-Security-Policy')) {
        // Add CSP meta tag after viewport meta tag
        indexHtml = indexHtml.replace(
          /<meta name="viewport"[^>]*>/,
          `$&\n    <meta
      http-equiv="Content-Security-Policy"
      content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; style-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; img-src * data: blob:; font-src * data:;"
    />`
        );
        await fs.writeFile(indexHtmlPath, indexHtml);
        console.log('Updated index.html with CSP policy');
      }
    } catch (error) {
      console.error('Error updating index.html:', error);
    }

    console.log('React app created successfully');
  } catch (error) {
    console.error('Error creating React app:', error);
    throw error;
  }
}

// Main endpoint
app.post('/generate-component', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    await createReactApp();
    await ensureDirectory(COMPONENTS_DIR);

    const componentName = data[0]?.name?.replace(/[^a-zA-Z0-9]/g, '') || DEFAULT_COMPONENT_NAME;
    const componentCode = generateComponentCode(data, componentName);
    const cssCode = generateCSS(componentName);

    const componentPath = path.join(COMPONENTS_DIR, `${componentName}.jsx`);
    const cssPath = path.join(COMPONENTS_DIR, `${componentName}.css`);

    await fs.writeFile(componentPath, componentCode);
    await fs.writeFile(cssPath, cssCode);

    // Update App.js or App.jsx (create-react-app uses .js by default)
    const appJSPath = path.join(SRC_DIR, 'App.js');
    const appJSXPath = path.join(SRC_DIR, 'App.jsx');

    const appCode = `import React from 'react';
import ${componentName} from './components/${componentName}';
import './App.css';

function App() {
  return (
    <div className="App">
      <${componentName} />
    </div>
  );
}

export default App;
`;

    // Try to update existing App.js, otherwise create App.jsx
    if (await directoryExists(appJSPath)) {
      await fs.writeFile(appJSPath, appCode);
    } else {
      await fs.writeFile(appJSXPath, appCode);
    }

    res.json({
      success: true,
      message: `Component ${componentName} generated successfully! Run 'npm start' in the react-app directory.`,
      componentPath: componentPath
    });
  } catch (error) {
    console.error('Error generating component:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Server is running' });
});

app.listen(PORT, () => {
  console.log(`MCP Server running on http://localhost:${PORT}`);
  console.log('Ready to receive Figma component data...');
});

