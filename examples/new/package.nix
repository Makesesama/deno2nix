{ deno2nix }:

deno2nix.mkDenoApp {
  pname = "deno2nix-example";
  version = "0.1.0";
  src = ./.;
  deps = ./deps.nix;
  denoJson = ./deno.json;
  denoLock = ./deno.lock;
  entrypoint = "main.ts";
  permissions = [ "--allow-net" "--allow-env" ];
}
