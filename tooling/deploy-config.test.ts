import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Returns the body of a TOML table such as `[auth.email]` (up to the next table header). */
function tomlSection(toml: string, header: string): string {
  const start = toml.indexOf(`\n${header}\n`);
  if (start === -1) return '';
  const rest = toml.slice(start + header.length + 2);
  const next = rest.search(/\n\[/);
  return next === -1 ? rest : rest.slice(0, next);
}

function walk(dir: string, out: string[] = []): string[] {
  const skip = new Set(['node_modules', '.git', 'dist', '.temp', 'package-lock.json']);
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('local supabase config', () => {
  const config = read('supabase/config.toml');

  it('is marked LOCAL ONLY at the top and warns never to config push it', () => {
    const head = config.split('\n').slice(0, 8).join('\n');
    expect(head).toMatch(/LOCAL ONLY/);
    expect(head).toMatch(/never run `supabase config push`/i);
  });

  it('enables the strict before-user-created allowlist hook', () => {
    const hook = tomlSection(config, '[auth.hook.before_user_created]');
    expect(hook).toContain('enabled = true');
    expect(hook).toContain('pg-functions://postgres/public/hook_before_user_created');
  });

  it('marks email/password as LOCAL ONLY next to the enabled email provider', () => {
    const idx = config.indexOf('\n[auth.email]\n');
    expect(idx).toBeGreaterThan(-1);
    const body = tomlSection(config, '[auth.email]');
    expect(body).toMatch(/LOCAL ONLY/);
    expect(body).toMatch(/Production MUST use Google OAuth only/);
  });

  it('does not load the local dev user through db seeds (would reach production on db push)', () => {
    const seedPaths = /sql_paths\s*=\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(seedPaths).toContain('./seed.sql');
    expect(seedPaths).not.toContain('dev-user');
    expect(seedPaths).not.toContain('members.local');
  });
});

describe('deploy checklist', () => {
  it('enables the signup hook BEFORE enabling the Google provider', () => {
    const doc = read('docs/DEPLOY.md');
    const hook = doc.search(/- \[ \] .*Enable the before-user-created hook/);
    const google = doc.search(/- \[ \] .*Enable the Google provider/);
    expect(hook).toBeGreaterThan(-1);
    expect(google).toBeGreaterThan(hook);
  });

  it('forbids pushing the local config and explains scheduled-workflow suspension', () => {
    const doc = read('docs/DEPLOY.md');
    expect(doc).toMatch(/never run `supabase config push`/i);
    expect(doc).toMatch(/60 days/);
  });
  it('documents disabling email/password auth in production', () => {
    expect(existsSync(join(root, 'docs/DEPLOY.md'))).toBe(true);
    const doc = read('docs/DEPLOY.md');
    expect(doc).toMatch(/- \[ \] .*Disable the Email provider/);
  });

  it('documents enabling the before-user-created hook and never using service_role', () => {
    const doc = read('docs/DEPLOY.md');
    expect(doc).toMatch(/- \[ \] .*before-user-created hook/);
    expect(doc).toMatch(/- \[ \] .*service_role/);
  });

  it('documents running members.local.sql manually', () => {
    expect(read('docs/DEPLOY.md')).toMatch(/- \[ \] .*members\.local\.sql/);
  });
});

describe('repository hygiene (public repo)', () => {
  it('ignores env files, local member list and keeps only .env.example', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\.\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
    expect(ignore).toMatch(/^supabase\/seed\/members\.local\.sql$/m);
  });

  it('contains no JWTs or secret keys in project files', () => {
    const jwt = /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./;
    const secretKey = new RegExp('sb_' + 'secret_[A-Za-z0-9_-]+');
    const offenders = walk(root)
      .filter((f) => !/\.(png|jpg|ico|woff2?)$/.test(f))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return jwt.test(text) || secretKey.test(text);
      })
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('.env.example holds placeholders only and exposes just the anon key', () => {
    const example = read('.env.example');
    expect(example).toMatch(/^VITE_SUPABASE_URL=/m);
    expect(example).toMatch(/^VITE_SUPABASE_ANON_KEY=your-local-or-hosted-anon-key$/m);
    expect(example).not.toMatch(/^[A-Z_]*SERVICE[A-Z_]*=/m);
  });
});

describe('client auth surface', () => {
  it('keeps the email/password form behind the Vite dev flag so it is stripped from production builds', () => {
    const page = read('src/pages/LoginPage.svelte');
    expect(page).toContain('{#if import.meta.env.DEV && methods.emailPassword}');
  });

  it('never references a service_role key in client source', () => {
    const srcFiles = walk(join(root, 'src')).filter((f) => !f.endsWith('.test.ts'));
    expect(srcFiles.length).toBeGreaterThan(5);
    for (const file of srcFiles) {
      expect(readFileSync(file, 'utf8').toLowerCase(), relative(root, file)).not.toContain('service_role');
    }
  });
});

describe('keep-alive workflow', () => {
  const path = '.github/workflows/keepalive.yml';

  it('exists and runs weekly plus on demand', () => {
    expect(existsSync(join(root, path))).toBe(true);
    const wf = read(path);
    expect(wf).toMatch(/cron:\s*'[^']+'/);
    expect(wf).toContain('workflow_dispatch');
  });

  it('calls the anon keepalive RPC with repo secrets and fails loudly on non-2xx', () => {
    const wf = read(path);
    expect(wf).toContain('curl --fail');
    expect(wf).toContain('/rest/v1/rpc/keepalive');
    expect(wf).toContain('secrets.SUPABASE_URL');
    expect(wf).toContain('secrets.SUPABASE_ANON_KEY');
  });

  it('never uses a privileged key and requests no token permissions', () => {
    const wf = read(path);
    expect(wf.toLowerCase()).not.toContain('service_role');
    expect(wf).toMatch(/permissions:\s*\{\}/);
  });
});
