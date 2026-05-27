'use strict';

const vscode      = require('vscode');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { exec }    = require('child_process');
const https       = require('https');
const http        = require('http');

// ───────────────────────────────────────────────────────────────────────────
// Language / filename map  (used by extension and sent to webview)
// ───────────────────────────────────────────────────────────────────────────

const LANGUAGES = [
    { id: 'global',          label: 'Global (all languages)', file: 'global.code-snippets' },
    { id: 'php',             label: 'PHP',                    file: 'php.json'             },
    { id: 'javascript',      label: 'JavaScript',             file: 'javascript.json'      },
    { id: 'typescript',      label: 'TypeScript',             file: 'typescript.json'      },
    { id: 'typescriptreact', label: 'TSX',                    file: 'typescriptreact.json' },
    { id: 'javascriptreact', label: 'JSX',                    file: 'javascriptreact.json' },
    { id: 'css',             label: 'CSS',                    file: 'css.json'             },
    { id: 'scss',            label: 'SCSS',                   file: 'scss.json'            },
    { id: 'html',            label: 'HTML',                   file: 'html.json'            },
    { id: 'python',          label: 'Python',                 file: 'python.json'          },
    { id: 'markdown',        label: 'Markdown',               file: 'markdown.json'        },
    { id: 'json',            label: 'JSON',                   file: 'json.json'            },
    { id: 'shellscript',     label: 'Shell',                  file: 'shellscript.json'     },
    { id: 'yaml',            label: 'YAML',                   file: 'yaml.json'            },
    { id: 'sql',             label: 'SQL',                    file: 'sql.json'             },
    { id: 'rust',            label: 'Rust',                   file: 'rust.json'            },
    { id: 'go',              label: 'Go',                     file: 'go.json'              },
    { id: 'java',            label: 'Java',                   file: 'java.json'            },
    { id: 'csharp',          label: 'C#',                     file: 'csharp.json'          },
    { id: 'vue',             label: 'Vue',                    file: 'vue.json'             },
    { id: 'svelte',          label: 'Svelte',                 file: 'svelte.json'          },
];

const FILE_TO_LANG = {};
LANGUAGES.forEach(l => { FILE_TO_LANG[l.file] = l; });

// ───────────────────────────────────────────────────────────────────────────
// Example snippets — loaded at runtime from the examples/ folder.
// Each file is a JSON array of { id, category, file, name, prefix,
// description, body } objects.  Files are read in alphabetical order so
// the category display order is predictable.
// ───────────────────────────────────────────────────────────────────────────

function loadExampleSnippets() {
    const exDir = path.join(__dirname, 'examples');
    if (!fs.existsSync(exDir)) return [];
    const all = [];
    try {
        const files = fs.readdirSync(exDir)
            .filter(f => f.endsWith('.json'))
            .sort();
        for (const file of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(exDir, file), 'utf8'));

                // ── Keyword Expander export format ────────────────────────
                // { keywordExpander: true, snippets: [...] }
                if (data && data.keywordExpander && Array.isArray(data.snippets)) {
                    const category = file
                        .replace(/\.json$/, '')
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase())
                        .replace(/\bAcf\b/g,        'ACF')
                        .replace(/\bAjax\b/g,        'AJAX')
                        .replace(/\bUi\b/g,          'UI')
                        .replace(/\bCpt\b/g,         'CPT')
                        .replace(/\bWoocommerce\b/g, 'WooCommerce')
                        .replace(/\bWordpress\b/g,   'WordPress')
                        .replace(/\bPhp\b/g,         'PHP');
                    for (const s of data.snippets) {
                        if (!s.file || !s.name || !s.prefix) continue;
                        all.push({
                            id:          file + '::' + s.name,
                            category,
                            file:        s.file,
                            name:        s.name,
                            prefix:      Array.isArray(s.prefix) ? s.prefix.join(', ') : String(s.prefix),
                            description: s.description || '',
                            body:        Array.isArray(s.body)   ? s.body.join('\n')   : String(s.body   || ''),
                            tags:        Array.isArray(s.tags)   ? s.tags              : [],
                        });
                    }

                // ── Plain array format ────────────────────────────────────
                // [ { id, category, file, name, prefix, body, ... }, ... ]
                } else if (Array.isArray(data)) {
                    all.push(...data);
                }
            } catch (_) {}
        }
    } catch (_) {}
    return all;
}

// ───────────────────────────────────────────────────────────────────────────
// Snippets directory (handles Code vs Code - Insiders, all platforms)
// ───────────────────────────────────────────────────────────────────────────

function getSnippetsDir() {
    const home      = os.homedir();
    const appName   = (vscode.env && vscode.env.appName) || '';
    const folder    = appName.includes('Insiders') ? 'Code - Insiders' : 'Code';

    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), folder, 'User', 'snippets');
    }
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', folder, 'User', 'snippets');
    }
    return path.join(home, '.config', folder, 'User', 'snippets');
}

// ───────────────────────────────────────────────────────────────────────────
// JSONC parser (VS Code snippet files may contain // and /* */ comments)
// ───────────────────────────────────────────────────────────────────────────

function parseJsonc(text) {
    let out      = '';
    let inString = false;
    let escape   = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape)                                { out += ch; escape = false; continue; }
        if (ch === '\\' && inString)               { out += ch; escape = true;  continue; }
        if (ch === '"')                             { inString = !inString; out += ch; continue; }
        if (!inString && ch === '/' && text[i+1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
        }
        if (!inString && ch === '/' && text[i+1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i+1] === '/')) i++;
            i++;
            continue;
        }
        out += ch;
    }
    return JSON.parse(out);
}

// ───────────────────────────────────────────────────────────────────────────
// File I/O helpers
// ───────────────────────────────────────────────────────────────────────────

function readSnippetFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        return parseJsonc(fs.readFileSync(filePath, 'utf8'));
    } catch (_) { return {}; }
}

function writeSnippetFile(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'), 'utf8');
}

// ───────────────────────────────────────────────────────────────────────────
// Tags sidecar  (keyword-expander-tags.json alongside snippet files)
// Keys are "file::snippetName", values are string[].
// Native snippet files are never modified — full VS Code compatibility kept.
// ───────────────────────────────────────────────────────────────────────────

function getTagsFilePath() {
    return path.join(getSnippetsDir(), 'keyword-expander-tags.json');
}

function readTags() {
    try {
        const filePath = getTagsFilePath();
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) { return {}; }
}

function writeTags(tags) {
    const filePath = getTagsFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Drop empty-array entries to keep the file tidy
    const cleaned = {};
    for (const [k, v] of Object.entries(tags)) {
        if (Array.isArray(v) && v.length > 0) cleaned[k] = v;
    }
    fs.writeFileSync(filePath, JSON.stringify(cleaned, null, '\t'), 'utf8');
}

function parseTags(raw) {
    if (!raw) return [];
    return raw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────
// Meta sidecar  (keyword-expander-meta.json alongside snippet files)
// Keys are "file::snippetName", values are { uses, lastUsed, favourite }.
// Tracks usage count, last-used timestamp, and favourite flag.
// ───────────────────────────────────────────────────────────────────────────

function getMetaFilePath() {
    return path.join(getSnippetsDir(), 'keyword-expander-meta.json');
}

function readMeta() {
    try {
        const filePath = getMetaFilePath();
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) { return {}; }
}

function writeMeta(meta) {
    const filePath = getMetaFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(meta, null, '\t'), 'utf8');
}

function trackUsage(id) {
    const meta     = readMeta();
    const entry    = meta[id] || { uses: 0, lastUsed: 0, favourite: false };
    entry.uses     = (entry.uses || 0) + 1;
    entry.lastUsed = Date.now();
    meta[id]       = entry;
    writeMeta(meta);
}

// Dismissed external snippets — keyed by sourceUrl::file::name so they
// survive source removal/re-add and remain stable across sessions.
function getDismissed() {
    return new Set(readMeta().__dismissed__ || []);
}

function addDismissed(key) {
    const meta = readMeta();
    const set  = new Set(meta.__dismissed__ || []);
    set.add(key);
    meta.__dismissed__ = Array.from(set);
    writeMeta(meta);
}

function clearDismissed() {
    const meta = readMeta();
    delete meta.__dismissed__;
    writeMeta(meta);
}

// ───────────────────────────────────────────────────────────────────────────
// External sources sidecar  (keyword-expander-sources.json)
// Each entry: { id, name, type, url, token, branch, enabled }
// Types: github-repo | github-gist | local | http
// ───────────────────────────────────────────────────────────────────────────

function getSourcesFilePath() {
    return path.join(getSnippetsDir(), 'keyword-expander-sources.json');
}

function readSources() {
    try {
        const fp = getSourcesFilePath();
        if (!fs.existsSync(fp)) return [];
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) { return []; }
}

function writeSources(sources) {
    const fp  = getSourcesFilePath();
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(sources, null, '\t'), 'utf8');
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP helper — follows redirects, returns { status, body }
// ───────────────────────────────────────────────────────────────────────────

