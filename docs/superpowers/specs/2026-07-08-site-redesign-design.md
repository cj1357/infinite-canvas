# Infinite Canvas Site Redesign Design Spec

## Design Read

This redesign treats Infinite Canvas as a creator SaaS product, not a single AI image page. The product should feel like a compact creative operating system: fast to enter, precise while working, beautiful enough to invite daily use, and structured enough to support accounts, credits, assets, prompt libraries, projects, and future team spaces.

The recommended direction is **Studio OS** as the primary system, with selective support from three secondary directions:

- **Creative Gallery** for the homepage showcase, prompt library, and asset library.
- **Canvas Lab** for canvas, agent, generation queue, reference groups, and model controls.
- **Light Pro** for account, admin, and future SaaS management surfaces.

## Goals

- Make the whole site look intentional, premium, and coherent across homepage, workbenches, canvas, libraries, account, and admin.
- Keep the product app-first. The first screen should help users start or continue creating, not behave like a generic landing page.
- Preserve the strong infinite-canvas identity while reducing visual noise and improving hierarchy.
- Create a design system that can support SaaS growth: user state, membership, usage, projects, storage, API gateway settings, and admin pages.
- Improve perceived quality without changing model-generation behavior in this design phase.

## Non-Goals

- Do not redesign the core canvas interaction model in this phase.
- Do not introduce a new UI framework.
- Do not rewrite data storage, model requests, or backend contracts as part of visual redesign.
- Do not add team collaboration, billing checkout, or public marketplace behavior in this phase.
- Do not remove existing pages or routes unless a later implementation plan explicitly scopes it.

## Core Product Model

The site should be organized around four creator loops:

1. **Start**: create a canvas, open a recent canvas, start image/video/audio generation, or load a prompt.
2. **Compose**: combine prompt text, reference images, reference video/audio, model settings, and reusable assets.
3. **Generate**: run generation, track progress, inspect results, reuse results as references, and save successful outputs.
4. **Organize**: collect canvases, prompts, generated media, assets, and account settings.

The redesigned UI should make these loops visible without explaining them in marketing copy.

## Visual System

### Theme

Use a dual-theme system:

- **Dark Studio** is the default for homepage, canvas, and creative workbenches.
- **Light Pro** is available for account, admin, and users who prefer bright UI.

The dark theme should use off-black and graphite tones, not pure black. The light theme should use neutral paper and soft gray, not warm beige.

### Palette

Recommended palette:

- Background dark: graphite black, charcoal, near-black neutral.
- Background light: cool white, mist gray, pale neutral.
- Surface dark: layered graphite panels with subtle borders.
- Surface light: white and light gray panels with minimal shadow.
- Accent: one primary accent, preferably electric cyan or clean lime. Use it for focus, active navigation, generation state, and key progress moments.
- Destructive: existing red semantics.
- Success: restrained green only for status, not decoration.

Avoid purple-blue AI gradients, heavy glassmorphism, beige luxury palettes, and multi-accent dashboards.

### Typography

Use a sharper, more product-grade sans stack through `next/font` if implementation allows. Good candidates:

- `Geist` / `Geist Mono` for precise SaaS product feel.
- `Satoshi` / `JetBrains Mono` if a more editorial studio tone is desired.

Typography rules:

- Large display text only on true homepage hero or empty-state moments.
- Dense app panels use compact headings, medium weights, and tabular numbers.
- Avoid huge headings inside tool surfaces.
- Chinese copy should stay concise and functional.
- Use mono or tabular numerals for version, count, duration, quota, and generation metadata.

### Shape

Use one radius system:

- App panels: 12px.
- Inner controls: 8px.
- Icon buttons: 8px or circle only when the icon is spatially centered.
- Image and media thumbnails: 8px.
- Avoid mixed pill-heavy UI except for tags and segmented controls where it is expected.

### Texture and Background

Keep the grid identity, but make it quieter and more purposeful:

