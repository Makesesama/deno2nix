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
  # Get this hash by running: nix build .#example.denoCache
  # Then copy the "got:" hash from the error message
  denoCacheHash = "sha256-0YdcznBQnJh5DDS6WGp4bgacW0YbU3j6nR0O0iqLAxo=";
}
