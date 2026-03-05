#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "content");
const PUBLIC_DIR = path.join(process.cwd(), "public");

const PASSWORD_PREFIX = "CONTENT_PASSWORD__";
const JSON_MAP_VAR = "CONTENT_PASSWORDS_JSON";
const PBKDF2_ITER_VAR = "CONTENT_PROTECTION_PBKDF2_ITERATIONS";

const DEFAULT_PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CONTENT_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".html"]);

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (!isQuoted) {
      const hashIndex = value.indexOf(" #");
      if (hashIndex >= 0) {
        value = value.slice(0, hashIndex);
      }
      value = value.trim();
    } else {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }

    out[key] = value;
  }

  return out;
}

function loadEnv() {
  const envFromFiles = {
    ...parseDotEnvFile(path.join(process.cwd(), ".env")),
    ...parseDotEnvFile(path.join(process.cwd(), ".env.local")),
  };
  return {
    ...envFromFiles,
    ...process.env,
  };
}

function normalizeContentPath(input) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function canonicalPath(input) {
  return normalizeContentPath(input).toLowerCase();
}

function decodePrefixedContentPath(encoded) {
  const segments = encoded.split("__").filter(Boolean);
  return segments
    .map((segment) => segment.toLowerCase().replace(/_/g, "-"))
    .join("/");
}

function collectProtectedFolderPasswords(env) {
  const folderPasswordMap = new Map();

  const jsonRaw = env[JSON_MAP_VAR];
  if (jsonRaw) {
    let parsed;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch (error) {
      throw new Error(`${JSON_MAP_VAR} is not valid JSON: ${error.message}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${JSON_MAP_VAR} must be a JSON object of folder -> password.`);
    }

    for (const [folderRaw, passwordRaw] of Object.entries(parsed)) {
      const folder = normalizeContentPath(String(folderRaw));
      const password = String(passwordRaw ?? "").trim();
      if (!folder || !password) {
        continue;
      }
      folderPasswordMap.set(canonicalPath(folder), { folder, password });
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(PASSWORD_PREFIX)) {
      continue;
    }

    const suffix = key.slice(PASSWORD_PREFIX.length);
    const folder = normalizeContentPath(decodePrefixedContentPath(suffix));
    const password = String(value ?? "").trim();

    if (!folder || !password) {
      continue;
    }
    folderPasswordMap.set(canonicalPath(folder), { folder, password });
  }

  return folderPasswordMap;
}

function listContentFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listContentFiles(absolutePath, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (CONTENT_EXTENSIONS.has(ext)) {
      out.push(absolutePath);
    }
  }
  return out;
}

function matchFolderForFile(relativeContentPath, sortedMappings) {
  const filePathCanonical = canonicalPath(relativeContentPath);
  for (const mapping of sortedMappings) {
    const folderCanonical = mapping.canonicalFolder;
    if (
      filePathCanonical === folderCanonical ||
      filePathCanonical.startsWith(`${folderCanonical}/`)
    ) {
      return mapping;
    }
  }
  return null;
}

function contentFileToPublicHtml(relativeContentPath) {
  const posixRel = relativeContentPath.replace(/\\/g, "/");
  const ext = path.posix.extname(posixRel);
  const withoutExt = posixRel.slice(0, -ext.length);
  const baseName = path.posix.basename(withoutExt);
  const dirName = path.posix.dirname(withoutExt);

  let routePath = "";
  if (baseName === "index" || baseName === "_index") {
    routePath = dirName === "." ? "" : dirName;
  } else {
    routePath = dirName === "." ? baseName : `${dirName}/${baseName}`;
  }

  if (!routePath) {
    return path.join(PUBLIC_DIR, "index.html");
  }
  return path.join(PUBLIC_DIR, ...routePath.split("/"), "index.html");
}

function findProtectedContentSlot(html) {
  const openTagMatch =
    /<section\b[^>]*\bid\s*=\s*(?:"protected-content-slot"|'protected-content-slot'|protected-content-slot)\b[^>]*>/i.exec(
      html,
    );
  if (!openTagMatch || typeof openTagMatch.index !== "number") {
    return null;
  }

  const start = openTagMatch.index;
  const sectionTokenRegex = /<\/?section\b[^>]*>/gi;
  sectionTokenRegex.lastIndex = start;

  let depth = 0;
  let sawOpening = false;

  while (true) {
    const token = sectionTokenRegex.exec(html);
    if (!token) {
      return null;
    }

    const raw = token[0];
    const isClosing = raw.startsWith("</");
    if (isClosing) {
      depth -= 1;
    } else {
      depth += 1;
      sawOpening = true;
    }

    if (sawOpening && depth === 0) {
      const end = sectionTokenRegex.lastIndex;
      return {
        start,
        end,
        outerHtml: html.slice(start, end),
      };
    }
  }
}