- Homepage: broad, low-contrast drafting grid with one or two structural guide lines.
- Canvas: denser grid with stronger zoom feedback.
- Admin/account: no dotted decoration; use clean SaaS surfaces.

Do not use decorative orbs or random bokeh. Any visual texture should support canvas, project space, or media preview.

## Navigation And App Shell

### Desktop

The top navigation should become a compact SaaS app shell:

- Left: logo and product name.
- Center: primary workspace routes: 我的画布, 生图工作台, 视频创作台, 提示词库, 我的素材.
- Right: docs/help icon, settings, theme, account/member state, admin entry when allowed.

Active state should be clear but quiet: thin underline, accent dot, or subtle text contrast. Avoid heavy pill backgrounds in the top nav.

### Canvas Route

Canvas detail routes should stay immersive and hide the normal site nav. Canvas-owned top controls should remain minimal and flat.

### Mobile

Use a bottom-leaning or drawer-based app menu. Prioritize:

- Continue recent canvas.
- Start generation.
- Open library.
- Account.

Do not attempt to fit the full desktop nav into one horizontal row on small screens.

## Homepage Redesign

The homepage should become a creation dashboard with marketing quality, not a static landing hero.

### First View

Structure:

- Left or center-left: product name and short positioning.
- Primary action: start or continue the most relevant workflow.
- Secondary actions: open canvas, image workbench, prompt library.
- Right or lower area: live-feeling preview made from real product cards: recent canvas, reference group, generation config, result thumbnails.

Suggested copy:

- Title: `无限画布`
- Subtitle: `把提示词、参考图、模型参数和生成结果放进同一个创作空间。`
- Primary CTA: `开始创作`
- Secondary CTA: `打开画布`

Do not use long explanatory paragraphs or feature text in the hero.

### Dashboard Band

Below the first view, show app-like modules:

- 最近画布: 3 to 5 project cards.
- 快速开始: 生图, 视频, 文本, 音频, 参考图组.
- 最近结果: generated media cards when available.
- 创作资产: prompt count, asset count, local storage status, future cloud status when implemented.

Empty states should be polished and useful, not blank.

### Prompt Showcase

Keep the current prompt gallery idea, but redesign it as an editorial masonry section:

- Consistent image behavior and aspect ratios.
- Better skeleton/error fallback for missing cover images.
- Stronger card hierarchy: image, title, tags, compact prompt preview.
- Use real visual media as the main draw.

## Canvas Redesign

Canvas should feel like the deepest part of the product.

### Keep

- Immersive grid.
- Floating toolbar.
- Minimal top-right status controls.
- Node-based generation and reference workflow.
- Right-side Agent panel as a product feature.

### Improve

- Reduce visual weight of node borders and panels.
- Make selected, hover, dragging, and disabled states more consistent.
- Standardize node header layout across generation node, reference set node, result group node, and media nodes.
- Make config composer feel like a compact instrument panel, not a modal inside the canvas.
- Use accent only for state: selected, active generation, connected, or requires attention.

### Node Visual Hierarchy

Suggested hierarchy:

- Media nodes: image/video/audio preview first, metadata second.
- Generation nodes: prompt and model state first, run controls second.
- Reference set nodes: reference categories and counts first, edit action second.
- Result group nodes: generated outputs first, reuse/save/download actions second.

## Workbench Pages

Image, video, and future audio pages should share one workbench layout.

### Layout

Desktop:

- Left column: history/session list.
- Center column: prompt and references.
- Right/main column: results.
- Settings are either a collapsible side panel or a compact inspector, not scattered.

Mobile:

- Prompt first.
- Results second.
- History/settings in drawers.

### Shared Workbench System

Create a shared visual language, even if implementation keeps files separate:

- Consistent section headers.
- Consistent empty, loading, failed, and success cards.
- Consistent reference image strips.
- Consistent action rows for save, reuse, download, and delete.

## Prompt Library

Prompt library should feel like a reusable creative memory system.

Design requirements:

