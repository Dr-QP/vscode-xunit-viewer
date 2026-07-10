/**
 * Ignore-pattern matching for result discovery.
 *
 * Patterns are evaluated against workspace-relative paths under the configured
 * `resultsPath` (using POSIX separators), which is the single source of truth
 * for both pre-render validation and the actual report generation. The matcher
 * supports the forms users reasonably expect:
 *
 *   - bare file names, e.g. `package.xml` (matched at any depth)
 *   - recursive globs, e.g. `**\/coverage/*.xml`
 *   - directory globs, e.g. `**\/testing/**`
 */

const REGEXP_SPECIALS = new Set(['\\', '^', '$', '.', '|', '+', '(', ')', '[', ']', '{', '}']);

function globToRegExpBody(glob: string): string {
  let body = '';

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === undefined) {
      continue;
    }

    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          // `**/` spans zero or more leading path segments.
          body += '(?:.*/)?';
        } else {
          // `**` spans anything, including path separators.
          body += '.*';
        }
      } else {
        // `*` stays within a single path segment.
        body += '[^/]*';
      }
    } else if (char === '?') {
      body += '[^/]';
    } else if (REGEXP_SPECIALS.has(char)) {
      body += `\\${char}`;
    } else {
      body += char;
    }
  }

  return body;
}

function patternToRegExp(pattern: string): RegExp {
  let body = globToRegExpBody(pattern);

  // A slash-free pattern is treated as a basename match at any depth so that
  // `package.xml` excludes both `package.xml` and `nested/package.xml`.
  if (!pattern.includes('/')) {
    body = `(?:.*/)?${body}`;
  }

  return new RegExp(`^${body}$`);
}

export interface IgnoreMatcher {
  isIgnored(relativePosixPath: string): boolean;
}

export function createIgnoreMatcher(ignorePatterns: string[]): IgnoreMatcher {
  const matchers = ignorePatterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map(patternToRegExp);

  return {
    isIgnored(relativePosixPath: string): boolean {
      return matchers.some((matcher) => matcher.test(relativePosixPath));
    },
  };
}
