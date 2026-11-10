// Native ChatGPT profile manager for macOS.
// AppKit only: no browser, no network access, no third-party dependencies.

ObjC.import('AppKit');
ObjC.import('Foundation');

const envHome = $.NSProcessInfo.processInfo.environment.objectForKey($('HOME'));
const HOME = envHome && !envHome.isNil() ? ObjC.unwrap(envHome) : ObjC.unwrap($.NSHomeDirectory);
const CONFIG_DIR = HOME + '/.config/multi-profile-for-chatgpt';
const PROFILES_DIR = CONFIG_DIR + '/profiles';
const DEFAULT_ROOT_BASE = HOME + '/Library/Application Support/Multi Profile for ChatGPT/Profiles';
const CHATGPT_APP = '/Applications/ChatGPT.app';

const PRESETS = [
  { id: 'company', name: 'Company', detail: 'Company account or workspace', color: '#334155' },
  { id: 'work', name: 'Work', detail: 'Everyday work profile', color: '#0F766E' },
  { id: 'personal', name: 'Personal', detail: 'Personal account and chats', color: '#7C3AED' },
  { id: 'client', name: 'Client', detail: 'Dedicated to one client', color: '#0369A1' },
  { id: 'third-party', name: 'Third Party', detail: 'Partner or external org', color: '#C2410C' },
  { id: 'testing', name: 'Testing', detail: 'Experiments and QA', color: '#B91C1C' },
  { id: 'sandbox', name: 'Sandbox', detail: 'Disposable isolated workspace', color: '#4338CA' },
  { id: 'temporary', name: 'Temporary', detail: 'Short-lived separate session', color: '#52525B' },
  { id: 'custom', name: 'Custom', detail: 'Choose your own setup', color: '#A21CAF' }
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
  const exe = ObjC.unwrap($.NSProcessInfo.processInfo.arguments.objectAtIndex(0));
  const marker = '/lib/profile-manager.js';
  if (exe.indexOf(marker) >= 0) {
    return exe.replace(marker, '/bin/chatgpt-profiles');
  }
  return HOME + '/.local/bin/chatgpt-profiles';
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

function presetGlyph(id) {
  const map = {
    original: '◎',
    company: '▣',
    work: '◆',
    personal: '●',
    client: '◉',
    'third-party': '↗',
    testing: '⌁',
    sandbox: '◇',
    temporary: '◷',
    custom: '✦'
  };
  return map[id] || '✦';
}

function clearContent() {
  const old = mainWindow.contentView;
  const subviews = ObjC.deepUnwrap(old.subviews || []);
  subviews.forEach(v => v.removeFromSuperview);
}

function makeProfileCard(parent, profile, index, x, y, w) {
  const box = $.NSBox.alloc.initWithFrame($.NSMakeRect(x, y, w, 92));
  box.boxType = $.NSBoxCustom;
  box.borderType = $.NSLineBorder;
  box.cornerRadius = 16;
  box.borderColor = $.NSColor.separatorColor;
  box.fillColor = $.NSColor.controlBackgroundColor;
  parent.addSubview(box);

  const accent = $.NSBox.alloc.initWithFrame($.NSMakeRect(16, 19, 54, 54));
  accent.boxType = $.NSBoxCustom;
  accent.borderType = $.NSNoBorder;
  accent.cornerRadius = 14;
  accent.fillColor = profile.original ? $.NSColor.windowBackgroundColor : color(presetById(profile.preset).color);
  box.contentView.addSubview(accent);

  const glyph = textField($.NSMakeRect(0, 11, 54, 31), presetGlyph(profile.preset), 25, true);
  glyph.alignment = $.NSTextAlignmentCenter;
  glyph.textColor = profile.original ? $.NSColor.labelColor : $.NSColor.whiteColor;
  accent.contentView.addSubview(glyph);

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
  clearContent();
  profiles = listProfiles();

  const content = mainWindow.contentView;
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

  const n = profiles.length;
  const col = n % cols;
  const row = Math.floor(n / cols);
  const x = 7 + col * (cardW + gapX);
  const y = docH - 104 - row * (92 + gapY);
  const box = $.NSButton.alloc.initWithFrame($.NSMakeRect(x, y, cardW, 92));
  box.title = $('＋  New Instance');
  box.bezelStyle = $.NSBezelStyleRounded;
  box.font = $.NSFont.boldSystemFontOfSize(15);
  box.target = controller;
  box.action = 'newProfile:';
  doc.addSubview(box);
}

function makePresetButton(parent, preset, index, x, y, w) {
  const b = $.NSButton.alloc.initWithFrame($.NSMakeRect(x, y, w, 66));
  b.title = $(presetGlyph(preset.id) + '   ' + preset.name + '\n     ' + preset.detail);
  b.alignment = $.NSTextAlignmentLeft;
  b.bezelStyle = $.NSBezelStyleRounded;
  b.font = $.NSFont.systemFontOfSize(12);
  b.target = controller;
  b.action = 'presetChosen:';
  b.tag = index;
  parent.addSubview(b);
}

function showCreate() {
  clearContent();
  selectedPreset = 'company';

  const content = mainWindow.contentView;
  const back = roundedButton($.NSMakeRect(28, 590, 82, 34), '‹ Back', 'cancelCreate:', 0);
  content.addSubview(back);

  const title = textField($.NSMakeRect(126, 586, 520, 42), 'New Instance', 28, true);
  content.addSubview(title);
  const subtitle = textField($.NSMakeRect(128, 558, 650, 26),
    'Pick a preset, then customize the isolated profile.', 13, false);
  subtitle.textColor = $.NSColor.secondaryLabelColor;
  content.addSubview(subtitle);

  const presetW = 260;
  for (let i = 0; i < PRESETS.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    makePresetButton(content, PRESETS[i], i, 35 + col * 278, 465 - row * 76, presetW);
  }

  content.addSubview(textField($.NSMakeRect(38, 218, 120, 18), 'NAME', 11, true));
  nameField = inputField($.NSMakeRect(35, 178, 390, 34), 'Company', 'Profile name');
  content.addSubview(nameField);

  content.addSubview(textField($.NSMakeRect(463, 218, 160, 18), 'ACCENT COLOR', 11, true));
  colorPopup = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(460, 178, 180, 34), false);
  ['Slate', 'Green', 'Teal', 'Purple', 'Orange', 'Red', 'Pink', 'Amber'].forEach(x => colorPopup.addItemWithTitle($(x)));
  content.addSubview(colorPopup);

  content.addSubview(textField($.NSMakeRect(38, 145, 120, 18), 'DATA ROOT', 11, true));
  rootField = inputField($.NSMakeRect(35, 105, 690, 34),
    DEFAULT_ROOT_BASE + '/company', 'Dedicated profile root');
  content.addSubview(rootField);
  const chooseRoot = roundedButton($.NSMakeRect(735, 105, 120, 34), 'Choose…', 'chooseRoot:', 0);
  content.addSubview(chooseRoot);

  content.addSubview(textField($.NSMakeRect(38, 73, 170, 18), 'CUSTOM LOGO (OPTIONAL)', 11, true));
  iconField = inputField($.NSMakeRect(35, 33, 480, 34), '', 'Uses preset logo if empty');
  content.addSubview(iconField);
  const chooseIcon = roundedButton($.NSMakeRect(525, 33, 120, 34), 'Choose…', 'chooseIcon:', 0);
  content.addSubview(chooseIcon);

  content.addSubview(textField($.NSMakeRect(665, 73, 160, 18), 'TEXT BADGE', 11, true));
  labelField = inputField($.NSMakeRect(662, 33, 90, 34), '', 'QA');
  content.addSubview(labelField);

  openCheckbox = $.NSButton.alloc.initWithFrame($.NSMakeRect(760, 33, 100, 28));
  openCheckbox.buttonType = $.NSSwitchButton;
  openCheckbox.title = $('Open');
  openCheckbox.state = $.NSControlStateValueOn;
  content.addSubview(openCheckbox);

  statusLabel = textField($.NSMakeRect(35, 4, 610, 22), '', 11, false);
  statusLabel.textColor = $.NSColor.systemRedColor;
  content.addSubview(statusLabel);

  const create = roundedButton($.NSMakeRect(735, 0, 120, 32), 'Create', 'createProfile:', 0);
  create.keyEquivalent = $('\r');
  content.addSubview(create);
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
        nameField.stringValue = $(p.name);
        rootField.stringValue = $(DEFAULT_ROOT_BASE + '/' + slugify(p.name));
        iconField.stringValue = $('');
        labelField.stringValue = $('');

        const colorNames = {
          company: 'Slate', work: 'Teal', personal: 'Purple', client: 'Green',
          'third-party': 'Orange', testing: 'Red', sandbox: 'Purple',
          temporary: 'Slate', custom: 'Pink'
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
    $.NSWindowStyleMaskMiniaturizable |
    $.NSWindowStyleMaskResizable;

  mainWindow = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, 900, 650),
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