function encryptMarkup(markup, password, iterations) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(markup, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combinedCiphertext = Buffer.concat([ciphertext, authTag]);

  return {
    v: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: salt.toString("base64"),
    },
    cipher: {
      name: "AES-GCM",
      iv: iv.toString("base64"),
    },
    ct: combinedCiphertext.toString("base64"),
  };
}

function protectedGateMarkup(payload) {
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return [
    '<div class="protected-content-root">',
    '<div class="protected-content-card">',
    '<h2 class="protected-content-title">Protected content</h2>',
    '<p class="protected-content-copy">This post is encrypted. Enter the password to unlock it.</p>',
    '<form class="protected-content-form" autocomplete="off">',
    '<input class="protected-content-input" type="password" name="password" placeholder="Password" required />',
    '<button class="protected-content-submit" type="submit">Unlock</button>',
    "</form>",
    '<p class="protected-content-error" hidden></p>',
    "</div>",
    `<script type="application/json" class="protected-content-payload">${payloadJson}</script>`,
    "</div>",
  ].join("");
}

function parseIterations(rawValue) {
  if (!rawValue) {
    return DEFAULT_PBKDF2_ITERATIONS;
  }
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 100000) {
    throw new Error(
      `${PBKDF2_ITER_VAR} must be an integer >= 100000. Received: ${rawValue}`,
    );
  }
  return parsed;
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    throw new Error(`Missing content directory: ${CONTENT_DIR}`);
  }
  if (!fs.existsSync(PUBLIC_DIR)) {
    throw new Error(`Missing public directory: ${PUBLIC_DIR}. Run Hugo build first.`);
  }

  const env = loadEnv();
  const iterations = parseIterations(env[PBKDF2_ITER_VAR]);
  const mappingsMap = collectProtectedFolderPasswords(env);

  if (mappingsMap.size === 0) {
    console.log(
      "Content protection: no folder passwords configured, skipping encryption pass.",
    );
    return;
  }

  const mappings = Array.from(mappingsMap.entries())
    .map(([canonicalFolder, value]) => ({
      canonicalFolder,
      folder: value.folder,
      password: value.password,
    }))
    .sort((a, b) => b.canonicalFolder.length - a.canonicalFolder.length);

  const missingFolders = mappings.filter(
    (item) => !fs.existsSync(path.join(CONTENT_DIR, item.folder)),
  );
  for (const item of missingFolders) {
    console.warn(
      `Content protection: configured folder "${item.folder}" does not exist under content/.`,
    );
  }

  const contentFiles = listContentFiles(CONTENT_DIR);
  let matchedFiles = 0;
  let protectedPages = 0;
  let skippedWithoutOutput = 0;
  let skippedWithoutSlot = 0;

  for (const absoluteContentFile of contentFiles) {
    const relativePath = path.relative(CONTENT_DIR, absoluteContentFile);
    const mapping = matchFolderForFile(relativePath, mappings);
    if (!mapping) {
      continue;
    }
    matchedFiles += 1;

    const outputHtmlPath = contentFileToPublicHtml(relativePath);
    if (!fs.existsSync(outputHtmlPath)) {
      skippedWithoutOutput += 1;
      continue;
    }

    const html = fs.readFileSync(outputHtmlPath, "utf8");
    const slot = findProtectedContentSlot(html);
    if (!slot) {
      skippedWithoutSlot += 1;
      continue;
    }

    const payload = encryptMarkup(slot.outerHtml, mapping.password, iterations);
    const gate = protectedGateMarkup(payload);
    const nextHtml = `${html.slice(0, slot.start)}${gate}${html.slice(slot.end)}`;
    fs.writeFileSync(outputHtmlPath, nextHtml);
    protectedPages += 1;
  }

  console.log(
    `Content protection: encrypted ${protectedPages} page(s) from ${matchedFiles} matching content file(s) with PBKDF2 iterations=${iterations}.`,
  );

  if (skippedWithoutOutput > 0) {
    console.warn(
      `Content protection: skipped ${skippedWithoutOutput} file(s) because no generated HTML output was found.`,
    );
  }
  if (skippedWithoutSlot > 0) {
    console.warn(
      `Content protection: skipped ${skippedWithoutSlot} page(s) because no protected slot was found (likely non-single templates).`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`Content protection failed: ${error.message}`);
  process.exitCode = 1;
}