function httpGet(url, headers = {}, redirects = 5) {
    return new Promise((resolve, reject) => {
        if (redirects === 0) { reject(new Error('Too many redirects')); return; }
        const lib     = url.startsWith('https') ? https : http;
        const options = { headers: { 'User-Agent': 'keyword-expander-vscode', ...headers } };
        lib.get(url, options, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                httpGet(res.headers.location, headers, redirects - 1).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

// ───────────────────────────────────────────────────────────────────────────
// Source type detection
// ───────────────────────────────────────────────────────────────────────────

function detectSourceType(url) {
    if (!url) return null;
    if (/^([/~]|[A-Za-z]:[/\\])/.test(url)) return 'local';
    if (url.includes('gist.github.com'))      return 'github-gist';
    if (url.includes('github.com'))           return 'github-repo';
    if (/^https?:\/\//.test(url))             return 'http';
    return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Parse snippets from a JSON string fetched from an external source.
// Handles: KE export format, plain array, and native VS Code snippet format.
// ───────────────────────────────────────────────────────────────────────────

function makeExternalSnippet(s, file, sourceName, sourceId, sourceUrl) {
    const lang   = FILE_TO_LANG[file] || { label: file.replace(/\.(json|code-snippets)$/, '') };
    const prefix = Array.isArray(s.prefix) ? s.prefix.join(', ') : String(s.prefix || '');
    const body   = Array.isArray(s.body)   ? s.body.join('\n')   : String(s.body   || '');
    return {
        id:          '__ext__' + sourceId + '::' + file + '::' + s.name,
        file,
        langLabel:   lang.label,
        name:        s.name,
        prefix,
        body,
        description: s.description || '',
        scope:       s.scope       || '',
        tags:        Array.isArray(s.tags) ? s.tags : [],
        uses:        0,
        lastUsed:    0,
        favourite:   false,
        readonly:    true,
        sourceName,
        sourceId,
        sourceUrl,
        // Stable dismiss key — survives source re-add or rename
        dismissKey:  (sourceUrl || sourceId) + '::' + file + '::' + s.name,
    };
}

function parseSnippetsFromSource(text, filename, sourceName, sourceId, sourceUrl) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return []; }

    const file = filename || 'global.code-snippets';

    // KE export format
    if (data && data.keywordExpander && Array.isArray(data.snippets)) {
        return data.snippets
            .filter(s => s.name && s.prefix)
            .map(s => makeExternalSnippet(s, s.file || file, sourceName, sourceId, sourceUrl));
    }

    // Plain array
    if (Array.isArray(data)) {
        return data
            .filter(s => s && s.name && s.prefix)
            .map(s => makeExternalSnippet(s, s.file || file, sourceName, sourceId, sourceUrl));
    }

    // Native VS Code snippet object  { "Snippet Name": { prefix, body, … } }
    if (data && typeof data === 'object') {
        const results = [];
        for (const [name, s] of Object.entries(data)) {
            if (!s || !s.prefix || !s.body) continue;
            results.push(makeExternalSnippet({ ...s, name }, file, sourceName, sourceId, sourceUrl));
        }
        return results;
    }

    return [];
}

// ───────────────────────────────────────────────────────────────────────────
// Fetch snippets from a single configured source
// ───────────────────────────────────────────────────────────────────────────

async function fetchSourceSnippets(source) {
    const snippets = [];
    const type     = source.type || detectSourceType(source.url);
    const auth     = source.token ? { 'Authorization': 'Bearer ' + source.token } : {};
    const ghHeader = { ...auth, 'Accept': 'application/vnd.github.v3+json' };
    const sUrl     = source.url;

    try {
        // ── GitHub repo ────────────────────────────────────────────────
        if (type === 'github-repo') {
            const m = source.url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
            if (!m) return [];
            const owner  = m[1];
            const repo   = m[2].replace(/\.git$/, '');
            const branch = source.branch || 'main';

            const treeRes = await httpGet(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
                ghHeader
            );
            if (treeRes.status !== 200) return [];

            const tree      = JSON.parse(treeRes.body);
            const jsonFiles = (tree.tree || []).filter(f =>
                f.type === 'blob' &&
                f.path.endsWith('.json') &&
                !f.path.includes('node_modules') &&
                !path.basename(f.path).startsWith('package')
            );

            for (const file of jsonFiles) {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
                const res    = await httpGet(rawUrl, auth);
                if (res.status !== 200) continue;
                snippets.push(...parseSnippetsFromSource(
                    res.body, path.basename(file.path), source.name, source.id, sUrl
                ));
            }

        // ── GitHub Gist ────────────────────────────────────────────────
        } else if (type === 'github-gist') {
            const m = source.url.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i);
            if (!m) return [];

            const res  = await httpGet(`https://api.github.com/gists/${m[1]}`, ghHeader);
            if (res.status !== 200) return [];

            const gist = JSON.parse(res.body);
            for (const [filename, file] of Object.entries(gist.files || {})) {
                if (!filename.endsWith('.json')) continue;
                let content = file.content;
                if (!content || file.truncated) {
                    const r = await httpGet(file.raw_url, auth);
                    content = r.body;
                }
                snippets.push(...parseSnippetsFromSource(content, filename, source.name, source.id, sUrl));
            }

        // ── Local folder ───────────────────────────────────────────────
        } else if (type === 'local') {
            const dir = source.url.replace(/^~/, os.homedir());
            if (!fs.existsSync(dir)) return [];
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                const content = fs.readFileSync(path.join(dir, file), 'utf8');
                snippets.push(...parseSnippetsFromSource(content, file, source.name, source.id, sUrl));
            }

        // ── HTTP / local server ────────────────────────────────────────
        } else if (type === 'http') {
            if (source.url.endsWith('.json')) {
                // Direct JSON file URL
                const res = await httpGet(source.url, auth);
                if (res.status === 200) {
                    snippets.push(...parseSnippetsFromSource(
                        res.body, path.basename(source.url), source.name, source.id, sUrl
                    ));
                }
            } else {
                // Folder — expects an index.json listing filenames
                const base     = source.url.replace(/\/?$/, '/');
                const indexRes = await httpGet(base + 'index.json', auth);
                if (indexRes.status === 200) {
                    let index;
                    try { index = JSON.parse(indexRes.body); } catch (_) { return []; }
                    const files = Array.isArray(index) ? index : (index.files || []);
                    for (const file of files) {
                        const res = await httpGet(base + file, auth);
                        if (res.status !== 200) continue;
                        snippets.push(...parseSnippetsFromSource(
                            res.body, path.basename(String(file)), source.name, source.id, sUrl
                        ));
                    }
                }
            }
        }
    } catch (_) {}

    return snippets;
}

// ───────────────────────────────────────────────────────────────────────────
// External snippet cache (5-minute TTL, force-invalidated on source changes)
// ───────────────────────────────────────────────────────────────────────────

let _externalSnippets  = [];
let _externalCacheTime = 0;
const EXTERNAL_CACHE_TTL = 5 * 60 * 1000;

async function getExternalSnippets(force = false) {
    if (!force && Date.now() - _externalCacheTime < EXTERNAL_CACHE_TTL) {
        return _externalSnippets;
    }
    const sources = readSources().filter(s => s.enabled !== false);
    if (!sources.length) {
        _externalSnippets  = [];
        _externalCacheTime = Date.now();
        return [];
    }
    const all = [];
    for (const source of sources) {
        try { all.push(...(await fetchSourceSnippets(source))); } catch (_) {}
    }
    // Filter out snippets the user has explicitly dismissed
    const dismissed    = getDismissed();
    _externalSnippets  = dismissed.size ? all.filter(s => !dismissed.has(s.dismissKey)) : all;
    _externalCacheTime = Date.now();
    return _externalSnippets;
}

// ───────────────────────────────────────────────────────────────────────────
// Load all snippets from the user snippets directory → flat array
// ───────────────────────────────────────────────────────────────────────────

function loadAllSnippets() {
    const dir  = getSnippetsDir();
    const list = [];

    if (!fs.existsSync(dir)) return list;

    let files;
    try {
        files = fs.readdirSync(dir).filter(f =>
            (f.endsWith('.json') || f.endsWith('.code-snippets')) &&
            f !== 'keyword-expander-tags.json'    &&
            f !== 'keyword-expander-meta.json'    &&
            f !== 'keyword-expander-sources.json'   // skip all sidecars
        );
    } catch (_) { return list; }

    const tags = readTags();
    const meta = readMeta();

    for (const file of files) {
        const data = readSnippetFile(path.join(dir, file));
        const lang = FILE_TO_LANG[file] || {
            id:    '',
            label: file.replace(/\.(json|code-snippets)$/, ''),
            file,
        };

        for (const [name, s] of Object.entries(data)) {
            if (!s || typeof s !== 'object') continue;

            const rawPrefix = s.prefix || '';
            const prefix    = Array.isArray(rawPrefix) ? rawPrefix.join(', ') : String(rawPrefix);
            const rawBody   = s.body   || '';
            const body      = Array.isArray(rawBody)   ? rawBody.join('\n')   : String(rawBody);
            const id        = file + '::' + name;

            list.push({
                id,
                file,
                langLabel:   lang.label,
                name,
                prefix,
                body,
                description: s.description || '',
                scope:       s.scope       || '',
                tags:        tags[id]      || [],
                uses:        meta[id]?.uses      || 0,
                lastUsed:    meta[id]?.lastUsed  || 0,
                favourite:   meta[id]?.favourite || false,
            });
        }
    }

    // Sort: global first, then alpha by file, then by name
    list.sort((a, b) => {
        if (a.file === 'global.code-snippets' && b.file !== 'global.code-snippets') return -1;
        if (b.file === 'global.code-snippets' && a.file !== 'global.code-snippets') return 1;
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.name.localeCompare(b.name);
    });

    return list;
}

// ───────────────────────────────────────────────────────────────────────────
// Activate
// ───────────────────────────────────────────────────────────────────────────

let _panel        = null;
let _pollInterval = null;

// ───────────────────────────────────────────────────────────────────────────
// Auto-updater  (git clone installs only)
// ───────────────────────────────────────────────────────────────────────────

function checkForUpdates(silent = false) {
    const gitDir = path.join(__dirname, '.git');
    if (!fs.existsSync(gitDir)) {
        if (!silent) {
            vscode.window.showInformationMessage(
                'Auto-update requires the git clone install.',
                'View on GitHub'
            ).then(a => {
                if (a === 'View on GitHub') {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://github.com/westcoastdigital/Keyword-Expander'
                    ));
                }
            });
        }
        return;
    }

    exec('git pull', { cwd: __dirname }, (err, stdout) => {
        if (err) return; // silent on network / git errors

        const upToDate = stdout.includes('Already up to date') ||
                         stdout.includes('Already up-to-date');
        if (upToDate) {
            if (!silent) {
                vscode.window.showInformationMessage('Keyword Expander: already up to date.');
            }
            return;
        }

        // Something was pulled — offer a reload
        vscode.window.showInformationMessage(
            'Keyword Expander has been updated.',
            'Reload Now'
        ).then(a => {
            if (a === 'Reload Now') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    });
}

function activate(context) {

    // ── Completion provider ────────────────────────────────────────────────
    // Registered for both 'file' (saved) and 'untitled' (unsaved) schemes so
    // snippets appear in IntelliSense regardless of whether the file is saved.
    // VS Code's native snippet loader skips untitled files; this fills the gap.
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            [{ scheme: 'file' }, { scheme: 'untitled' }],
            {
                provideCompletionItems(document) {
                    const all = loadAllSnippets();
                    const items = [];

                    for (const s of all) {
                        // Language filter
                        const langInfo = FILE_TO_LANG[s.file];
                        if (langInfo && langInfo.id && langInfo.id !== 'global') {
                            if (langInfo.id !== document.languageId) continue;
                        }
                        if (s.scope && s.file.endsWith('.code-snippets')) {
                            if (!s.scope.split(/,\s*/).includes(document.languageId)) continue;
                        }

                        // One completion item per prefix (prefix may be comma-separated)
                        const prefixes = s.prefix.split(/,\s*/).map(p => p.trim()).filter(Boolean);
                        for (const prefix of prefixes) {
                            const item = new vscode.CompletionItem(prefix, vscode.CompletionItemKind.Snippet);
                            item.insertText    = new vscode.SnippetString(s.body);
                            item.detail        = s.name;
                            item.documentation = new vscode.MarkdownString(
                                '```\n' + s.body.substring(0, 300) +
                                (s.body.length > 300 ? '\n…' : '') + '\n```'
                            );
                            item.sortText = '!!' + prefix;
                            items.push(item);
                        }
                    }
                    return items;
                }
            }
        )
    );

    // Expand command — optional alternative to IntelliSense Tab expansion.
    // Reads from the actual VS Code snippet files. Can be bound to Tab; see README.
    context.subscriptions.push(
        vscode.commands.registerCommand('keywordExpander.expand', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const pos    = editor.selection.active;
            const before = editor.document.lineAt(pos.line).text.substring(0, pos.character);
            const m      = before.match(/(\S+)$/);

            if (m) {
                const typed    = m[1];
                const snippets = loadAllSnippets();

                for (const s of snippets) {
                    const prefixes = s.prefix.split(/,\s*/).map(p => p.trim());
                    if (!prefixes.includes(typed)) continue;

                    // Honour language-specific files
                    const langInfo = FILE_TO_LANG[s.file];
                    if (langInfo && langInfo.id && langInfo.id !== 'global') {
                        if (langInfo.id !== editor.document.languageId) continue;
                    }
                    // Honour scope field on global snippets
                    if (s.scope && s.file.endsWith('.code-snippets')) {
                        const scopes = s.scope.split(/,\s*/);
                        if (!scopes.includes(editor.document.languageId)) continue;
                    }

                    const start = new vscode.Position(pos.line, pos.character - typed.length);
                    await editor.edit(eb => eb.delete(new vscode.Range(start, pos)));
                    await editor.insertSnippet(new vscode.SnippetString(s.body));
                    trackUsage(s.id);
                    return;
                }
            }

            // Fallthrough — respect editor indent settings
            const spaces = editor.options.insertSpaces;
            const size   = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;
            await editor.edit(eb =>
                eb.insert(editor.selection.active, spaces ? ' '.repeat(size) : '\t')
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('keywordExpander.openEditor', () => openEditor())
    );

    // ── Add selection as snippet ─────────────────────────────────────────
    // Invoked from the editor right-click context menu when text is selected.
    // Opens (or reveals) the snippet editor pre-filled with the selected text
    // as the body, then focuses the Name field so you can complete the form.
    context.subscriptions.push(
        vscode.commands.registerCommand('keywordExpander.addFromSelection', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const selection = editor.selection;
            if (selection.isEmpty) {
                vscode.window.showInformationMessage(
                    'Keyword Expander: Select some code first, then right-click to add it as a snippet.'
                );
                return;
            }

            const body     = editor.document.getText(selection);
            const langId   = editor.document.languageId;

            // Open/reveal the panel, then send the prefill once it's ready.
            // openEditor() sets _panel; if the panel already existed the
            // webview is still live, so we can post immediately after.
            const alreadyOpen = !!_panel;
            openEditor();

            const doPost = () => {
                if (_panel) {
                    _panel.webview.postMessage({ type: 'prefill', body, langId });
                }
            };

            if (alreadyOpen) {
                // Panel was already open — webview is live, post straight away.
                doPost();
            } else {
                // Panel was just created — give the webview a moment to
                // initialise before posting (it fires 'ready' but we post
                // on top of the normal load flow, so a short delay is enough).
                setTimeout(doPost, 350);
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('keywordExpander.browse', async () => {
            const all = loadAllSnippets();

            if (!all.length) {
                vscode.window.showInformationMessage(
                    'Keyword Expander: No snippets found. Open the editor to create some.'
                );
                return;
            }

            // Group by language for section separators
            const groups  = {};
            const order   = [];
            for (const s of all) {
                if (!groups[s.langLabel]) { groups[s.langLabel] = []; order.push(s.langLabel); }
                groups[s.langLabel].push(s);
            }

            const items = [];
            for (const lang of order) {
                items.push({ label: lang, kind: vscode.QuickPickItemKind.Separator });
                for (const s of groups[lang]) {
                    // Embed tags as "tag:xxx" tokens in the detail field so
                    // VS Code's native filter matches e.g. "tag:woo" as a
                    // substring of "tag:woocommerce" — no custom handler needed.
                    const tagTokens = s.tags && s.tags.length
                        ? s.tags.map(t => 'tag:' + t).join('  ')
                        : '';
                    const detailParts = [s.description, tagTokens].filter(Boolean);
                    items.push({
                        label:       s.prefix,
                        description: s.name,
                        detail:      detailParts.length ? detailParts.join('   ·   ') : undefined,
                        snippet:     s,
                    });
                }
            }

            const qp = vscode.window.createQuickPick();
            qp.items              = items;
            qp.matchOnDescription = true;
            qp.matchOnDetail      = true;
            qp.placeholder        = 'Type a keyword, snippet name, or tag:woo…';
            qp.title              = 'Keyword Expander — Browse & Insert';

            qp.onDidAccept(async () => {
                const picked = qp.selectedItems[0];
                qp.hide();
                if (!picked || !picked.snippet) return;

                trackUsage(picked.snippet.id);

                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await editor.insertSnippet(new vscode.SnippetString(picked.snippet.body));
                } else {
                    // No active editor — open a new untitled file and insert
                    const doc = await vscode.workspace.openTextDocument({ content: '' });
                    const ed  = await vscode.window.showTextDocument(doc);
                    await ed.insertSnippet(new vscode.SnippetString(picked.snippet.body));
                }
            });

            qp.show();
        })
    );

    // ── Status bar item ──────────────────────────────────────────────────
    // Always-visible one-click access in the bottom bar.
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.text    = '$(symbol-keyword) Snippets';
    statusBar.tooltip = 'Open Keyword Expander';
    statusBar.command = 'keywordExpander.openEditor';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // ── Auto-update ───────────────────────────────────────────────────────
    // Silent background check once per 24 hours on startup.
    const lastCheck = context.globalState.get('lastUpdateCheck', 0);
    if (Date.now() - lastCheck > 86_400_000) {
        context.globalState.update('lastUpdateCheck', Date.now());
        checkForUpdates(true);
    }

    // Manual trigger via Command Palette.
    context.subscriptions.push(
        vscode.commands.registerCommand('keywordExpander.update', () => checkForUpdates(false))
    );
}

function deactivate() {}

// ───────────────────────────────────────────────────────────────────────────
// Webview panel
// ───────────────────────────────────────────────────────────────────────────

function openEditor() {
    if (_panel) { _panel.reveal(vscode.ViewColumn.Active); return; }

    _panel = vscode.window.createWebviewPanel(
        'keywordExpander',
        'Keyword Expander',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    _panel.webview.html = getWebviewHtml();

    async function push(forceExternal = false) {
        if (!_panel) return;
        const external = await getExternalSnippets(forceExternal);
        _panel.webview.postMessage({
            type:        'load',
            snippets:    [...loadAllSnippets(), ...external],
            snippetsDir: getSnippetsDir(),
            languages:   LANGUAGES,
        });
    }

    _panel.webview.onDidReceiveMessage(async msg => {
        const dir = getSnippetsDir();

        switch (msg.type) {

            case 'ready':
            case 'refresh':
                push();
                break;

            case 'save': {
                const { originalFile, originalName, file, name, prefix, body, description, scope, tags } = msg;

                // Delete original entry if file or name changed
                if (originalFile && (originalFile !== file || originalName !== name)) {
                    const orig = readSnippetFile(path.join(dir, originalFile));
                    if (Object.prototype.hasOwnProperty.call(orig, originalName)) {
                        delete orig[originalName];
                        writeSnippetFile(path.join(dir, originalFile), orig);
                    }
                }

                // Build and write the new entry
                const target = readSnippetFile(path.join(dir, file));
                const entry  = { prefix: prefix.includes(',') ? prefix.split(/,\s*/) : prefix };
                entry.body   = body.split('\n');
                if (description) entry.description = description;
                if (scope && file.endsWith('.code-snippets')) entry.scope = scope;
                target[name] = entry;
                writeSnippetFile(path.join(dir, file), target);

                // Persist tags in sidecar (rename-aware)
                const allTags = readTags();
                const oldKey  = originalFile ? originalFile + '::' + originalName : null;
                const newKey  = file + '::' + name;
                if (oldKey && oldKey !== newKey) delete allTags[oldKey];
                const tagArr = parseTags(tags);
                if (tagArr.length) allTags[newKey] = tagArr;
                else delete allTags[newKey];
                writeTags(allTags);

                vscode.window.showInformationMessage('Keyword Expander: "' + name + '" saved.');
                push();
                break;
            }

            case 'delete': {
                const { file, name } = msg;
                const data = readSnippetFile(path.join(dir, file));
                if (Object.prototype.hasOwnProperty.call(data, name)) {
                    delete data[name];
                    writeSnippetFile(path.join(dir, file), data);
                }
                // Remove tags entry from sidecar
                const allTags = readTags();
                const key = file + '::' + name;
                if (allTags[key]) { delete allTags[key]; writeTags(allTags); }
                push();
                break;
            }

            case 'preview': {
                const ed = vscode.window.activeTextEditor;
                if (ed) {
                    await ed.insertSnippet(new vscode.SnippetString(msg.body));
                } else {
                    vscode.window.showWarningMessage('Keyword Expander: Open a file first to preview.');
                }
                break;
            }

            case 'openDir':
                try {
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
                } catch (_) {
                    vscode.window.showInformationMessage('Snippets directory: ' + dir);
                }
                break;

            case 'export': {
                // msg.snippetIds — null means all, array means specific ids
                const all        = loadAllSnippets();
                const toExport   = msg.snippetIds
                    ? all.filter(s => msg.snippetIds.includes(s.id))
                    : all;

                const defaultName = msg.snippetIds && msg.snippetIds.length === 1
                    ? toExport[0].name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.json'
                    : 'keyword-expander-snippets.json';

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName)),
                    filters: { 'JSON': ['json'] },
                    title: msg.snippetIds ? 'Export Snippet' : 'Export All Snippets',
                });
                if (!saveUri) break;

                const exportData = {
                    keywordExpander: true,
                    version:         1,
                    exported:        new Date().toISOString(),
                    snippets:        toExport.map(s => ({
                        file:        s.file,
                        name:        s.name,
                        prefix:      s.prefix,
                        body:        s.body,
                        description: s.description,
                        scope:       s.scope,
                        tags:        s.tags && s.tags.length ? s.tags : undefined,
                    })),
                };
                fs.writeFileSync(saveUri.fsPath, JSON.stringify(exportData, null, '\t'), 'utf8');
                vscode.window.showInformationMessage(
                    'Keyword Expander: Exported ' + toExport.length + ' snippet(s).'
                );
                if (_panel) {
                    _panel.webview.postMessage({ type: 'exportDone', count: toExport.length });
                }
                break;
            }

            case 'import': {
                const openUris = await vscode.window.showOpenDialog({
                    canSelectFiles:   true,
                    canSelectFolders: false,
                    canSelectMany:    false,
                    filters:          { 'JSON': ['json'] },
                    title:            'Import Snippets',
                });
                if (!openUris || !openUris.length) break;

                let importData;
                try {
                    importData = parseJsonc(fs.readFileSync(openUris[0].fsPath, 'utf8'));
                } catch (_) {
                    vscode.window.showErrorMessage(
                        'Keyword Expander: Could not parse the selected file.'
                    );
                    break;
                }

                if (!importData.keywordExpander || !Array.isArray(importData.snippets)) {
                    vscode.window.showErrorMessage(
                        'Keyword Expander: File is not a valid Keyword Expander export.'
                    );
                    break;
                }

                let count = 0;
                const importedTags = readTags();
                for (const s of importData.snippets) {
                    if (!s.file || !s.name || !s.prefix || !s.body) continue;
                    const filePath = path.join(dir, s.file);
                    const target   = readSnippetFile(filePath);
                    const entry    = {
                        prefix: s.prefix.includes(',') ? s.prefix.split(/,\s*/) : s.prefix,
                    };
                    entry.body = s.body.split('\n');
                    if (s.description) entry.description = s.description;
                    if (s.scope && s.file.endsWith('.code-snippets')) entry.scope = s.scope;
                    target[s.name] = entry;
                    writeSnippetFile(filePath, target);
                    // Restore tags if present
                    if (Array.isArray(s.tags) && s.tags.length) {
                        importedTags[s.file + '::' + s.name] = s.tags;
                    }
                    count++;
                }
                writeTags(importedTags);

                vscode.window.showInformationMessage(
                    'Keyword Expander: Imported ' + count + ' snippet(s).'
                );
                push();
                if (_panel) {
                    _panel.webview.postMessage({ type: 'importDone', count });
                }
                break;
            }
            case 'importExamples': {
                // Group examples by category for separator display
                const exGroups = {};
                const exOrder  = [];
                for (const ex of loadExampleSnippets()) {
                    if (!exGroups[ex.category]) { exGroups[ex.category] = []; exOrder.push(ex.category); }
                    exGroups[ex.category].push(ex);
                }

                const qpItems = [];
                for (const cat of exOrder) {
                    qpItems.push({ label: cat, kind: vscode.QuickPickItemKind.Separator });
                    for (const ex of exGroups[cat]) {
                        qpItems.push({
                            label:       ex.prefix,
                            description: ex.name,
                            detail:      ex.description || '',
                            picked:      true,
                            _ex:         ex,
                        });
                    }
                }

                const picked = await vscode.window.showQuickPick(qpItems, {
                    canPickMany:       true,
                    title:             '★  Import Example Snippets',
                    placeHolder:       'Select snippets to import — all pre-selected, uncheck to skip',
                    matchOnDescription: true,
                    matchOnDetail:      true,
                });

                if (!picked || !picked.length) break;

                let count = 0;
                const exTags = readTags();
                for (const item of picked) {
                    if (!item._ex) continue;
                    const s        = item._ex;
                    const filePath = path.join(dir, s.file);
                    const target   = readSnippetFile(filePath);
                    const entry    = { prefix: s.prefix };
                    entry.body     = s.body.split('\n');
                    if (s.description) entry.description = s.description;
                    if (s.scope && s.file.endsWith('.code-snippets')) entry.scope = s.scope;
                    target[s.name] = entry;
                    writeSnippetFile(filePath, target);
                    if (Array.isArray(s.tags) && s.tags.length) {
                        exTags[s.file + '::' + s.name] = s.tags;
                    }
                    count++;
                }
                writeTags(exTags);

                vscode.window.showInformationMessage(
                    'Keyword Expander: Imported ' + count + ' example snippet(s).'
                );
                push();
                if (_panel) {
                    _panel.webview.postMessage({ type: 'importDone', count });
                }
                break;
            }
            case 'toggleFavourite': {
                const m    = readMeta();
                const entry = m[msg.id] || { uses: 0, lastUsed: 0, favourite: false };
                entry.favourite = !entry.favourite;
                m[msg.id] = entry;
                writeMeta(m);
                push();
                break;
            }

            case 'trackUsage': {
                trackUsage(msg.id);
                break;
            }
            case 'hideExternal': {
                addDismissed(msg.dismissKey);
                // Remove from in-memory cache immediately so it vanishes without a full re-fetch
                _externalSnippets = _externalSnippets.filter(s => s.dismissKey !== msg.dismissKey);
                push();
                break;
            }

            case 'refreshSources': {
                _externalCacheTime = 0;
                if (_panel) _panel.webview.postMessage({ type: 'sourcesLoading' });
                await push(true);
                break;
            }

            case 'manageSources': {
                const sources = readSources();

                // ── Step 1: show source list + actions ─────────────────
                const dismissed  = getDismissed();
                const listItems = [
                    ...sources.map(s => ({
                        label:       (s.enabled !== false ? '$(cloud)' : '$(circle-slash)') + '  ' + s.name,
                        description: s.url,
                        detail:      (s.type || detectSourceType(s.url) || 'unknown') +
                                     (s.enabled !== false ? '' : '  —  disabled'),
                        _source:     s,
                        _action:     'toggle',
                    })),
                    { label: '', kind: vscode.QuickPickItemKind.Separator },
                    { label: '$(add)  Add New Source',    _action: 'add'    },
                    { label: '$(trash)  Remove a Source', _action: 'remove' },
                    ...(dismissed.size ? [{ label: `$(eye)  Show ${dismissed.size} hidden snippet${dismissed.size !== 1 ? 's' : ''}`, _action: 'clearHidden' }] : []),
                ];

                const pick = await vscode.window.showQuickPick(listItems, {
                    title:       'Keyword Expander — External Sources',
                    placeHolder: sources.length
                        ? 'Select a source to toggle on/off, or add/remove'
                        : 'No external sources — add one to get started',
                    matchOnDescription: true,
                });
                if (!pick) break;

                // ── Clear hidden snippets ──────────────────────────────
                if (pick._action === 'clearHidden') {
                    clearDismissed();
                    _externalCacheTime = 0;
                    await push(true);
                    break;
                }

                // ── Toggle enabled ─────────────────────────────────────
                if (pick._action === 'toggle' && pick._source) {
                    const idx = sources.findIndex(s => s.id === pick._source.id);
                    if (idx !== -1) {
                        sources[idx].enabled = !(sources[idx].enabled !== false);
                        writeSources(sources);
                        _externalCacheTime = 0;
                        await push(true);
                    }
                    break;
                }

                // ── Add new source ─────────────────────────────────────
                if (pick._action === 'add') {
                    const url = await vscode.window.showInputBox({
                        title:       'Add External Source (1/3)',
                        prompt:      'URL or local path',
                        placeHolder: 'https://github.com/user/repo  ·  gist.github.com/user/id  ·  /local/path  ·  https://server/snippets/',
                        ignoreFocusOut: true,
                    });
                    if (!url) break;

                    const detectedType = detectSourceType(url);
                    const name = await vscode.window.showInputBox({
                        title:       'Add External Source (2/3)',
                        prompt:      'Display name for this source',
                        placeHolder: 'e.g. Team Snippets',
                        ignoreFocusOut: true,
                    });
                    if (!name) break;

                    let token = '';
                    if (detectedType === 'github-repo' || detectedType === 'github-gist') {
                        token = await vscode.window.showInputBox({
                            title:          'Add External Source (3/3)',
                            prompt:         'GitHub Personal Access Token — required for private repos/gists, leave blank for public',
                            placeHolder:    'ghp_…  or leave blank',
                            password:       true,
                            ignoreFocusOut: true,
                        }) || '';
                    }

                    sources.push({
                        id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        name,
                        type:    detectedType,
                        url:     url.trim(),
                        token,
                        enabled: true,
                    });
                    writeSources(sources);
                    _externalCacheTime = 0;

                    vscode.window.showInformationMessage(`Keyword Expander: Source "${name}" added. Fetching…`);
                    if (_panel) _panel.webview.postMessage({ type: 'sourcesLoading' });
                    await push(true);
                    break;
                }

                // ── Remove source ──────────────────────────────────────
                if (pick._action === 'remove') {
                    if (!sources.length) {
                        vscode.window.showInformationMessage('No sources to remove.');
                        break;
                    }
                    const toRemove = await vscode.window.showQuickPick(
                        sources.map(s => ({ label: s.name, description: s.url, _id: s.id })),
                        { title: 'Remove External Source', placeHolder: 'Select source to remove' }
                    );
                    if (!toRemove) break;
                    writeSources(sources.filter(s => s.id !== toRemove._id));
                    _externalCacheTime = 0;
                    await push(true);
                }
                break;
            }
        }
    });

    _panel.onDidDispose(() => {
        _panel = null;
        clearInterval(_pollInterval);
        _pollInterval = null;
    });

    // Poll external sources every 10 minutes while the panel is open
    // so team-added snippets appear automatically without manual refresh.
    _pollInterval = setInterval(async () => {
        if (!_panel) return;
        _externalCacheTime = 0;
        await push(true);
    }, 10 * 60 * 1000);
}

