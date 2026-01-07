# Package for the deno2nix generate-deps command
{
  lib,
  stdenv,
  deno,
  makeWrapper,
}:
stdenv.mkDerivation {
  pname = "deno2nix";
  version = "2.0.0";

  src = ../.;

  nativeBuildInputs = [makeWrapper];
  buildInputs = [deno];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/deno2nix

    # Copy the generator script
    cp $src/generate-deps.ts $out/share/deno2nix/

    # Create wrapper script
    makeWrapper ${deno}/bin/deno $out/bin/deno2nix \
      --add-flags "run" \
      --add-flags "--allow-read" \
      --add-flags "--allow-write" \
      --add-flags "--allow-net" \
      --add-flags "$out/share/deno2nix/generate-deps.ts"

    runHook postInstall
  '';

  meta = with lib; {
    description = "Generate Nix derivations from deno.lock files";
    homepage = "https://github.com/SnO2WMaN/deno2nix";
    license = licenses.mit;
    maintainers = [];
    mainProgram = "deno2nix";
  };
}
