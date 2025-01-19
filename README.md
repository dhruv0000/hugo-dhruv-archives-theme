
<div align="center">
<h1>Hugo theme for Dhruv Archives </h1>

A Hugo theme for dhruv-archives.com (snake-case) or dhruvArchives.com (camelCase), built on top of [hugo-paper](https://github.com/nanxiaobei/hugo-paper).

</div>
---

## Overview
[to-do] Change this ref
![](./images/screenshot.png)
![](./images/screenshot_dark.png)
![](./images/pagespeed.png)

## Customizations

This theme includes several specific customizations on top of the base hugo-paper theme:

[to-do] All the customizations
1. **Typography**
   - Primary Font: Jersey 15
   - Secondary Font: Roboto

2. **Color Scheme**
   - Implements [Flexoki](https://stephango.com/flexoki) color palette
   - Carefully chosen colors for both light and dark modes

3. **Dark Mode Animation**
   - Enhanced dark/light mode transition
   - Smooth animation; inspired by Jersey 15

## Options

Available options to `config.toml` or `hugo.toml`:

```toml
[services]
  [services.disqus]
    shortname = 'YOUR_DISQUS_SHORTNAME'     # use disqus comments

[params]
  # color style
  color = 'linen'                           # linen, wheat, gray, light

  # header social icons
  twitter = 'YOUR_TWITTER_ID'               # twitter.com/YOUR_TWITTER_ID
  github = 'YOUR_GITHUB_ID'                 # github.com/YOUR_GITHUB_ID
  instagram = 'YOUR_INSTAGRAM_ID'           # instagram.com/YOUR_INSTAGRAM_ID
  linkedin = 'YOUR_LINKEDIN_ID'             # linkedin.com/in/YOUR_LINKEDIN_ID
  mastodon = 'YOUR_MASTODON_LINK'           # e.g. 'https://mastodon.instance/@xxx'
  threads = '@YOUR_THREADS_ID'              # threads.net/@YOUR_THREADS_ID
  bluesky = 'YOUR_BLUESKY_ID'               # https://bsky.app/profile/YOUR_BLUESKY_ID
  rss = true                                # show rss icon

  # home page profile
  avatar = 'GRAVATAR_EMAIL'                 # gravatar email or image url
  name = 'YOUR_NAME'
  bio = 'YOUR_BIO'


  # misc
  disableHLJS = true                        # disable highlight.js
  disablePostNavigation = true              # disable post navigation
  monoDarkIcon = false                       # show monochrome dark mode icon
  gravatarCdn = 'GRAVATAR_CDN_LINK'         # e.g. 'https://cdn.v2ex.com/gravatar/'
  math = true                               # enable KaTeX math typesetting globally
  localKatex = false                        # use local KaTeX js/css instead of CDN
  graphCommentId = "YOUR_GRAPH_COMMENT_ID"  # use graph comment (disqus alternative)
  favicon = "favicon.ico"                   # customize the default favicon
  appleTouchIcon = "apple-touch-icon.png"   # customize the default Apple touch icon

  # RTL supprot
  direction = "rtl"                         # RTL support for Right-to-left languages

  # giscus
[params.giscus]
  repo = 'YOUR_GISCUS_REPO'                 # see https://giscus.app for more details
  repoId = 'YOUR_GISCUS_REPO_ID'
  category = 'YOUR__GISCUS_CATEGORY'
  categoryId = 'YOUR_GISCUS_CATEGORY_ID'
  mapping = 'pathname'
  theme = 'light'
  lang = 'zh-CN'
```

Available options to front matter:

```toml
comments = false                            # disable comments for a specific page
math = true                                 # enable KaTeX math typesetting for a specific page
```

## Install

### As git submodule

Inside the folder of your Hugo project, run:

```bash
git submodule add https://github.com/dhruv0000/hugo-dhruv-archives-theme themes/dhruv-archives-theme
```

Open `config.toml`(or `hugo.toml`), change `theme` to `"dhruv-archives-theme"`:

```toml
theme = "dhruv-archives-theme"
```

Then run:

```bash
hugo server
```

For more information, please read the [official guide](https://gohugo.io/getting-started/quick-start/#configure-the-site) of Hugo.

## License

[MIT License](https://github.com/dhruv0000//blob/main/LICENSE) (c) [dhruv0000](https://dhruv-archives.com/)