// ───────────────────────────────────────────────────────────────────────────
// Auto Tab Stops — defined as real Node.js functions so backslash escapes,
// regex literals, and string quoting all work normally.  They are injected
// into the webview HTML via Function.prototype.toString(), which preserves
// the original source exactly.  The _wv_ prefix is stripped on injection.
// ───────────────────────────────────────────────────────────────────────────

function _wv_autoTabStops() {
    var textarea = document.getElementById('bodyInput');
    var body     = textarea.value;
    if (!body.trim()) { setStatus('Body is empty — nothing to process.', true); return; }

    // Detect existing tab stops without relying on \d (scan char by char)
    var hasStops = false;
    for (var ci = 0; ci < body.length - 1; ci++) {
        if (body[ci] === '$') {
            var nx = body[ci + 1];
            if (nx === '{' || (nx >= '0' && nx <= '9')) { hasStops = true; break; }
        }
    }
    if (hasStops) {
        setStatus('Body already has tab stops. Clear them first to regenerate.', true);
        return;
    }

    var result = buildAutoTabStops(body);

    // Count generated tab stops by scanning for '${'
    var added = 0, si = 0;
    while ((si = result.indexOf('${', si)) !== -1) { added++; si++; }

    if (added === 0) {
        setStatus('No repeated identifiers or comments found to convert.', true);
        return;
    }
    textarea.value = result;
    setStatus('Generated ' + added + ' tab stop' + (added !== 1 ? 's' : '') + ' — review and tweak as needed.');
}

