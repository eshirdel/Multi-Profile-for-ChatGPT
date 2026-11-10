// Render a ChatGPT profile icon with an optional lower-right overlay.
// Usage:
// osascript -l JavaScript badge-icon.js SOURCE MODE OVERLAY LABEL COLOR OUT_ICONSET
//
// MODE: original, company, work, personal, client, third-party, testing,
//       sandbox, temporary, custom, manager, badge.
// OVERLAY: optional image path; overrides the built-in symbol.
// LABEL: 1-3 chars for badge mode.
// Uses only AppKit/Foundation included with macOS.

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
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    1
  );
}

function symbolForMode(mode) {
  const names = {
    company: 'briefcase.fill',
    work: 'hammer.fill',
    personal: 'person.fill',
    friend: 'heart.fill',
    client: 'person.2.fill',
    'third-party': 'link',
    testing: 'wrench.and.screwdriver.fill',
    sandbox: 'cube.fill',
    temporary: 'clock.fill',
    custom: 'star.fill',
    manager: 'square.grid.2x2.fill'
  };
  const name = names[mode] || 'star.fill';
  let image = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription($(name), $(name));
  if (!image || image.isNil()) {
    image = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription($('star.fill'), $('star.fill'));
  }
  if (!image || image.isNil()) fail('cannot create SF Symbol overlay');
  return image;
}

function drawTextBadge(label, color, px) {
  const s = px / 1024;
  const wide = label.length > 1;
  const w = (wide ? 520 : 330) * s;
  const h = 330 * s;
  const rect = $.NSMakeRect(px - w - 30 * s, 40 * s, w, h);
  const pill = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    rect, 150 * s, 150 * s);

  color.setFill;
  pill.fill;
  pill.setLineWidth(Math.max(1, 24 * s));
  $.NSColor.whiteColor.setStroke;
  pill.stroke;

  const font = $.NSFont.boldSystemFontOfSize((wide ? 150 : 230) * s);
  const attrs = $({ NSFont: font, NSColor: $.NSColor.whiteColor });
  const text = $(label);
  const ts = text.sizeWithAttributes(attrs);
  text.drawAtPointWithAttributes(
    $.NSMakePoint(
      rect.origin.x + (w - ts.width) / 2,
      rect.origin.y + (h - ts.height) / 2
    ),
    attrs
  );
}

function drawLogoOverlay(mode, overlayPath, color, px) {
  const s = px / 1024;
  const d = 350 * s;
  const rect = $.NSMakeRect(px - d - 26 * s, 34 * s, d, d);
  const plate = $.NSBezierPath.bezierPathWithOvalInRect(rect);

  $.NSColor.whiteColor.setFill;
  plate.fill;
  plate.setLineWidth(Math.max(1, 24 * s));
  color.setStroke;
  plate.stroke;

  let overlay;
  if (overlayPath) {
    overlay = $.NSImage.alloc.initWithContentsOfFile($(overlayPath));
    if (!overlay || overlay.isNil()) fail('cannot read overlay icon: ' + overlayPath);
  } else {
    overlay = symbolForMode(mode);
  }

  const inset = 72 * s;
  const inner = $.NSMakeRect(
    rect.origin.x + inset,
    rect.origin.y + inset,
    rect.size.width - inset * 2,
    rect.size.height - inset * 2
  );
  overlay.drawInRectFromRectOperationFraction(
    inner,
    $.NSZeroRect,
    $.NSCompositingOperationSourceOver,
    1
  );
}

function renderPNG(base, mode, overlayPath, label, color, px, outPath) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  rep.setSize($.NSMakeSize(px, px));

  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);
  ctx.setImageInterpolation($.NSImageInterpolationHigh);

  base.drawInRectFromRectOperationFraction(
    $.NSMakeRect(0, 0, px, px),
    $.NSZeroRect,
    $.NSCompositingOperationSourceOver,
    1
  );

  if (mode === 'badge') {
    if (label.length < 1 || label.length > 3) fail('badge label must be 1-3 characters');
    drawTextBadge(label, color, px);
  } else if (mode !== 'original') {
    drawLogoOverlay(mode, overlayPath, color, px);
  }

  $.NSGraphicsContext.restoreGraphicsState;
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (!png.writeToFileAtomically($(outPath), true)) fail('cannot write ' + outPath);
}

function argString(v) {
  let out = '';
  try {
    const unwrapped = ObjC.unwrap(v);
    if (unwrapped !== null && unwrapped !== undefined) out = String(unwrapped);
  } catch (e) {
    if (v !== null && v !== undefined) out = String(v);
  }
  return out === '__MPFC_EMPTY__' ? '' : out;
}

function run(argv) {
  if (argv.length !== 6) {
    fail('usage: badge-icon.js SOURCE MODE OVERLAY LABEL HEX_COLOR OUT_ICONSET');
  }

  const src = argString(argv[0]);
  const mode = argString(argv[1]);
  const overlayPath = argString(argv[2]);
  const label = argString(argv[3]);
  const hex = argString(argv[4]);
  const outDir = argString(argv[5]);

  const allowed = [
    'original', 'company', 'work', 'personal', 'friend', 'client', 'third-party',
    'testing', 'sandbox', 'temporary', 'custom', 'manager', 'badge'
  ];
  if (allowed.indexOf(mode) < 0) fail('unknown icon mode: ' + mode);

  const base = $.NSImage.alloc.initWithContentsOfFile($(src));
  if (!base || base.isNil()) fail('cannot read icon: ' + src);
  const color = parseColor(hex);

  const fm = $.NSFileManager.defaultManager;
  if (!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
      $(outDir), true, $(), null)) {
    fail('cannot create ' + outDir);
  }

  [16, 32, 128, 256, 512].forEach(pt => {
    renderPNG(base, mode, overlayPath, label, color, pt,
      outDir + '/icon_' + pt + 'x' + pt + '.png');
    renderPNG(base, mode, overlayPath, label, color, pt * 2,
      outDir + '/icon_' + pt + 'x' + pt + '@2x.png');
  });
  return '';
}