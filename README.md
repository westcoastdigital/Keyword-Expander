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

### Plugin scaffolding

#### PHP theme header

```
Name:     WordPress Theme Header
Prefix:   theme
Language: PHP
Body:
/**
 * Theme Name: ${1:SimpliWeb Theme}
 * Theme URI: https://github.com/westcoastdigital
 * Description:  ${2:Describe your theme here}
 * Version: ${3:1.0.0}
 * Author: SimpliWeb
 * Author URI: https://simpliweb.com.au
 * Text Domain: ${4:simpliweb}
 * Domain Path: /assets/lang
 * Tested up to: 6.4
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * License: GNU General Public License v2.0 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */
$0
```

#### PHP plugin header

```
Name:     WordPress Plugin Header
Prefix:   plugin
Language: PHP
Body:
<?php
/*
Plugin Name:  ${1:SimpliWeb Plugin}
Plugin URI:   https://gist.github.com/westcoastdigital
Description:  ${2:Describe what the plugin does here}
Version:      ${3:1.0.0}
Author:       SimpliWeb
Author URI:   https://simpliweb.com.au
License:      GPL v2 or later
License URI:  https://www.gnu.org/licenses/gpl-2.0.html
Text Domain:  ${4:simpliweb}
Domain Path:  /languages
*/

define('${5:SIMPLI_PLUGIN}_VERSION', '${3:1.0.0}');
define('${5:SIMPLI_PLUGIN}_PATH', plugin_dir_path(__FILE__));
define('${5:SIMPLI_PLUGIN}_URL', plugin_dir_url(__FILE__));

$0
```

#### Singleton plugin class

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

#### Abort if accessed directly

```
Name:     Abort if accessed directly
Prefix:   abspath
Language: PHP
Body:
if ( ! defined( 'ABSPATH' ) ) exit;
```

#### Plugin constants

```
Name:     Plugin constants
Prefix:   pluginconst
Language: PHP
Body:
define( '${1:MYPLUGIN}_VERSION',   '${2:1.0.0}' );
define( '${1:MYPLUGIN}_DIR',       plugin_dir_path( __FILE__ ) );
define( '${1:MYPLUGIN}_URL',       plugin_dir_url( __FILE__ ) );
define( '${1:MYPLUGIN}_BASENAME',  plugin_basename( __FILE__ ) );
```

---

### Hooks & filters

#### WordPress action hook

```
Name:     WordPress Action Hook
Prefix:   wphook
Language: PHP
Body:
if(!function_exists(${1:callback_function})) {

    add_action( '${2:hook_name}', '${1:callback_function}' );
    function ${1:callback_function}() {
	    $0
    }

}
```

#### add_action (class method)

```
Name:     add_action (class method)
Prefix:   addaction
Language: PHP
Body:
add_action( '${1:hook_name}', [ $this, '${2:method_name}' ]${3:, 10, 1} );
```

#### add_filter (class method)

```
Name:     add_filter (class method)
Prefix:   addfilter
Language: PHP
Body:
add_filter( '${1:hook_name}', [ $this, '${2:method_name}' ]${3:, 10, 1} );
```

#### Standalone filter callback

```
Name:     Standalone filter callback
Prefix:   wpfilter
Language: PHP
Body:
add_filter( '${1:hook_name}', '${2:my_filter}' );

function ${2:my_filter}( $${3:value} ) {
    $0
    return $${3:value};
}
```

---

### Enqueue

#### Enqueue script with localize

```
Name:     Enqueue script with localize
Prefix:   enqscript
Language: PHP
Body:
add_action( 'wp_enqueue_scripts', '${1:prefix}_enqueue_scripts' );

function ${1:prefix}_enqueue_scripts() {
    wp_enqueue_script(
        '${2:handle}',
        plugin_dir_url( __FILE__ ) . 'js/${3:script}.js',
        [ 'jquery' ],
        ${4:MY_PLUGIN_VERSION},
        true
    );
    wp_localize_script( '${2:handle}', '${5:MyPlugin}', [
        'ajaxurl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( '${6:my-nonce}' ),
    ] );
}
```

#### Enqueue stylesheet