function _wv_buildAutoTabStops(code) {
    var SKIP = {};
    ('function return var let const if else for while do switch case break ' +
     'continue new this typeof instanceof true false null undefined class ' +
     'extends import export default async await try catch finally throw ' +
     'delete void yield super static get set of in ' +
     'echo print array list isset empty unset die exit include require ' +
     'include_once require_once use namespace abstract final interface ' +
     'implements clone match fn public private protected global foreach ' +
     'endforeach endwhile endif endfor elseif self parent ' +
     'add_action add_filter remove_action remove_filter do_action ' +
     'apply_filters has_action has_filter wp_enqueue_script wp_enqueue_style ' +
     'wp_register_script wp_register_style wp_localize_script ' +
     'get_template_directory get_template_directory_uri ' +
     'get_stylesheet_directory get_stylesheet_directory_uri ' +
     'plugin_dir_path plugin_dir_url plugin_basename ' +
     'register_post_type register_taxonomy WP_Query wp_reset_postdata ' +
     'setup_postdata the_post have_posts the_title the_content the_excerpt ' +
     'the_permalink the_ID get_the_title get_the_ID get_the_content ' +
     'get_post_meta update_post_meta delete_post_meta add_post_meta ' +
     'get_field the_field have_rows the_row get_sub_field the_sub_field ' +
     'get_option update_option delete_option add_option ' +
     'get_transient set_transient delete_transient ' +
     'add_shortcode shortcode_atts do_shortcode ' +
     'sanitize_text_field sanitize_email sanitize_url sanitize_key ' +
     'esc_html esc_attr esc_url esc_js esc_html__ esc_attr__ ' +
     'esc_html_e esc_attr_e __ _e _n _x _nx ' +
     'wp_nonce_field wp_verify_nonce check_admin_referer ' +
     'is_admin is_user_logged_in current_user_can wp_die wp_redirect ' +
     'wp_safe_redirect woocommerce_form_field wc_add_notice wc_price WC ' +
     'wc_get_product wc_get_order acf_add_local_field_group ' +
     'register_nav_menus register_nav_menu register_sidebar ' +
     'add_theme_support load_theme_textdomain add_image_size ' +
     'add_menu_page add_submenu_page add_meta_box ' +
     'register_setting add_settings_field add_settings_section ' +
     'file_exists class_exists function_exists defined define ' +
     'ABSPATH post page args wpdb order product user item'
    ).split(' ').forEach(function(w) { if (w) SKIP[w] = 1; });

    var nextNum = 1;

    // Blank strings/comments so we count only BARE identifier occurrences
    function blankStringsAndComments(src) {
        var out = '', i = 0, n = src.length;
        while (i < n) {
            var c = src[i];
            if (c === '/' && src[i+1] === '/') {
                var e = src.indexOf('\n', i); if (e < 0) e = n;
                out += ' '.repeat(e - i); i = e; continue;
            }
            if (c === '/' && src[i+1] === '*') {
                var e = src.indexOf('*/', i+2); e = e < 0 ? n : e + 2;
                out += ' '.repeat(e - i); i = e; continue;
            }
            if (c === "'") {
                var j = i + 1;
                while (j < n && !(src[j] === "'" && src[j-1] !== '\\')) j++;
                out += ' '.repeat(j + 1 - i); i = j + 1; continue;
            }
            if (c === '"') {
                var j = i + 1;
                while (j < n && !(src[j] === '"' && src[j-1] !== '\\')) j++;
                out += ' '.repeat(j + 1 - i); i = j + 1; continue;
            }
            out += c; i++;
        }
        return out;
    }

    // Step 1 — bare identifier counts (outside strings/comments)
    var bareCode = blankStringsAndComments(code);
    var bareCounts = {}, m;
    var reWord = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g;
    reWord.lastIndex = 0;
    while ((m = reWord.exec(bareCode)) !== null) {
        var w = m[1]; if (!SKIP[w]) bareCounts[w] = (bareCounts[w] || 0) + 1;
    }

    // Step 2 — strings whose ENTIRE content is a plain identifier
    // e.g. add_action('the_hook', 'my_func') → 'my_func' links to the bare definition
    var strIdentCounts = {};
    var reStrIdent = /'([a-zA-Z_][a-zA-Z0-9_]{2,})'/g;
    reStrIdent.lastIndex = 0;
    while ((m = reStrIdent.exec(code)) !== null) {
        var w = m[1]; if (!SKIP[w]) strIdentCounts[w] = (strIdentCounts[w] || 0) + 1;
    }

    // Build identifier → tab stop number map, ordered by first bare occurrence
    var identStopMap = {}, seenId = {};
    var reWord2 = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g;
    reWord2.lastIndex = 0;
    while ((m = reWord2.exec(bareCode)) !== null) {
        var w = m[1];
        if (SKIP[w] || seenId[w]) continue;
        seenId[w] = 1;
        if ((bareCounts[w] || 0) + (strIdentCounts[w] || 0) >= 2) {
            identStopMap[w] = nextNum++;
        }
    }

    // Step 3 — repeated single-quoted string literals not already covered above
    var strCounts = {}, strStopMap = {}, strSeen = {};
    var reStrLit = /'([^'\\\n]{3,})'/g;
    reStrLit.lastIndex = 0;
    while ((m = reStrLit.exec(code)) !== null) {
        strCounts[m[1]] = (strCounts[m[1]] || 0) + 1;
    }
    reStrLit.lastIndex = 0;
    while ((m = reStrLit.exec(code)) !== null) {
        var s = m[1];
        if (strCounts[s] < 2 || strSeen[s]) continue;
        strSeen[s] = 1;
        if (identStopMap.hasOwnProperty(s)) continue;
        // Skip if the string contains an identifier already mapped
        var inner = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g, mm, hit = false;
        while ((mm = inner.exec(s)) !== null) {
            if (identStopMap.hasOwnProperty(mm[1])) { hit = true; break; }
        }
        if (!hit) strStopMap[s] = nextNum++;
    }

    // Step 4 — emit output character by character
    var out = '', i = 0, len = code.length, firstId = {}, firstStr = {};

    function peek(n) { return i + n < len ? code[i + n] : ''; }

    function emitIdent(word) {
        if (!identStopMap.hasOwnProperty(word)) return word;
        var num = identStopMap[word];
        if (!firstId[word]) { firstId[word] = 1; return '${' + num + ':' + word + '}'; }
        return '${' + num + '}';
    }

    function processInside(start, end) {
        var s = '', k = start;
        while (k < end) {
            if (/[a-zA-Z_]/.test(code[k])) {
                var kj = k;
                while (kj < end && /[a-zA-Z0-9_]/.test(code[kj])) kj++;
                s += emitIdent(code.slice(k, kj)); k = kj;
            } else { s += code[k++]; }
        }
        return s;
    }

    while (i < len) {
        var c = code[i];

        // Line comment → convert text to tab stop
        if (c === '/' && peek(1) === '/') {
            var e = code.indexOf('\n', i); if (e < 0) e = len;
            var txt = code.slice(i + 2, e).trim();
            out += txt ? '// ${' + nextNum++ + ':' + txt + '}' : '//';
            i = e; continue;
        }
        // Block comment → pass through unchanged
        if (c === '/' && peek(1) === '*') {
            var cl = code.indexOf('*/', i + 2);
            var be = cl < 0 ? len : cl + 2;
            out += code.slice(i, be); i = be; continue;
        }
        // Single-quoted string
        if (c === "'") {
            var j = i + 1;
            while (j < len && !(code[j] === "'" && code[j-1] !== '\\')) j++;
            var content = code.slice(i + 1, j);
            if (strStopMap.hasOwnProperty(content)) {
                var num = strStopMap[content];
                if (!firstStr[content]) {
                    firstStr[content] = 1;
                    out += "'" + '${' + num + ':' + content + "}'" ;
                } else {
                    out += "'" + '${' + num + "}'" ;
                }
            } else {
                out += "'" + processInside(i + 1, j) + "'";
            }
            i = j + 1; continue;
        }
        // Double-quoted string
        if (c === '"') {
            var j = i + 1;
            while (j < len && !(code[j] === '"' && code[j-1] !== '\\')) j++;
            out += '"' + processInside(i + 1, j) + '"';
            i = j + 1; continue;
        }
        // Identifier
        if (/[a-zA-Z_]/.test(c)) {
            var j = i; while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
            out += emitIdent(code.slice(i, j)); i = j; continue;
        }
        // Dollar sign — escape for VS Code snippet syntax
        if (c === '$') { out += '\\$'; i++; continue; }

        out += c; i++;
    }

    if (out.length && out[out.length - 1] !== '\n') out += '\n';
    out += '$0';
    return out;
}

