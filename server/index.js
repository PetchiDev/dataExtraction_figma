const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;
const COMPONENT_DIR = path.join(__dirname, '../react-app/src/components');
const FONTS_DIR = path.join(__dirname, '../react-app/public/fonts');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure component directory exists
async function ensureDirectory(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Extract unique fonts from Figma data
function extractFontsFromData(data) {
    const fonts = new Set();

    function traverse(node) {
        if (node.fontFamily) {
            // Clean font name - remove quotes and get base font name
            const cleanFont = String(node.fontFamily)
                .replace(/^['"]+|['"]+$/g, '')
                .replace(/'/g, '')
                .replace(/"/g, '')
                .trim()
                .split(',')[0] // Get first font (before comma)
                .trim();

            if (cleanFont && !isSystemFont(cleanFont)) {
                fonts.add(cleanFont);
            }
        }

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(traverse);
        }
    }

    data.forEach(traverse);
    return Array.from(fonts);
}

// Check if font is a system font (shouldn't download)
function isSystemFont(fontName) {
    const systemFonts = [
        'arial', 'helvetica', 'times', 'courier', 'verdana', 'georgia',
        'palatino', 'garamond', 'bookman', 'comic sans ms', 'trebuchet ms',
        'arial black', 'impact', 'system', 'monospace', 'serif', 'sans-serif',
        'cursive', 'fantasy', '-apple-system', 'blinkmacsystemfont', 'segoe ui',
        'roboto', 'oxygen', 'ubuntu', 'cantarell', 'fira sans', 'droid sans',
        'helvetica neue'
    ];

    return systemFonts.some(sysFont =>
        fontName.toLowerCase().includes(sysFont.toLowerCase())
    );
}

// Download font from Google Fonts API
async function downloadFontFromGoogle(fontName) {
    try {
        // Convert font name to Google Fonts API format (replace spaces with +)
        const apiFontName = fontName.replace(/\s+/g, '+');

        // Get font info from Google Fonts API
        const apiUrl = `https://fonts.googleapis.com/css2?family=${apiFontName}:wght@400;500;600;700&display=swap`;

        return new Promise((resolve, reject) => {
            https.get(apiUrl, (res) => {
                let cssData = '';

                res.on('data', (chunk) => {
                    cssData += chunk;
                });

                res.on('end', () => {
                    // Extract font URLs from CSS
                    const fontUrls = [];
                    const urlRegex = /url\(([^)]+)\)/g;
                    let match;

                    while ((match = urlRegex.exec(cssData)) !== null) {
                        const url = match[1].replace(/['"]/g, '');
                        if (url.startsWith('http')) {
                            fontUrls.push(url);
                        }
                    }

                    if (fontUrls.length > 0) {
                        resolve({ css: cssData, urls: fontUrls, fontName });
                    } else {
                        // Fallback: use Google Fonts CDN link
                        resolve({
                            css: `@import url('https://fonts.googleapis.com/css2?family=${apiFontName}:wght@400;500;600;700&display=swap');`,
                            urls: [],
                            fontName
                        });
                    }
                });
            }).on('error', (err) => {
                // Fallback to CDN import if download fails
                const apiFontName = fontName.replace(/\s+/g, '+');
                resolve({
                    css: `@import url('https://fonts.googleapis.com/css2?family=${apiFontName}:wght@400;500;600;700&display=swap');`,
                    urls: [],
                    fontName
                });
            });
        });
    } catch (error) {
        // Fallback to CDN import
        const apiFontName = fontName.replace(/\s+/g, '+');
        return {
            css: `@import url('https://fonts.googleapis.com/css2?family=${apiFontName}:wght@400;500;600;700&display=swap');`,
            urls: [],
            fontName
        };
    }
}

// Generate @font-face CSS for all fonts
async function generateFontCSS(fonts) {
    await ensureDirectory(FONTS_DIR);

    const fontCSSPromises = fonts.map(font => downloadFontFromGoogle(font));
    const fontResults = await Promise.all(fontCSSPromises);

    // Combine all font CSS
    const fontCSS = fontResults
        .map(result => result.css)
        .join('\n\n');

    return fontCSS;
}

// Color Utility
function rgbToColor(rgb, opacity = 1) {
    if (!rgb) return 'transparent';
    const r = Math.round(rgb.r * 255);
    const g = Math.round(rgb.g * 255);
    const b = Math.round(rgb.b * 255);
    return opacity < 1 ? `rgba(${r}, ${g}, ${b}, ${opacity})` : `rgb(${r}, ${g}, ${b})`;
}

// Common Style Extractor
function getCommonStyles(node) {
    const styles = {};
    styles.position = 'absolute';
    styles.left = `${node.x}px`;
    styles.top = `${node.y}px`;
    styles.width = `${node.width}px`;
    styles.height = `${node.height}px`;

    // Rotation - Use top-left origin to match Figma's coordinate system
    // Figma's x/y coordinates represent the top-left corner before rotation
    if (node.rotation && node.rotation !== 0) {
        styles.transform = `rotate(${node.rotation}deg)`;
        // Use top-left origin (0,0) to match Figma's coordinate system exactly
        styles.transformOrigin = '0 0';
    }

    // Fills (Background/Text Color)
    if (node.fills && node.fills.length > 0) {
        const fill = node.fills[0];
        if (fill.type === 'SOLID') {
            const color = rgbToColor(fill.color, fill.opacity);
            if (node.type === 'TEXT') {
                styles.color = color;
            } else if (!node.image && !node.svg && !node.svgBase64) {
                // Only apply background color if it's NOT an image/svg
                styles.backgroundColor = color;
            }
        }
    }

    // Border/Strokes
    if (node.strokes && node.strokes.length > 0) {
        const stroke = node.strokes[0];
        if (stroke.type === 'SOLID') {
            styles.border = `${stroke.weight || 1}px solid ${rgbToColor(stroke.color, stroke.opacity)}`;
        }
    }

    // Effects (Shadows)
    if (node.effects && node.effects.length > 0) {
        const shadow = node.effects.find(e => e.type === 'DROP_SHADOW' && e.visible);
        if (shadow) {
            const color = rgbToColor(shadow.color, 0.5); // approximate opacity if missing
            styles.boxShadow = `${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius}px ${color}`;
        }
    }

    // Typography
    if (node.type === 'TEXT') {
        // Preserve whitespace for text with intentional spacing (like navigation items)
        // Check if text content has multiple spaces (likely intentional spacing)
        if (node.textContent && /\s{2,}/.test(node.textContent)) {
            styles.whiteSpace = 'pre';
        }

        // Ensure text doesn't wrap for single-line text
        // If rotated, we might need visible overflow
        if (node.rotation && node.rotation !== 0) {
            styles.overflow = 'visible';
            styles.whiteSpace = 'nowrap';
        } else {
            styles.overflow = 'hidden';
            styles.textOverflow = 'ellipsis';
        }
        
        // For text with height significantly larger than font size, add vertical alignment
        // This ensures text is properly centered vertically (like "ADD TO CART" button)
        // But don't apply flexbox to rotated text as it interferes with rotation
        if (!node.rotation && node.height && node.fontSize && node.height > node.fontSize * 1.5) {
            styles.display = 'flex';
            styles.alignItems = 'center'; // Vertically center the text
            styles.justifyContent = 'flex-start'; // Horizontal alignment based on textAlign
        }

        // Font Size
        if (node.fontSize) {
            styles.fontSize = `${node.fontSize}px`;
        }

        // Font Weight - convert to number if string, default to 400
        if (node.fontWeight) {
            const weight = typeof node.fontWeight === 'string' ? parseFloat(node.fontWeight) || 400 : node.fontWeight;
            styles.fontWeight = weight;
        } else {
            styles.fontWeight = 400; // Default
        }

        // Font Family - use exact Figma font (primary font only, no fallbacks)
        if (node.fontFamily) {
            // Clean fontFamily: remove ALL quotes and get primary font name only
            // This ensures we use the installed font from Google Fonts
            const cleanFontFamily = String(node.fontFamily)
                .replace(/^['"]+|['"]+$/g, '') // Remove leading/trailing quotes
                .replace(/'/g, '') // Remove all single quotes
                .replace(/"/g, '') // Remove all double quotes
                .trim()
                .split(',')[0] // Get primary font only (before comma)
                .trim();
            // Use exact primary font from Figma (installed via Google Fonts)
            styles.fontFamily = cleanFontFamily;
        }

        // Text Align - handle both textAlign and textAlignHorizontal
        const textAlign = node.textAlign || node.textAlignHorizontal;
        if (textAlign) {
            const alignValue = textAlign.toLowerCase();
            styles.textAlign = alignValue;
            
            // If using flexbox for vertical alignment, adjust justifyContent for horizontal alignment
            if (styles.display === 'flex') {
                if (alignValue === 'center') {
                    styles.justifyContent = 'center';
                } else if (alignValue === 'right') {
                    styles.justifyContent = 'flex-end';
                } else {
                    styles.justifyContent = 'flex-start';
                }
            }
        } else {
            styles.textAlign = 'left';
            // If using flexbox, set justifyContent to flex-start
            if (styles.display === 'flex') {
                styles.justifyContent = 'flex-start';
            }
        }

        // Line Height - handle AUTO, PIXELS, PERCENT, and missing values
        if (node.lineHeight) {
            if (node.lineHeight.unit === 'AUTO') {
                // For AUTO, use normal or calculate from fontSize (typically 1.2x)
                styles.lineHeight = 'normal';
            } else if (node.lineHeight.unit === 'PIXELS') {
                styles.lineHeight = `${node.lineHeight.value}px`;
            } else if (node.lineHeight.unit === 'PERCENT') {
                styles.lineHeight = `${node.lineHeight.value}%`;
            } else if (typeof node.lineHeight === 'number') {
                // If lineHeight is just a number, assume pixels
                styles.lineHeight = `${node.lineHeight}px`;
            } else if (node.lineHeight.value !== undefined) {
                // Fallback for other units
                styles.lineHeight = node.lineHeight.value;
            }
        } else if (node.fontSize) {
            // If no lineHeight specified, use a reasonable default (1.2x fontSize)
            styles.lineHeight = `${Math.round(node.fontSize * 1.2)}px`;
        }

        // Letter Spacing
        if (node.letterSpacing) {
            if (node.letterSpacing.unit === 'PIXELS') {
                styles.letterSpacing = `${node.letterSpacing.value}px`;
            } else if (node.letterSpacing.unit === 'PERCENT') {
                styles.letterSpacing = `${node.letterSpacing.value}%`;
            } else if (typeof node.letterSpacing === 'number') {
                styles.letterSpacing = `${node.letterSpacing}px`;
            } else if (node.letterSpacing.value !== undefined && node.letterSpacing.value !== 0) {
                styles.letterSpacing = `${node.letterSpacing.value}em`;
            }
        }
    }

    // Border Radius
    if (node.cornerRadius) {
        styles.borderRadius = `${node.cornerRadius}px`;
    }

    return styles;
}

// Helper to escape text content for JSX
// Wraps text in JSX expression to safely handle special characters
// Since we use single quotes in JSX expression {'text'}, we only need to escape single quotes and backslashes
function escapeJSXText(text) {
    if (!text) return '';
    // Convert to string and escape only necessary characters for JSX expression with single quotes
    return String(text)
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/'/g, "\\'")     // Escape single quotes (since we use single quotes in JSX)
        .replace(/\n/g, '\\n')     // Escape newlines
        .replace(/\r/g, '\\r')    // Escape carriage returns
        .replace(/\t/g, '\\t');    // Escape tabs
    // Note: Double quotes don't need escaping when using single quotes in JSX expression
}

// Helper to convert style object to React style string
function styleObjectToString(styles) {
    return Object.entries(styles)
        .map(([k, v]) => {
            if (typeof v === 'string') {
                // For fontFamily, aggressively remove ALL quotes (React handles font names with spaces automatically)
                if (k === 'fontFamily') {
                    // Remove all single and double quotes from the entire fontFamily string
                    // Split by comma, trim each part, remove quotes, then rejoin
                    const cleaned = v
                        .split(',')
                        .map(font => font.trim().replace(/^['"]+|['"]+$/g, ''))
                        .join(', ');
                    // Escape any remaining single quotes (shouldn't be any after cleaning)
                    const escaped = cleaned.replace(/'/g, "\\'");
                    return `${k}: '${escaped}'`;
                } else {
                    // Escape single quotes in the string value
                    const escaped = v.replace(/'/g, "\\'");
                    return `${k}: '${escaped}'`;
                }
            } else {
                // For numbers, booleans, etc., don't quote
                return `${k}: ${v}`;
            }
        })
        .join(', ');
}

// DOM Generator
function generateElement(node) {
    if (!node.visible) return '';

    const styles = getCommonStyles(node);

    // Convert style object to React style string
    // We need to adjust 'position', 'left', 'top' for children relative to parent?
    // Actually, Figma 'x' and 'y' are relative to the PARENT in standard extraction, 
    // unless extracted as absolute.
    // Assuming the plugin extracts X/Y relative to the parent frame.

    // TEXT
    if (node.type === 'TEXT') {
        const styleStr = styleObjectToString(styles);
        // Escape text content and wrap in JSX expression to safely handle special characters
        const escapedText = escapeJSXText(node.textContent);
        // Use JSX expression syntax to safely render text with special characters
        const textJSX = `{'${escapedText}'}`;
        
        // For rotated text, ensure the text content is properly wrapped
        // This helps maintain alignment after rotation
        if (node.rotation && node.rotation !== 0) {
            // Wrap text in a span to ensure proper alignment
            return `<div style={{${styleStr}}}><span style={{display: 'inline-block', width: '100%', textAlign: '${styles.textAlign || 'left'}'}}>${textJSX}</span></div>`;
        }
        
        // For text with flexbox (vertical alignment), wrap content to maintain text-align
        if (styles.display === 'flex') {
            // When using flexbox, text-align doesn't work on the container
            // So we wrap the text in a span with proper width and text-align
            const textAlign = styles.textAlign || 'left';
            return `<div style={{${styleStr}}}><span style={{width: '100%', textAlign: '${textAlign}'}}>${textJSX}</span></div>`;
        }
        
        return `<div style={{${styleStr}}}>${textJSX}</div>`;
    }

    // IMAGE / VECTOR
    if (node.image || node.svg || node.svgBase64) {
        const styleStr = styleObjectToString(styles);
        // If we have raw SVG string, use dangerouslySetInnerHTML for better rendering
        if (node.svg) {
            // Escape the SVG string for JSX - need to escape quotes and backslashes
            const escapedSvg = node.svg
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            return `<div style={{${styleStr}}} dangerouslySetInnerHTML={{__html: '${escapedSvg}'}} />`;
        } else {
            // Use img tag for base64 or PNG images
            const src = node.svgBase64 || node.image;
            return `<img src="${src}" alt="${node.name}" style={{${styleStr}, objectFit: 'contain'}} />`;
        }
    }

    // CONTAINER / FRAME / RECTANGLE
    const childrenHtml = node.children ? node.children.map(generateElement).join('\n') : '';
    const styleStr = styleObjectToString(styles);

    return `<div style={{${styleStr}}}>${childrenHtml}</div>`;
}

// component generator
function generateComponent(data, name, fontCSS = '') {
    const root = data[0];

    // Root needs relative positioning to contain absolute children
    // Root X/Y should be ignored or reset to 0 for the component itself
    // We wrap everything in a relative container matching the root dimensions.

    // Filter root overrides
    const rootWidth = root.width;
    const rootHeight = root.height;
    const rootBg = (root.fills && root.fills[0] && root.fills[0].type === 'SOLID')
        ? rgbToColor(root.fills[0].color, root.fills[0].opacity)
        : 'transparent';

    // Generate children
    const childrenHtml = root.children.map(generateElement).join('\n');

    return `import React from 'react';
import './${name}.css';

const ${name} = () => {
    return (
        <div style={{
            position: 'relative',
            width: '${rootWidth}px',
            height: '${rootHeight}px',
            backgroundColor: '${rootBg}',
            overflow: 'hidden',
            margin: '0 auto' // Center it
        }}>
            ${childrenHtml}
        </div>
    );
};

export default ${name};
`;
}

app.post('/api/generate', async (req, res) => {
    try {
        const data = req.body;
        await ensureDirectory(COMPONENT_DIR);

        const componentName = data[0].name.replace(/[^a-zA-Z0-9]/g, '') || 'Frame1';

        // Extract fonts from Figma data
        const fonts = extractFontsFromData(data);
        console.log('Extracted fonts:', fonts);

        // Generate font CSS
        let fontCSS = '';
        if (fonts.length > 0) {
            try {
                fontCSS = await generateFontCSS(fonts);
                console.log('Generated font CSS for fonts:', fonts);
            } catch (fontError) {
                console.error('Error generating font CSS:', fontError);
                // Continue without fonts if there's an error
            }
        }

        const code = generateComponent(data, componentName, fontCSS);
        const css = fontCSS; // Include font CSS in component CSS file

        await fs.writeFile(path.join(COMPONENT_DIR, `${componentName}.jsx`), code);
        await fs.writeFile(path.join(COMPONENT_DIR, `${componentName}.css`), css);

        // Update App.js
        const appjs = `import React from 'react';
import ${componentName} from './components/${componentName}';

function App() {
  return (
    <div className="App">
      <${componentName} />
    </div>
  );
}

export default App;`;

        await fs.writeFile(path.join(__dirname, '../react-app/src/App.js'), appjs);

        res.json({ success: true, fonts: fonts });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
