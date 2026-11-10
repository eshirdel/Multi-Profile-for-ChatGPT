// Native ChatGPT profile manager for macOS.
// AppKit only: no browser, no network access, no third-party dependencies.

ObjC.import('AppKit');
ObjC.import('Foundation');

const envHome = $.NSProcessInfo.processInfo.environment.objectForKey($('HOME'));
const HOME = envHome && !envHome.isNil() ? ObjC.unwrap(envHome) : ObjC.unwrap($.NSHomeDirectory);
const CONFIG_DIR = HOME + '/.config/multi-profile-for-chatgpt';
const PROFILES_DIR = CONFIG_DIR + '/profiles';
const PREVIEWS_DIR = CONFIG_DIR + '/previews';
const DEFAULT_ROOT_BASE = HOME + '/Library/Application Support/Multi Profile for ChatGPT/Profiles';
const envApp = $.NSProcessInfo.processInfo.environment.objectForKey($('CHATGPT_APP'));
const CHATGPT_APP = envApp && !envApp.isNil() ? ObjC.unwrap(envApp) : '/Applications/ChatGPT.app';
const envLauncherDir = $.NSProcessInfo.processInfo.environment.objectForKey($('MPFC_LAUNCHER_DIR'));
const LAUNCHER_DIR = envLauncherDir && !envLauncherDir.isNil() ? ObjC.unwrap(envLauncherDir) : HOME + '/Applications';

const PRESETS = [
  { id: 'personal', name: 'Personal', detail: 'Your own profile; can use the same account as Company with a different workspace', color: '#7C3AED' },
  { id: 'company', name: 'Company', detail: 'Company workspace; can use the same account as Personal', color: '#334155' },
  { id: 'friend', name: 'Friend', detail: 'A separate profile for a friend\'s ChatGPT account', color: '#D97706' },
  { id: 'client', name: 'Client', detail: 'Dedicated profile for a client account or workspace', color: '#0369A1' },
  { id: 'third-party', name: 'Third Party', detail: 'Partner, vendor, contractor or external organization', color: '#C2410C' },
  { id: 'sandbox', name: 'Sandbox', detail: 'Isolated disposable profile for testing or temporary use', color: '#4338CA' }
];

let mainWindow = null;
let controller = null;
let profiles = [];
let selectedPreset = 'company';
let nameField = null;
let rootField = null;
let iconField = null;
let labelField = null;
let colorPopup = null;
let openCheckbox = null;
let statusLabel = null;
let presetButtons = [];

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(
    $(path), $.NSUTF8StringEncoding, null);
  if (!s || s.isNil()) return '';
  return ObjC.unwrap(s);
}

function parseConf(text) {
  const out = {};
  text.split(/\r?\n/).forEach(line => {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  });
  return out;
}

function cliPath() {
  const envCli = $.NSProcessInfo.processInfo.environment.objectForKey($('MPFC_CLI'));
  if (envCli && !envCli.isNil()) {
    const value = ObjC.unwrap(envCli);
    if (value) return value;
  }
  return HOME + '/.local/share/multi-profile-for-chatgpt/current/bin/chatgpt-profiles';
}

function listProfiles() {
  const result = [{
    name: 'Original',
    preset: 'original',
    root: 'Existing ChatGPT profile — untouched',
    original: true
  }];

  const fm = $.NSFileManager.defaultManager;
  const contents = fm.contentsOfDirectoryAtPathError($(PROFILES_DIR), null);
  if (!contents || contents.isNil()) return result;

  const files = ObjC.deepUnwrap(contents).filter(x => /\.conf$/.test(x)).sort();
  files.forEach(file => {
    const c = parseConf(readText(PROFILES_DIR + '/' + file));
    if (!c.NAME) return;
    result.push({
      name: c.NAME,
      preset: c.PRESET || 'custom',
      root: c.ROOT || '(legacy profile paths)',
      original: false
    });
  });
  return result;
}

function runTask(path, args) {
  const task = $.NSTask.alloc.init;
  const pipe = $.NSPipe.pipe;
  task.launchPath = $(path);
  task.arguments = $(args);
  task.standardOutput = pipe;
  task.standardError = pipe;

  try {
    task.launch;
    task.waitUntilExit;
  } catch (e) {
    return { status: 1, output: String(e) };
  }

  const data = pipe.fileHandleForReading.readDataToEndOfFile;
  const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  return {
    status: Number(task.terminationStatus),
    output: str && !str.isNil() ? ObjC.unwrap(str) : ''
  };
}

