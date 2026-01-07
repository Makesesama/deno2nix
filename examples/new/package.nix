{
  lib,
  stdenv,
  deno,
  writeShellScriptBin,
  fetchurl,
}:
let
  deps = import ./deps.nix { inherit stdenv fetchurl lib; };
  src = ./.;
in
writeShellScriptBin "deno2nix-example" ''
  export DENO_DIR="$(mktemp -d)"
  ln -s ${deps.cache} "$DENO_DIR/npm"
  exec ${deno}/bin/deno run \
    --cached-only \
    --allow-net \
    --allow-env \
    ${src}/main.ts "$@"
''