```
Name:     Enqueue stylesheet
Prefix:   enqstyle
Language: PHP
Body:
add_action( 'wp_enqueue_scripts', '${1:prefix}_enqueue_styles' );

function ${1:prefix}_enqueue_styles() {
    wp_enqueue_style(
        '${2:handle}',
        plugin_dir_url( __FILE__ ) . 'css/${3:style}.css',
        [],
        ${4:MY_PLUGIN_VERSION}
    );
}
```

---

### AJAX

#### AJAX handler (front + admin)

```
Name:     AJAX handler (front + admin)
Prefix:   wpajax
Language: PHP
Body:
add_action( 'wp_ajax_${1:action_name}',        '${2:handle_ajax}' );
add_action( 'wp_ajax_nopriv_${1:action_name}', '${2:handle_ajax}' );

function ${2:handle_ajax}() {
    check_ajax_referer( '${3:my-nonce}', 'nonce' );

    $0

    wp_send_json_success( [] );
}
```

#### fetch() AJAX call to WordPress

```
Name:     fetch() AJAX call to WordPress
Prefix:   wpfetch
Language: JavaScript
Body:
fetch( MyPlugin.ajaxurl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        action: '${1:action_name}',
        nonce:  MyPlugin.nonce,
        $0
    }),
} )
.then( r => r.json() )
.then( data => {
    if ( ! data.success ) return;
    console.log( data.data );
} );
```

---

### Custom post types

#### Register custom post type

```
Name:     Register custom post type
Prefix:   regcpt
Language: PHP
Body:
add_action( 'init', '${1:prefix}_register_${2:cpt}' );

function ${1:prefix}_register_${2:cpt}() {
    register_post_type( '${2:cpt}', [
        'labels'  => [
            'name'          => __( '${3:Items}',  '${4:text-domain}' ),
            'singular_name' => __( '${5:Item}',   '${4:text-domain}' ),
            'add_new_item'  => __( 'Add new ${5:Item}', '${4:text-domain}' ),
        ],
        'public'            => true,
        'show_in_rest'      => true,
        'has_archive'       => true,
        'supports'          => [ 'title', 'editor', 'thumbnail' ],
        'menu_icon'         => 'dashicons-${6:admin-post}',
        'rewrite'           => [ 'slug' => '${7:items}' ],
    ] );
}
```

#### Register custom taxonomy

```
Name:     Register custom taxonomy
Prefix:   regtax
Language: PHP
Body:
add_action( 'init', '${1:prefix}_register_${2:taxonomy}' );

function ${1:prefix}_register_${2:taxonomy}() {
    register_taxonomy( '${2:taxonomy}', '${3:post_type}', [
        'labels'       => [
            'name'          => __( '${4:Categories}', '${5:text-domain}' ),
            'singular_name' => __( '${6:Category}',   '${5:text-domain}' ),
        ],
        'hierarchical' => true,
        'show_in_rest' => true,
        'rewrite'      => [ 'slug' => '${7:category}' ],
    ] );
}
```

---

### Admin UI

#### Add admin menu page

```
Name:     Add admin menu page
Prefix:   adminpage
Language: PHP
Body:
add_action( 'admin_menu', '${1:prefix}_admin_menu' );

function ${1:prefix}_admin_menu() {
    add_menu_page(
        __( '${2:Page Title}', '${3:text-domain}' ),
        __( '${4:Menu Label}', '${3:text-domain}' ),
        'manage_options',
        '${5:page-slug}',
        '${6:render_page}',
        'dashicons-${7:admin-generic}',
        25
    );
}

function ${6:render_page}() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    echo '<div class="wrap"><h1>' . esc_html( get_admin_page_title() ) . '</h1>';
    $0
    echo '</div>';
}
```

#### Register settings field