// Inject the above functions into the webview by serialising their source.
// The _wv_ prefix is stripped so the webview sees the correct function names.
function _wvSrc(fn, name) {
    return fn.toString().replace('_wv_' + name, name);
}

// ───────────────────────────────────────────────────────────────────────────
// Webview HTML  (no inline data — snippets arrive via postMessage)
// ───────────────────────────────────────────────────────────────────────────

function getWebviewHtml() {
/* Return the full HTML string for the webview. No template-literal
   interpolation of user data is needed — all data arrives via postMessage. */
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
/* ── Reset ────────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ── Base ─────────────────────────────────────────────────────── */
body{
  background:var(--vscode-editor-background);
  color:var(--vscode-editor-foreground);
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size,13px);
  height:100vh;
  overflow:hidden;
  display:flex;
  flex-direction:column;
}

/* ── Header ───────────────────────────────────────────────────── */
.header{
  display:flex;align-items:center;justify-content:space-between;
  padding:9px 14px;
  border-bottom:1px solid var(--vscode-panel-border);
  flex-shrink:0;gap:8px;
}
.header-title{
  font-size:13px;font-weight:600;
  display:flex;align-items:center;gap:8px;white-space:nowrap;
}
.header-actions{display:flex;gap:6px;}

/* ── Main split ───────────────────────────────────────────────── */
.main{display:flex;flex:1;overflow:hidden;}

/* ── Sidebar ──────────────────────────────────────────────────── */
.sidebar{
  width:260px;min-width:180px;flex-shrink:0;
  background:var(--vscode-sideBar-background,var(--vscode-editor-background));
  border-right:1px solid var(--vscode-panel-border);
  display:flex;flex-direction:column;overflow:hidden;
}
.sidebar-toolbar{
  display:flex;flex-direction:column;gap:5px;
  padding:7px 8px 6px;
  border-bottom:1px solid var(--vscode-panel-border);
  flex-shrink:0;
}
.sidebar-toolbar input,
.sidebar-toolbar select{
  width:100%;
  background:var(--vscode-input-background);
  color:var(--vscode-input-foreground);
  border:1px solid var(--vscode-input-border,transparent);
  padding:5px 8px;
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size,13px);
  border-radius:3px;outline:none;
}
.sidebar-toolbar input:focus,
.sidebar-toolbar select:focus{
  border-color:var(--vscode-focusBorder);
  outline:1px solid var(--vscode-focusBorder);
}
.sidebar-toolbar select option{background:var(--vscode-dropdown-background);}

.add-new-btn{
  display:flex;align-items:center;gap:6px;
  width:100%;padding:8px 12px;
  background:none;border:none;
  border-bottom:1px solid var(--vscode-panel-border);
  color:var(--vscode-textLink-foreground,var(--vscode-button-background));
  cursor:pointer;
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size,13px);
  text-align:left;flex-shrink:0;
}
.add-new-btn:hover{background:var(--vscode-list-hoverBackground);}

.snippet-list{flex:1;overflow-y:auto;}

.list-section{
  padding:5px 12px 3px;
  font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:0.7px;
  opacity:0.45;
  border-bottom:1px solid var(--vscode-panel-border);
  margin-top:4px;
}
.list-section:first-child{margin-top:0;}

.snippet-item{
  display:flex;align-items:center;
  padding:7px 10px;cursor:pointer;gap:7px;
  border-left:3px solid transparent;min-width:0;
}
.snippet-item:hover{background:var(--vscode-list-hoverBackground);}
.snippet-item.active{
  background:var(--vscode-list-activeSelectionBackground);
  color:var(--vscode-list-activeSelectionForeground);
  border-left-color:var(--vscode-button-background);
}
.kw-badge{
  font-family:var(--vscode-editor-font-family,monospace);
  font-size:11px;
  background:var(--vscode-badge-background);
  color:var(--vscode-badge-foreground);
  padding:2px 6px;border-radius:3px;
  flex-shrink:0;max-width:85px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.item-name{
  font-size:12px;flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.item-actions{display:none;gap:2px;flex-shrink:0;}
.snippet-item:hover .item-actions,
.snippet-item.active .item-actions{display:flex;}
.icon-btn{
  background:none;border:none;color:inherit;
  cursor:pointer;padding:2px 5px;
  opacity:0.6;border-radius:3px;font-size:13px;line-height:1;
}
.icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}

.empty-list{
  padding:24px 14px;text-align:center;
  opacity:0.4;font-size:12px;line-height:1.7;
}
.loading-msg{
  padding:24px 14px;text-align:center;opacity:0.5;font-size:12px;
}

/* ── Editor panel ─────────────────────────────────────────────── */
.editor-panel{
  flex:1;display:flex;flex-direction:column;
  overflow:hidden;padding:18px;gap:13px;min-width:0;
}
.empty-state{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:14px;opacity:0.4;text-align:center;
}
.empty-state-icon{font-size:40px;line-height:1;}
.empty-state p{font-size:13px;line-height:1.6;}

/* ── Edit form ────────────────────────────────────────────────── */
.edit-form{flex:1;display:none;flex-direction:column;gap:13px;overflow:hidden;}
.edit-form.visible{display:flex;}

.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.form-group{display:flex;flex-direction:column;gap:5px;}
.form-group.full{grid-column:1/-1;}

label{
  font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:0.6px;opacity:0.6;
}
.label-hint{
  font-size:10px;font-weight:400;
  text-transform:none;letter-spacing:0;opacity:0.5;margin-left:6px;
}

input[type="text"],select{
  background:var(--vscode-input-background);
  color:var(--vscode-input-foreground);
  border:1px solid var(--vscode-input-border,var(--vscode-panel-border));
  padding:6px 9px;
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size,13px);
  border-radius:3px;outline:none;width:100%;
}
input[type="text"]:focus,select:focus,textarea:focus{
  border-color:var(--vscode-focusBorder);
  outline:1px solid var(--vscode-focusBorder);
}
select option{background:var(--vscode-dropdown-background);}

.scope-row{grid-column:1/-1;}
.scope-row.hidden{display:none;}

/* ── Body textarea ────────────────────────────────────────────── */
.body-group{
  flex:1;display:flex;flex-direction:column;gap:5px;
  overflow:hidden;min-height:0;
}
.body-label-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.hint code{
  font-family:var(--vscode-editor-font-family,monospace);
  background:var(--vscode-textBlockQuote-background,rgba(128,128,128,.2));
  padding:0 4px;border-radius:2px;font-size:11px;
}
textarea{
  flex:1;min-height:0;
  background:var(--vscode-editor-background);
  color:var(--vscode-editor-foreground);
  border:1px solid var(--vscode-input-border,var(--vscode-panel-border));
  padding:10px 12px;
  font-family:var(--vscode-editor-font-family,monospace);
  font-size:var(--vscode-editor-font-size,13px);
  line-height:1.5;border-radius:3px;resize:none;outline:none;tab-size:4;
}

