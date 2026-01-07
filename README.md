# deno2nix

Generate Nix derivations from Deno lock files (v5 format).

Similar to [node2nix](https://github.com/svanderburg/node2nix), this tool reads your `deno.lock` file and generates a `deps.nix` file containing fetchurl expressions and a ready-to-use npm cache for all your dependencies (NPM, JSR, and remote URLs).

## Installation

```bash
nix run github:SnO2WMaN/deno2nix -- deno.lock deps.nix
```

## Usage

### 1. Generate deps.nix

```bash
deno2nix deno.lock deps.nix
```

This creates a `deps.nix` with all dependencies and a pre-built cache:

```nix
{ stdenv, fetchurl, lib }:

let
  sources = {
    "hono-4.11.3" = {
      type = "npm";
      packageName = "hono";
      version = "4.11.3";
      registryPath = "registry.npmjs.org/hono/4.11.3";
      src = fetchurl {
        url = "https://registry.npmjs.org/hono/-/hono-4.11.3.tgz";
        sha512 = "...";
      };
    };
    # JSR packages use npm.jsr.io registry
    "@std/assert-1.0.16" = {
      type = "jsr";
      registryPath = "npm.jsr.io/@jsr/std__assert/1.0.16";
      src = fetchurl { ... };
    };
  };

  # Pre-built npm cache - extracts all packages to correct paths
  cache = stdenv.mkDerivation { ... };

in { inherit sources cache; }
```

### 2. Use in your package.nix

```nix
{ lib, stdenv, deno, writeShellScriptBin, fetchurl }:

let
  deps = import ./deps.nix { inherit stdenv fetchurl lib; };
  src = ./.;
in
writeShellScriptBin "my-app" ''
  export DENO_DIR="$(mktemp -d)"
  ln -s ${deps.cache} "$DENO_DIR/npm"
  exec ${deno}/bin/deno run --cached-only --allow-net ${src}/main.ts "$@"
''
```

### 3. Build and run

```bash
nix build
./result/bin/my-app
```

## Example

See [examples/new](./examples/new) for a complete working example with:
- `deno.json` - Deno config with npm imports
- `deno.lock` - Lock file (v5 format)
- `deps.nix` - Generated dependencies
- `package.nix` - Nix package definition
- `main.ts` - Simple Hono server

## Supported Dependency Types

| Type | Source | Registry Path |
|------|--------|---------------|
| NPM | `npm:package@version` | `registry.npmjs.org/{package}/{version}` |
| JSR | `jsr:@scope/name@version` | `npm.jsr.io/@jsr/{scope}__{name}/{version}` |
| Remote | `https://...` | (not cached in npm dir) |

## Requirements

- Deno lock file version 5 (Deno 1.37+)
- Nix with flakes enabled

## Thanks

- [node2nix](https://github.com/svanderburg/node2nix) - Inspiration for this project
- [esselius/nix-deno](https://github.com/esselius/nix-deno) - Original deno2nix implementation