- Search and filters should be prominent but compact.
- Prompt cards should support cover image, tags, title, preview text, source/type, and primary action.
- Detail view should make copy, use in workbench, and save/edit actions obvious.
- Empty and failed states should explain the next action in one sentence.

Avoid making every prompt card the same size if the content is naturally visual. Masonry or mixed-size grids are acceptable.

## Asset Library

The asset library should feel like a local media vault now and a cloud asset library later.

Design requirements:

- Clear tabs or filters for image, text, video, audio, and all.
- Media cards should emphasize preview and reuse action.
- Bulk actions should be visible only when selecting.
- Storage status should be factual: current local storage, future cloud/R2 only when implemented.

Do not imply cloud sync until it exists.

## Account And Admin

These pages should use the Light Pro / clean SaaS language by default, while still supporting dark mode.

Account page priorities:

- User identity and login state.
- Membership or quota state.
- API/base URL configuration if exposed to end users.
- Storage and privacy notes.

Admin page priorities:

- Dense but readable tables.
- Clear status badges.
- Direct edit actions.
- No decorative marketing layout.

## Internationalization

The design must support multiple languages.

Rules:

- Avoid layout that depends on short Chinese labels only.
- Buttons must allow labels to expand without breaking.
- Navigation should handle longer English strings.
- Cards should clamp copy predictably.
- Text should not be embedded in generated images or decorative backgrounds.

Implementation should keep visible strings compatible with the existing i18n direction when that system is introduced.

## Accessibility And Interaction

Requirements:

- Visible keyboard focus for every interactive element.
- Hover, active, selected, disabled, loading, empty, and error states for shared components.
- Minimum contrast suitable for dark and light themes.
- No text over busy images without a scrim or solid text area.
- Respect reduced motion for non-essential animations.
- Avoid scroll traps in modals, drawers, and canvas side panels.

Motion should communicate product state:

- Page entry: subtle stagger for homepage modules.
- Hover: small surface lift or border shift.
- Generation: progress shimmer or structured pending skeleton.
- Canvas: selected/dragging state should feel responsive, not flashy.

## Implementation Boundaries

This redesign should be implemented in phases.

### Phase 1: Design System And Shell

- Update global tokens, app theme, and shared utility classes.
- Redesign top navigation and mobile navigation.
- Establish shared page background and surface patterns.
- Keep routes and data behavior unchanged.

### Phase 2: Homepage

- Replace the centered hero with the Studio OS dashboard composition.
- Redesign prompt showcase with robust image fallbacks.
- Add homepage empty states for missing prompt data.

### Phase 3: Workbench Pages

- Unify image and video workbench visual structure.
- Improve result cards, reference strips, history list, and settings drawers.
- Keep model request behavior untouched.

### Phase 4: Library Pages

- Redesign prompt library and asset library around reusable creative memory.
- Improve card layouts, filters, and detail modals.

### Phase 5: Canvas Polish

- Standardize canvas node surfaces and states.
- Refine toolbar, zoom controls, composer panel, Agent panel, and context actions.
- Keep core canvas interactions intact.

### Phase 6: Account And Admin

- Make account and admin pages feel like clean SaaS management screens.
- Improve table density, status badges, forms, and empty states.

## Success Criteria

- The homepage immediately communicates a creator SaaS product, not a generic AI landing page.
- Navigation and page structure feel consistent across all routes.
- Canvas remains immersive but less visually heavy.
- Workbench pages feel like part of the same product.
- Prompt and asset libraries become desirable places to browse and reuse work.
- Dark and light themes both look intentional.
- Chinese UI works well, and longer future English labels do not break layout.
- No page relies on model generation to look complete during local testing.

## Open Product Decisions For Later

- Whether the public homepage should eventually differ from the logged-in dashboard.
- Whether team spaces should appear in the primary nav or account menu.
- Whether prompt/library content becomes public marketplace content.
- Whether cloud asset storage is exposed as a user-facing feature before full sync exists.