/* ── Buttons ──────────────────────────────────────────────────── */
.btn{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
  border:none;padding:6px 14px;cursor:pointer;
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size,13px);
  border-radius:3px;white-space:nowrap;
}
.btn:hover{background:var(--vscode-button-hoverBackground);}
.btn-secondary{
  background:var(--vscode-button-secondaryBackground,transparent);
  color:var(--vscode-button-secondaryForeground,var(--vscode-editor-foreground));
  border:1px solid var(--vscode-panel-border);
}
.btn-secondary:hover{
  background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground));
}
.btn-danger{
  background:transparent;
  color:var(--vscode-errorForeground,#f48771);
  border:1px solid currentColor;
}
.btn-danger:hover{background:rgba(244,135,113,0.1);}

.btn-row{display:flex;gap:8px;align-items:center;flex-shrink:0;}
.btn-row .spacer{flex:1;}

/* ── Footer ───────────────────────────────────────────────────── */
.footer{
  padding:6px 14px;
  border-top:1px solid var(--vscode-panel-border);
  display:flex;align-items:center;gap:8px;
  font-size:11px;opacity:0.55;flex-shrink:0;
}
.status-dot{
  width:7px;height:7px;border-radius:50%;
  background:#4EC9B0;flex-shrink:0;
  transition:background 0.3s;
}
.footer-spacer{flex:1;}
.footer-btn{
  background:none;border:none;
  color:var(--vscode-textLink-foreground);
  cursor:pointer;font-size:11px;
  font-family:var(--vscode-font-family);padding:0;
  opacity:0.8;
}
.footer-btn:hover{opacity:1;text-decoration:underline;}

/* ── Toast ────────────────────────────────────────────────────── */
.toast{
  position:fixed;bottom:38px;right:16px;
  background:var(--vscode-notificationCenterHeader-background,#252526);
  color:var(--vscode-editor-foreground);
  border:1px solid var(--vscode-panel-border);
  padding:7px 14px;border-radius:4px;font-size:12px;
  opacity:0;transition:opacity 0.2s;pointer-events:none;z-index:999;
}
.toast.show{opacity:1;}

/* ── Scrollbar ────────────────────────────────────────────────── */
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground);}

/* ── Confirm dialog ───────────────────────────────────────────── */
.confirm-overlay{
  position:fixed;inset:0;
  background:rgba(0,0,0,0.45);
  display:flex;align-items:center;justify-content:center;
  z-index:1000;
}
.confirm-box{
  background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;padding:20px 22px 16px;
  min-width:270px;max-width:380px;
  display:flex;flex-direction:column;gap:16px;
  box-shadow:0 4px 20px rgba(0,0,0,0.4);
}
.confirm-box p{font-size:13px;line-height:1.5;word-break:break-word;}
.confirm-btns{display:flex;gap:8px;justify-content:flex-end;}

/* ── Custom filename row ──────────────────────────────────────── */
.custom-file-row{display:none;}
.custom-file-row.visible{display:flex;}

/* ── Tag pills (sidebar list) ─────────────────────────────────── */
.item-tags{
  display:flex;flex-wrap:nowrap;gap:3px;
  flex-shrink:0;overflow:hidden;
}
.tag-pill{
  font-size:9px;line-height:1;
  background:var(--vscode-badge-background);
  color:var(--vscode-badge-foreground);
  opacity:0.7;
  padding:2px 5px;border-radius:8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55px;
}
.snippet-item.active .tag-pill,.snippet-item:hover .tag-pill{opacity:1;}

/* ── Tags input (form) ────────────────────────────────────────── */
.tags-hint{font-size:10px;opacity:0.45;margin-top:2px;}
.btn-auto{font-size:10px;padding:2px 8px;margin-left:auto;flex-shrink:0;}

/* ── Sort select ──────────────────────────────────────────────── */
.sort-row{display:flex;align-items:center;gap:5px;}
.sort-row label{font-size:10px;opacity:0.5;white-space:nowrap;text-transform:none;letter-spacing:0;font-weight:400;}
.sort-row select{flex:1;}

