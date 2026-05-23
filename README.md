# Keyword Expander

A VS Code extension with a visual editor for creating and managing keyword shortcuts that expand into full code snippets. Reads and writes to your real VS Code snippet files — so existing snippets load automatically, new ones appear in IntelliSense straight away, and everything syncs via VS Code Settings Sync.

---

## Installation

### Option A — Drop in extensions folder (no build needed)

```bash
git clone https://github.com/westcoastdigital/keyword-expander.git ~/.vscode/extensions/keyword-expander
```

Then restart VS Code (or run *Developer: Reload Window*).

On Windows, clone into `%USERPROFILE%\.vscode\extensions\keyword-expander` instead.

### Option B — Build a `.vsix`

```bash
git clone https://github.com/westcoastdigital/keyword-expander.git
cd keyword-expander
npm install
npx vsce package
code --install-extension keyword-expander-1.0.0.vsix
```

### Updating

```bash
cd ~/.vscode/extensions/keyword-expander
git pull
```

Reload VS Code after pulling.

---

## Opening the editor

There are four ways to open the snippet editor — no Command Palette required:

| Where | How |
|---|---|
| **Status bar** | Click **⌨ Snippets** in the bottom-right of the VS Code window — always visible |
| **Editor title bar** | Click the **⌨** icon in the top-right corner of any open file |
| **Extensions panel** | Find *Keyword Expander* in your installed extensions, click the **⚙** gear icon, choose *Keyword Expander: Open Snippet Editor* |
| **Command Palette** | `Ctrl+Shift+P` → `Keyword Expander: Open Snippet Editor` |

---

## Adding a snippet

1. Click **+ Add New Snippet** in the sidebar
2. Fill in the form:

| Field | Description |
|---|---|
| **Snippet Name** | Display label shown in IntelliSense (e.g. `WordPress Plugin Header`) |
| **Language / File** | Where to save it — `PHP`, `JavaScript`, `Global`, etc. |
| **Prefix / Keyword** | What you type to trigger the expansion (e.g. `plugin`) |
| **Description** | Optional detail line shown in the IntelliSense dropdown |
| **Scope** | Global snippets only — comma-separated language IDs to restrict to (blank = all languages) |
| **Body** | The content to expand into — supports full VS Code snippet syntax |

3. Click **Save Snippet** (or `Ctrl+S`)

The snippet is written immediately to your VS Code snippets directory and available in IntelliSense with no restart.

---

## Expanding snippets

### IntelliSense (primary)

Type your keyword in any file. It appears in the autocomplete dropdown labelled with your snippet name and description. Press **Tab** or **Enter** to expand.

This works automatically with no configuration — VS Code picks up the snippet files the extension writes to.

### Tab key (optional)

To expand by pressing **Tab** directly after a keyword (like Emmet), add this to your `keybindings.json` (`Ctrl+Shift+P` → *Open Keyboard Shortcuts JSON*):

```json
{
    "key": "tab",
    "command": "keywordExpander.expand",
    "when": "editorTextFocus && !editorReadonly && !suggestWidgetVisible && !inSnippetMode"
}
```

If the word before the cursor doesn't match any snippet, Tab falls through to normal indentation.

---

## Settings Sync

Snippets created with Keyword Expander sync automatically via [VS Code Settings Sync](https://code.visualstudio.com/docs/editor/settings-sync). This is because the extension writes directly to VS Code's own snippet files (`User/snippets/`), which Settings Sync already includes alongside your settings, keybindings, and extensions.

To enable Settings Sync: *Manage* (⚙ bottom-left) → *Settings Sync is Off* → *Turn On* → sign in with GitHub or Microsoft.

Once on, any snippet you create or edit is synced to all your machines automatically.

---

## Body syntax

The body follows VS Code's standard [snippet format](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_snippet-syntax).

| Syntax | Result |
|---|---|
| `$1`, `$2` | Tab stops — cursor jumps to each in order |
| `$0` | Final cursor position after all tab stops |
| `${1:text}` | Tab stop with placeholder text |
| `${1\|a,b,c\|}` | Tab stop with a drop-down choice |
| `\$` | Literal `$` sign — use this for PHP variables |
| `$TM_FILENAME_BASE` | Current filename without extension |
| `$CURRENT_YEAR` | Four-digit year |
| `$CURRENT_DATE` | Day of month |

---

## Examples

### PHP plugin header

```
Name:     WordPress Plugin Header
Prefix:   plugin
Language: PHP
Body:
<?php
/*
Plugin Name:  ${1:My Plugin}
Plugin URI:   https://gist.github.com/westcoastdigital
Description:  ${2:Describe what the plugin does here}
Version:      ${3:1.0.0}
Author:       Jon Mather
Author URI:   https://jonmather.au
License:      GPL v2 or later
License URI:  https://www.gnu.org/licenses/gpl-2.0.html
Text Domain:  ${4:my-plugin}
Domain Path:  /languages
*/
$0
```

### WordPress singleton class

```
Name:     WordPress Singleton Class
Prefix:   wpclass
Language: PHP
Body:
<?php
if ( ! class_exists( '${1:ClassName}' ) ) :

class ${1:ClassName} {

	private static \$instance = null;

	public static function get_instance() {
		if ( null === self::\$instance ) {
			self::\$instance = new self();
		}
		return self::\$instance;
	}

	private function __construct() {
		$0
	}
}

${1:ClassName}::get_instance();

endif;
```

### WordPress action hook

```
Name:     WordPress Action Hook
Prefix:   wphook
Language: PHP
Body:
add_action( '${1:hook_name}', '${2:callback_function}' );

function ${2:callback_function}() {
	$0
}
```

---

## Editor panel shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save snippet |
| `Ctrl+N` / `Cmd+N` | New snippet |
| `Ctrl+R` / `Cmd+R` | Refresh from disk |
| `Escape` | Cancel / close form |
| `Tab` in body | Inserts 4 spaces |

---

## Snippets directory

Snippets are saved to your VS Code user snippets folder:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\Code\User\snippets\` |
| macOS | `~/Library/Application Support/Code/User/snippets/` |
| Linux | `~/.config/Code/User/snippets/` |

Language-specific snippets are stored in files like `php.json` and `javascript.json`. Global snippets go in `global.code-snippets` and optionally use the **Scope** field to restrict which languages they appear in.

Click **Open Snippets Folder** in the editor footer to open the directory directly.

VS Code Insiders is detected automatically and uses the `Code - Insiders` path.