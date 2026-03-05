(() => {
  "use strict";

  const TEXT_ENCODER = new TextEncoder();
  const TEXT_DECODER = new TextDecoder();
  const MATH_DELIMITERS = [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
  ];

  function decodeBase64(value) {
    const bytes = atob(value);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      out[i] = bytes.charCodeAt(i);
    }
    return out;
  }

  async function decryptProtectedPayload(payload, password) {
    const salt = decodeBase64(payload.kdf.salt);
    const iv = decodeBase64(payload.cipher.iv);
    const ciphertext = decodeBase64(payload.ct);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      TEXT_ENCODER.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: payload.kdf.iterations,
        hash: payload.kdf.hash,
      },
      baseKey,
      { name: payload.cipher.name, length: 256 },
      false,
      ["decrypt"],
    );
    const plainBuffer = await crypto.subtle.decrypt(
      { name: payload.cipher.name, iv },
      key,
      ciphertext,
    );
    return TEXT_DECODER.decode(plainBuffer);
  }

  function runPostDecryptRenderPasses(rootElement) {
    if (!rootElement) {
      return;
    }

    if (window.hljs && typeof window.hljs.highlightElement === "function") {
      rootElement.querySelectorAll("pre code").forEach((block) => {
        window.hljs.highlightElement(block);
      });
    }

    if (typeof window.renderMathInElement === "function") {
      window.renderMathInElement(rootElement, {
        delimiters: MATH_DELIMITERS,
        throwOnError: false,
      });
    }

    Array.from(rootElement.getElementsByClassName("language-mermaid")).forEach(
      (el) => {
        if (!el.parentElement) {
          return;
        }
        el.parentElement.outerHTML = `<div class="mermaid [&_svg]:block [&_svg]:m-auto">${el.innerHTML}</div>`;
      },
    );

    if (window.mermaid && typeof window.mermaid.run === "function") {
      window.mermaid.run({
        nodes: rootElement.querySelectorAll(".mermaid"),
      });
    }
  }

  function injectProtectedMarkup(root, htmlString) {
    const template = document.createElement("template");
    template.innerHTML = htmlString.trim();
    const firstElement = template.content.firstElementChild;
    root.replaceWith(template.content);
    return firstElement;
  }

  function parsePayload(root) {
    const payloadElement = root.querySelector(".protected-content-payload");
    if (!payloadElement || !payloadElement.textContent) {
      throw new Error("Missing encrypted payload.");
    }
    const payload = JSON.parse(payloadElement.textContent);
    if (
      !payload ||
      payload.v !== 1 ||
      !payload.kdf ||
      !payload.cipher ||
      typeof payload.ct !== "string"
    ) {
      throw new Error("Invalid encrypted payload.");
    }
    return payload;
  }

  function attachHandler(root) {
    const form = root.querySelector(".protected-content-form");
    const input = root.querySelector(".protected-content-input");
    const submit = root.querySelector(".protected-content-submit");
    const error = root.querySelector(".protected-content-error");
    if (!form || !input || !submit || !error) {
      return;
    }

    const payload = parsePayload(root);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.hidden = true;
      error.textContent = "";

      const password = input.value;
      if (!password) {
        error.textContent = "Enter a password.";
        error.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = "Decrypting...";

      try {
        const decryptedMarkup = await decryptProtectedPayload(payload, password);
        const restoredNode = injectProtectedMarkup(root, decryptedMarkup);
        runPostDecryptRenderPasses(restoredNode);
      } catch (_error) {
        submit.disabled = false;
        submit.textContent = "Unlock";
        error.textContent = "Incorrect password or corrupted protected content.";
        error.hidden = false;
      }
    });
  }

  function initProtectedPages() {
    const roots = document.querySelectorAll(".protected-content-root");
    roots.forEach((root) => {
      try {
        attachHandler(root);
      } catch (_error) {
        const error = root.querySelector(".protected-content-error");
        if (error) {
          error.textContent = "Protected content failed to initialize.";
          error.hidden = false;
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProtectedPages);
  } else {
    initProtectedPages();
  }
})();
