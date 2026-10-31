/**
 * UGNAYRA — Production Build & Source Code Protection Pipeline
 * - Combines, minifies, and obfuscates frontend JavaScript with Terser (strips comments & mangles identifiers).
 * - Bundles and compresses all CSS stylesheets into a single minified bundle.
 * - Embeds anti-tamper client guards (disables right-click inspection, View-Source shortcuts, and DevTools hotkeys).
 * - Generates a standalone production distribution in frontend/dist/ with zero raw source code exposed.
 */

const fs = require('fs');
const path = require('path');
const terser = require('terser');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DIST_DIR = path.join(FRONTEND_DIR, 'dist');

console.log('🚀 Starting UGNAYRA Production Build & Source Protection Pipeline...\n');

// 1. Prepare dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'js'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });

// 2. Client Anti-Tamper & Security Guard code
const ANTI_TAMPER_HEADER = `
/**
 * UGNAYRA — School-Based Social Networking Platform (BulSU)
 * Production Secured Build — Protected against source tampering and reverse engineering.
 */
(function() {
  'use strict';
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // 1. Disable Right-Click Context Menu (Except editable fields)
    document.addEventListener('contextmenu', function(e) {
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea' && !e.target.isContentEditable) {
        e.preventDefault();
        return false;
      }
    });

    // 2. Deter Inspection & View-Source Keyboard Shortcuts
    document.addEventListener('keydown', function(e) {
      // F12
      if (e.keyCode === 123 || e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      // Ctrl + Shift + I (Inspect), Ctrl + Shift + J (Console), Ctrl + Shift + C (Element selector)
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67 || e.key === 'I' || e.key === 'J' || e.key === 'C')) {
        e.preventDefault();
        return false;
      }
      // Ctrl + U (View Source), Ctrl + S (Save Page)
      if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return false;
      }
    });

    // 3. Official Institutional Security Warning in DevTools Console
    try {
      console.log(
        '%cUGNAYRA %c— Official Campus Social Network\\n%cSTOP! This browser feature is reserved for system administrators. Pasting or executing scripts here violates the Acceptable Use Policy and will be logged.',
        'color:#173b70;font-size:24px;font-weight:bold;font-family:sans-serif;',
        'color:#c89d0a;font-size:16px;font-weight:600;font-family:sans-serif;',
        'color:#dc2626;font-size:12px;line-height:1.6;font-family:sans-serif;'
      );
    } catch (_e) {}
  }
})();
`;

// 3. Ordered JS Files to Bundle
const JS_FILES = [
  'src/js/core/config.js',
  'src/js/core/theme.js',
  'src/js/core/networkMonitor.js',
  'src/js/utils/escape.js',
  'src/js/utils/validator.js',
  'src/js/core/store.js',
  'src/js/core/apiClient.js',
  'src/js/core/templateLoader.js',
  'src/js/services/apiServices.js',
  'src/js/services/firebaseChatService.js',
  'src/js/components/ui.js',
  'src/js/components/postCard.js',
  'src/js/modules/authModule.js',
  'src/js/modules/feedModule.js',
  'src/js/modules/messagesModule.js',
  'src/js/modules/communitiesModule.js',
  'src/js/modules/announcementsModule.js',
  'src/js/modules/notificationsModule.js',
  'src/js/modules/profileModule.js',
  'src/js/modules/searchModule.js',
  'src/js/modules/rtcModule.js',
  'src/js/core/app-polling.js',
  'src/js/core/app.js'
];

async function bundleJavaScript() {
  console.log('📦 Bundling and minifying JavaScript files...');
  let combined = ANTI_TAMPER_HEADER + '\n';

  for (const relPath of JS_FILES) {
    const fullPath = path.join(FRONTEND_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Missing JS file: ' + fullPath);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    combined += '\n/* --- ' + path.basename(relPath) + ' --- */\n' + content + '\n';
  }

  const minified = await terser.minify(combined, {
    compress: {
      drop_debugger: true,
      passes: 2
    },
    mangle: {
      toplevel: false,
      reserved: ['UgnayraApp', 'UgnayraStore', 'UgnayraUI', 'UgnayraFormat', 'UgnayraServices', 'UgnayraTemplates', 'UgnayraTheme', 'UgnayraNetworkMonitor', 'UgnayraFirebaseChat', 'UgnayraAuthModule', 'UgnayraFeedModule', 'UgnayraMessagesModule', 'UgnayraCommunitiesModule', 'UgnayraAnnouncementsModule', 'UgnayraNotificationsModule', 'UgnayraProfileModule', 'UgnayraSearchModule', 'UgnayraRtcModule', 'UgnayraAppPolling', 'UGNAYRA_CONFIG', 'firebase']
    },
    format: {
      comments: false
    },
    sourceMap: false // NEVER emit source maps in production to prevent source code reconstruction!
  });

  const outJsPath = path.join(DIST_DIR, 'js', 'ugnayra.bundle.min.js');
  fs.writeFileSync(outJsPath, minified.code, 'utf8');
  console.log(`   ✅ Created ${path.relative(ROOT_DIR, outJsPath)} (${(minified.code.length / 1024).toFixed(1)} KB minified, zero source maps)`);
}

// 4. Ordered CSS Files to Bundle
const CSS_FILES = [
  'src/css/base/tokens.css',
  'src/css/base/reset.css',
  'src/css/base/typography.css',
  'src/css/base/utilities.css',
  'src/css/components/buttons.css',
  'src/css/components/forms.css',
  'src/css/components/cards-badges.css',
  'src/css/components/theme.css',
  'src/css/layouts/app-shell.css',
  'src/css/pages/views.css'
];

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
    .replace(/\s+/g, ' ')             // collapse whitespace
    .replace(/\s*([{}:;,>+~])\s*/g, '$1') // remove spaces around punctuation
    .replace(/;}/g, '}')              // remove trailing semicolons
    .trim();
}

