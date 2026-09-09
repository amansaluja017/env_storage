/**
 * Robust DotEnv Parser for Env Vault
 *
 * Capabilities:
 * - Ignores comments (full line with '#', '//', or ';', even if indented).
 * - Ignores trailing inline comments on unquoted and quoted values.
 * - Accurately extracts KEY and VALUE pairs.
 * - Handles 'export ' prefix (e.g. `export KEY=VALUE`).
 * - Supports single quotes ('...'), double quotes ("..."), and backticks (`...`).
 * - Unescapes characters in double-quoted strings (\n, \r, \t, \", \\, etc.).
 * - Preserves '#' inside quotes (e.g. KEY="my#pass") and in hex colors/URLs (e.g. COLOR=#1E293B, URL=https://example.com#section).
 * - Supports multi-line quoted strings (e.g. RSA private keys, certificates).
 * - Normalizes keys to uppercase and trimmed (compatible with repository conventions).
 * - Extracts inline or associated comment metadata if present.
 */

export interface ParsedDotEnvEntry {
  key: string;
  value: string;
  comment?: string;
}

/**
 * Unescapes common escape sequences in double-quoted string values.
 */
function unescapeDoubleQuotedString(str: string): string {
  return str.replace(/\\([nrtbfv\\'"$])/g, (_, esc) => {
    switch (esc) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      case '\\':
        return '\\';
      case '"':
        return '"';
      case "'":
        return "'";
      case '$':
        return '$';
      default:
        return esc;
    }
  });
}

/**
 * Parses raw .env file contents into an array of key-value pairs.
 */
export function parseDotEnv(content: string): ParsedDotEnvEntry[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const entries: ParsedDotEnvEntry[] = [];

  let inMultiline = false;
  let multilineQuoteChar = '';
  let multilineKey = '';
  let multilineBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // If currently inside a multi-line quoted string
    if (inMultiline) {
      let closeIdx = -1;
      let isEscaped = false;

      for (let c = 0; c < rawLine.length; c++) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (rawLine[c] === '\\') {
          isEscaped = true;
          continue;
        }
        if (rawLine[c] === multilineQuoteChar) {
          closeIdx = c;
          break;
        }
      }

      if (closeIdx !== -1) {
        // Found closing quote on this line
        multilineBuffer.push(rawLine.slice(0, closeIdx));
        let val = multilineBuffer.join('\n');
        if (multilineQuoteChar === '"') {
          val = unescapeDoubleQuotedString(val);
        }

        // Check for inline comment following the closing quote
        const afterQuote = rawLine.slice(closeIdx + 1).trim();
        let comment: string | undefined;
        if (afterQuote.startsWith('#') || afterQuote.startsWith('//') || afterQuote.startsWith(';')) {
          comment = afterQuote.replace(/^(#|\/\/|;)\s*/, '').trim();
        }

        entries.push({
          key: multilineKey,
          value: val,
          comment: comment || undefined,
        });

        // Reset multiline state
        inMultiline = false;
        multilineQuoteChar = '';
        multilineKey = '';
        multilineBuffer = [];
      } else {
        multilineBuffer.push(rawLine);
      }
      continue;
    }

    const trimmed = rawLine.trim();

    // Ignore empty lines and full-line comments
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith(';')
    ) {
      continue;
    }

    // Strip optional "export " prefix
    let lineToParse = trimmed;
    if (/^export\s+/i.test(lineToParse)) {
      lineToParse = lineToParse.replace(/^export\s+/i, '').trim();
    }

    const eqIdx = lineToParse.indexOf('=');
    if (eqIdx === -1) {
      // Not a valid key=value pair
      continue;
    }

    const rawKey = lineToParse.substring(0, eqIdx).trim();
    if (!rawKey) {
      continue;
    }
    const key = rawKey.toUpperCase();

    const rawValuePart = lineToParse.substring(eqIdx + 1).trim();

    // Check if value is completely empty (e.g. KEY=)
    if (rawValuePart === '') {
      entries.push({ key, value: '' });
      continue;
    }

    // Check if value begins with a comment immediately after '='
    // (e.g. KEY= # comment or KEY=# comment or KEY=// comment)
    if (
      rawValuePart.startsWith('//') ||
      rawValuePart.startsWith(';') ||
      rawValuePart === '#' ||
      /^#\s+/.test(rawValuePart)
    ) {
      const comment = rawValuePart.replace(/^(#|\/\/|;)\s*/, '').trim();
      entries.push({ key, value: '', comment: comment || undefined });
      continue;
    }

    const firstChar = rawValuePart[0];

    // Check if value starts with a quote: ", ', or `
    if (firstChar === '"' || firstChar === "'" || firstChar === '`') {
      const quoteChar = firstChar;
      let closeIdx = -1;
      let isEscaped = false;

      for (let c = 1; c < rawValuePart.length; c++) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (rawValuePart[c] === '\\') {
          isEscaped = true;
          continue;
        }
        if (rawValuePart[c] === quoteChar) {
          closeIdx = c;
          break;
        }
      }

      if (closeIdx !== -1) {
        // Quoted string closed on the same line
        let extractedVal = rawValuePart.slice(1, closeIdx);
        if (quoteChar === '"') {
          extractedVal = unescapeDoubleQuotedString(extractedVal);
        }

        const afterQuote = rawValuePart.slice(closeIdx + 1).trim();
        let comment: string | undefined;
        if (afterQuote.startsWith('#') || afterQuote.startsWith('//') || afterQuote.startsWith(';')) {
          comment = afterQuote.replace(/^(#|\/\/|;)\s*/, '').trim();
        }

        entries.push({
          key,
          value: extractedVal,
          comment: comment || undefined,
        });
      } else {
        // Multiline quoted string begins here
        inMultiline = true;
        multilineQuoteChar = quoteChar;
        multilineKey = key;
        multilineBuffer = [rawValuePart.slice(1)];
      }
      continue;
    }

    // Unquoted value:
    // Check for inline comments preceded by whitespace (e.g. "value # comment" or "value // comment")
    // Preserves hashes without leading whitespace like hex colors (#ff0000) or URL anchors (#anchor)
    const inlineCommentMatch = rawValuePart.match(/\s+(?:#|\/\/|;)\s*(.*)$/);
    let value = rawValuePart;
    let comment: string | undefined;

    if (inlineCommentMatch && inlineCommentMatch.index !== undefined) {
      value = rawValuePart.substring(0, inlineCommentMatch.index).trim();
      comment = inlineCommentMatch[1]?.trim();
    } else {
      value = rawValuePart.trim();
    }

    entries.push({
      key,
      value,
      comment: comment || undefined,
    });
  }

  // Handle unterminated multiline string if file ended unexpectedly
  if (inMultiline && multilineBuffer.length > 0) {
    let val = multilineBuffer.join('\n');
    if (multilineQuoteChar === '"') {
      val = unescapeDoubleQuotedString(val);
    }
    entries.push({
      key: multilineKey,
      value: val,
    });
  }

  return entries;
}
