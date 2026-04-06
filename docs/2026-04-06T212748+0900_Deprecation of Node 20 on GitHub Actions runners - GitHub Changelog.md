---
title: "Deprecation of Node 20 on GitHub Actions runners - GitHub Changelog"
source: "https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/"
author:
  - "[[Allison]]"
published: 2025-09-20
created: 2026-04-06
description: "Editor’s note (February 25, 2026): Updated the migration date to June of 2026. Node20 will reach end-of-life (EOL) in April of 2026. As a result we have started the deprecation…"
tags:
  - "clippings"
---
*Editor’s note (February 25, 2026): Updated the migration date to June of 2026.*

Node20 will reach end-of-life (EOL) in April of 2026. As a result we have started the deprecation process of Node20 for GitHub Actions. We plan to migrate all actions to run on Node24 in the fall of 2026.

The newest GitHub runner () now supports both Node20 and Node24 and uses Node20 as the default version. If you’d like to test Node24 ahead of time, set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` as an `env` in your workflow or as an environment variable on your runner machine to force the use of Node24.

Beginning on June 2nd, 2026, runners will begin using Node24 by default. To opt out of this and continue using Node20 after this date, set `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` as an `env` in your workflow or as an environment variable on your runner machine. This will only work until we upgrade the runner and remove Node20 later in the fall of 2026.

### Removal of operating system support with Node24

Node24 is incompatible with macOS 13.4 and lower versions.

Node 24 does not have official support for ARM32, so self-hosted runners on ARM32 will no longer be supported after Node 20 deprecation.

To find out more about the OS versions we support and self-hosted runner architectures, please read our documentation.

### What you need to do

For Actions maintainers: Update your actions to run on Node24 instead of Node20 ([Actions configuration settings](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runs-for-javascript-actions))  
For Actions users: Update your workflows with latest versions of the actions that run on Node24 ([Using versions for Actions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#example-using-versioned-actions))

Join the discussion within [GitHub Community](https://github.com/orgs/community/discussions/categories/announcements).

[

Back to top

](#start-of-content)