function bundleCss() {
  console.log('🎨 Bundling and compressing CSS stylesheets...');
  let combined = '';

  for (const relPath of CSS_FILES) {
    const fullPath = path.join(FRONTEND_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Missing CSS file: ' + fullPath);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    combined += '\n' + content;
  }

  const minified = minifyCss(combined);
  const outCssPath = path.join(DIST_DIR, 'css', 'ugnayra.bundle.min.css');
  fs.writeFileSync(outCssPath, minified, 'utf8');
  console.log(`   ✅ Created ${path.relative(ROOT_DIR, outCssPath)} (${(minified.length / 1024).toFixed(1)} KB compressed)`);
}

// 5. Copy Directory Helper
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 6. Copy Public Assets & HTML View Templates
function copyAssetsAndTemplates() {
  console.log('📁 Copying public assets and HTML view templates...');
  copyDirRecursive(path.join(FRONTEND_DIR, 'public'), path.join(DIST_DIR, 'public'));
  copyDirRecursive(path.join(FRONTEND_DIR, 'src', 'pages'), path.join(DIST_DIR, 'src', 'pages'));
  console.log('   ✅ Copied public vendor libraries, logos, avatars, and page templates to dist/');
}

// 7. Generate Production index.html (Single CSS bundle + Single JS bundle, No Raw Source Files Exposed)
function generateProductionHtml() {
  console.log('📄 Generating production index.html...');
  const prodHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>UGNAYRA — Bulacan State University Social Platform</title>

  <!-- Favicon & Brand Icons -->
  <link rel="icon" type="image/png" href="public/assets/logos/ugnayra-mark.png" />
  <link rel="apple-touch-icon" href="public/assets/logos/ugnayra-mark.png" />
  <meta name="theme-color" content="#173B70" />

  <!-- Preload Critical Typography -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />

  <!-- Instant Zero-Flash Theme Pre-Hydration -->
  <script>
    (function () {
      try {
        var savedTheme = localStorage.getItem('ugnayra_theme') || 'system';
        var isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var effective = (savedTheme === 'dark' || (savedTheme === 'system' && isSystemDark)) ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', effective);
      } catch (_e) {}
    })();
  </script>

  <!-- Production Minified Master Stylesheet (Single Compact File) -->
  <link rel="stylesheet" href="css/ugnayra.bundle.min.css?v=prod" />
</head>
<body>
  <div id="app" class="app-root">
    <!-- Initial Accessible Boot State before AJAX Session Verification -->
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;">
      <img src="public/assets/logos/ugnayra-mark.png" alt="UGNAYRA" style="width:60px;height:60px;background:transparent;" />
      <div style="display:flex;align-items:center;gap:10px;color:var(--color-navy-900, #173B70);font-weight:600;font-size:1rem;">
        <span class="spinner" aria-hidden="true"></span>
        <span>Loading UGNAYRA...</span>
      </div>
    </div>
  </div>

  <!-- Local Bundled Dependencies (Offline-Safe) -->
  <script src="public/assets/vendor/jquery.min.js"></script>
  <script src="public/assets/vendor/lucide.min.js"></script>
  <!-- Firebase NoSQL Realtime Messaging Client (Offline-Safe Vendor Bundles) -->
  <script src="public/assets/vendor/firebase-app-compat.js"></script>
  <script src="public/assets/vendor/firebase-firestore-compat.js"></script>

  <!-- Production Minified & Obfuscated Application Bundle (Zero Raw Code Exposed) -->
  <script src="js/ugnayra.bundle.min.js?v=prod"></script>
</body>
</html>
`;

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), prodHtml, 'utf8');
  console.log('   ✅ Created frontend/dist/index.html (Clean production entrypoint)');
}

// 8. Generate Production vercel.json (Strict Security Headers & Directory Lockdown)
function generateProductionVercelConfig() {
  const vercelConfig = {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "version": 2,
    "cleanUrls": true,
    "trailingSlash": false,
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(self), geolocation=()" }
        ]
      },
      {
        "source": "/public/assets/(.*)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "/(.*)\\.(env|json|sql|md|git|yml|yaml|map)$",
        "headers": [
          { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive" }
        ]
      }
    ],
    "rewrites": [
      {
        "source": "/api/v1/:path*",
        "destination": "https://your-ugnayra-backend.onrender.com/api/v1/:path*"
      },
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  };

  fs.writeFileSync(path.join(DIST_DIR, 'vercel.json'), JSON.stringify(vercelConfig, null, 2), 'utf8');
  console.log('   ✅ Created frontend/dist/vercel.json (Locked down against sensitive file indexing)');
}

async function run() {
  try {
    await bundleJavaScript();
    bundleCss();
    copyAssetsAndTemplates();
    generateProductionHtml();
    generateProductionVercelConfig();

    console.log('\n🎉 BUILD COMPLETE! Production bundle is ready in frontend/dist/');
    console.log('🔒 Security Highlights:');
    console.log('   • All 21 JavaScript source files minified & mangled into js/ugnayra.bundle.min.js');
    console.log('   • Comments & development annotations stripped completely');
    console.log('   • Source maps disabled to prevent browser DevTools code reconstruction');
    console.log('   • Right-click context menu & View-Source shortcuts deterred');
    console.log('   • Production HTML only exposes minified bundles, hiding raw source tree');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

run();

