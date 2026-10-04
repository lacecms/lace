# Styling the public site

The public Astro site owns its presentation. Edit
[`apps/site/src/styles/site.css`](../apps/site/src/styles/site.css) to change
styles without changing Lace content, the admin application, or a block
component. `BaseLayout.astro` imports this global stylesheet for every static
route. A site rebuild publishes CSS changes; saving a CMS draft alone does not
change the public site.

## Stable selectors

| Attribute | Element | Value | Scope |
| --- | --- | --- | --- |
| `data-lace-model` | Entry `<main>` | Stable model key, such as `home` or `posts` | All entries of one model |
| `data-lace-entry` | Entry `<main>` | Stable public entry identifier | One entry, even if its slug changes |
| `data-lace-block` | Block root | Registered type, such as `hero` or `image` | All instances of one type |
| `data-lace-block-key` | Block root | Stable block key | One block within its entry |
| `data-lace-part` | Element inside a block | Semantic part name below | One part of a block |

`data-lace-block-key` is unique within an entry, not across the whole site. For
one specific block, combine it with `data-lace-entry`. You can inspect the
published page to copy the entry ID and block key. Page models such as `home`
have one entry, so their model key is usually a more readable selector.

The supported parts are:

| Block | `data-lace-part` values |
| --- | --- |
| `hero` | `eyebrow`, `heading`, `body`, `media`, `action` |
| `richText` | `content` |
| `image` | `media`, `caption` |
| `quote` | `text`, `attribution` |
| `cta` | `heading`, `body`, `action` |

An optional part is absent when the published block has no value for it. For
example, a `hero` without an image has no `data-lace-part="media"` element.
Rich-text `body` and `content` parts wrap the safe rendered rich-text nodes;
style headings or links inside those wrappers with ordinary descendant CSS.

## Examples

Add rules to `apps/site/src/styles/site.css`:

```css
/* Every hero on the site. The starter stylesheet ships this example. */
:where([data-lace-block="hero"]) {
  padding-block: 2rem;
}

/* Heroes on the home model only. */
[data-lace-model="home"] [data-lace-block="hero"] {
  max-width: 72rem;
}

/* Images in one published post. */
[data-lace-entry="first-post-entry"] [data-lace-block="image"] {
  margin-block: 3rem;
}

/* The heading of one block on the home page. */
[data-lace-entry="home-entry"]
  [data-lace-block-key="home-hero"]
  [data-lace-part="heading"] {
  max-width: 20ch;
}
```

These entry and block identifiers come from the committed reference fixture;
use the values on your own published pages in a generated project. The CSS
file is site-owned and can be changed freely. The `:where()` example has low
specificity; use normal CSS specificity when you need a more targeted rule.

Astro scopes `<style>` rules written inside a component by default. The
imported site stylesheet is global, so its selectors can reach block
components rendered inside routes. Keep these rules under the entry/block
selectors to avoid styling unrelated page elements.

The `data-lace-*` names and documented part values are the reference site's
public styling contract. HTML tag names, nesting beyond the part wrappers,
and existing classes such as `hero`, `rich-text`, and `cta` are implementation
details. This contract changes CSS targeting only; changing the structure or
behavior of a block still requires editing its Astro renderer. Automatically
generated HTML `id` attributes are not part of the contract.
