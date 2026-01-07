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
      // Root component: if it has negative coordinates, adjust to start from 0,0
      // Store the offset to adjust children
      relativeX = 0;
      relativeY = 0;
    } else {
      // Children: calculate relative to parent
      relativeX = node.x !== undefined ? node.x - parentX : 0;
      relativeY = node.y !== undefined ? node.y - parentY : 0;
    }

    // Check if this node has SVG data provided by the plugin
    const isTextNode = node.type === 'TEXT';

    // If the plugin sent 'svg' or 'svgBase64', it means it determined this node should be an image.
    // If the plugin sent 'svg' or 'svgBase64', it means it determined this node should be an image.
    // We should trust the plugin's decision (which now handles the "no text" check).
    const hasSVG = !!(node.svg || node.svgBase64);

    // We strictly respect the plugin's output. If it sent SVG, we render SVG.
    // The only exception is if for some reason a Text node has SVG (unlikely), we might prefer Text.
    // But generally, hasSVG is the primary signal.
    const shouldUseSVG = hasSVG && !isTextNode;

    // If node has SVG and should use it, don't add backgroundColor
    // Otherwise, add background styles
    const styles = {
      width: `${node.width}px`,
      height: `${node.height}px`,
      position: isRoot ? 'relative' : 'absolute',
      opacity: node.opacity !== undefined ? node.opacity : 1,
      display: node.visible !== false ? 'block' : 'none',
      ...((hasSVG && shouldUseSVG) || isTextNode ? {} : getBackgroundStyle(node.fills)), // Skip background if using SVG or if it's a Text node (fills = text color)
      ...getBorderStyle(node.strokes, node),
      ...getEffectStyles(node.effects)
    };

    // Add positioning for non-root elements
    if (!isRoot) {
      styles.left = `${relativeX}px`;
      styles.top = `${relativeY}px`;
    }

    if (node.cornerRadius) {
      styles.borderRadius = `${node.cornerRadius}px`;
    }

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

    // Normalize all style keys to camelCase and filter invalid values
    const normalizedStyles = {};
    for (const [key, value] of Object.entries(styles)) {
      if (value !== undefined && value !== null && value !== '') {
        const camelKey = toCamelCase(key);
        normalizedStyles[camelKey] = value;
      }
    }

    // Convert to string format
    const styleEntries = Object.entries(normalizedStyles);
    const styleString = styleEntries.length > 0
      ? styleEntries
        .map(([key, value]) => {
          // Escape single quotes in values
          const escapedValue = String(value).replace(/'/g, "\\'");
          return `${indent}        ${key}: '${escapedValue}'`;
        })
        .join(',\n')
      : '';

    let content = '';
    const nodeHasChildren = node.children && node.children.length > 0;

    // Priority order: TEXT > SVG > Image > Background div
    if (node.type === 'TEXT' && node.textContent) {
      const textStyles = {};
      if (node.fontSize) textStyles.fontSize = `${node.fontSize}px`;
      if (node.fontFamily) textStyles.fontFamily = node.fontFamily.replace(/'/g, ''); // Remove extra quotes
      if (node.fontWeight) textStyles.fontWeight = typeof node.fontWeight === 'number' ? node.fontWeight : 400;
      if (node.textAlign) textStyles.textAlign = node.textAlign.toLowerCase();

      const fillColor = node.fills && node.fills[0]?.color;
      if (fillColor) {
        textStyles.color = rgbToColor(fillColor, node.fills[0].opacity);
      }

      // Normalize text style keys
      const normalizedTextStyles = {};
      for (const [key, value] of Object.entries(textStyles)) {
        if (value !== undefined && value !== null && value !== '') {
          const camelKey = toCamelCase(key);
          normalizedTextStyles[camelKey] = value;
        }
      }

      const textStyleEntries = Object.entries(normalizedTextStyles);
      const textStyleStr = textStyleEntries.length > 0
        ? textStyleEntries
          .map(([key, value]) => {
            const escapedValue = String(value).replace(/'/g, "\\'");
            return `${indent}          ${key}: '${escapedValue}'`;
          })
          .join(',\n')
        : '';

      if (textStyleStr) {
        content = `\n${indent}        <span style={{\n${textStyleStr}\n${indent}        }}>\n${indent}          ${node.textContent.replace(/'/g, "\\'")}\n${indent}        </span>`;
      } else {
        content = `\n${indent}        <span>\n${indent}          ${node.textContent.replace(/'/g, "\\'")}\n${indent}        </span>`;
      }
    } else if (hasSVG && shouldUseSVG) {
      // For VECTOR, ELLIPSE, RECTANGLE nodes - use SVG
      let svgContent = node.svg || node.svgBase64;

      // If it's a Base64 data URI, decode it
      if (typeof svgContent === 'string' && svgContent.startsWith('data:image/svg+xml;base64,')) {
        try {
          const base64Data = svgContent.replace('data:image/svg+xml;base64,', '');
          svgContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decoding Base64 SVG:', e);
          // Keep as data URI if decoding fails - use as img src
          content = `\n${indent}        <img src="${svgContent}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
          svgContent = null;
        }
      }

      if (svgContent && !svgContent.startsWith('data:')) {
        // Escape for template literal
        const escapedSvg = svgContent
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$/g, '\\$')
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        content = `\n${indent}        <div
${indent}          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
${indent}          dangerouslySetInnerHTML={{ __html: \`${escapedSvg}\` }}
${indent}        />`;
      } else if (svgContent && svgContent.startsWith('data:')) {
        // Use as img src if still in data URI format
        content = `\n${indent}        <img src="${svgContent}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
      }
    } else if (node.image) {
      content = `\n${indent}        <img src="${node.image}" alt="${node.name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`;
    }

    // For Auto Layout, children positions are relative to parent (0,0)
    // For absolute positioning, use parent's x,y as reference
    let childrenX, childrenY;

    if (isRoot) {
      // Root: if it has negative coords, children need offset adjustment
      const rootX = node.x !== undefined ? node.x : 0;
      const rootY = node.y !== undefined ? node.y : 0;
      // If root is at (-215, -466), children should be relative to (0, 0) but need +215, +466 offset
      childrenX = node.layoutMode ? 0 : (rootX < 0 ? Math.abs(rootX) : 0);
      childrenY = node.layoutMode ? 0 : (rootY < 0 ? Math.abs(rootY) : 0);
    } else {
      // Non-root: use parent's actual position (already adjusted)
      childrenX = node.layoutMode ? 0 : (node.x !== undefined ? node.x : parentX);
      childrenY = node.layoutMode ? 0 : (node.y !== undefined ? node.y : parentY);
    }

    const childrenContent = nodeHasChildren
      ? node.children.map((child) => generateNodeComponent(child, depth + 1, childrenX, childrenY)).join('\n')
      : '';

    const Tag = node.type === 'TEXT' ? 'span' : 'div';
    const isSelfClosing = !nodeHasChildren && !content;

    // Build the opening tag
    let openingTag = `${indent}    <${Tag}\n${indent}      key="${nodeId}"`;

    if (styleString) {
      openingTag += `\n${indent}      style={{\n${styleString}\n${indent}      }}`;
    }

    if (isSelfClosing) {
      return `${openingTag}\n    />`;
    }

    // For elements with content or children, ensure proper closing
    return `${openingTag}\n    >\n${content}${childrenContent}${indent}    </${Tag}>`;
  }

  // Generate root component with proper positioning
  // Handle negative coordinates by normalizing to 0,0 for root
  const mainComponent = components.map((comp) => {
    // Root component: normalize coordinates (if negative, adjust children)
    const rootX = comp.x !== undefined ? comp.x : 0;
    const rootY = comp.y !== undefined ? comp.y : 0;

    // If root has negative coords, we'll adjust children positions
    // Root itself will be at 0,0 relative to container
    const childrenOffsetX = rootX < 0 ? Math.abs(rootX) : 0;
    const childrenOffsetY = rootY < 0 ? Math.abs(rootY) : 0;

    // Generate root with depth 0 (so isRoot = true), then children with adjusted offsets
    return generateNodeComponent(comp, 0, childrenOffsetX, childrenOffsetY);
  }).join('\n');

  return `import React from 'react';
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

