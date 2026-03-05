# Hugo Dhruv Archives Theme

Custom Hugo theme for [dhruv-archives.com](https://dhruv-archives.com), built on top of [hugo-paper](https://github.com/nanxiaobei/hugo-paper).

## Screenshots

The images in `./images/` are snapshots and may not match your latest local changes.

Snapshot (light):

![](./images/screenshot.png)

Snapshot (dark):

![](./images/screenshot_dark.png)

## What Is Customized

- Custom typography via Hugo params + Google Fonts (`heading_*`, `body_*`, `google_fonts`)
- Flexoki-inspired light/dark background palette controlled by `params.color`
- Animated theme toggle with custom assets (`/static/button/*.webp`)
- Homepage featured area with random portrait/landscape media from:
  - `static/animation/golden-portrait/`
  - `static/animation/golden-landscape/`
- Homepage intro blocks via `params.aboutItems`
- Grid-style post listing on list/home pages

## Config Template

Copy/paste and tweak:

```toml
theme = "hugo-dhruv-archives"
baseURL = "https://example.com/"
languageCode = "en-us"
title = "Your Site Title"

[params]
  # which sections count as "posts" (affects home + prev/next nav)
  mainSections = ["blog"]

  # valid: linen, wheat, gray, light
  color = "linen"

  # fonts (optional)
  google_fonts = [
    ["Jersey 15", "400"],
    ["Courier Prime", "400,700"]
  ]

  heading_font = "Jersey 15"
  heading_weight = "400"
  body_font = "Courier Prime"
  body_weight = "400,700"
  body_h_weight = "700"

  # social (optional)
  github = "YOUR_GITHUB_ID"
  twitter = "YOUR_TWITTER_ID"
  linkedin = "YOUR_LINKEDIN_ID"
  behance = "YOUR_BEHANCE_ID"
  rss = true

  # icons (optional)
  favicon = "favicon.ico"
  appleTouchIcon = "apple-touch-icon.png"

  [[params.aboutItems]]
    title = "./whoami"
    description = "Short blurb for the homepage."

[menu]
  [[menu.main]]
    identifier = "blog"
    name = "Blog"
    url = "/blog/"
    weight = 10
```

## Additional Supported Params

```toml
[services]
  [services.disqus]
    shortname = "YOUR_DISQUS_SHORTNAME"

[params]
  # social icons rendered in header:
  # twitter, github, instagram, linkedin, mastodon, threads, bluesky, behance, rss
  mastodon = "https://mastodon.instance/@you"
  threads = "@your_handle"
  bluesky = "your-handle.bsky.social"
  rss = true

  # profile card
  avatar = "email@example.com" # or image URL
  name = "Your Name"
  bio = "Your bio"

  # behavior
  disableHLJS = true
  disablePostNavigation = true
  monoDarkIcon = true
  gravatarCdn = "https://cdn.v2ex.com/gravatar/"
  math = true
  localKatex = false
  graphCommentId = "YOUR_GRAPHCOMMENT_ID"
  direction = "rtl"

  [params.giscus]
    repo = "owner/repo"
    repoId = "..."
    category = "General"
    categoryId = "..."
    mapping = "pathname"
    strict = "1"
    reactionsEnabled = "0"
    emitMetadata = "0"
    inputPosition = "top"
    theme = "light"
    lang = "en"
    loading = "lazy"
```

Front matter:

```toml
comments = false
math = true
mermaid = true
```

## Install

As a git submodule:

```bash
git submodule add https://github.com/dhruv0000/hugo-dhruv-archives-theme themes/hugo-dhruv-archives
```

Then in your `hugo.toml`:

```toml
theme = "hugo-dhruv-archives"
```

Run:

```bash
hugo server
```

## License

[MIT](./LICENSE) (c) [Dhruv Patel](https://dhruv-archives.com/)