function color(hex) {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) return $.NSColor.controlAccentColor;
  const n = parseInt(m[1], 16);
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    1
  );
}

function textField(frame, text, size, bold) {
  const f = $.NSTextField.alloc.initWithFrame(frame);
  f.stringValue = $(text || '');
  f.editable = false;
  f.bezeled = false;
  f.drawsBackground = false;
  f.selectable = false;
  f.font = bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
  f.textColor = $.NSColor.labelColor;
  return f;
}

function inputField(frame, value, placeholder) {
  const f = $.NSTextField.alloc.initWithFrame(frame);
  f.stringValue = $(value || '');
  f.placeholderString = $(placeholder || '');
  f.font = $.NSFont.systemFontOfSize(14);
  return f;
}

function roundedButton(frame, title, action, tag) {
  const b = $.NSButton.alloc.initWithFrame(frame);
  b.title = $(title);
  b.bezelStyle = $.NSBezelStyleRounded;
  b.target = controller;
  b.action = action;
  if (tag !== undefined) b.tag = tag;
  return b;
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function presetById(id) {
  for (let i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].id === id) return PRESETS[i];
  }
  return PRESETS[PRESETS.length - 1];
}

function presetSymbolName(id) {
  const map = {
    company: 'briefcase.fill',
    personal: 'person.fill',
    friend: 'heart.fill',
    client: 'person.2.fill',
    'third-party': 'link',
    sandbox: 'cube.fill'
  };
  return map[id] || 'star.fill';
}

function pathExists(path) {
  return $.NSFileManager.defaultManager.fileExistsAtPath($(path));
}

function appIconForPath(path) {
  return $.NSWorkspace.sharedWorkspace.iconForFile($(path));
}

function imageFromFile(path) {
  const image = $.NSImage.alloc.initWithContentsOfFile($(path));
  if (!image || image.isNil()) return null;
  return image;
}

function profileLauncherPath(profile) {
  return LAUNCHER_DIR + '/ChatGPT Profiles/' + slugify(profile.name) + '/ChatGPT ' + profile.name + '.app';
}

function presetPreviewPath(presetId) {
  return PREVIEWS_DIR + '/' + presetId + '.icns';
}

function makeIconPreview(frame, presetId, hex, actualAppPath) {
  const holder = $.NSView.alloc.initWithFrame(frame);
  const size = frame.size.width;

  const base = $.NSImageView.alloc.initWithFrame($.NSMakeRect(0, 0, size, size));
  base.imageScaling = $.NSImageScaleProportionallyUpOrDown;

  if (actualAppPath && pathExists(actualAppPath)) {
    base.image = appIconForPath(actualAppPath);
    holder.addSubview(base);
    return holder;
  }

  const previewPath = presetPreviewPath(presetId);
  if (presetId !== 'original' && pathExists(previewPath)) {
    const previewImage = imageFromFile(previewPath);
    if (previewImage) {
      base.image = previewImage;
      holder.addSubview(base);
      return holder;
    }
  }

  base.image = appIconForPath(CHATGPT_APP);
  holder.addSubview(base);

  if (presetId === 'original') return holder;

  const badge = Math.max(19, Math.round(size * 0.42));
  const plate = $.NSBox.alloc.initWithFrame($.NSMakeRect(size - badge, 0, badge, badge));
  plate.boxType = $.NSBoxCustom;
  plate.borderType = $.NSLineBorder;
  plate.cornerRadius = badge / 2;
  plate.borderColor = color(hex || '#52525B');
  plate.fillColor = $.NSColor.whiteColor;
  holder.addSubview(plate);

  const symbol = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(
    $(presetSymbolName(presetId)),
    $(presetId)
  );
  if (symbol && !symbol.isNil()) {
    const inset = Math.max(3, Math.round(badge * 0.22));
    const symbolView = $.NSImageView.alloc.initWithFrame(
      $.NSMakeRect(inset, inset, badge - inset * 2, badge - inset * 2)
    );
    symbolView.image = symbol;
    symbolView.imageScaling = $.NSImageScaleProportionallyUpOrDown;
    symbolView.contentTintColor = color(hex || '#52525B');
    plate.contentView.addSubview(symbolView);
  }

  return holder;
}

function clearContent() {
  const old = mainWindow.contentView;
  const frame = old ? old.frame : $.NSMakeRect(0, 0, 900, 680);
  const fresh = $.NSView.alloc.initWithFrame(frame);
  mainWindow.contentView = fresh;
  return fresh;
}

