#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net
/**
 * deno2nix - Generate deps.nix from deno.lock (v5 format)
 *
 * Usage: deno run --allow-read --allow-write generate-deps.ts [deno.lock] [output.nix]
 *
 * Generates a Nix file with fetchurl expressions for all dependencies:
 * - NPM packages from npm registry
 * - JSR packages from npm.jsr.io mirror
 * - Remote URL dependencies
 */

// Types for deno.lock v5 format
interface DenoLockV5 {
  version: "5";
  specifiers: Record<string, string>;
  jsr?: Record<string, JsrPackage>;
  npm?: Record<string, NpmPackage>;
  remote?: Record<string, string>;
}

interface JsrPackage {
  integrity: string;
  dependencies?: string[];
}

interface NpmPackage {
  integrity: string;
  dependencies?: string[];
  os?: string[];
  cpu?: string[];
  deprecated?: boolean;
}

type SourceType = "npm" | "jsr" | "remote";

interface NixSource {
  type: SourceType;
  name: string;
  packageName: string;
  version: string;
  registryPath: string; // path in cache, e.g., "registry.npmjs.org/hono/4.11.3"
  url: string;
  hashType: "sha256" | "sha512";
  hash: string;
}

// Escape special characters for Nix strings
function escapeNixString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$");
}

