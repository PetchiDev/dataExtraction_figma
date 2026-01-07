/// <reference types="@figma/plugin-typings" />

// Constants
const SERVER_URL = 'http://localhost:3000';
const EXPORT_FORMAT_SVG = 'SVG';
const EXPORT_FORMAT_PNG = 'PNG';
const BASE64_PREFIX_SVG = 'data:image/svg+xml;base64,';
const BASE64_PREFIX_PNG = 'data:image/png;base64,';

// Types
interface ExtractedData {
  name: string;
  type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  fills: FillData[];
  strokes: StrokeData[];
  effects: EffectData[];
  opacity: number;
  visible: boolean;
  svg?: string;
  svgBase64?: string;
  image?: string;
  children?: ExtractedData[];
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: ExtractedLetterSpacing;
  lineHeight?: ExtractedLineHeight;
  textAlign?: string;
  cornerRadius?: number;
  layoutMode?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  gap?: number;
}

interface FillData {
  type: string;
  color?: RGB;
  opacity?: number;
  gradientStops?: GradientStop[];
}

interface StrokeData {
  type: string;
  color?: RGB;
  opacity?: number;
  weight?: number;
}

interface EffectData {
  type: string;
  color?: RGB;
  offset?: { x: number; y: number };
  radius?: number;
  visible?: boolean;
}

interface GradientStop {
  position: number;
  color: RGB;
}

interface ExtractedLetterSpacing {
  value: number;
  unit: string;
}

interface ExtractedLineHeight {
  value: number;
  unit: string;
}

// Convert RGB to Hex
function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Convert Unit8Array to Base64
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Check if btoa exists, otherwise use a fallback or throw informative error
  if (typeof btoa === 'function') {
    return btoa(binary);
  } else {
    // Simple Base64 polyfill if btoa is missing (unlikely in Figma, but possible in some envs)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    for (let i = 0; i < binary.length; i += 3) {
      const block = (binary.charCodeAt(i) << 16) | ((i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0) << 8) | ((i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0));
      str += chars.charAt((block >> 18) & 0x3F) + chars.charAt((block >> 12) & 0x3F) + (i + 1 < binary.length ? chars.charAt((block >> 6) & 0x3F) : '=') + (i + 2 < binary.length ? chars.charAt(block & 0x3F) : '=');
    }
    return str;
  }
}