function makeProfileCard(parent, profile, index, x, y, w) {
  const box = $.NSBox.alloc.initWithFrame($.NSMakeRect(x, y, w, 92));
  box.boxType = $.NSBoxCustom;
  box.borderType = $.NSLineBorder;
  box.cornerRadius = 16;
  box.borderColor = $.NSColor.separatorColor;
  box.fillColor = $.NSColor.controlBackgroundColor;
  parent.addSubview(box);

  const preset = profile.original ? { color: '#52525B' } : presetById(profile.preset);
  const actualApp = profile.original ? CHATGPT_APP : profileLauncherPath(profile);
  const icon = makeIconPreview(
    $.NSMakeRect(16, 19, 54, 54),
    profile.original ? 'original' : profile.preset,
    preset.color,
    actualApp
  );
  box.contentView.addSubview(icon);

  const name = textField($.NSMakeRect(84, 50, w - 178, 24), profile.name, 16, true);
  box.contentView.addSubview(name);

  const root = textField($.NSMakeRect(84, 20, w - 178, 32), profile.root, 11, false);
  root.textColor = $.NSColor.secondaryLabelColor;
  root.lineBreakMode = $.NSLineBreakByTruncatingMiddle;
  box.contentView.addSubview(root);

  const open = roundedButton($.NSMakeRect(w - 86, 30, 68, 32), 'Open', 'openProfile:', index);
  box.contentView.addSubview(open);
}

function showProfiles() {
  const content = clearContent();
  profiles = listProfiles();
  const title = textField($.NSMakeRect(30, 590, 520, 42), 'ChatGPT Profiles', 31, true);
  content.addSubview(title);
  const subtitle = textField($.NSMakeRect(32, 560, 560, 26),
    'Choose an existing profile or create one isolated instance.', 14, false);
  subtitle.textColor = $.NSColor.secondaryLabelColor;
  content.addSubview(subtitle);

  const newButton = roundedButton($.NSMakeRect(700, 578, 155, 40), '＋  New Instance', 'newProfile:', 0);
  newButton.keyEquivalent = $('n');
  content.addSubview(newButton);

  const scroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(24, 24, 852, 520));
  scroll.hasVerticalScroller = true;
  scroll.drawsBackground = false;
  content.addSubview(scroll);

  const cols = 2;
  const cardW = 405;
  const gapX = 14;
  const gapY = 14;
  const rows = Math.ceil(profiles.length / cols);
  const docH = Math.max(500, rows * (92 + gapY) + 16);
  const doc = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, 835, docH));
  scroll.documentView = doc;

  profiles.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 7 + col * (cardW + gapX);
    const y = docH - 104 - row * (92 + gapY);
    makeProfileCard(doc, p, i, x, y, cardW);
  });

}

function makePresetButton(parent, preset, index, x, y, w) {
  const b = $.NSButton.alloc.initWithFrame($.NSMakeRect(x, y, w, 70));
  b.title = $(preset.name);
  b.bezelStyle = $.NSBezelStyleRounded;
  b.buttonType = $.NSButtonTypeToggle;
  b.state = preset.id === selectedPreset ? $.NSControlStateValueOn : $.NSControlStateValueOff;
  b.font = $.NSFont.boldSystemFontOfSize(14);
  b.alignment = $.NSTextAlignmentLeft;
  b.imagePosition = $.NSImageLeft;
  b.imageScaling = $.NSImageScaleProportionallyUpOrDown;
  b.toolTip = $(preset.detail);
  b.target = controller;
  b.action = 'presetChosen:';
  b.tag = index;

  const previewPath = presetPreviewPath(preset.id);
  let preview = pathExists(previewPath) ? imageFromFile(previewPath) : null;
  if (!preview) preview = appIconForPath(CHATGPT_APP);
  if (preview) {
    preview.size = $.NSMakeSize(44, 44);
    b.image = preview;
  }

  presetButtons.push(b);
  parent.addSubview(b);
}

