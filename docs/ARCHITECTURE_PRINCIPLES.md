# Book Studio Architecture Principles

The architecture should support growth for many years. Avoid rewriting. Prefer
evolution over replacement.

## Modular

Everything should be modular. Features should be isolated. Components should be
reusable. Avoid tightly coupled systems.

## Structured Content

Books are not documents. Books are structured collections of reusable content:

Book → Pages → Components → Content → Styles

Everything should be based on structured data.

## Separate Content From Presentation

Content should never depend on layout. Layouts should never modify content. This
allows the same book to become: PDF, Kindle, EPUB, paperback, hardback, website,
audiobook, and future formats — without rewriting the content.

## Publishing Engine

Publishing should be independent from editing. The editor creates content. The
publishing engine produces outputs. Future outputs should simply become additional
publishing workers.

## Plugin Architecture

Every major feature should be replaceable — for example: Speech Provider, Image
Provider, Translation Provider, AI Provider, Publishing Provider, Storage Provider.
This prevents vendor lock-in.

## Scalability

Every new feature should integrate without redesigning the application. Avoid
technical debt. Prefer extensible systems.

## Reusable Components

Everything should become reusable: pages, templates, layouts, sections, widgets,
themes, publishing workers. Nothing should exist as a one-off implementation.

## Long-Term Thinking

Do not optimise for the next feature. Optimise for the next five years. Every
architectural decision should make future development easier.

## Preserve Existing Work

Do not redesign simply because another solution exists. Improve existing systems
whenever practical. Respect previous implementation decisions. Reduce breaking
changes. Evolve rather than rebuild.

## Development Philosophy

Before implementing any feature, ask:

Is this the simplest architecture that will still scale? Does this reduce future
maintenance? Will another developer immediately understand this? Does this improve
the overall product?

If not... reconsider the implementation.
