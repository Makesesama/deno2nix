# deno2nix

Generate Nix derivations from Deno lock files (v5 format).

Similar to [node2nix](https://github.com/svanderburg/node2nix), this tool reads your `deno.lock` file and generates a `deps.nix` file containing fetchurl expressions and a ready-to-use npm cache for all your dependencies (NPM, JSR, and remote URLs).

## Quick Start

```bash
# Generate deps.nix from your lock file
nix run github:Makesesama/deno2nix -- deno.lock deps.nix
```

## Flake Usage

### Basic Setup

```nix
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    deno2nix.url = "github:Makesesama/deno2nix";
  };

  outputs = { self, nixpkgs, deno2nix, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ deno2nix.overlays.default ];
      };
    in {
      packages.${system}.default = pkgs.deno2nix.mkDenoApp {
        pname = "my-app";
        version = "1.0.0";
        src = ./.;
        deps = ./deps.nix;
        entrypoint = "main.ts";
        permissions = [ "--allow-net" "--allow-env" ];
      };

      devShells.${system}.default = pkgs.mkShell {
        packages = [ deno2nix.packages.${system}.default ];
      };
    };
}
```

### Building Your App

1. Generate `deps.nix`:
   ```bash
   nix run github:Makesesama/deno2nix -- deno.lock deps.nix
   ```

2. Build:
   ```bash
   nix build
   ```

3. Run:
   ```bash
   ./result/bin/my-app
   ```

## mkDenoApp Options

| Option | Default | Description |
|--------|---------|-------------|
| `pname` | required | Package name |
| `version` | `"0.0.0"` | Package version |
| `src` | required | Source directory (should contain deno.json) |
| `deps` | required | Path to generated deps.nix |
| `config` | `"deno.json"` | Deno config file |
| `lockfile` | `"deno.lock"` | Deno lock file |
| `entrypoint` | `"main.ts"` | Main entry point |
| `permissions` | `["--allow-all"]` | Deno permissions |

## Generated deps.nix

The generator creates a self-contained `deps.nix`:

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
    # JSR packages fetched from npm.jsr.io
    "@std/assert-1.0.16" = {
      type = "jsr";
      registryPath = "npm.jsr.io/@jsr/std__assert/1.0.16";
      src = fetchurl {
        url = "https://npm.jsr.io/~/11/@jsr/std__assert/1.0.16.tgz";
        sha512 = "...";
      };
    };
  };

  # Pre-built npm cache
  cache = stdenv.mkDerivation { ... };

in { inherit sources cache; }
```

## Manual Usage

If you need more control, you can use `deps.cache` directly:

```nix
{ stdenv, deno, fetchurl, lib }:

let
  deps = import ./deps.nix { inherit stdenv fetchurl lib; };
in
stdenv.mkDerivation {
  pname = "my-app";
  src = ./.;

  buildPhase = ''
    export DENO_DIR=$(mktemp -d)
    ln -s ${deps.cache} "$DENO_DIR/npm"
    # Now deno can use cached packages
  '';
}
```

## Supported Dependency Types

| Type | Source | Registry |
|------|--------|----------|
| NPM | `npm:package@version` | registry.npmjs.org |
| JSR | `jsr:@scope/name@version` | npm.jsr.io |
| Remote | `https://...` | direct URL |

## Example

See [examples/new](./examples/new) for a complete working example.

## Requirements

- Deno lock file version 5 (Deno 1.37+)
- Nix with flakes enabled

## Thanks

- [node2nix](https://github.com/svanderburg/node2nix) - Inspiration for this project
- [esselius/nix-deno](https://github.com/esselius/nix-deno) - Original deno2nix implementation