function showCreate() {
  const content = clearContent();
  selectedPreset = 'company';
  presetButtons = [];

  const back = roundedButton($.NSMakeRect(28, 620, 82, 34), '‹ Back', 'cancelCreate:', 0);
  content.addSubview(back);

  const title = textField($.NSMakeRect(126, 616, 520, 38), 'New Instance', 28, true);
  content.addSubview(title);

  const subtitle = textField($.NSMakeRect(128, 590, 650, 22),
    'Choose a profile type, then customize its isolated storage and icon.', 13, false);
  subtitle.textColor = $.NSColor.secondaryLabelColor;
  content.addSubview(subtitle);

  const presetsTitle = textField($.NSMakeRect(36, 554, 160, 18), 'PROFILE TYPE', 11, true);
  presetsTitle.textColor = $.NSColor.secondaryLabelColor;
  content.addSubview(presetsTitle);

  const presetW = 260;
  for (let i = 0; i < PRESETS.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    makePresetButton(content, PRESETS[i], i, 35 + col * 278, 470 - row * 82, presetW);
  }

  const panel = $.NSBox.alloc.initWithFrame($.NSMakeRect(28, 42, 844, 328));
  panel.boxType = $.NSBoxCustom;
  panel.borderType = $.NSLineBorder;
  panel.cornerRadius = 16;
  panel.borderColor = $.NSColor.separatorColor;
  panel.fillColor = $.NSColor.controlBackgroundColor;
  content.addSubview(panel);

  const form = panel.contentView;

  form.addSubview(textField($.NSMakeRect(22, 278, 120, 18), 'NAME', 11, true));
  nameField = inputField($.NSMakeRect(20, 238, 385, 34), 'Company', 'Profile name');
  form.addSubview(nameField);

  form.addSubview(textField($.NSMakeRect(435, 278, 160, 18), 'ACCENT COLOR', 11, true));
  colorPopup = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(432, 238, 180, 34), false);
  ['Slate', 'Green', 'Teal', 'Purple', 'Orange', 'Red', 'Pink', 'Amber'].forEach(x => colorPopup.addItemWithTitle($(x)));
  colorPopup.selectItemWithTitle($('Slate'));
  form.addSubview(colorPopup);

  form.addSubview(textField($.NSMakeRect(22, 200, 120, 18), 'DATA ROOT', 11, true));
  rootField = inputField($.NSMakeRect(20, 160, 650, 34),
    DEFAULT_ROOT_BASE + '/company', 'Dedicated profile root');
  form.addSubview(rootField);
  const chooseRoot = roundedButton($.NSMakeRect(684, 160, 120, 34), 'Choose…', 'chooseRoot:', 0);
  form.addSubview(chooseRoot);

  const rootHint = textField($.NSMakeRect(22, 136, 760, 18),
    'Codex, Electron state and runtime stay under this root.', 11, false);
  rootHint.textColor = $.NSColor.secondaryLabelColor;
  form.addSubview(rootHint);

  form.addSubview(textField($.NSMakeRect(22, 103, 190, 18), 'CUSTOM LOGO (OPTIONAL)', 11, true));
  iconField = inputField($.NSMakeRect(20, 63, 470, 34), '', 'Uses preset logo if empty');
  form.addSubview(iconField);
  const chooseIcon = roundedButton($.NSMakeRect(504, 63, 110, 34), 'Choose…', 'chooseIcon:', 0);
  form.addSubview(chooseIcon);

  form.addSubview(textField($.NSMakeRect(638, 103, 100, 18), 'TEXT BADGE', 11, true));
  labelField = inputField($.NSMakeRect(636, 63, 90, 34), '', 'QA');
  form.addSubview(labelField);

  openCheckbox = $.NSButton.alloc.initWithFrame($.NSMakeRect(735, 66, 72, 28));
  openCheckbox.buttonType = $.NSSwitchButton;
  openCheckbox.title = $('Open');
  openCheckbox.state = $.NSControlStateValueOn;
  form.addSubview(openCheckbox);

  statusLabel = textField($.NSMakeRect(22, 18, 610, 24), '', 11, false);
  statusLabel.textColor = $.NSColor.systemRedColor;
  form.addSubview(statusLabel);

  const create = roundedButton($.NSMakeRect(684, 12, 120, 34), 'Create Instance', 'createProfile:', 0);
  create.keyEquivalent = $('\r');
  form.addSubview(create);
}

