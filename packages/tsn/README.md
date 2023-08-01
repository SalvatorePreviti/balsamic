# @balsamic/tsn

Simplified typescript node runner, for cjs and esm.

Automatically load .env files, and .ts files.

Usage:

```bash

tsn <file> [args]

```

Time the execution of a script

```bash

tsn --timed <file> [args]

```

Special commands:

```bash

# Check typescript files in the whole workspace

tsn tscheck

# Execute node test runner

tsn --test

# Executes an arbitrary executable with arguments and setting up node environment

tsn spawn <executable> [arguments]

# Run mocha test runner

tsn mocha [mocha arguments]

# Manages git subtrees

tsn git-subtree <arguments>

```

## Git subtrees

```
Usage: tsn git-subtree <command> [args]

Configuration is read from package.json, under the key `git-subtree`
    "git-subtree": { <name> { localFolder: [relative path], "repository": "https://...", "branch": [branch name], "push_branch": [branch name] } ... }

Commands:
  init [subtree1] [subtree2] ...   Initialize subtrees
  pull [subtree1] [subtree2] ...   Pull subtrees
  push <subtree> [branch]          Push subtree
  commit <subtree> "<message>"     Commit subtree
```
