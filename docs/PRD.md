# Book Studio — Product Requirements Document

## Vision
Book Studio is an AI-first professional publishing application designed to make creating
beautiful books dramatically easier than Adobe InDesign. The software should enable
anyone — from self-publishing authors to small publishers — to create print-ready books
with minimal design knowledge. The core philosophy is that content and design are
separate: users should never have to manually redesign an entire book after changing its
appearance.

## Primary Goal
Create a professional-quality book in minutes rather than days.

Workflow: Create Project → Import Manuscript → Import Illustrations → Select Theme →
Generate Layout → Make Optional Adjustments → Export Print-Ready PDF.

## User Types
Self-publishing authors, children's book creators, educational publishers, nature
writers, coffee-table book creators, course creators, small publishing houses.

## Core Principles
Beautiful by default. Professional typography. AI assists rather than replaces the
designer. Non-destructive editing. Fast regeneration. Print-first design. Modular
architecture.

## Functional Requirements

### Project Management
Create/open/save projects, autosave, project metadata, version history, backup and restore.

### Manuscript Import
DOCX, Markdown, TXT, HTML. Automatically detect chapters, headings, lists, tables,
quotes, captions.

### Image Library
PNG, JPG, WebP, SVG. Drag-and-drop, crop, scale, rotate, captions, collections,
resolution warnings.

### Layout Engine
Automatic text flow, facing pages, running headers/footers, page numbering, table of
contents, blank page insertion, widow/orphan control, caption placement, intelligent
whitespace balancing.

### Typography
Paragraph styles, character styles, drop caps, ligatures, hyphenation, optical margin
alignment, baseline grid, font pairing.

### Themes
Themes control fonts, colours, margins, headers, footers, chapter openers, image
treatment, tables, callouts, captions. Changing a theme must never modify the manuscript.

### Components
Reusable: hero pages, chapter openers, pull quotes, fact boxes, warning boxes, tip
boxes, plant profiles, species tables, galleries, timelines, checklists.

### Export
Print-ready PDF with bleed, crop marks, embedded fonts, CMYK-ready workflow,
high-resolution images. Future: EPUB, Kindle, HTML.

### AI Features
Version 1: rule-based layout optimisation. Future: AI layout assistant, AI theme
generation, AI illustration placement, AI typography improvements, AI book critique, AI
accessibility review.

## Success Criteria
A new user should be able to produce a beautiful print-ready book without reading
documentation. The software should feel elegant, fast and enjoyable. Every default
should be publication quality.
