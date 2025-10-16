# Zen Browser CSS Theming Guide

This guide helps you create custom CSS themes for Zen Browser, including how to implement popular themes like Catppuccin.

## Getting Started

Zen Browser uses CSS for theming the browser interface. You can create custom themes by targeting specific selectors and using CSS custom properties (variables) that Zen Browser exposes.

## Key CSS Custom Properties (Variables)

Zen Browser exposes several CSS custom properties that control the overall appearance:

```css
:root {
  --zen-primary-color: rgb(102, 73, 54);
  --zen-border-radius: 10px;
  --zen-element-separation: 8px;
  --zen-background-opacity: 1;
  --zen-main-browser-background-toolbar: rgba(23, 23, 26, 1);
  --zen-main-browser-background: rgba(0, 0, 0, 0.4);
  --toolbox-textcolor: rgba(255, 255, 255, 0.8);
}
```

## Main Selectors to Target

### 1. Main Window
```css
#main-window {
  /* Main browser window container */
}
```

### 2. Toolbar and Navigation
```css
#nav-bar {
  /* Main navigation bar */
}

#TabsToolbar {
  /* Tab bar area */
}

#PersonalToolbar {
  /* Bookmarks toolbar */
}
```

### 3. Sidebar
```css
#sidebar-box {
  /* Sidebar container */
}

#sidebar {
  /* Sidebar content */
}
```

### 4. Tabs
```css
.tabbrowser-tab {
  /* Individual tab styling */
}

.tab-background {
  /* Tab background */
}

.tab-label {
  /* Tab text */
}
```

### 5. URL Bar
```css
#urlbar {
  /* URL bar container */
}

#urlbar-input {
  /* URL input field */
}

#urlbar-background {
  /* URL bar background */
}
```

### 6. Browser Content Area
```css
#browser {
  /* Main content area */
}

browser[type="content-primary"] {
  /* Primary browser content */
}
```

### 7. Context Menus and Popups
```css
menupopup {
  /* Context menus */
}

.panel-arrowcontent {
  /* Panel content */
}
```

## Zen-Specific Selectors

Zen Browser includes many custom elements with specific selectors:

```css
/* Workspace-related */
#zen-workspaces-button {
  /* Workspace switcher button */
}

/* Sidebar toggle */
[data-l10n-id="zen-toolbar-context-new-folder"] {
  /* Folder creation button */
}

/* Zen attributes */
[zen-sidebar-expanded="true"] {
  /* When sidebar is expanded */
}

[zen-single-toolbar="true"] {
  /* Single toolbar mode */
}
```

## Example: Catppuccin Theme

Here's how to create a Catppuccin-inspired theme:

```css
/* Catppuccin Mocha Theme for Zen Browser */

:root {
  /* Catppuccin Mocha Colors */
  --ctp-rosewater: #f5e0dc;
  --ctp-flamingo: #f2cdcd;
  --ctp-pink: #f5c2e7;
  --ctp-mauve: #cba6f7;
  --ctp-red: #f38ba8;
  --ctp-maroon: #eba0ac;
  --ctp-peach: #fab387;
  --ctp-yellow: #f9e2af;
  --ctp-green: #a6e3a1;
  --ctp-teal: #94e2d5;
  --ctp-sky: #89dceb;
  --ctp-sapphire: #74c7ec;
  --ctp-blue: #89b4fa;
  --ctp-lavender: #b4befe;
  --ctp-text: #cdd6f4;
  --ctp-subtext1: #bac2de;
  --ctp-subtext0: #a6adc8;
  --ctp-overlay2: #9399b2;
  --ctp-overlay1: #7f849c;
  --ctp-overlay0: #6c7086;
  --ctp-surface2: #585b70;
  --ctp-surface1: #45475a;
  --ctp-surface0: #313244;
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-crust: #11111b;

  /* Apply Catppuccin colors to Zen variables */
  --zen-primary-color: var(--ctp-mauve);
  --zen-border-radius: 12px;
  --zen-element-separation: 8px;
  --zen-background-opacity: 1;
  --zen-main-browser-background-toolbar: var(--ctp-mantle);
  --zen-main-browser-background: var(--ctp-base);
  --toolbox-textcolor: var(--ctp-text);
}

/* Main window */
#main-window {
  background-color: var(--ctp-base) !important;
  color: var(--ctp-text) !important;
}

/* Toolbar styling */
#nav-bar, #TabsToolbar, #PersonalToolbar {
  background-color: var(--ctp-mantle) !important;
  border-color: var(--ctp-surface0) !important;
}

/* Tab styling */
.tabbrowser-tab {
  color: var(--ctp-subtext1) !important;
}

.tabbrowser-tab[selected="true"] {
  color: var(--ctp-text) !important;
}

.tab-background {
  background-color: var(--ctp-surface0) !important;
}

.tabbrowser-tab[selected="true"] .tab-background {
  background-color: var(--ctp-surface1) !important;
}

/* URL bar */
#urlbar {
  background-color: var(--ctp-surface0) !important;
  border-color: var(--ctp-surface1) !important;
  color: var(--ctp-text) !important;
}

#urlbar:focus-within {
  background-color: var(--ctp-surface1) !important;
  border-color: var(--ctp-mauve) !important;
}

/* Sidebar */
#sidebar-box {
  background-color: var(--ctp-mantle) !important;
  border-color: var(--ctp-surface0) !important;
}

/* Context menus */
menupopup {
  background-color: var(--ctp-surface0) !important;
  border-color: var(--ctp-surface1) !important;
  color: var(--ctp-text) !important;
}

menuitem:hover {
  background-color: var(--ctp-surface1) !important;
  color: var(--ctp-mauve) !important;
}
```

## Theme Application

1. **Via userChrome.css**: Place your CSS in the `userChrome.css` file in your Firefox profile's `chrome` folder
2. **Via browser extensions**: Some extensions allow injecting custom CSS
3. **Via Zen's built-in theming**: Check Zen Browser's preferences for theme customization options

## Tips for Creating Custom Themes

1. **Use browser developer tools**: Right-click on elements and inspect them to find the correct selectors
2. **Test incrementally**: Add styles gradually to see their effects
3. **Use CSS custom properties**: Define your color palette as CSS variables for easy maintenance
4. **Consider dark/light modes**: Use media queries to support different color schemes
5. **Test with different content**: Make sure your theme works with various websites and UI states

## Common Theme Elements

### Color Scheme Structure
```css
:root {
  /* Define your color palette */
  --theme-primary: #your-color;
  --theme-secondary: #your-color;
  --theme-background: #your-color;
  --theme-surface: #your-color;
  --theme-text: #your-color;
  --theme-accent: #your-color;
}
```

### Component Styling Pattern
```css
/* Apply theme colors to components */
.component-selector {
  background-color: var(--theme-background);
  color: var(--theme-text);
  border: 1px solid var(--theme-surface);
}

.component-selector:hover {
  background-color: var(--theme-surface);
  color: var(--theme-accent);
}
```

This guide provides a foundation for creating custom Zen Browser themes. Experiment with different selectors and properties to achieve your desired look!