/* ── Favourite button ─────────────────────────────────────────── */
.fav-btn{
  background:none;border:none;cursor:pointer;
  padding:2px 4px;font-size:13px;line-height:1;
  opacity:0.25;color:inherit;border-radius:3px;flex-shrink:0;
}
.fav-btn:hover{opacity:0.8;background:var(--vscode-toolbar-hoverBackground);}
.fav-btn.is-fav{opacity:1;color:#e8b84b;}
.snippet-item:not(:hover):not(.active) .fav-btn:not(.is-fav){display:none;}

/* ── Uses badge ───────────────────────────────────────────────── */
.uses-badge{
  font-size:9px;opacity:0.35;white-space:nowrap;flex-shrink:0;
  font-family:var(--vscode-editor-font-family,monospace);
}
.snippet-item:hover .uses-badge,
.snippet-item.active .uses-badge{opacity:0.6;}

/* ── External source badge (sidebar) ─────────────────────────── */
.source-badge{
  font-size:9px;
  background:var(--vscode-inputValidation-infoBorder,#007acc);
  color:#fff;opacity:0.75;
  padding:1px 5px;border-radius:8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65px;
  flex-shrink:0;
}
.snippet-item.active .source-badge,.snippet-item:hover .source-badge{opacity:1;}

/* ── Read-only banner (form) ──────────────────────────────────── */
.readonly-bar{
  display:flex;align-items:center;gap:10px;
  padding:7px 10px;
  background:var(--vscode-inputValidation-infoBackground,rgba(0,120,212,0.1));
  border:1px solid var(--vscode-inputValidation-infoBorder,#007acc);
  border-radius:3px;flex-shrink:0;font-size:11px;
}
.readonly-bar-icon{opacity:0.7;flex-shrink:0;}
.readonly-bar-text{flex:1;opacity:0.8;}
.edit-form.is-readonly input,
.edit-form.is-readonly select,
.edit-form.is-readonly textarea{
  opacity:0.65;pointer-events:none;
  background:var(--vscode-editor-background);
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-title">&#9000;&nbsp; Keyword Expander</div>
  <div class="header-actions">
    <button class="btn btn-secondary" onclick="importSnippets()">&#8657;&nbsp; Import</button>
    <button class="btn btn-secondary" onclick="openExamplePicker()">&#9733;&nbsp; Examples</button>
    <button class="btn btn-secondary" onclick="manageSources()">&#9729;&nbsp; Sources</button>
    <button class="btn btn-secondary" onclick="exportAll()">&#8659;&nbsp; Export All</button>
    <button class="btn btn-secondary" onclick="refresh()">&#8635; Refresh</button>
    <button class="btn btn-secondary" onclick="newSnippet()">&#65291; New Snippet</button>
  </div>
</div>

<!-- Main -->
<div class="main">

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-toolbar">
      <input type="text" id="search" placeholder="Search&#x2026; or tag:woo" oninput="renderList()" autocomplete="off">
      <select id="langFilter" onchange="renderList()">
        <option value="">All Languages</option>
      </select>
      <div class="sort-row">
        <label for="sortSelect">Sort</label>
        <select id="sortSelect" onchange="renderList()">
          <option value="az">Name A–Z</option>
          <option value="fav">Favourites First</option>
          <option value="used">Most Used</option>
          <option value="recent">Recently Used</option>
        </select>
      </div>
    </div>
    <button class="add-new-btn" onclick="newSnippet()">&#65291;&nbsp; Add New Snippet</button>
    <div class="snippet-list" id="snippetList">
      <div class="loading-msg">Loading&#x2026;</div>
    </div>
  </div>

  <!-- Editor -->
  <div class="editor-panel">

    <!-- Empty state -->
    <div class="empty-state" id="emptyState">
      <div class="empty-state-icon">&#9000;</div>
      <p>Select a snippet to edit<br>or create a new one.</p>
      <button class="btn" onclick="newSnippet()">&#65291;&nbsp; Add New Snippet</button>
    </div>

    <!-- Edit form -->
    <div class="edit-form" id="editForm">

      <!-- Read-only banner (external snippets) -->
      <div class="readonly-bar" id="readonlyBar" style="display:none">
        <span class="readonly-bar-icon">&#9729;</span>
        <span class="readonly-bar-text" id="readonlyBarText">External snippet — read only</span>
        <button class="btn btn-secondary" style="font-size:11px;padding:3px 10px" onclick="saveAsLocal()">Save as Local Copy</button>
      </div>

      <div class="form-grid">

        <div class="form-group">
          <label for="nameInput">Snippet Name <span class="label-hint">(the display label)</span></label>
          <input type="text" id="nameInput" placeholder="e.g. WordPress Plugin Header" autocomplete="off">
        </div>

        <div class="form-group">
          <label for="fileSelect">Language / File</label>
          <select id="fileSelect" onchange="onFileChange()"></select>
        </div>

        <div class="form-group full custom-file-row" id="customFileRow">
          <label for="customFileInput">Custom filename <span class="label-hint">(e.g. myproject.code-snippets)</span></label>
          <input type="text" id="customFileInput" placeholder="myproject.code-snippets" autocomplete="off" spellcheck="false"
            onkeydown="customFileKeydown(event)" onblur="applyCustomFile()">
        </div>

        <div class="form-group">
          <label for="prefixInput">Prefix / Keyword <span class="label-hint">(what you type)</span></label>
          <input type="text" id="prefixInput" placeholder="e.g. plugin" autocomplete="off" spellcheck="false">
        </div>

        <div class="form-group">
          <label for="descInput">Description <span class="label-hint">(optional)</span></label>
          <input type="text" id="descInput" placeholder="Short description shown in IntelliSense" autocomplete="off">
        </div>

        <div class="form-group full">
          <label for="tagsInput">Tags <span class="label-hint">(optional — comma-separated)</span></label>
          <input type="text" id="tagsInput" placeholder="e.g. woocommerce, php, checkout" autocomplete="off" spellcheck="false">
          <span class="tags-hint">Search by tag in the sidebar with <code style="font-family:var(--vscode-editor-font-family,monospace);background:var(--vscode-textBlockQuote-background,rgba(128,128,128,.2));padding:0 4px;border-radius:2px;font-size:10px">tag:woo</code></span>
        </div>

        <div class="form-group full scope-row hidden" id="scopeRow">
          <label for="scopeInput">Scope <span class="label-hint">(comma-separated language IDs, blank = all)</span></label>
          <input type="text" id="scopeInput" placeholder="e.g. php, javascript, typescript" autocomplete="off" spellcheck="false">
        </div>

      </div><!-- /.form-grid -->

      <div class="body-group">
        <div class="body-label-row">
          <label>Body</label>
          <span class="hint">
            Tab stops: <code>\$1</code>&nbsp;<code>\${1:placeholder}</code>
            &nbsp;&middot;&nbsp; Literal \$: <code>\\\$</code>
            &nbsp;&middot;&nbsp; Variables: <code>\$TM_FILENAME</code>
          </span>
          <button class="btn btn-secondary btn-auto" onclick="autoTabStops()" title="Scan for repeated identifiers and convert to VS Code tab stops">&#9889;&nbsp;Auto Tab Stops</button>
        </div>
        <textarea id="bodyInput" spellcheck="false"
          placeholder="Enter the snippet body here&#x2026;&#10;&#10;Examples:&#10;  \$1, \$2           tab stops&#10;  \${1:label}       placeholder&#10;  \\\$variable       literal dollar sign (PHP etc.)&#10;  \$TM_FILENAME    current filename"
          onkeydown="textareaTabKey(event)"></textarea>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="cancelEdit()">Cancel</button>
        <button class="btn btn-danger" id="deleteBtn" onclick="deleteCurrentSnippet()" style="display:none">Delete</button>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="exportBtn" onclick="exportCurrentSnippet()" style="display:none">&#8659;&nbsp; Export</button>
        <button class="btn btn-secondary" onclick="previewSnippet()">&#9654;&nbsp; Preview in Editor</button>
        <button class="btn" id="saveBtn" onclick="saveSnippet()">Save Snippet</button>
      </div>

    </div><!-- /.edit-form -->
  </div><!-- /.editor-panel -->
</div><!-- /.main -->

<!-- Footer -->
<div class="footer">
  <div class="status-dot" id="statusDot"></div>
  <span id="statusText">Loading&#x2026;</span>
  <div class="footer-spacer"></div>
  <button class="footer-btn" onclick="openDir()">Open Snippets Folder &#8599;</button>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
var vscode = acquireVsCodeApi();

/* ── State ─────────────────────────────────────────────────────────── */
var state = {
  snippets:    [],
  languages:   [],
  snippetsDir: '',
  selectedId:  null,
  isNew:       false,
  isReadonly:  false,
  // what was in the form before editing (to detect file/name moves)
  originalFile: null,
  originalName: null,
};

/* ── Extension messages ─────────────────────────────────────────────── */
window.addEventListener('message', function(event) {
  var msg = event.data;
  if (msg.type === 'load') {
    state.snippets    = msg.snippets    || [];
    state.languages   = msg.languages   || [];
    state.snippetsDir = msg.snippetsDir || '';

    buildLangFilter();
    buildFileSelect();
    renderList();

    var count = state.snippets.length;
    setStatus(count + ' snippet' + (count !== 1 ? 's' : '') + ' loaded.');
    return;
  }
  if (msg.type === 'exportDone') {
    showToast('Exported ' + msg.count + ' snippet' + (msg.count !== 1 ? 's' : '') + '.');
    return;
  }
  if (msg.type === 'importDone') {
    showToast('Imported ' + msg.count + ' snippet' + (msg.count !== 1 ? 's' : '') + '.');
    return;
  }
  if (msg.type === 'sourcesLoading') {
    setStatus('Fetching external sources…');
    return;
  }
  if (msg.type === 'prefill') {
    // Triggered by "Add Selection as Snippet" — open a blank new-snippet
    // form with the body pre-populated and the cursor in the Name field.
    newSnippet();
    document.getElementById('bodyInput').value = msg.body || '';
    // Try to pre-select the matching language file
    if (msg.langId) {
      var fileSelect = document.getElementById('fileSelect');
      // Find the option whose value ends with the langId (e.g. "php.json")
      var matched = Array.from(fileSelect.options).find(function(o) {
        return o.value === msg.langId + '.json' || o.value === msg.langId;
      });
      if (matched) {
        fileSelect.value = matched.value;
        updateScopeVisibility();
      }
    }
    document.getElementById('nameInput').focus();
    setStatus('Paste your selection is ready — fill in the name and keyword.');
    return;
  }
});

/* ── Build sidebar language filter ─────────────────────────────────── */
function buildLangFilter() {
  var sel   = document.getElementById('langFilter');
  var cur   = sel.value;

  // Collect unique language labels from loaded snippets
  var seen  = {};
  var opts  = ['<option value="">All Languages</option>'];
  state.snippets.forEach(function(s) {
    if (!seen[s.langLabel]) {
      seen[s.langLabel] = true;
      opts.push('<option value="' + esc(s.langLabel) + '">' + esc(s.langLabel) + '</option>');
    }
  });
  sel.innerHTML = opts.join('');
  sel.value = cur;
}

/* ── Build form file select from LANGUAGES list ─────────────────────── */
function buildFileSelect() {
  var sel  = document.getElementById('fileSelect');
  var cur  = sel.value;
  var opts = state.languages.map(function(l) {
    return '<option value="' + esc(l.file) + '">' + esc(l.label) + '</option>';
  });
  // Add separator + custom option
  opts.push('<option value="__custom__">Custom filename&#x2026;</option>');
  sel.innerHTML = opts.join('');
  if (cur) sel.value = cur;
}

/* ── Render sidebar list ─────────────────────────────────────────────── */
function renderList() {
  var raw        = document.getElementById('search').value;
  var langFilter = document.getElementById('langFilter').value;
  var sortMode   = document.getElementById('sortSelect').value;
  var list       = document.getElementById('snippetList');

  // Extract tag: filter — anything after "tag:" up to the next space
  var tagNeedle  = null;
  var textSearch = raw.replace(/(?:^|\s)tag:(\S*)/gi, function(_, t) {
    tagNeedle = t.toLowerCase();
    return '';
  }).trim().toLowerCase();

  var filtered = state.snippets.filter(function(s) {
    if (langFilter && s.langLabel !== langFilter) return false;
    if (tagNeedle !== null) {
      var tags = s.tags || [];
      var hit  = tagNeedle === '' || tags.some(function(t) { return t.indexOf(tagNeedle) !== -1; });
      if (!hit) return false;
    }
    if (textSearch) {
      return s.prefix.toLowerCase().indexOf(textSearch) !== -1 ||
             s.name.toLowerCase().indexOf(textSearch)   !== -1 ||
             s.body.toLowerCase().indexOf(textSearch)   !== -1;
    }
    return true;
  });

  if (filtered.length === 0) {
    var emptyMsg = tagNeedle !== null && tagNeedle !== ''
      ? 'No snippets tagged &ldquo;' + esc(tagNeedle) + '&rdquo;.'
      : 'No snippets found.<br>Click &ldquo;+ Add New Snippet&rdquo; to create one.';
    list.innerHTML = '<div class="empty-list">' + emptyMsg + '</div>';
    return;
  }

  // ── Sort ────────────────────────────────────────────────────────────
  if (sortMode === 'used') {
    filtered.sort(function(a, b) { return (b.uses || 0) - (a.uses || 0); });
  } else if (sortMode === 'recent') {
    filtered.sort(function(a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
  } else if (sortMode === 'fav') {
    filtered.sort(function(a, b) {
      if (a.favourite && !b.favourite) return -1;
      if (!a.favourite && b.favourite) return  1;
      return a.name.localeCompare(b.name);
    });
  }
  // 'az' keeps the existing extension-side alpha sort

  // ── Render ──────────────────────────────────────────────────────────
  // Flat list for sorted modes, grouped by language for A–Z
  var html = '';

  if (sortMode !== 'az') {
    // Flat — no language section headers, just items
    filtered.forEach(function(s) {
      html += renderItem(s, sortMode);
    });
  } else {
    // Grouped by file
    var groups = {};
    var order  = [];
    filtered.forEach(function(s) {
      if (!groups[s.file]) { groups[s.file] = []; order.push(s.file); }
      groups[s.file].push(s);
    });
    order.forEach(function(file) {
      var grp = groups[file];
      var langEntry = null;
      state.languages.forEach(function(l) { if (l.file === file) langEntry = l; });
      var label = langEntry ? langEntry.label : file.replace(/\.(json|code-snippets)$/, '');
      html += '<div class="list-section">' + esc(label) + '</div>';
      grp.forEach(function(s) { html += renderItem(s, sortMode); });
    });
  }

  list.innerHTML = html;
}

/* ── Render a single sidebar item ───────────────────────────────────── */
function renderItem(s, sortMode) {
  var active   = s.id === state.selectedId ? ' active' : '';
  var favClass = s.favourite ? ' is-fav' : '';

  var tagPills = '';
  if (s.tags && s.tags.length) {
    var show = s.tags.slice(0, 3);
    tagPills = '<div class="item-tags">' +
      show.map(function(t) { return '<span class="tag-pill" title="' + esc(t) + '">' + esc(t) + '</span>'; }).join('') +
      '</div>';
  }

  var usesBadge = '';
  if (sortMode === 'used' && s.uses > 0) {
    usesBadge = '<span class="uses-badge">' + s.uses + 'x</span>';
  }

  var sourceBadge = '';
  if (s.readonly && s.sourceName) {
    sourceBadge = '<span class="source-badge" title="' + esc(s.sourceName) + '">' + esc(s.sourceName) + '</span>';
  }

  return '<div class="snippet-item' + active + '" data-id="' + esc(s.id) + '">' +
    '<button class="fav-btn' + favClass + '" title="' + (s.favourite ? 'Remove favourite' : 'Add to favourites') + '" data-id="' + esc(s.id) + '">&#9733;</button>' +
    '<span class="kw-badge" title="' + esc(s.prefix) + '">' + esc(s.prefix) + '</span>' +
    '<span class="item-name">' + esc(s.name) + '</span>' +
    tagPills +
    sourceBadge +
    usesBadge +
    '<div class="item-actions">' +
    '<button class="icon-btn exp-btn" title="Export snippet" data-id="' + esc(s.id) + '">&#8659;</button>' +
    (s.readonly
      ? '<button class="icon-btn hide-btn" title="Hide this snippet" data-id="' + esc(s.id) + '" data-key="' + esc(s.dismissKey || '') + '">&#10005;</button>'
      : '<button class="icon-btn del-btn" title="Delete" data-id="' + esc(s.id) + '">&#128465;</button>') +
    '</div>' +
    '</div>';
}

/* ── List click delegation (avoids inline-onclick quote-escaping bugs) ──── */
document.getElementById('snippetList').addEventListener('click', function(e) {
  var favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.stopPropagation();
    var id = favBtn.dataset.id;
    // Optimistic toggle in local state
    var s = state.snippets.find(function(x) { return x.id === id; });
    if (s) {
      s.favourite = !s.favourite;
      renderList();
    }
    vscode.postMessage({ type: 'toggleFavourite', id: id });
    return;
  }
  var expBtn = e.target.closest('.exp-btn');
  if (expBtn) {
    e.stopPropagation();
    exportSnippet(expBtn.dataset.id);
    return;
  }
  var hideBtn = e.target.closest('.hide-btn');
  if (hideBtn) {
    e.stopPropagation();
    var id  = hideBtn.dataset.id;
    var key = hideBtn.dataset.key;
    // Remove from local state immediately so it vanishes without waiting for push
    state.snippets = state.snippets.filter(function(x) { return x.id !== id; });
    if (state.selectedId === id) { state.selectedId = null; hideForm(); }
    renderList();
    vscode.postMessage({ type: 'hideExternal', dismissKey: key });
    return;
  }
  var delBtn = e.target.closest('.del-btn');
  if (delBtn) {
    e.stopPropagation();
    deleteSnippet(delBtn.dataset.id);
    return;
  }
  var item = e.target.closest('.snippet-item');
  if (item && item.dataset.id) selectSnippet(item.dataset.id);
});

/* ── Select snippet ──────────────────────────────────────────────────── */
function selectSnippet(id) {
  var s = state.snippets.find(function(x) { return x.id === id; });
  if (!s) return;

  state.selectedId   = id;
  state.isNew        = false;
  state.isReadonly   = !!s.readonly;
  state.originalFile = s.file;
  state.originalName = s.name;

  document.getElementById('nameInput').value   = s.name;
  document.getElementById('prefixInput').value = s.prefix;
  document.getElementById('descInput').value   = s.description;
  document.getElementById('tagsInput').value   = (s.tags || []).join(', ');
  document.getElementById('bodyInput').value   = s.body;
  document.getElementById('scopeInput').value  = s.scope;

  var fileSelect = document.getElementById('fileSelect');
  fileSelect.value = s.file;
  if (fileSelect.value !== s.file) {
    var opt = document.createElement('option');
    opt.value = s.file; opt.textContent = s.file;
    fileSelect.appendChild(opt);
    fileSelect.value = s.file;
  }
  updateScopeVisibility();

  var form = document.getElementById('editForm');
  var bar  = document.getElementById('readonlyBar');
  if (s.readonly) {
    form.classList.add('is-readonly');
    bar.style.display = 'flex';
    document.getElementById('readonlyBarText').textContent =
      'External snippet from "' + (s.sourceName || 'unknown') + '" — read only';
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('exportBtn').style.display = '';
    document.getElementById('saveBtn').style.display   = 'none';
  } else {
    form.classList.remove('is-readonly');
    bar.style.display = 'none';
    document.getElementById('deleteBtn').style.display = '';
    document.getElementById('exportBtn').style.display = '';
    document.getElementById('saveBtn').style.display   = '';
  }

  showForm();
  renderList();
}

/* ── New snippet ─────────────────────────────────────────────────────── */
function newSnippet() {
  state.selectedId   = null;
  state.isNew        = true;
  state.isReadonly   = false;
  state.originalFile = null;
  state.originalName = null;

  document.getElementById('nameInput').value   = '';
  document.getElementById('prefixInput').value = '';
  document.getElementById('descInput').value   = '';
  document.getElementById('tagsInput').value   = '';
  document.getElementById('bodyInput').value   = '';
  document.getElementById('scopeInput').value  = '';

  var fileSelect = document.getElementById('fileSelect');
  if (fileSelect.options.length) fileSelect.selectedIndex = 0;
  updateScopeVisibility();

  document.getElementById('editForm').classList.remove('is-readonly');
  document.getElementById('readonlyBar').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('exportBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display   = '';
  showForm();
  renderList();
  document.getElementById('nameInput').focus();
}

/* ── Cancel ──────────────────────────────────────────────────────────── */
function cancelEdit() {
  state.selectedId = null;
  state.isNew = false;
  hideForm();
  renderList();
}

/* ── Save ────────────────────────────────────────────────────────────── */
function saveSnippet() {
  var name   = document.getElementById('nameInput').value.trim();
  var prefix = document.getElementById('prefixInput').value.trim();
  var desc   = document.getElementById('descInput').value.trim();
  var tags   = document.getElementById('tagsInput').value.trim();
  var body   = document.getElementById('bodyInput').value;
  var scope  = document.getElementById('scopeInput').value.trim();
  var file   = document.getElementById('fileSelect').value;

  if (!name)   { document.getElementById('nameInput').focus();   setStatus('Please enter a snippet name.', true);    return; }
  if (!prefix) { document.getElementById('prefixInput').focus(); setStatus('Please enter a prefix keyword.', true);  return; }
  if (!body.trim()) { document.getElementById('bodyInput').focus(); setStatus('Body cannot be empty.', true); return; }
  if (file === '__custom__') { setStatus('Please select a language / file.', true); return; }

  vscode.postMessage({
    type:         'save',
    originalFile: state.originalFile,
    originalName: state.originalName,
    file,
    name,
    prefix,
    description:  desc,
    tags,
    body,
    scope,
  });

  // Optimistic update — mark as editing the saved key
  state.originalFile = file;
  state.originalName = name;
  state.isNew        = false;

  // The extension will push a fresh 'load' which re-renders the list
  showToast('"' + name + '" saved.');
}

/* ── Delete current (from form) ──────────────────────────────────────── */
function deleteCurrentSnippet() {
  if (!state.originalFile || !state.originalName) return;
  deleteSnippet(state.originalFile + '::' + state.originalName);
}

/* ── Inline confirm dialog ────────────────────────────────────────────── */
var _confirmCallback = null;
function showConfirm(msg, onOk) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmOverlay').style.display = 'flex';
  _confirmCallback = onOk;
  document.getElementById('confirmOkBtn').focus();
}
function confirmOk() {
  document.getElementById('confirmOverlay').style.display = 'none';
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
}
function confirmCancel() {
  document.getElementById('confirmOverlay').style.display = 'none';
  _confirmCallback = null;
}

/* ── Delete by id ────────────────────────────────────────────────────── */
function deleteSnippet(id) {
  var s = state.snippets.find(function(x) { return x.id === id; });
  if (!s) return;

  showConfirm('Delete snippet "' + s.name + '"?', function() {
    vscode.postMessage({ type: 'delete', file: s.file, name: s.name });
    if (state.selectedId === id) {
      state.selectedId = null;
      hideForm();
    }
    showToast('"' + s.name + '" deleted.');
  });
}

/* ── Auto tab stops ──────────────────────────────────────────────────── */
${_wvSrc(_wv_autoTabStops, 'autoTabStops')}

${_wvSrc(_wv_buildAutoTabStops, 'buildAutoTabStops')}

/* ── Preview in active editor ────────────────────────────────────────── */
function previewSnippet() {
  var body = document.getElementById('bodyInput').value;
  if (!body.trim()) { setStatus('Nothing to preview.', true); return; }
  vscode.postMessage({ type: 'preview', body: body });
  // Track usage if editing an existing snippet
  if (state.originalFile && state.originalName) {
    vscode.postMessage({ type: 'trackUsage', id: state.originalFile + '::' + state.originalName });
    var s = state.snippets.find(function(x) { return x.id === state.originalFile + '::' + state.originalName; });
    if (s) { s.uses = (s.uses || 0) + 1; s.lastUsed = Date.now(); }
  }
}

/* ── File select change ──────────────────────────────────────────────── */
function onFileChange() {
  var file = document.getElementById('fileSelect').value;
  var customRow = document.getElementById('customFileRow');
  if (file === '__custom__') {
    customRow.classList.add('visible');
    var input = document.getElementById('customFileInput');
    input.value = '';
    input.focus();
  } else {
    customRow.classList.remove('visible');
  }
  updateScopeVisibility();
}

function customFileKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); applyCustomFile(); }
  if (e.key === 'Escape') {
    document.getElementById('customFileRow').classList.remove('visible');
    document.getElementById('fileSelect').selectedIndex = 0;
    updateScopeVisibility();
  }
}

function applyCustomFile() {
  var input = document.getElementById('customFileInput');
  var val   = input.value.trim();
  var sel   = document.getElementById('fileSelect');
  if (val) {
    // Add or reuse the option
    var existing = Array.from(sel.options).find(function(o) { return o.value === val; });
    if (!existing) {
      var opt = document.createElement('option');
      opt.value = val; opt.textContent = val;
      sel.appendChild(opt);
    }
    sel.value = val;
    document.getElementById('customFileRow').classList.remove('visible');
    updateScopeVisibility();
  } else {
    sel.selectedIndex = 0;
    document.getElementById('customFileRow').classList.remove('visible');
    updateScopeVisibility();
  }
}

function updateScopeVisibility() {
  var file = document.getElementById('fileSelect').value;
  var row  = document.getElementById('scopeRow');
  if (file && file.endsWith('.code-snippets')) {
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
  }
}

/* ── Refresh ─────────────────────────────────────────────────────────── */
function refresh() {
  document.getElementById('snippetList').innerHTML = '<div class="loading-msg">Refreshing&#x2026;</div>';
  vscode.postMessage({ type: 'refreshSources' });
}

/* ── Open snippets folder ────────────────────────────────────────────── */
function openDir() {
  vscode.postMessage({ type: 'openDir' });
}

/* ── Export all snippets ─────────────────────────────────────────────── */
function exportAll() {
  vscode.postMessage({ type: 'export', snippetIds: null });
}

/* ── Export a single snippet by id ──────────────────────────────────── */
function exportSnippet(id) {
  vscode.postMessage({ type: 'export', snippetIds: [id] });
}

/* ── Export the snippet currently open in the form ───────────────────── */
function exportCurrentSnippet() {
  if (!state.originalFile || !state.originalName) return;
  exportSnippet(state.originalFile + '::' + state.originalName);
}

/* ── Import snippets from file ───────────────────────────────────────── */
function importSnippets() {
  vscode.postMessage({ type: 'import' });
}

/* ── Open example picker (native VS Code QuickPick) ──────────────────── */
function openExamplePicker() {
  vscode.postMessage({ type: 'importExamples' });
}

/* ── External sources ────────────────────────────────────────────────── */
function manageSources() {
  vscode.postMessage({ type: 'manageSources' });
}

function refreshSources() {
  vscode.postMessage({ type: 'refreshSources' });
}

/* ── Save external snippet as a local copy ───────────────────────────── */
function saveAsLocal() {
  var s = state.snippets.find(function(x) { return x.id === state.selectedId; });
  if (!s) return;

  // Switch form to editable — user can rename/adjust then save normally
  state.isReadonly   = false;
  state.originalFile = null;  // treat as new so save doesn't try to delete original
  state.originalName = null;
  state.isNew        = true;

  document.getElementById('editForm').classList.remove('is-readonly');
  document.getElementById('readonlyBar').style.display = 'none';
  document.getElementById('deleteBtn').style.display   = 'none';
  document.getElementById('exportBtn').style.display   = 'none';
  document.getElementById('saveBtn').style.display     = '';
  document.getElementById('nameInput').focus();
  setStatus('Edit and save to create a local copy of this snippet.');
}

/* ── Textarea Tab key ────────────────────────────────────────────────── */
function textareaTabKey(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  var el = e.target;
  var s  = el.selectionStart;
  el.value = el.value.substring(0, s) + '    ' + el.value.substring(el.selectionEnd);
  el.selectionStart = el.selectionEnd = s + 4;
}

/* ── Global keyboard shortcuts ───────────────────────────────────────── */
document.addEventListener('keydown', function(e) {
  var mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    if (document.getElementById('confirmOverlay').style.display !== 'none') {
      confirmCancel(); return;
    }
    cancelEdit(); return;
  }
  if (mod && e.key === 's')   { e.preventDefault(); saveSnippet(); return; }
  if (mod && e.key === 'n')   { e.preventDefault(); newSnippet(); return; }
  if (mod && e.key === 'r')   { e.preventDefault(); refresh(); return; }
});

/* ── Helpers ─────────────────────────────────────────────────────────── */
function showForm() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('editForm').classList.add('visible');
}
function hideForm() {
  document.getElementById('emptyState').style.display = '';
  document.getElementById('editForm').classList.remove('visible');
}
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
var _toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2500);
}
var _statusTimer = null;
function setStatus(msg, isError) {
  var el  = document.getElementById('statusText');
  var dot = document.getElementById('statusDot');
  el.textContent       = msg;
  dot.style.background = isError ? '#f48771' : '#4EC9B0';
  clearTimeout(_statusTimer);
  if (!isError) {
    _statusTimer = setTimeout(function() {
      el.textContent       = state.snippets.length + ' snippets loaded.';
      dot.style.background = '#4EC9B0';
    }, 3000);
  }
}

/* ── Ready ───────────────────────────────────────────────────────────── */
vscode.postMessage({ type: 'ready' });
</script>
<!-- Confirm dialog -->
<div class="confirm-overlay" id="confirmOverlay" style="display:none">
  <div class="confirm-box">
    <p id="confirmMsg"></p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="confirmCancel()">Cancel</button>
      <button class="btn btn-danger" id="confirmOkBtn" onclick="confirmOk()">Delete</button>
    </div>
  </div>
</div>

</body>
</html>`;
}

module.exports = { activate, deactivate };