```
Name:     Register settings field
Prefix:   settings
Language: PHP
Body:
add_action( 'admin_init', '${1:prefix}_register_settings' );

function ${1:prefix}_register_settings() {
    register_setting( '${2:option_group}', '${3:option_name}' );

    add_settings_section(
        '${4:section_id}',
        __( '${5:Section Title}', '${6:text-domain}' ),
        '__return_null',
        '${2:option_group}'
    );

    add_settings_field(
        '${7:field_id}',
        __( '${8:Field Label}', '${6:text-domain}' ),
        '${9:render_field}',
        '${2:option_group}',
        '${4:section_id}'
    );
}

function ${9:render_field}() {
    $val = get_option( '${3:option_name}', '' );
    echo '<input type="text" name="${3:option_name}" value="' . esc_attr( $val ) . '">';
}
```

---

### ACF

#### get_field with fallback

```
Name:     ACF get_field with fallback
Prefix:   acfget
Language: PHP
Body:
\$${1:value} = get_field( '${2:field_name}' ) ?: '${3:default}';
```

#### Text field (escaped output)

```
Name:     ACF text field (escaped output)
Prefix:   acftext
Language: PHP
Body:
<?php if ( $${1:value} = get_field( '${2:field_name}' ) ) : ?>
    <p><?php echo esc_html( $${1:value} ); ?></p>
<?php endif; ?>
```

#### Image field

```
Name:     ACF image field
Prefix:   acfimage
Language: PHP
Body:
<?php
\$image = get_field( '${1:image_field}' );
if ( \$image ) : ?>
    <img src="<?php echo esc_url( \$image['url'] ); ?>"
         alt="<?php echo esc_attr( \$image['alt'] ); ?>"
         width="<?php echo esc_attr( \$image['width'] ); ?>"
         height="<?php echo esc_attr( \$image['height'] ); ?>">
<?php endif; ?>
```

#### Repeater field loop

```
Name:     ACF repeater field loop
Prefix:   acfrepeater
Language: PHP
Body:
<?php if ( have_rows( '${1:repeater_field}' ) ) : ?>
    <?php while ( have_rows( '${1:repeater_field}' ) ) : the_row(); ?>
        <?php \$${2:sub} = get_sub_field( '${3:sub_field}' ); ?>
        <div><?php echo esc_html( \$${2:sub} ); ?></div>
    <?php endwhile; ?>
<?php endif; ?>
```

#### Flexible content loop

```
Name:     ACF flexible content loop
Prefix:   acfflexible
Language: PHP
Body:
<?php if ( have_rows( '${1:flexible_field}' ) ) : ?>
    <?php while ( have_rows( '${1:flexible_field}' ) ) : the_row(); ?>

        <?php if ( is_row_layout( '${2:layout_one}' ) ) : ?>
            $0
        <?php elseif ( is_row_layout( '${3:layout_two}' ) ) : ?>

        <?php endif; ?>

    <?php endwhile; ?>
<?php endif; ?>
```

#### Options page field

```
Name:     ACF options page field
Prefix:   acfoption
Language: PHP
Body:
get_field( '${1:field_name}', 'option' );
```

#### Link field

```
Name:     ACF link field
Prefix:   acflink
Language: PHP
Body:
<?php \$link = get_field( '${1:link_field}' );
if ( \$link ) : ?>
    <a href="<?php echo esc_url( \$link['url'] ); ?>"
       target="<?php echo esc_attr( \$link['target'] ); ?>">
        <?php echo esc_html( \$link['title'] ); ?>
    </a>
<?php endif; ?>
```

#### Register field group (PHP)

```
Name:     Register ACF field group (PHP)
Prefix:   acfreg
Language: PHP
Body:
add_action( 'acf/init', '${1:prefix}_register_fields' );

function ${1:prefix}_register_fields() {
    acf_add_local_field_group( [
        'key'      => 'group_${2:unique_key}',
        'title'    => '${3:Field Group Title}',
        'fields'   => [
            [
                'key'   => 'field_${4:unique_key}',
                'label' => '${5:Field Label}',
                'name'  => '${6:field_name}',
                'type'  => '${7:text}',
            ],
        ],
        'location' => [
            [ [ 'param' => 'post_type', 'operator' => '==', 'value' => '${8:post}' ] ],
        ],
    ] );
}
```

---

### WooCommerce

#### Get product price

```
Name:     WooCommerce get product price
Prefix:   wooprice
Language: PHP
Body:
global \$product;
\$price     = \$product->get_price();
\$formatted = wc_price( \$price );
```