ObjC.registerSubclass({
  name: 'MPFCController',
  methods: {
    'openProfile:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        const idx = Number(sender.tag);
        const p = profiles[idx];
        if (!p) return;
        let r;
        if (p.original) {
          r = runTask('/usr/bin/open', [CHATGPT_APP]);
        } else {
          r = runTask(cliPath(), ['open', p.name]);
        }
        if (r.status !== 0) {
          const alert = $.NSAlert.alloc.init;
          alert.messageText = $('Could not open profile');
          alert.informativeText = $(r.output || 'Unknown error');
          alert.runModal;
        }
      }
    },
    'newProfile:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        showCreate();
      }
    },
    'cancelCreate:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        showProfiles();
      }
    },
    'presetChosen:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        const p = PRESETS[Number(sender.tag)] || PRESETS[0];
        selectedPreset = p.id;
        presetButtons.forEach((button, i) => {
          button.state = i === Number(sender.tag)
            ? $.NSControlStateValueOn
            : $.NSControlStateValueOff;
        });
        nameField.stringValue = $(p.name);
        rootField.stringValue = $(DEFAULT_ROOT_BASE + '/' + slugify(p.name));
        iconField.stringValue = $('');
        labelField.stringValue = $('');

        const colorNames = {
          personal: 'Purple', company: 'Slate', friend: 'Amber',
          client: 'Green', 'third-party': 'Orange', sandbox: 'Purple'
        };
        colorPopup.selectItemWithTitle($(colorNames[p.id] || 'Pink'));
      }
    },
    'chooseRoot:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        const panel = $.NSOpenPanel.openPanel;
        panel.allowsMultipleSelection = false;
        panel.canCreateDirectories = true;
        panel.canChooseDirectories = true;
        panel.canChooseFiles = false;
        panel.prompt = $('Choose');
        panel.message = $('Choose a dedicated data root for this profile.');
        if (panel.runModal === $.NSModalResponseOK) {
          rootField.stringValue = panel.URL.path;
        }
      }
    },
    'chooseIcon:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        const panel = $.NSOpenPanel.openPanel;
        panel.allowsMultipleSelection = false;
        panel.canChooseDirectories = false;
        panel.canChooseFiles = true;
        panel.allowedFileTypes = $(['icns', 'png', 'jpg', 'jpeg', 'tiff']);
        panel.prompt = $('Choose');
        panel.message = $('Choose an image to overlay on the ChatGPT icon.');
        if (panel.runModal === $.NSModalResponseOK) {
          iconField.stringValue = panel.URL.path;
        }
      }
    },
    'createProfile:': {
      types: ['void', ['id']],
      implementation: function(sender) {
        const name = ObjC.unwrap(nameField.stringValue).trim();
        const root = ObjC.unwrap(rootField.stringValue).trim();
        const icon = ObjC.unwrap(iconField.stringValue).trim();
        const label = ObjC.unwrap(labelField.stringValue).trim();
        const colorName = ObjC.unwrap(colorPopup.titleOfSelectedItem).toLowerCase();

        if (!name) {
          statusLabel.stringValue = $('Choose a profile name.');
          return;
        }
        if (!root) {
          statusLabel.stringValue = $('Choose a data root.');
          return;
        }
        if (label.length > 3) {
          statusLabel.stringValue = $('Text badge must be at most 3 characters.');
          return;
        }

        const args = [
          'create',
          '--name', name,
          '--preset', selectedPreset,
          '--root', root,
          '--color', colorName
        ];
        if (icon) args.push('--icon', icon);
        if (label) args.push('--label', label);
        if (Number(openCheckbox.state) === Number($.NSControlStateValueOn)) args.push('--open');

        statusLabel.stringValue = $('Creating…');
        const r = runTask(cliPath(), args);
        if (r.status !== 0) {
          statusLabel.stringValue = $(r.output.trim() || 'Unable to create profile.');
          return;
        }
        showProfiles();
      }
    },
    'windowWillClose:': {
      types: ['void', ['id']],
      implementation: function(notification) {
        $.NSApplication.sharedApplication.terminate(null);
      }
    }
  }
});

function main() {
  const testFlag = $.NSProcessInfo.processInfo.environment.objectForKey($('MPFC_MANAGER_TEST'));
  if (testFlag && !testFlag.isNil() && ObjC.unwrap(testFlag)) {
    console.log(JSON.stringify(listProfiles()));
    return;
  }

  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyRegular);

  controller = $.MPFCController.alloc.init;

  const style =
    $.NSWindowStyleMaskTitled |
    $.NSWindowStyleMaskClosable |
    $.NSWindowStyleMaskMiniaturizable;

  mainWindow = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, 900, 680),
    style,
    $.NSBackingStoreBuffered,
    false
  );
  mainWindow.title = $('ChatGPT Profiles');
  mainWindow.minSize = $.NSMakeSize(760, 600);
  mainWindow.center;
  mainWindow.delegate = controller;

  showProfiles();

  mainWindow.makeKeyAndOrderFront(null);
  app.activateIgnoringOtherApps(true);
  app.run;
}

main();