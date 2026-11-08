// Draw a profile badge on top of an app icon and write a macOS .iconset folder.
//
// usage: osascript -l JavaScript badge-icon.js SOURCE_ICON LABEL HEX_COLOR OUT_ICONSET
//   SOURCE_ICON  .icns/.png to start from (normally the installed ChatGPT icon)
//   LABEL        1-3 characters shown in the badge, e.g. P, C, PRO
//   HEX_COLOR    badge color, e.g. #16A34A
//   OUT_ICONSET  folder to create, e.g. /tmp/x.iconset (convert with iconutil)
//
// Only uses JavaScript for Automation + AppKit, which ship with macOS.

ObjC.import('AppKit');
ObjC.import('Foundation');
ObjC.import('stdlib');

function fail(msg) {
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    $(msg + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
  $.exit(1);
}

function parseColor(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) fail('invalid color: ' + hex + ' (expected #RRGGBB)');
  const n = parseInt(m[1], 16);
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1);
}

function renderPNG(base, label, color, px, outPath) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  rep.setSize($.NSMakeSize(px, px));
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);
  ctx.setImageInterpolation($.NSImageInterpolationHigh);

  base.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, px, px), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);

  // Proportions match the 1024 px design: pill in the lower-right corner with a white ring.
  const s = px / 1024;
  const wide = label.length > 1;
  const w = (wide ? 520 : 330) * s, h = 330 * s, margin = 30 * s, bottom = 40 * s;
  const rect = $.NSMakeRect(px - w - margin, bottom, w, h);
  const pill = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect, 150 * s, 150 * s);
  color.setFill;
  pill.fill;
  pill.setLineWidth(Math.max(1, 24 * s));
  $.NSColor.whiteColor.setStroke;
  pill.stroke;

  const font = $.NSFont.boldSystemFontOfSize((wide ? 150 : 230) * s);
  // NSFontAttributeName / NSForegroundColorAttributeName are not bridged in JXA; these are their values.
  const attrs = $({ NSFont: font, NSColor: $.NSColor.whiteColor });
  const text = $(label);
  const ts = text.sizeWithAttributes(attrs);
  text.drawAtPointWithAttributes($.NSMakePoint(rect.origin.x + (w - ts.width) / 2, rect.origin.y + (h - ts.height) / 2), attrs);

  $.NSGraphicsContext.restoreGraphicsState;
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (!png.writeToFileAtomically($(outPath), true)) fail('cannot write ' + outPath);
}

function run(argv) {
  if (argv.length !== 4) fail('usage: badge-icon.js SOURCE_ICON LABEL HEX_COLOR OUT_ICONSET');
  const [src, label, hex, outDir] = argv;
  if (label.length < 1 || label.length > 3) fail('label must be 1-3 characters');
  const base = $.NSImage.alloc.initWithContentsOfFile($(src));
  if (base.isNil()) fail('cannot read icon: ' + src);
  const color = parseColor(hex);

  const fm = $.NSFileManager.defaultManager;
  if (!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(outDir), true, $(), null)) fail('cannot create ' + outDir);

  // Standard iconset members: 16..512 at 1x and 2x.
  [16, 32, 128, 256, 512].forEach(pt => {
    renderPNG(base, label, color, pt, outDir + '/icon_' + pt + 'x' + pt + '.png');
    renderPNG(base, label, color, pt * 2, outDir + '/icon_' + pt + 'x' + pt + '@2x.png');
  });
  return '';
}