#### Shop columns

```
Name:     WooCommerce shop columns
Prefix:   woocol
Language: PHP
Body:
add_filter( 'loop_shop_columns', '${1:prefix}_shop_columns' );

function ${1:prefix}_shop_columns() {
    return ${2:3};
}
```

#### Custom checkout field

```
Name:     WooCommerce custom checkout field
Prefix:   woocheckout
Language: PHP
Body:
add_action( 'woocommerce_after_order_notes', '${1:prefix}_checkout_field' );

function ${1:prefix}_checkout_field( \$checkout ) {
    woocommerce_form_field( '${2:field_name}', [
        'type'        => 'text',
        'class'       => [ 'form-row-wide' ],
        'label'       => __( '${3:Field Label}', '${4:text-domain}' ),
        'placeholder' => '${5:Placeholder}',
        'required'    => ${6:false},
    ], \$checkout->get_value( '${2:field_name}' ) );
}

add_action( 'woocommerce_checkout_process', '${1:prefix}_checkout_field_validate' );

function ${1:prefix}_checkout_field_validate() {
    if ( empty( \$_POST['${2:field_name}'] ) && ${6:false} ) {
        wc_add_notice( __( '${7:Please fill in this field.}', '${4:text-domain}' ), 'error' );
    }
}

add_action( 'woocommerce_checkout_update_order_meta', '${1:prefix}_save_checkout_field' );

function ${1:prefix}_save_checkout_field( \$order_id ) {
    if ( ! empty( \$_POST['${2:field_name}'] ) ) {
        update_post_meta( \$order_id, '${2:field_name}', sanitize_text_field( \$_POST['${2:field_name}'] ) );
    }
}
```

#### Save order meta

```
Name:     WooCommerce save order meta
Prefix:   woometa
Language: PHP
Body:
add_action( 'woocommerce_checkout_update_order_meta', '${1:prefix}_save_order_meta' );

function ${1:prefix}_save_order_meta( \$order_id ) {
    if ( isset( \$_POST['${2:field_name}'] ) ) {
        update_post_meta( \$order_id, '${2:field_name}', sanitize_text_field( \$_POST['${2:field_name}'] ) );
    }
}
```

---

### Theme

#### Theme setup function

```
Name:     Theme setup function
Prefix:   themesetup
Language: PHP
Body:
add_action( 'after_setup_theme', '${1:prefix}_setup' );

function ${1:prefix}_setup() {
    load_theme_textdomain( '${2:text-domain}', get_template_directory() . '/languages' );
    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'html5', [ 'search-form', 'comment-form', 'gallery', 'caption' ] );
    add_theme_support( 'customize-selective-refresh-widgets' );
    register_nav_menus( [
        'primary' => __( 'Primary Menu', '${2:text-domain}' ),
        'footer'  => __( 'Footer Menu',  '${2:text-domain}' ),
    ] );
}
```

#### Register widget area / sidebar

```
Name:     Register widget area / sidebar
Prefix:   regsidebar
Language: PHP
Body:
add_action( 'widgets_init', '${1:prefix}_widgets_init' );

function ${1:prefix}_widgets_init() {
    register_sidebar( [
        'name'          => __( '${2:Primary Sidebar}', '${3:text-domain}' ),
        'id'            => '${4:primary-sidebar}',
        'before_widget' => '<section id="%1\$s" class="widget %2\$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ] );
}
```

#### Custom WP_Query loop

```
Name:     Custom WP_Query loop
Prefix:   wploopquery
Language: PHP
Body:
\$args = [
    'post_type'      => '${1:post}',
    'posts_per_page' => ${2:10},
    'meta_query'     => [
        [
            'key'     => '${3:meta_key}',
            'value'   => '${4:meta_value}',
            'compare' => '=',
        ],
    ],
];

\$query = new WP_Query( \$args );

if ( \$query->have_posts() ) :
    while ( \$query->have_posts() ) : \$query->the_post();
        $0
    endwhile;
    wp_reset_postdata();
else :
    echo '<p>' . esc_html__( 'No results found.', '${5:text-domain}' ) . '</p>';
endif;
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