// Convert package name to valid Nix attribute name
function escapeNixName(name: string): string {
  return name.replace(/@/g, "_at_").replace(/\//g, "_slash_");
}

// Parse NPM package key from deno.lock
// Examples: "package@version", "@scope/package@version", "package@version_peer1@ver"
function parseNpmPackageKey(
  key: string
): { name: string; version: string } | null {
  const match = key.match(/^(@?[^@]+)@([^_]+)/);
  if (!match) return null;
  return { name: match[1], version: match[2] };
}

// Parse JSR package key from deno.lock
// Example: "@scope/name@version"
function parseJsrPackageKey(
  key: string
): { scope: string; name: string; version: string } | null {
  const match = key.match(/^@([^/]+)\/([^@]+)@(.+)$/);
  if (!match) return null;
  return { scope: match[1], name: match[2], version: match[3] };
}

// Get NPM tarball URL
function getNpmTarballUrl(name: string, version: string): string {
  if (name.startsWith("@")) {
    const [scope, pkgName] = name.slice(1).split("/");
    return `https://registry.npmjs.org/@${scope}/${pkgName}/-/${pkgName}-${version}.tgz`;
  }
  return `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
}

// Get JSR tarball URL via npm.jsr.io mirror
function getJsrTarballUrl(
  scope: string,
  name: string,
  version: string
): string {
  // JSR npm mirror uses format: https://npm.jsr.io/~/11/@jsr/{scope}__{name}/{version}.tgz
  return `https://npm.jsr.io/~/11/@jsr/${scope}__${name}/${version}.tgz`;
}

// Convert integrity string to hash type and value
function parseIntegrity(
  integrity: string
): { type: "sha256" | "sha512"; hash: string } {
  if (integrity.startsWith("sha512-")) {
    return { type: "sha512", hash: integrity.slice(7) };
  }
  if (integrity.startsWith("sha256-")) {
    return { type: "sha256", hash: integrity.slice(7) };
  }
  // JSR uses raw hex sha256 - convert to base64 for Nix SRI format
  if (/^[a-f0-9]{64}$/.test(integrity)) {
    const bytes = new Uint8Array(
      integrity.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const base64 = btoa(String.fromCharCode(...bytes));
    return { type: "sha256", hash: base64 };
  }
  throw new Error(`Unknown integrity format: ${integrity}`);
}

// Generate Nix source entry
function generateNixSource(source: NixSource): string {
  const lines: string[] = [];
  const key = `${source.packageName}-${source.version}`;

  lines.push(`    "${escapeNixString(key)}" = {`);
  lines.push(`      type = "${source.type}";`);
  lines.push(
    `      name = "${escapeNixString(escapeNixName(source.name))}";`
  );
  lines.push(`      packageName = "${escapeNixString(source.packageName)}";`);
  lines.push(`      version = "${escapeNixString(source.version)}";`);
  lines.push(`      registryPath = "${escapeNixString(source.registryPath)}";`);
  lines.push(`      src = fetchurl {`);
  lines.push(`        url = "${escapeNixString(source.url)}";`);
  lines.push(
    `        ${source.hashType} = "${escapeNixString(source.hash)}";`
  );
  lines.push(`      };`);
  lines.push(`    };`);

  return lines.join("\n");
}

// Process NPM packages from lock file
function processNpmPackages(
  npm: Record<string, NpmPackage>,
  sources: Map<string, NixSource>
): void {
  for (const [key, pkg] of Object.entries(npm)) {
    const parsed = parseNpmPackageKey(key);
    if (!parsed) {
      console.error(`Warning: Could not parse NPM package key: ${key}`);
      continue;
    }

    const sourceKey = `${parsed.name}-${parsed.version}`;
    if (sources.has(sourceKey)) continue;

    const integrity = parseIntegrity(pkg.integrity);
    sources.set(sourceKey, {
      type: "npm",
      name: parsed.name,
      packageName: parsed.name,
      version: parsed.version,
      registryPath: `registry.npmjs.org/${parsed.name}/${parsed.version}`,
      url: getNpmTarballUrl(parsed.name, parsed.version),
      hashType: integrity.type,
      hash: integrity.hash,
    });
  }
}

// Fetch JSR package metadata from npm.jsr.io to get correct tarball hash
async function fetchJsrNpmMetadata(
  scope: string,
  name: string,
  version: string
): Promise<{ url: string; integrity: string } | null> {
  const jsrNpmName = `@jsr/${scope}__${name}`;
  const registryUrl = `https://npm.jsr.io/${jsrNpmName}`;

  try {
    const response = await fetch(registryUrl);
    if (!response.ok) {
      console.error(`Warning: Failed to fetch JSR metadata for ${jsrNpmName}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const versionData = data.versions?.[version];
    if (!versionData?.dist) {
      console.error(`Warning: No dist info for ${jsrNpmName}@${version}`);
      return null;
    }
    return {
      url: versionData.dist.tarball,
      integrity: versionData.dist.integrity,
    };
  } catch (e) {
    console.error(`Warning: Error fetching JSR metadata for ${jsrNpmName}: ${e}`);
    return null;
  }
}

// Process JSR packages from lock file
async function processJsrPackages(
  jsr: Record<string, JsrPackage>,
  sources: Map<string, NixSource>
): Promise<void> {
  for (const [key, _pkg] of Object.entries(jsr)) {
    const parsed = parseJsrPackageKey(key);
    if (!parsed) {
      console.error(`Warning: Could not parse JSR package key: ${key}`);
      continue;
    }

    const fullName = `@${parsed.scope}/${parsed.name}`;
    const jsrNpmName = `@jsr/${parsed.scope}__${parsed.name}`;
    const sourceKey = `${fullName}-${parsed.version}`;
    if (sources.has(sourceKey)) continue;

    // Fetch the correct hash from npm.jsr.io registry
    const metadata = await fetchJsrNpmMetadata(parsed.scope, parsed.name, parsed.version);
    if (!metadata) {
      console.error(`Warning: Skipping ${fullName}@${parsed.version} - could not fetch metadata`);
      continue;
    }

    const integrity = parseIntegrity(metadata.integrity);
    sources.set(sourceKey, {
      type: "jsr",
      name: fullName,
      packageName: fullName,
      version: parsed.version,
      registryPath: `npm.jsr.io/${jsrNpmName}/${parsed.version}`,
      url: metadata.url,
      hashType: integrity.type,
      hash: integrity.hash,
    });
  }
}

// Process remote URL dependencies from lock file
function processRemotePackages(
  remote: Record<string, string>,
  sources: Map<string, NixSource>
): void {
  for (const [url, hash] of Object.entries(remote)) {
    // Create a unique key from the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const filename = pathParts[pathParts.length - 1] || "remote";

    // Try to extract version from URL (e.g., @0.167.0/)
    const versionMatch = url.match(/@([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : "0.0.0";

    const name = `remote:${urlObj.hostname}/${filename}`;
    const sourceKey = `${name}-${version}`;
    if (sources.has(sourceKey)) continue;

    // Remote hashes are sha256 hex
    const integrity = parseIntegrity(hash);
    sources.set(sourceKey, {
      type: "remote",
      name: name,
      packageName: name,
      version: version,
      registryPath: "", // Remote URLs don't use npm cache
      url: url,
      hashType: integrity.type,
      hash: integrity.hash,
    });
  }
}

// Generate complete deps.nix file
async function generateDepsNix(lock: DenoLockV5): Promise<string> {
  const sources = new Map<string, NixSource>();

  // Process all package types
  if (lock.npm) {
    processNpmPackages(lock.npm, sources);
  }
  if (lock.jsr) {
    console.log("Fetching JSR package metadata from npm.jsr.io...");
    await processJsrPackages(lock.jsr, sources);
  }
  if (lock.remote) {
    processRemotePackages(lock.remote, sources);
  }

  // Sort sources by key for deterministic output
  const sortedSources = [...sources.values()].sort((a, b) =>
    `${a.packageName}-${a.version}`.localeCompare(
      `${b.packageName}-${b.version}`
    )
  );

  // Generate the Nix file
  const lines: string[] = [
    "# This file has been generated by deno2nix. Do not edit!",
    "",
    "{ stdenv, fetchurl, lib }:",
    "",
    "let",
    "  sources = {",
  ];

  for (const source of sortedSources) {
    lines.push(generateNixSource(source));
  }

  lines.push("  };");
  lines.push("");
  lines.push("  # Build the npm cache directory for Deno");
  lines.push("  cache = stdenv.mkDerivation {");
  lines.push('    name = "deno-npm-cache";');
  lines.push("    dontUnpack = true;");
  lines.push("    buildPhase = ''");
  lines.push("      mkdir -p $out");
  lines.push('      ${lib.concatStringsSep "\\n" (lib.mapAttrsToList (name: pkg:');
  lines.push("        lib.optionalString (pkg.registryPath != \"\") ''");
  lines.push('          mkdir -p "$out/${pkg.registryPath}"');
  lines.push('          tar -xzf ${pkg.src} -C "$out/${pkg.registryPath}" --strip-components=1');
  lines.push("        ''");
  lines.push("      ) sources)}");
  lines.push("    '';");
  lines.push('    installPhase = "true";');
  lines.push("  };");
  lines.push("");
  lines.push("in {");
  lines.push("  inherit sources cache;");
  lines.push("}");

  return lines.join("\n") + "\n";
}

// Main entry point
async function main() {
  const args = Deno.args;
  const lockPath = args[0] || "deno.lock";
  const outputPath = args[1] || "deps.nix";

  console.log(`Reading ${lockPath}...`);

  let lockContent: string;
  try {
    lockContent = await Deno.readTextFile(lockPath);
  } catch (e) {
    console.error(`Error: Could not read ${lockPath}: ${e}`);
    Deno.exit(1);
  }

  let lock: DenoLockV5;
  try {
    lock = JSON.parse(lockContent);
  } catch (e) {
    console.error(`Error: Could not parse ${lockPath} as JSON: ${e}`);
    Deno.exit(1);
  }

  if (lock.version !== "5") {
    console.error(
      `Error: Expected deno.lock version 5, got ${lock.version || "unknown"}`
    );
    console.error("This tool only supports deno.lock v5 format.");
    Deno.exit(1);
  }

  console.log(`Generating ${outputPath}...`);
  const nixContent = await generateDepsNix(lock);

  try {
    await Deno.writeTextFile(outputPath, nixContent);
  } catch (e) {
    console.error(`Error: Could not write ${outputPath}: ${e}`);
    Deno.exit(1);
  }

  // Print summary
  const npmCount = lock.npm ? Object.keys(lock.npm).length : 0;
  const jsrCount = lock.jsr ? Object.keys(lock.jsr).length : 0;
  const remoteCount = lock.remote ? Object.keys(lock.remote).length : 0;

  console.log(`Done!`);
  console.log(`  NPM packages: ${npmCount}`);
  console.log(`  JSR packages: ${jsrCount}`);
  console.log(`  Remote URLs:  ${remoteCount}`);
}

main();
