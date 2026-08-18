/** Minimal unauthenticated page served before the official Web Client loads. */

/**
 * Login-page Content-Security-Policy.
 * `connect-src 'self'` is required: the submit handler `fetch`es `/auth/sign-in/username`.
 * `default-src 'none'` would otherwise block that request in the browser.
 */
export const LOGIN_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
].join('; ')

/**
 * Render the login page without external assets so unauthenticated requests
 * never reach the official Harness HTTP server.
 * @param authPath - Better Auth base path.
 * @param next - validated same-origin path to open after sign-in.
 * @returns complete login HTML.
 */
export function loginPage(authPath: string, next: string): string {
  const authPathJson = JSON.stringify(authPath)
  const nextJson = JSON.stringify(next)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeepSeek Harness 登录</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111318; color: #f4f5f7; }
    main { width: min(100% - 32px, 380px); padding: 32px; border: 1px solid #30343d; border-radius: 16px; background: #1b1e25; box-shadow: 0 20px 60px #0008; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #a9afbb; line-height: 1.5; }
    label { display: block; margin: 18px 0 7px; color: #d5d9e1; font-size: 14px; }
    input { width: 100%; padding: 11px 12px; border: 1px solid #444a55; border-radius: 8px; background: #12141a; color: inherit; font: inherit; }
    input:focus { border-color: #729cff; outline: 2px solid #729cff55; }
    button { width: 100%; margin-top: 24px; padding: 11px 14px; border: 0; border-radius: 8px; background: #729cff; color: #111318; font: inherit; font-weight: 650; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .65; }
    [role="alert"] { min-height: 21px; margin: 14px 0 0; color: #ff9b9b; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>DeepSeek Harness</h1>
    <p>登录后访问 Agent Web 界面。</p>
    <form id="login-form">
      <label for="username">账号</label>
      <input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button id="submit" type="submit">登录</button>
      <p id="error" role="alert"></p>
    </form>
  </main>
  <script>
    const authPath = ${authPathJson};
    const next = ${nextJson};
    const form = document.getElementById('login-form');
    const submit = document.getElementById('submit');
    const error = document.getElementById('error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      try {
        const response = await fetch(authPath + '/sign-in/username', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            username: form.username.value,
            password: form.password.value,
            callbackURL: next,
          }),
        });
        if (!response.ok) throw new Error('invalid credentials');
        window.location.assign(next);
      } catch {
        error.textContent = '账号或密码错误。';
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>
`
}
