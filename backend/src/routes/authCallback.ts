import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /auth/callback
 *
 * SolarPro redirects here after user signs in with:
 *   ?token=<JWT>&state=<nonce>
 *
 * This endpoint generates a deeplink back to the mobile app
 * via Expo's linking system.
 */
router.get('/:platform?', (req: Request, res: Response) => {
  try {
    const { token, state } = req.query;
    const platform = req.params.platform || 'universal'; // could be 'android', 'ios', etc.

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        error: 'token parameter is required',
      });
    }

    if (!state || typeof state !== 'string') {
      return res.status(400).json({
        error: 'state parameter is required',
      });
    }

    // Generate the deeplink back to the mobile app
    // Expo's linking system handles opening the app and routing via query params
    const deeplink = `exp://login?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;

    // Also generate a fallback Expo Go deeplink
    const expoGoDeeplink = `exp://exp.dev/@kilby/site-survey-app/--/login?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;

    // Return an HTML page that knows how to deeplink
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting to Site Survey App...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 {
      color: #1a202c;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    p {
      color: #718096;
      margin: 0 0 30px 0;
      font-size: 16px;
    }
    .spinner {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 4px solid #ecf0f1;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 20px 0;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .fallback-link {
      display: inline-block;
      margin-top: 30px;
      padding: 12px 24px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: background 0.3s;
    }
    .fallback-link:hover {
      background: #5568d3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Signing In...</h1>
    <div class="spinner"></div>
    <p>Opening Site Survey app. If it doesn't open automatically, tap the button below.</p>
    <a href="${deeplink}" class="fallback-link">Open Site Survey</a>
  </div>

  <script>
    // Try to open the deeplink with a small delay
    setTimeout(() => {
      window.location.href = "${deeplink}";
    }, 500);
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('GET /auth/callback error:', error);
    res.status(500).json({
      error: 'Callback processing failed',
    });
  }
});

export default router;