// Convert Uint8Array to String (UTF-8 safe-ish)
function bytesToString(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    let c = bytes[i++];
    switch (c >> 4) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        out += String.fromCharCode(((c & 0x1F) << 6) | (bytes[i++] & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        out += String.fromCharCode(((c & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | ((bytes[i++] & 0x3F) << 0));
        break;
    }
  }
  return out;
}

// Extract fill data
function extractFills(node: SceneNode): FillData[] {
  if (!('fills' in node) || !Array.isArray(node.fills)) {
    return [];
  }

  return node.fills.map((fill: Paint) => {
    const fillData: FillData = { type: fill.type };

    if (fill.type === 'SOLID' && fill.color) {
      fillData.color = fill.color;
      fillData.opacity = fill.opacity !== undefined ? fill.opacity : 1;
    }

    if (fill.type === 'GRADIENT_LINEAR' && 'gradientStops' in fill) {
      fillData.gradientStops = fill.gradientStops.map((stop: ColorStop) => ({
        position: stop.position,
        color: stop.color
      }));
    }

    return fillData;
  });
}

// Extract stroke data
function extractStrokes(node: SceneNode): StrokeData[] {
  if (!('strokes' in node) || !Array.isArray(node.strokes)) {
    return [];
  }

  return node.strokes.map((stroke: Paint) => {
    const strokeWeight = 'strokeWeight' in node && typeof node.strokeWeight === 'number' ? node.strokeWeight : 1;
    const strokeData: StrokeData = {
      type: stroke.type,
      weight: strokeWeight
    };

    if (stroke.type === 'SOLID' && stroke.color) {
      strokeData.color = stroke.color;
      strokeData.opacity = stroke.opacity !== undefined ? stroke.opacity : 1;
    }

    return strokeData;
  });
}

// Extract effects data
function extractEffects(node: SceneNode): EffectData[] {
  if (!('effects' in node) || !Array.isArray(node.effects)) {
    return [];
  }

  return node.effects.map((effect: Effect) => {
    const effectData: EffectData = {
      type: effect.type,
      visible: effect.visible
    };

    if (effect.type === 'DROP_SHADOW' && 'color' in effect) {
      effectData.color = effect.color;
      effectData.offset = effect.offset;
      effectData.radius = effect.radius;
    }

    return effectData;
  });
}

// Extract text properties
function extractTextProperties(node: TextNode): Partial<ExtractedData> {
  const textData: Partial<ExtractedData> = {
    textContent: node.characters,
    fontSize: node.fontSize !== figma.mixed ? node.fontSize : undefined,
    fontFamily: node.fontName !== figma.mixed ? node.fontName.family : undefined,
    fontWeight: node.fontName !== figma.mixed ? (typeof node.fontName.style === 'string' ? parseFloat(node.fontName.style) || 400 : 400) : undefined,
    letterSpacing: node.letterSpacing !== figma.mixed ? {
      value: typeof node.letterSpacing === 'object' && 'value' in node.letterSpacing ? node.letterSpacing.value : (typeof node.letterSpacing === 'number' ? node.letterSpacing : 0),
      unit: typeof node.letterSpacing === 'object' && 'unit' in node.letterSpacing ? node.letterSpacing.unit : 'PIXELS'
    } : undefined,
    lineHeight: node.lineHeight !== figma.mixed ? {
      value: typeof node.lineHeight === 'object' && 'value' in node.lineHeight ? node.lineHeight.value : (typeof node.lineHeight === 'number' ? node.lineHeight : 0),
      unit: typeof node.lineHeight === 'object' && 'unit' in node.lineHeight ? node.lineHeight.unit : 'PIXELS'
    } : undefined,
    textAlign: node.textAlignHorizontal
  };

  return textData;
}

// Extract layout properties
function extractLayoutProperties(node: SceneNode): Partial<ExtractedData> {
  const layoutData: Partial<ExtractedData> = {};

  if ('layoutMode' in node) {
    layoutData.layoutMode = node.layoutMode;
  }

  if ('paddingLeft' in node) {
    layoutData.paddingLeft = node.paddingLeft;
    layoutData.paddingRight = node.paddingRight;
    layoutData.paddingTop = node.paddingTop;
    layoutData.paddingBottom = node.paddingBottom;
  }

  if ('itemSpacing' in node) {
    layoutData.gap = node.itemSpacing;
  }

  if ('cornerRadius' in node) {
    if (typeof node.cornerRadius === 'number') {
      layoutData.cornerRadius = node.cornerRadius;
    }
  }


  return layoutData;
}

// Helper to check if a node has any TEXT descendants
function hasTextDescendant(node: SceneNode): boolean {
  if (node.type === 'TEXT') {
    return true;
  }

  if ('children' in node) {
    return node.children.some(child => hasTextDescendant(child));
  }

  return false;
}

// Main extraction function
async function extractNodeData(node: SceneNode): Promise<ExtractedData> {
  const baseData: ExtractedData = {
    name: node.name,
    type: node.type,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    fills: extractFills(node),
    strokes: extractStrokes(node),
    effects: extractEffects(node),
    opacity: 'opacity' in node ? node.opacity : 1,
    visible: node.visible
  };

  // Extract text properties if text node
  if (node.type === 'TEXT') {
    Object.assign(baseData, extractTextProperties(node as TextNode));
  }

  // Extract layout properties
  Object.assign(baseData, extractLayoutProperties(node));

  // Export SVG for vector/shape nodes or containers WITHOUT text
  // This satisfies the requirement: "extract everything else as SVG apart from text and buttons"
  const vectorTypes = ['VECTOR', 'ELLIPSE', 'RECTANGLE', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'];

  // Logic: 
  // 1. Always export vector primitives as SVG
  // 2. For containers (FRAME, COMPONENT, INSTANCE, GROUP):
  //    - If they contain NO text, they are likely icons/illustrations -> Export as SVG
  //    - If they contain text, they are likely UI components (Buttons, Cards) -> Keep as JSON layout

  let shouldExportSVG = false;

  if (vectorTypes.includes(node.type)) {
    shouldExportSVG = true;
  } else if (
    node.type === 'FRAME' ||
    node.type === 'COMPONENT' ||
    node.type === 'INSTANCE' ||
    node.type === 'GROUP'
  ) {
    // Only export container as SVG if it has NO text descendants
    const hasText = hasTextDescendant(node);
    shouldExportSVG = !hasText;
    if (!shouldExportSVG) {
      console.log(`[DEBUG] Skipping SVG for container: ${node.name} (Type: ${node.type}) - Has Text: ${hasText}`);
    }
  }

  if (shouldExportSVG) {
    console.log(`[DEBUG] Exporting SVG for node: ${node.name} (Type: ${node.type})`);
    try {
      const svgBytes = await node.exportAsync({ format: EXPORT_FORMAT_SVG });

      const svgString = bytesToString(svgBytes);
      // Store both raw SVG string and Base64 for flexibility
      baseData.svg = svgString; // Raw SVG string for direct rendering
      baseData.svgBase64 = BASE64_PREFIX_SVG + arrayBufferToBase64(svgBytes); // Base64 for img src fallback
    } catch (error) {
      console.error(`Error exporting SVG for ${node.type} (${node.name}):`, error);
      // Try PNG as fallback for vector nodes
      if (vectorTypes.includes(node.type)) {
        try {
          const pngBytes = await node.exportAsync({ format: EXPORT_FORMAT_PNG });
          baseData.image = BASE64_PREFIX_PNG + arrayBufferToBase64(pngBytes);
        } catch (pngError) {
          console.error('Error exporting PNG fallback:', pngError);
        }
      }
    }
  }

  // Export PNG for images (as additional format) - only for RECTANGLE/ELLIPSE if no SVG
  // VECTOR nodes should always use SVG, not PNG
  if ((node.type === 'RECTANGLE' || node.type === 'ELLIPSE') && !baseData.svg) {
    try {
      const pngBytes = await node.exportAsync({ format: EXPORT_FORMAT_PNG });
      baseData.image = BASE64_PREFIX_PNG + arrayBufferToBase64(pngBytes);
    } catch (error) {
      console.error('Error exporting PNG:', error);
    }
  }

  // Extract children recursively - ONLY if we are NOT exporting as a single SVG
  // If we are exporting as SVG, we want to treat this node as a leaf (image) and ignore its internal structure
  if (!shouldExportSVG && 'children' in node && Array.isArray(node.children)) {
    baseData.children = await Promise.all(
      node.children.map((child: SceneNode) => extractNodeData(child))
    );
  }

  return baseData;
}

// Handle selection change
figma.on('selectionchange', async () => {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'no-selection' });
    return;
  }

  try {
    const extractedData = await Promise.all(
      selection.map((node) => extractNodeData(node))
    );

    figma.ui.postMessage({
      type: 'data-extracted',
      data: extractedData
    });
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'extract-data') {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Please select a component' });
      return;
    }

    try {
      const extractedData = await Promise.all(
        selection.map((node) => extractNodeData(node))
      );

      figma.ui.postMessage({
        type: 'data-extracted',
        data: extractedData
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to extract data'
      });
    }
  }

  if (msg.type === 'send-to-server') {
    try {
      const response = await fetch(`${SERVER_URL}/generate-component`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: msg.data })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const result = await response.json();
      figma.ui.postMessage({
        type: 'server-response',
        success: true,
        message: result.message || 'Component generated successfully'
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'server-response',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send to server'
      });
    }
  }
};

// Show UI
figma.showUI(__html__, { width: 500, height: 600 });

