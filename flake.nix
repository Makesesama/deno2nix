{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    {
      overlays.default = import ./nix/overlay.nix;
    }
    // flake-utils.lib.eachSystem [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ]
    (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [self.overlays.default];
        };
        deno2nix-cli = pkgs.callPackage ./nix/generate-deps.nix {};
      in {
        packages = {
          default = deno2nix-cli;
          deno2nix = deno2nix-cli;
          example = pkgs.callPackage ./examples/new/package.nix {};
        };

        apps.default = flake-utils.lib.mkApp {
          drv = deno2nix-cli;
          name = "deno2nix";
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            alejandra
            deno
          ];
        };
      }
    );
}
